import crypto from 'node:crypto';
import { Router, type Response } from 'express';
import multer from 'multer';
import {
  ALLOWED_SPREADSHEET_EXTENSIONS,
  ALLOWED_SPREADSHEET_MIMES,
} from '@ai-assistant/core';
import type { AuthedRequest } from '../auth.ts';
import { logger, type ServerConfig } from '../config.ts';
import { parseSpreadsheetBuffer } from '../files/parseSheet.ts';
import { generateErrorReportCsv, validateSpreadsheetRows } from '../files/validate.ts';
import type { ProfileRegistry } from '../profiles/loader.ts';
import { createConfirmationToken, type ActionLogStore } from '../security/confirmation.ts';
import { validateExtensionAndMime } from '../security/sanitize.ts';

export function createUploadRouter(params: {
  cfg: ServerConfig;
  profiles: ProfileRegistry;
  actionStore: ActionLogStore;
}): Router {
  const router = Router();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: params.cfg.uploadMaxBytes,
      files: 1,
    },
  });

  router.post(
    '/',
    upload.single('file'),
    async (req: AuthedRequest, res: Response): Promise<void> => {
      const profile = req.appProfile;
      const authUser = req.authUser;
      if (!profile || !authUser) {
        res.status(401).json({ error: 'Unauthorized.' });
        return;
      }

      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'Missing spreadsheet file under field "file".' });
        return;
      }

      const check = validateExtensionAndMime(
        file.originalname,
        file.mimetype,
        ALLOWED_SPREADSHEET_EXTENSIONS,
        ALLOWED_SPREADSHEET_MIMES
      );
      if (!check.valid) {
        res.status(400).json({ error: check.reason });
        return;
      }

      const targetAreaRaw =
        typeof req.body?.targetArea === 'string' ? req.body.targetArea.trim().toLowerCase() : '';
      const explicitArea = targetAreaRaw && targetAreaRaw !== 'auto' ? targetAreaRaw : '';
      let templateId =
        typeof req.body?.templateId === 'string' && req.body.templateId
          ? req.body.templateId
          : undefined;
      if (!templateId && explicitArea && profile.appId === 'khazna-ledger') {
        if (/\b(managers?|admins?|staff)\b/.test(explicitArea)) templateId = 'khazna-managers';
        else if (/\b(bulk|entry|entries|ledger|transactions?|batch(?:es)?)\b/.test(explicitArea))
          templateId = 'khazna-bulk-entries';
        else if (/\b(students?|directory|roster)\b/.test(explicitArea))
          templateId = 'khazna-students';
      }

      let template = params.profiles.getTemplate(profile.appId, templateId);
      if (!template) {
        res.status(400).json({
          error: `No spreadsheet import template configured for app "${profile.appId}"${templateId ? ` (${templateId})` : ''}.`,
        });
        return;
      }

      let columnOverrides: Record<string, string> = {};
      if (typeof req.body?.columnOverrides === 'string' && req.body.columnOverrides.trim()) {
        try {
          columnOverrides = JSON.parse(req.body.columnOverrides) as Record<string, string>;
        } catch {
          res.status(400).json({ error: 'Invalid JSON in columnOverrides.' });
          return;
        }
      }

      try {
        const parsed = parseSpreadsheetBuffer(
          file.buffer,
          file.originalname,
          params.cfg.uploadMaxRows
        );

        // If no explicit targetArea/templateId was given for khazna-ledger, auto-pick best matching template if another template clearly fits better
        if (!templateId && !explicitArea && profile.appId === 'khazna-ledger') {
          const allTemplates = params.profiles.getTemplates(profile.appId);
          if (allTemplates.length > 1) {
            let bestTpl = template;
            let bestScore = -1;
            for (const cand of allTemplates) {
              const candPreview = validateSpreadsheetRows({
                uploadId: 'probe',
                appId: profile.appId,
                fileName: file.originalname,
                template: cand,
                headers: parsed.headers,
                rows: parsed.rows.slice(0, 5),
                totalRows: parsed.totalRows,
                truncated: false,
                columnOverrides,
              });
              const reqCols = cand.columns.filter((c) => c.required);
              const matchedReq = reqCols.filter((rc) =>
                candPreview.columnMapping.some((m) => m.expectedKey === rc.key && m.confidence !== 'missing')
              ).length;
              const score = matchedReq * 10 + (reqCols.length > 0 && matchedReq === reqCols.length ? 20 : 0);
              if (score > bestScore) {
                bestScore = score;
                bestTpl = cand;
              }
            }
            template = bestTpl;
          }
        }

        const uploadId = `upl_${crypto.randomUUID()}`;

        const preview = validateSpreadsheetRows({
          uploadId,
          appId: profile.appId,
          fileName: file.originalname,
          template,
          headers: parsed.headers,
          rows: parsed.rows,
          totalRows: parsed.totalRows,
          truncated: parsed.truncated,
          columnOverrides,
        });

        const requiredKeys = new Set(template.columns.filter((c) => c.required).map((c) => c.key));
        const missingRequiredColumns = preview.columnMapping
          .filter((m) => requiredKeys.has(m.expectedKey) && m.confidence === 'missing')
          .map((m) => m.expectedLabel);

        const role =
          typeof req.body?.role === 'string' ? req.body.role.trim().toLowerCase() : '';
        let permissionError: string | undefined;
        if (profile.appId === 'khazna-ledger' && role) {
          if (role === 'student') {
            permissionError = 'Student accounts do not have permission to bulk upload CSV files.';
          } else if (
            role === 'manager' &&
            (template.templateId === 'khazna-students' || template.templateId === 'khazna-managers')
          ) {
            permissionError =
              'Only College Admin can bulk import Students or Sector Managers. Managers can upload Bulk Ledger Entries for their assigned sector.';
          }
        }

        const formatMatched =
          !permissionError &&
          missingRequiredColumns.length === 0 &&
          preview.totalRows > 0 &&
          preview.validCount > 0;
        preview.formatMatched = formatMatched;
        preview.missingRequiredColumns = missingRequiredColumns;
        if (permissionError) {
          preview.permissionError = permissionError;
        }

        // Create confirmation-gated pending action ONLY when formatMatched & role permission pass
        if (formatMatched) {
          const actionId = `act_${crypto.randomUUID()}`;
          const toolArgs = {
            uploadId,
            fileName: file.originalname,
            validCount: preview.validCount,
            targetArea: targetAreaRaw || template.templateId,
          };
          const { token } = createConfirmationToken(
            {
              actionId,
              appId: profile.appId,
              userId: authUser.userId,
              toolName: template.targetTool,
              args: toolArgs,
            },
            params.cfg.confirmationSecret
          );

          params.actionStore.savePendingAction(
            {
              id: actionId,
              appId: profile.appId,
              userId: authUser.userId,
              toolName: template.targetTool,
              risk: 'write',
              status: 'pending',
              summary: `Import ${preview.validCount} valid row(s) via "${template.name}" from "${file.originalname}" (${preview.invalidCount} skipped due to validation errors)`,
              args: toolArgs,
              createdIds: [],
              createdAt: new Date().toISOString(),
            },
            toolArgs
          );

          preview.actionId = actionId;
          preview.confirmationToken = token;
        }

        params.actionStore.saveUploadPreview(preview);

        logger.info(
          {
            appId: profile.appId,
            userId: authUser.userId,
            uploadId,
            templateId: template.templateId,
            formatMatched,
            totalRows: preview.totalRows,
            validCount: preview.validCount,
            invalidCount: preview.invalidCount,
          },
          'Spreadsheet parsed and validated for preview'
        );

        res.json(preview);
      } catch (err) {
        logger.error({ err, appId: profile.appId }, 'Spreadsheet parsing failed');
        res.status(400).json({
          error: err instanceof Error ? err.message : 'Failed to parse spreadsheet file.',
        });
      }
    }
  );

  router.get('/:uploadId/errors.csv', (req: AuthedRequest, res: Response) => {
    const profile = req.appProfile;
    if (!profile) {
      res.status(401).json({ error: 'Unauthorized.' });
      return;
    }
    const uploadId = String(req.params.uploadId);
    const preview = params.actionStore.getUploadPreview(uploadId, profile.appId);
    if (!preview) {
      res.status(404).json({ error: 'Upload preview not found.' });
      return;
    }

    const csv = generateErrorReportCsv(preview.errors);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="import-errors-${uploadId}.csv"`);
    res.send(csv);
  });

  return router;
}
