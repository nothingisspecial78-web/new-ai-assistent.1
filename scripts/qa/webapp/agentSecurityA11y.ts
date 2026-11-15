import fs from 'node:fs';
import path from 'node:path';
import { launchQaBrowser } from '../../qaRunner.ts';
import { attachErrorListeners, formatBucketErrors, type WebappTestResult } from './types.ts';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'qa-artifacts') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

export async function runSecurityA11yAgent(): Promise<WebappTestResult[]> {
  console.log('\n=== [WEBAPP AGENT 4: SECURITY, AUTH ISOLATION, SECRET SCAN & ACCESSIBILITY] ===');
  const results: WebappTestResult[] = [];
  const browser = await launchQaBrowser();

  try {
    // WSA-01: Super Admin API Authentication & Forged JWT Rejection
    {
      const t0 = Date.now();
      try {
        const endpoints = [
          '/api/super-admin/organizations',
          '/api/super-admin/analytics',
          '/api/super-admin/audit-logs',
        ];
        const unauthStatuses: number[] = [];
        const forgedStatuses: number[] = [];

        for (const ep of endpoints) {
          const r1 = await fetch(`${BASE_URL}${ep}`);
          unauthStatuses.push(r1.status);
          const r2 = await fetch(`${BASE_URL}${ep}`, {
            headers: { Authorization: 'Bearer forged.invalid.jwt.token' },
          });
          forgedStatuses.push(r2.status);
        }

        const unauthBlocked = unauthStatuses.every((s) => s === 401);
        const forgedBlocked = forgedStatuses.every((s) => s === 401 || s === 403);
        results.push({
          id: 'WSA-01',
          suite: 'Security & A11y',
          name: 'Super Admin API Rejects Unauthenticated (401) & Forged Bearer Tokens (403)',
          role: 'PUBLIC',
          passed: unauthBlocked && forgedBlocked,
          durationMs: Date.now() - t0,
          details: `unauth=${unauthStatuses.join(',')}, forged=${forgedStatuses.join(',')}`,
        });
      } catch (err) {
        results.push({
          id: 'WSA-01',
          suite: 'Security & A11y',
          name: 'Super Admin API Rejects Unauthenticated (401) & Forged Bearer Tokens (403)',
          role: 'PUBLIC',
          passed: false,
          durationMs: Date.now() - t0,
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // WSA-02: Static Security & Hygiene Scan (Zero alert/confirm/window.open, Zero Live Secrets)
    {
      const t0 = Date.now();
      const files = [
        ...walkFiles(path.resolve(process.cwd(), 'src')),
        ...walkFiles(path.resolve(process.cwd(), 'packages')),
        path.resolve(process.cwd(), 'server.ts'),
      ].filter((f) => fs.existsSync(f));

      const nativeDialogHits: string[] = [];
      const secretHits: string[] = [];

      const secretPatterns = [
        /sk-or-v1-[A-Za-z0-9]{20,}/g,
        /AIza[0-9A-Za-z-_]{35}/g,
        /gsk_[A-Za-z0-9]{20,}/g,
      ];

      for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        const rel = path.relative(process.cwd(), file);
        if (/\b(?:window\.)?(?:alert|confirm|open)\s*\(/.test(content)) {
          // Allow standard URL/stream/file handling only if not UI dialog
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            if (/\b(?:window\.)?(?:alert|confirm)\s*\(/.test(line) && !line.trim().startsWith('//')) {
              nativeDialogHits.push(`${rel}:${idx + 1}`);
            }
            if (/\bwindow\.open\s*\(/.test(line) && !line.trim().startsWith('//')) {
              nativeDialogHits.push(`${rel}:${idx + 1}`);
            }
          });
        }
        for (const pat of secretPatterns) {
          if (pat.test(content)) {
            secretHits.push(rel);
          }
        }
      }

      const passed = nativeDialogHits.length === 0 && secretHits.length === 0;
      results.push({
        id: 'WSA-02',
        suite: 'Security & A11y',
        name: 'Static Scan: Zero Browser Native Dialogs (alert/confirm/window.open) & Zero Hardcoded API Secrets',
        role: 'ALL',
        passed,
        durationMs: Date.now() - t0,
        details: `filesScanned=${files.length}, nativeDialogs=${nativeDialogHits.length}${nativeDialogHits.length ? ` (${nativeDialogHits.join(', ')})` : ''}, hardcodedSecrets=${secretHits.length}`,
      });
    }

    // WSA-03: Forgot Password Modal + Accessibility & Keyboard Navigation Across Roles
    {
      const t0 = Date.now();
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const bucket = attachErrorListeners(page);

      try {
        // Test /login Forgot password KDialog + Escape close + Tab focus movement
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
        await page.click('[data-guide-id="login-forgot-password"]');
        await page.waitForSelector('text=Reset or recover access', { timeout: 5000 });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        const modalClosed = (await page.locator('text=Reset or recover access').count()) === 0;

        await page.keyboard.press('Tab');
        const firstFocusTag = await page.evaluate(() => document.activeElement?.tagName || '');

        const routesToAudit = [
          { role: null, path: '/login', headingSelector: 'h1' },
          { role: 'admin', path: '/admin', headingSelector: 'main h1' },
          { role: 'manager', path: '/m/dept-fiqh', headingSelector: 'main h1' },
          { role: 'student', path: '/app', headingSelector: 'main h1' },
        ];

        const a11yIssues: string[] = [];
        for (const item of routesToAudit) {
          if (item.role) {
            await page.evaluate(`localStorage.setItem('khazna_current_role_v1', '${item.role}')`);
          } else {
            await page.evaluate(`localStorage.removeItem('khazna_current_role_v1')`);
          }
          await page.goto(`${BASE_URL}${item.path}`, { waitUntil: 'networkidle' });

          const audit = await page.evaluate((sel) => {
            const h1Count = document.querySelectorAll(sel).length;
            const imgsWithoutAlt = Array.from(document.querySelectorAll('img')).filter(
              (img) => !img.hasAttribute('alt')
            ).length;
            const unlabeledIconButtons = Array.from(document.querySelectorAll('button')).filter((btn) => {
              const txt = (btn.textContent || '').trim();
              const aria = btn.getAttribute('aria-label') || btn.getAttribute('title') || '';
              return txt.length === 0 && aria.trim().length === 0 && btn.offsetParent !== null;
            }).length;
            return { h1Count, imgsWithoutAlt, unlabeledIconButtons };
          }, item.headingSelector);

          if (audit.h1Count === 0) a11yIssues.push(`${item.path}:missing_h1`);
          if (audit.imgsWithoutAlt > 0) a11yIssues.push(`${item.path}:img_no_alt=${audit.imgsWithoutAlt}`);
          if (audit.unlabeledIconButtons > 0) {
            a11yIssues.push(`${item.path}:unlabeled_icon_btns=${audit.unlabeledIconButtons}`);
          }
        }

        const errStr = formatBucketErrors(bucket);
        const passed = modalClosed && firstFocusTag !== 'BODY' && a11yIssues.length === 0 && !errStr;
        results.push({
          id: 'WSA-03',
          suite: 'Security & A11y',
          name: 'Forgot Password KDialog, Escape Close, Tab Focus & Semantic A11y Audit Across Portals',
          role: 'ALL',
          passed,
          durationMs: Date.now() - t0,
          details: `modalEscClose=${modalClosed}, tabFocus=${firstFocusTag}, a11yIssues=${a11yIssues.length ? a11yIssues.join(',') : 'none'}${errStr ? `; ${errStr}` : ''}`,
        });
      } catch (err) {
        results.push({
          id: 'WSA-03',
          suite: 'Security & A11y',
          name: 'Forgot Password KDialog, Escape Close, Tab Focus & Semantic A11y Audit Across Portals',
          role: 'ALL',
          passed: false,
          durationMs: Date.now() - t0,
          details: err instanceof Error ? err.message : String(err),
        });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  return results;
}
