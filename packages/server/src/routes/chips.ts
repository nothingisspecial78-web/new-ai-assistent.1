import express, { type Request, type Response } from 'express';
import type { ServerConfig } from '../config.ts';
import type { AssistantRepository } from '../db/assistantRepository.ts';
import { extractAccessScope } from '../security/scope.ts';
import { getRankedChips, resolvePageId } from '../chips/pageRegistry.ts';

export function createChipsRouter(params: {
  cfg: ServerConfig;
  repository: AssistantRepository;
}): express.Router {
  const router = express.Router();
  const { cfg, repository } = params;

  // GET /api/assistant/chips?pageId=...&lang=...
  router.get('/chips', async (req: Request, res: Response) => {
    const start = Date.now();
    try {
      const scope = await extractAccessScope(req, cfg, { defaultUnauthenticatedRole: 'PUBLIC' });
      const rawPage = String(req.query.pageId || req.query.pathname || 'global');
      const pageId = rawPage.includes('/') ? resolvePageId(rawPage) : rawPage;
      const lang = (String(req.query.lang || 'en').toLowerCase() === 'ml' ? 'ml' : 'en') as 'en' | 'ml';

      // Load chip usages for personalization ranking
      const usages = await repository.getChipUsages(scope.userId, pageId);
      const chipUsageMap = new Map(
        usages.map((u) => [
          u.chipId,
          { shownCount: u.shownCount, clickCount: u.clickCount, lastClickedAt: u.lastClickedAt },
        ])
      );

      // Context for dynamic rules
      const dueAmount = req.query.dueAmount ? Number(req.query.dueAmount) : undefined;
      const unpaidCount = req.query.unpaidCount ? Number(req.query.unpaidCount) : undefined;
      const unassignedSectorsCount = req.query.unassignedSectorsCount
        ? Number(req.query.unassignedSectorsCount)
        : undefined;

      const ranked = getRankedChips({
        scope,
        pageId,
        lang,
        chipUsageMap,
        context: {
          scope,
          dueAmount,
          unpaidCount,
          unassignedSectorsCount,
        },
        limit: 4,
      });

      // Record impression asynchronously
      const chipIds = ranked.map((c) => c.id);
      void repository.recordChipImpression(scope.userId, pageId, chipIds);

      const latencyMs = Date.now() - start;
      res.setHeader('X-Response-Time', `${latencyMs}ms`);
      res.json({
        ok: true,
        pageId,
        role: scope.role,
        chips: ranked,
        latencyMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  // POST /api/assistant/chips/click
  router.post('/chips/click', async (req: Request, res: Response) => {
    try {
      const scope = await extractAccessScope(req, cfg, { defaultUnauthenticatedRole: 'PUBLIC' });
      const chipId = String(req.body?.chipId || '').trim();
      const pageId = String(req.body?.pageId || 'global').trim();

      if (!chipId) {
        res.status(400).json({ ok: false, error: 'chipId is required' });
        return;
      }

      await repository.recordChipClick(scope.userId, pageId, chipId);
      res.json({ ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: message });
    }
  });

  return router;
}
