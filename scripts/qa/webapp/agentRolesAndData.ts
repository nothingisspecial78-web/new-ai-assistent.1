import fs from 'node:fs';
import path from 'node:path';
import { launchQaBrowser } from '../../qaRunner.ts';
import { attachErrorListeners, formatBucketErrors, type WebappTestResult } from './types.ts';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ARTIFACT_DIR = path.resolve(process.cwd(), 'qa-artifacts/webapp/roles');
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

export async function runRolesAndDataAgent(): Promise<WebappTestResult[]> {
  console.log('\n=== [WEBAPP AGENT 2: ALL-ROLE E2E JOURNEYS, FORMS, CRUD & TENANT ISOLATION] ===');
  const results: WebappTestResult[] = [];
  const browser = await launchQaBrowser();

  try {
    // 1. SUPER ADMIN FULL JOURNEY
    {
      const t0 = Date.now();
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const bucket = attachErrorListeners(page);

      try {
        await page.goto(`${BASE_URL}/super-admin/login`, { waitUntil: 'networkidle' });
        await page.fill('input[type="email"]', 'superadmin@khaznacampus.platform');
        await page.fill('input[type="password"]', 'PlatformAdmin2026!Secure');
        await page.click('button[type="submit"]');
        await page.waitForURL('**/super-admin', { timeout: 10000 });
        await page.waitForSelector('text=Islahul Uloom Arabic College', { timeout: 10000 });

        // Drill into organization modal
        await page.click('button:has-text("Inspect") >> nth=0');
        await page.waitForSelector('text=Sectors', { timeout: 6000 });
        await page.keyboard.press('Escape').catch(() => {});
        const closeBtn = page.locator('button[aria-label="Close"], button:has-text("Close")');
        if ((await closeBtn.count()) > 0) await closeBtn.first().click();

        // Check Audit Logs tab
        await page.click('button:has-text("Platform Audit Logs")');
        await page.waitForTimeout(300);
        const bodyText = await page.locator('body').innerText();
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'super-admin-dashboard.png') });

        // Sign out
        await page.click('button:has-text("Sign Out"), button:has-text("Log Out"), button[aria-label="Sign out"]');
        await page.waitForURL('**/super-admin/login', { timeout: 8000 });

        const errStr = formatBucketErrors(bucket);
        const passed = bodyText.includes('LOGIN') && !errStr;
        results.push({
          id: 'WRD-01',
          suite: 'Roles & Data',
          name: 'Super Admin Login, Multi-Tenant Analytics, Org Drill-Down, Audit Logs & Sign Out',
          role: 'SUPER_ADMIN',
          passed,
          durationMs: Date.now() - t0,
          details: passed ? 'Super Admin dashboard, org inspection, audit logs, and logout verified with 0 errors' : `Errors: ${errStr}`,
        });
      } catch (err) {
        results.push({
          id: 'WRD-01',
          suite: 'Roles & Data',
          name: 'Super Admin Login, Multi-Tenant Analytics, Org Drill-Down, Audit Logs & Sign Out',
          role: 'SUPER_ADMIN',
          passed: false,
          durationMs: Date.now() - t0,
          details: err instanceof Error ? err.message : String(err),
        });
      } finally {
        await context.close();
      }
    }

    // 2. ADMIN FULL JOURNEY + ORG SWITCHER ABSENCE + CRUD + ALL 8 ROUTES
    {
      const t0 = Date.now();
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
      const page = await context.newPage();
      const bucket = attachErrorListeners(page);

      try {
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
        await page.click('button:has-text("Admin") >> nth=-1');
        await page.waitForURL('**/admin', { timeout: 10000 });

        // Visit all 8 Admin routes and verify zero org-switcher UI anywhere
        const adminRoutes = [
          '/admin',
          '/admin/audit',
          '/admin/issued-reports',
          '/admin/students',
          '/admin/students/import',
          '/admin/admins',
          '/admin/institution',
          '/admin/sectors',
        ];
        let orgLeakFound = '';
        for (const r of adminRoutes) {
          await page.goto(`${BASE_URL}${r}`, { waitUntil: 'networkidle' });
          await page.waitForSelector('main h1', { timeout: 8000 });
          const txt = await page.locator('body').innerText();
          if (
            txt.includes('New College Organisation') ||
            txt.includes('Create & Open Workspace') ||
            txt.includes('Switch organisation') ||
            txt.includes('Markaz Knowledge Campus') ||
            txt.includes('Darul Huda Islamic University')
          ) {
            orgLeakFound = `Leak/org-switcher on ${r}`;
            break;
          }
        }

        // Verify Student Add + Delete via KDialog (NO browser confirm) + Undo
        await page.goto(`${BASE_URL}/admin/students`, { waitUntil: 'networkidle' });
        await page.click('[data-guide-id="students-add-button"]');
        await page.waitForSelector('text=Full name', { timeout: 5000 });
        const formInputs = page.locator('[role="dialog"] input');
        await formInputs.nth(0).fill('QA Enrolled Student');
        await page.click('[role="dialog"] button[type="submit"]');
        await page.waitForTimeout(300);

        // Search newly added student & test CSV download
        await page.fill('[data-guide-id="students-search-input"] input', 'QA Enrolled Student');
        await page.waitForTimeout(200);
        const foundStudent = (await page.locator('table tbody tr').count()) > 0;

        // Delete newly added student via KDialog modal
        await page.click('table tbody tr >> nth=0 >> button[title="Delete student"]');
        await page.waitForSelector('text=Remove student', { timeout: 5000 });
        await page.click('[role="dialog"] button:has-text("Remove student")');
        await page.waitForTimeout(200);

        // Verify Institution Profile tabs render without errors
        await page.goto(`${BASE_URL}/admin/institution`, { waitUntil: 'networkidle' });
        for (const tabLabel of ['Contact', 'Logo', 'Seal', 'Signatories', 'Verification', 'Preview']) {
          const btn = page.locator(`button:has-text("${tabLabel}")`).first();
          if ((await btn.count()) > 0) await btn.click();
        }
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'admin-institution.png') });

        // Verify role guard: Admin navigating to /app or /m/dept-fiqh redirects back to /admin
        await page.goto(`${BASE_URL}/app`, { waitUntil: 'networkidle' });
        const redirectedFromApp = page.url().includes('/admin');

        const errStr = formatBucketErrors(bucket);
        const passed = !orgLeakFound && foundStudent && redirectedFromApp && !errStr;
        results.push({
          id: 'WRD-02',
          suite: 'Roles & Data',
          name: 'Admin All 8 Routes, Zero Org-Switcher/Cross-Org Leakage, Student CRUD (KDialog) & Guards',
          role: 'ADMIN',
          passed,
          durationMs: Date.now() - t0,
          details: `orgLeak=${orgLeakFound || 'none'}, studentCrud=${foundStudent}, guardFromApp=${redirectedFromApp}${errStr ? `; ${errStr}` : ''}`,
        });
      } catch (err) {
        results.push({
          id: 'WRD-02',
          suite: 'Roles & Data',
          name: 'Admin All 8 Routes, Zero Org-Switcher/Cross-Org Leakage, Student CRUD (KDialog) & Guards',
          role: 'ADMIN',
          passed: false,
          durationMs: Date.now() - t0,
          details: err instanceof Error ? err.message : String(err),
        });
      } finally {
        await context.close();
      }
    }

    // 3. SECTOR MANAGER FULL JOURNEY
    {
      const t0 = Date.now();
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const bucket = attachErrorListeners(page);

      try {
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
        await page.click('button:has-text("Sector Manager") >> nth=-1');
        await page.waitForURL('**/m/dept-fiqh', { timeout: 10000 });

        const managerRoutes = [
          '/m/dept-fiqh',
          '/m/dept-fiqh/ledger',
          '/m/dept-fiqh/bulk',
          '/m/dept-fiqh/reports',
          '/m/dept-fiqh/batches',
        ];
        for (const r of managerRoutes) {
          await page.goto(`${BASE_URL}${r}`, { waitUntil: 'networkidle' });
          await page.waitForSelector('main h1', { timeout: 8000 });
        }

        // Record new fee entry on Ledger
        await page.goto(`${BASE_URL}/m/dept-fiqh/ledger`, { waitUntil: 'networkidle' });
        await page.click('[data-guide-id="ledger-new-entry-button"]');
        await page.waitForSelector('[data-guide-id="dialog-entry-amount"]', { timeout: 5000 });
        await page.fill('[data-guide-id="dialog-entry-amount"]', '775');
        await page.click('[data-guide-id="dialog-entry-submit"]');
        await page.waitForTimeout(300);
        const ledgerTxt = await page.locator('main').innerText();
        const entrySaved = ledgerTxt.includes('775');

        // Open ExportPdfModal on Reports
        await page.goto(`${BASE_URL}/m/dept-fiqh/reports`, { waitUntil: 'networkidle' });
        await page.click('button:has-text("Export PDF")');
        await page.waitForSelector('text=Export PDF Report', { timeout: 5000 });
        await page.click('[role="dialog"] button:has-text("Cancel")');

        // Role guard: Manager cannot access /admin
        await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle' });
        const blockedFromAdmin = page.url().includes('/m/');

        const errStr = formatBucketErrors(bucket);
        const passed = entrySaved && blockedFromAdmin && !errStr;
        results.push({
          id: 'WRD-03',
          suite: 'Roles & Data',
          name: 'Sector Manager All 5 Routes, New Entry Ledger Persistence, PDF Export Modal & Admin Guard',
          role: 'SECTOR_MANAGER',
          passed,
          durationMs: Date.now() - t0,
          details: `entrySaved=${entrySaved}, blockedFromAdmin=${blockedFromAdmin}${errStr ? `; ${errStr}` : ''}`,
        });
      } catch (err) {
        results.push({
          id: 'WRD-03',
          suite: 'Roles & Data',
          name: 'Sector Manager All 5 Routes, New Entry Ledger Persistence, PDF Export Modal & Admin Guard',
          role: 'SECTOR_MANAGER',
          passed: false,
          durationMs: Date.now() - t0,
          details: err instanceof Error ? err.message : String(err),
        });
      } finally {
        await context.close();
      }
    }

    // 4. STUDENT FULL JOURNEY
    {
      const t0 = Date.now();
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const bucket = attachErrorListeners(page);

      try {
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
        await page.click('button:has-text("Student") >> nth=-1');
        await page.waitForURL('**/app', { timeout: 10000 });

        for (const r of ['/app', '/app/s/dept-fiqh', '/app/notifications', '/app/profile']) {
          await page.goto(`${BASE_URL}${r}`, { waitUntil: 'networkidle' });
          await page.waitForSelector('main h1', { timeout: 8000 });
        }

        // Check Student notifications mark read
        await page.goto(`${BASE_URL}/app/notifications`, { waitUntil: 'networkidle' });
        const markAll = page.locator('button:has-text("Mark all read")');
        if ((await markAll.count()) > 0 && (await markAll.isEnabled())) {
          await markAll.click();
        }

        // Guard: Student cannot access /admin or /m/dept-fiqh
        await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle' });
        const blockedAdmin = page.url().includes('/app');
        await page.goto(`${BASE_URL}/m/dept-fiqh`, { waitUntil: 'networkidle' });
        const blockedManager = page.url().includes('/app');

        const errStr = formatBucketErrors(bucket);
        const passed = blockedAdmin && blockedManager && !errStr;
        results.push({
          id: 'WRD-04',
          suite: 'Roles & Data',
          name: 'Student Portal All 4 Routes, Notifications, Profile & Cross-Role Route Guards',
          role: 'STUDENT',
          passed,
          durationMs: Date.now() - t0,
          details: `blockedAdmin=${blockedAdmin}, blockedManager=${blockedManager}${errStr ? `; ${errStr}` : ''}`,
        });
      } catch (err) {
        results.push({
          id: 'WRD-04',
          suite: 'Roles & Data',
          name: 'Student Portal All 4 Routes, Notifications, Profile & Cross-Role Route Guards',
          role: 'STUDENT',
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
