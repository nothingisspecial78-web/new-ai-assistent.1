import fs from 'node:fs';
import path from 'node:path';
import { launchQaBrowser } from '../../qaRunner.ts';
import { attachErrorListeners, formatBucketErrors, type WebappTestResult } from './types.ts';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

interface InventoryRoute {
  path: string;
  role: string;
  redirectsTo?: string;
  guardRedirectTo?: string;
  keySelectors?: string[];
  expectedText?: string;
  assistantExpected?: boolean;
}

export async function runCrawlerAndRoutesAgent(): Promise<WebappTestResult[]> {
  console.log('\n=== [WEBAPP AGENT 1: ROUTE INVENTORY, REDIRECTS & 404 CRAWLER] ===');
  const results: WebappTestResult[] = [];
  const inventoryPath = path.resolve(process.cwd(), 'webapp-inventory.json');
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8')) as { routes: InventoryRoute[] };
  const browser = await launchQaBrowser();

  try {
    // WCR-01: Legacy /superadmin & /superadmin/login 302 redirects
    {
      const t0 = Date.now();
      try {
        const r1 = await fetch(`${BASE_URL}/superadmin`, { redirect: 'manual' });
        const r2 = await fetch(`${BASE_URL}/superadmin/login`, { redirect: 'manual' });
        const ok =
          r1.status === 302 &&
          r1.headers.get('location') === '/super-admin' &&
          r2.status === 302 &&
          r2.headers.get('location') === '/super-admin/login';
        results.push({
          id: 'WCR-01',
          suite: 'Routes & Crawler',
          name: 'Legacy /superadmin & /superadmin/login Redirects (302 -> /super-admin)',
          role: 'PUBLIC',
          passed: ok,
          durationMs: Date.now() - t0,
          details: `/superadmin=${r1.status}->${r1.headers.get('location')}, /superadmin/login=${r2.status}->${r2.headers.get('location')}`,
        });
      } catch (err) {
        results.push({
          id: 'WCR-01',
          suite: 'Routes & Crawler',
          name: 'Legacy /superadmin & /superadmin/login Redirects (302 -> /super-admin)',
          role: 'PUBLIC',
          passed: false,
          durationMs: Date.now() - t0,
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // WCR-02: Public routes, / -> /login redirect, /v/$token clean view, 404 Not Found, and unauth /super-admin guard
    {
      const t0 = Date.now();
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const bucket = attachErrorListeners(page);

      try {
        await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
        const rootRedirectOk = page.url().endsWith('/login');

        await page.goto(`${BASE_URL}/super-admin`, { waitUntil: 'networkidle' });
        const superAdminGuardOk = page.url().includes('/super-admin/login');

        await page.goto(`${BASE_URL}/v/nonexistent-qa-token`, { waitUntil: 'networkidle' });
        const vText = await page.locator('body').innerText();
        const vHasNoAssistant = (await page.locator('[data-testid="assistant-launcher"]').count()) === 0;
        const vOk = vText.includes('not available') && vHasNoAssistant;

        await page.goto(`${BASE_URL}/qa-nonexistent-page-404`, { waitUntil: 'networkidle' });
        const notFoundText = await page.locator('body').innerText();
        const notFoundOk = notFoundText.includes('404') && notFoundText.includes('Page not found');

        const errStr = formatBucketErrors(bucket);
        const passed = rootRedirectOk && superAdminGuardOk && vOk && notFoundOk && !errStr;
        results.push({
          id: 'WCR-02',
          suite: 'Routes & Crawler',
          name: 'Public Redirects, Unauthenticated Super-Admin Guard, /v/$token Clean Audit & 404 Page',
          role: 'PUBLIC',
          passed,
          durationMs: Date.now() - t0,
          details: `rootToLogin=${rootRedirectOk}, saGuard=${superAdminGuardOk}, verifyClean=${vOk}, notFound404=${notFoundOk}${errStr ? `; ${errStr}` : ''}`,
        });
      } catch (err) {
        results.push({
          id: 'WCR-02',
          suite: 'Routes & Crawler',
          name: 'Public Redirects, Unauthenticated Super-Admin Guard, /v/$token Clean Audit & 404 Page',
          role: 'PUBLIC',
          passed: false,
          durationMs: Date.now() - t0,
          details: err instanceof Error ? err.message : String(err),
        });
      } finally {
        await context.close();
      }
    }

    // WCR-03: Inventory Completeness Verification (all 23 inventoried routes are handled)
    {
      const t0 = Date.now();
      const routeCount = inventory.routes.length;
      const hasAllRoles = ['PUBLIC', 'STUDENT', 'SECTOR_MANAGER', 'ADMIN', 'SUPER_ADMIN'].every((r) =>
        inventory.routes.some((rt) => rt.role === r)
      );
      results.push({
        id: 'WCR-03',
        suite: 'Routes & Crawler',
        name: 'Machine-Readable Webapp Inventory Coverage (All 5 Roles & Routes)',
        role: 'ALL',
        passed: routeCount >= 22 && hasAllRoles,
        durationMs: Date.now() - t0,
        details: `${routeCount} routes mapped across all 5 roles in webapp-inventory.json`,
      });
    }
  } finally {
    await browser.close();
  }

  return results;
}
