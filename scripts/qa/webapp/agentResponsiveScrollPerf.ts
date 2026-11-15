import fs from 'node:fs';
import path from 'node:path';
import { launchQaBrowser, verifyAvatarPresenceAndMotion } from '../../qaRunner.ts';
import { attachErrorListeners, formatBucketErrors, type WebappTestResult } from './types.ts';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ARTIFACT_DIR = path.resolve(process.cwd(), 'qa-artifacts/webapp/responsive-perf');
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

export interface PerfSummaryMetric {
  route: string;
  viewport: string;
  ttfbMs: number;
  domContentLoadedMs: number;
  loadMs: number;
  cls: number;
  longTasksCount: number;
  maxLongTaskMs: number;
  avatarFps: number;
  horizontalOverflow: boolean;
}

export async function runResponsiveScrollPerfAgent(): Promise<{
  results: WebappTestResult[];
  perfMetrics: PerfSummaryMetric[];
}> {
  console.log('\n=== [WEBAPP AGENT 3: RESPONSIVE VIEWPORTS, FAST SCROLL, FPS & PERFORMANCE] ===');
  const results: WebappTestResult[] = [];
  const perfMetrics: PerfSummaryMetric[] = [];
  const browser = await launchQaBrowser();

  try {
    // WRP-01: 4 Viewports (360x800, 768x1024, 1440x900, 1920x1080) zero horizontal overflow + Web Vitals + 3D Avatar FPS
    {
      const t0 = Date.now();
      const viewports = [
        { name: 'mobile_360x800', width: 360, height: 800 },
        { name: 'tablet_768x1024', width: 768, height: 1024 },
        { name: 'desktop_1440x900', width: 1440, height: 900 },
        { name: 'wide_1920x1080', width: 1920, height: 1080 },
      ];
      const testRoutes = [
        { role: null, route: '/login' },
        { role: 'admin', route: '/admin' },
        { role: 'admin', route: '/admin/students' },
        { role: 'manager', route: '/m/dept-fiqh/ledger' },
        { role: 'student', route: '/app' },
      ];

      const overflowFailures: string[] = [];
      const lowFpsFailures: string[] = [];
      const errorFailures: string[] = [];

      for (const vp of viewports) {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const page = await context.newPage();
        const bucket = attachErrorListeners(page);

        await page.addInitScript(() => {
          (window as any).__qaLongTasks = [];
          (window as any).__qaCls = 0;
          try {
            new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                (window as any).__qaLongTasks.push(entry.duration);
              }
            }).observe({ entryTypes: ['longtask'] });
          } catch {
            // ignore
          }
          try {
            new PerformanceObserver((list) => {
              for (const entry of list.getEntries() as any[]) {
                if (!entry.hadRecentInput) {
                  (window as any).__qaCls += entry.value || 0;
                }
              }
            }).observe({ entryTypes: ['layout-shift'] });
          } catch {
            // ignore
          }
        });

        try {
          await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
          for (const item of testRoutes) {
            if (item.role) {
              await page.evaluate(`localStorage.setItem('khazna_current_role_v1', '${item.role}')`);
            } else {
              await page.evaluate(`localStorage.removeItem('khazna_current_role_v1')`);
            }
            await page.evaluate(() => {
              (window as any).__qaLongTasks = [];
              (window as any).__qaCls = 0;
            });

            await page.goto(`${BASE_URL}${item.route}`, { waitUntil: 'networkidle' });
            await page.waitForTimeout(350);

            const overflow = await page.evaluate(
              () => document.documentElement.scrollWidth > window.innerWidth + 1
            );
            if (overflow) {
              overflowFailures.push(`${vp.name}:${item.route}`);
            }

            const timing = await page.evaluate(() => {
              const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
              return {
                ttfbMs: nav ? Math.round(nav.responseStart - nav.requestStart) : 0,
                domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : 0,
                loadMs: nav ? Math.round(nav.loadEventEnd - nav.startTime) : 0,
                cls: Number(((window as any).__qaCls || 0).toFixed(4)),
                longTasks: ((window as any).__qaLongTasks || []) as number[],
              };
            });

            let avatarFps = 0;
            if (item.route !== '/login') {
              const av = await verifyAvatarPresenceAndMotion(page);
              avatarFps = av.fps;
              if (!av.visible || av.fps < 20) {
                lowFpsFailures.push(`${vp.name}:${item.route}(vis=${av.visible},fps=${av.fps})`);
              }
            }

            perfMetrics.push({
              route: item.route,
              viewport: vp.name,
              ttfbMs: timing.ttfbMs,
              domContentLoadedMs: timing.domContentLoadedMs,
              loadMs: timing.loadMs,
              cls: timing.cls,
              longTasksCount: timing.longTasks.length,
              maxLongTaskMs: timing.longTasks.length ? Math.round(Math.max(...timing.longTasks)) : 0,
              avatarFps,
              horizontalOverflow: overflow,
            });
          }
          await page.screenshot({ path: path.join(ARTIFACT_DIR, `admin_${vp.name}.png`) });
        } finally {
          const errStr = formatBucketErrors(bucket);
          if (errStr) errorFailures.push(`${vp.name}: ${errStr}`);
          await context.close();
        }
      }

      const passed = overflowFailures.length === 0 && lowFpsFailures.length === 0 && errorFailures.length === 0;
      results.push({
        id: 'WRP-01',
        suite: 'Responsive & Perf',
        name: '4-Viewport Matrix (360x800, 768x1024, 1440x900, 1920x1080) Zero Overflow, Web Vitals & 3D FPS',
        role: 'ALL',
        passed,
        durationMs: Date.now() - t0,
        details: passed
          ? `20 route-viewport checks passed; zero horizontal overflow; 3D avatar FPS>=20 on all authenticated viewports`
          : `overflow=[${overflowFailures.join(',')}], lowFps=[${lowFpsFailures.join(',')}], errors=[${errorFailures.join(';')}]`,
      });
    }

    // WRP-02: Mobile Bottom Nav, "+" QuickActionSheet, AestheticMenu Drawer & Tablet Slim Rail
    {
      const t0 = Date.now();
      const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
      const page = await context.newPage();
      const bucket = attachErrorListeners(page);

      try {
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
        await page.click('button:has-text("Admin") >> nth=-1');
        await page.waitForURL('**/admin', { timeout: 10000 });

        // Bottom nav visible on mobile
        const mobileNavVisible = await page.locator('nav[aria-label="Mobile Navigation Bar"]').isVisible();

        // Open "+" Quick Action Sheet
        await page.click('[data-guide-id="quick-action-button"]');
        await page.waitForSelector('text=Quick Actions', { timeout: 5000 });
        const sheetOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 1
        );
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'mobile-quick-action-sheet.png') });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);

        // Open AestheticMenu drawer
        await page.click('[data-guide-id="mobile-menu-button"]');
        await page.waitForSelector('text=Academic Year', { timeout: 5000 });
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'mobile-aesthetic-menu.png') });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);

        // Check Tablet Slim Rail at 768x1024
        await page.setViewportSize({ width: 768, height: 1024 });
        await page.waitForTimeout(250);
        const tabletRailVisible = await page.locator('aside').nth(1).isVisible().catch(() => false);
        const tabletOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 1
        );

        const errStr = formatBucketErrors(bucket);
        const passed = mobileNavVisible && !sheetOverflow && tabletRailVisible && !tabletOverflow && !errStr;
        results.push({
          id: 'WRP-02',
          suite: 'Responsive & Perf',
          name: 'Mobile Bottom Nav, "+" QuickActionSheet, AestheticMenu Drawer & Tablet 768px Slim Rail',
          role: 'ADMIN',
          passed,
          durationMs: Date.now() - t0,
          details: `mobileNav=${mobileNavVisible}, sheetNoOverflow=${!sheetOverflow}, tabletRail=${tabletRailVisible}, tabletNoOverflow=${!tabletOverflow}${errStr ? `; ${errStr}` : ''}`,
        });
      } catch (err) {
        results.push({
          id: 'WRP-02',
          suite: 'Responsive & Perf',
          name: 'Mobile Bottom Nav, "+" QuickActionSheet, AestheticMenu Drawer & Tablet 768px Slim Rail',
          role: 'ADMIN',
          passed: false,
          durationMs: Date.now() - t0,
          details: err instanceof Error ? err.message : String(err),
        });
      } finally {
        await context.close();
      }
    }

    // WRP-03: Fast-Scroll Stress Test on Student Directory & Sector Ledger + 4x CPU Throttled Load
    {
      const t0 = Date.now();
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const bucket = attachErrorListeners(page);

      try {
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
        await page.evaluate(`localStorage.setItem('khazna_current_role_v1', 'admin')`);
        await page.goto(`${BASE_URL}/admin/students`, { waitUntil: 'networkidle' });

        // Rapid scroll sweep down and up
        const studentSweep = await page.evaluate(`
          new Promise((resolve) => {
            const maxY = Math.max(400, document.documentElement.scrollHeight - window.innerHeight);
            let step = 0;
            const totalSteps = 20;
            function tick() {
              step++;
              const pos = step <= 10 ? (step / 10) * maxY : ((20 - step) / 10) * maxY;
              window.scrollTo(0, pos);
              if (step < totalSteps) {
                requestAnimationFrame(tick);
              } else {
                const rows = document.querySelectorAll('table tbody tr');
                let blankRows = 0;
                rows.forEach((r) => {
                  if ((r.textContent || '').trim().length === 0) blankRows++;
                });
                resolve({ rowCount: rows.length, blankRows });
              }
            }
            requestAnimationFrame(tick);
          })
        `) as { rowCount: number; blankRows: number };

        // Manager Ledger rapid scroll
        await page.evaluate(`localStorage.setItem('khazna_current_role_v1', 'manager')`);
        await page.goto(`${BASE_URL}/m/dept-fiqh/ledger`, { waitUntil: 'networkidle' });
        const ledgerSweep = await page.evaluate(`
          new Promise((resolve) => {
            const maxY = Math.max(400, document.documentElement.scrollHeight - window.innerHeight);
            let step = 0;
            function tick() {
              step++;
              const pos = step <= 10 ? (step / 10) * maxY : ((20 - step) / 10) * maxY;
              window.scrollTo(0, pos);
              if (step < 20) {
                requestAnimationFrame(tick);
              } else {
                const rows = document.querySelectorAll('table tbody tr');
                let blankRows = 0;
                rows.forEach((r) => {
                  if ((r.textContent || '').trim().length === 0) blankRows++;
                });
                resolve({ rowCount: rows.length, blankRows });
              }
            }
            requestAnimationFrame(tick);
          })
        `) as { rowCount: number; blankRows: number };

        // 4x CPU throttle load verification on /admin
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await page.evaluate(`localStorage.setItem('khazna_current_role_v1', 'admin')`);
        const tThrottled = Date.now();
        await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle' });
        const throttledLoadMs = Date.now() - tThrottled;
        const throttledH1 = await page.locator('main h1').isVisible();
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

        const errStr = formatBucketErrors(bucket);
        const passed =
          studentSweep.rowCount > 0 &&
          studentSweep.blankRows === 0 &&
          ledgerSweep.rowCount > 0 &&
          ledgerSweep.blankRows === 0 &&
          throttledH1 &&
          !errStr;

        results.push({
          id: 'WRP-03',
          suite: 'Responsive & Perf',
          name: 'Fast-Scroll Table Stress (Zero Blank Rows) & 4x CPU Throttled Load Check',
          role: 'ADMIN',
          passed,
          durationMs: Date.now() - t0,
          details: `studentRows=${studentSweep.rowCount}(blank=${studentSweep.blankRows}), ledgerRows=${ledgerSweep.rowCount}(blank=${ledgerSweep.blankRows}), cpu4xAdminLoad=${throttledLoadMs}ms${errStr ? `; ${errStr}` : ''}`,
        });
      } catch (err) {
        results.push({
          id: 'WRP-03',
          suite: 'Responsive & Perf',
          name: 'Fast-Scroll Table Stress (Zero Blank Rows) & 4x CPU Throttled Load Check',
          role: 'ADMIN',
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

  return { results, perfMetrics };
}
