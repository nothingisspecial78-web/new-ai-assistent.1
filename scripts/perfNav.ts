import fs from 'node:fs';
import path from 'node:path';
import { launchQaBrowser, verifyAvatarPresenceAndMotion, type NavMetric } from './qaRunner.ts';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ARTIFACTS_DIR = path.resolve(process.cwd(), 'qa-artifacts');
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

interface RoleNavScenario {
  role: string;
  initialRoute: string;
  transitions: Array<{ name: string; selector: string; expectedUrl: string }>;
}

const SCENARIOS: RoleNavScenario[] = [
  {
    role: 'admin',
    initialRoute: '/admin',
    transitions: [
      { name: 'Students Directory', selector: '[data-guide-id="nav-students"]', expectedUrl: '/admin/students' },
      { name: 'Bulk Import', selector: '[data-guide-id="nav-students-import"]', expectedUrl: '/admin/students/import' },
      { name: 'Audit Trail', selector: '[data-guide-id="nav-audit"]', expectedUrl: '/admin/audit' },
      { name: 'Sectors & Classes', selector: '[data-guide-id="nav-sectors"]', expectedUrl: '/admin/sectors' },
      { name: 'Issued Reports', selector: '[data-guide-id="nav-reports"]', expectedUrl: '/admin/issued-reports' },
      { name: 'Institution Profile', selector: '[data-guide-id="nav-institution"]', expectedUrl: '/admin/institution' },
      { name: 'Dashboard', selector: '[data-guide-id="nav-dashboard"]', expectedUrl: '/admin' },
    ],
  },
  {
    role: 'manager',
    initialRoute: '/m/dept-fiqh',
    transitions: [
      { name: 'Ledger', selector: '[data-guide-id="nav-manager-ledger"]', expectedUrl: '/m/dept-fiqh/ledger' },
      { name: 'Bulk Entry', selector: '[data-guide-id="nav-manager-bulk"]', expectedUrl: '/m/dept-fiqh/bulk' },
      { name: 'Class Reports', selector: '[data-guide-id="nav-manager-reports"]', expectedUrl: '/m/dept-fiqh/reports' },
      { name: 'Batches', selector: '[data-guide-id="nav-manager-batches"]', expectedUrl: '/m/dept-fiqh/batches' },
      { name: 'Overview', selector: '[data-guide-id="nav-manager-overview"]', expectedUrl: '/m/dept-fiqh' },
    ],
  },
  {
    role: 'student',
    initialRoute: '/app',
    transitions: [
      { name: 'Profile', selector: 'a[href="/app/profile"]', expectedUrl: '/app/profile' },
      { name: 'Notifications', selector: 'a[href="/app/notifications"]', expectedUrl: '/app/notifications' },
      { name: 'Overview', selector: '[data-guide-id="nav-student-overview"]', expectedUrl: '/app' },
    ],
  },
];

async function runNavBenchmark() {
  console.log('=== STARTING NAVIGATION BENCHMARK (scripts/perfNav.ts) ===');
  const browser = await launchQaBrowser();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  // Inject Long Tasks Observer
  await page.addInitScript(() => {
    (window as any).__longTasks = [];
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          (window as any).__longTasks.push(entry.duration);
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      // ignore
    }
  });

  const allMetrics: NavMetric[] = [];

  for (const scenario of SCENARIOS) {
    console.log(`\n--- Testing Role: ${scenario.role.toUpperCase()} ---`);
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(`localStorage.setItem('khazna_current_role_v1', '${scenario.role}')`);
    await page.goto(`${BASE_URL}${scenario.initialRoute}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    let currentRoute = scenario.initialRoute;

    for (const trans of scenario.transitions) {
      // Reset long tasks recorder
      await page.evaluate(() => {
        (window as any).__longTasks = [];
      });

      const navBtn = page.locator(trans.selector).first();
      const exists = (await navBtn.count()) > 0;

      if (!exists) {
        console.warn(`[WARN] Selector not found: ${trans.selector} for ${trans.name}`);
        continue;
      }

      const t0 = performance.now();
      await navBtn.click();
      const visualResponseMs = Math.round(performance.now() - t0);

      // Wait until target route is reached
      const tStartWait = performance.now();
      await page.waitForURL(`**${trans.expectedUrl}*`, { timeout: 6000 }).catch(() => {});
      const interactiveMs = Math.round(performance.now() - tStartWait);

      // Settle
      await page.waitForTimeout(300);

      // Collect long tasks
      const longTasks: number[] = await page.evaluate(() => (window as any).__longTasks || []);
      const maxLongTask = longTasks.length > 0 ? Math.round(Math.max(...longTasks)) : 0;

      // Verify 3D Avatar presence & continuous animation
      const avatarState = await verifyAvatarPresenceAndMotion(page);

      // Capture screenshot
      const safeFrom = currentRoute.replace(/[^a-zA-Z0-9]/g, '_');
      const safeTo = trans.expectedUrl.replace(/[^a-zA-Z0-9]/g, '_');
      const shotPath = path.join(ARTIFACTS_DIR, `nav_${scenario.role}_${safeFrom}_to_${safeTo}.png`);
      await page.screenshot({ path: shotPath, fullPage: false });

      const metric: NavMetric = {
        fromRoute: currentRoute,
        toRoute: trans.expectedUrl,
        role: scenario.role,
        device: 'desktop_1440x900',
        visualResponseMs,
        interactiveMs,
        longTasksCount: longTasks.length,
        maxLongTaskMs: maxLongTask,
        avatarFps: avatarState.fps,
        avatarVisible: avatarState.visible,
        avatarAnimating: avatarState.animating,
      };

      allMetrics.push(metric);

      console.log(
        `✓ ${trans.name.padEnd(20)} | Visual: ${String(visualResponseMs).padStart(3)}ms | Content: ${String(interactiveMs).padStart(4)}ms | LongTasks: ${longTasks.length} (max: ${maxLongTask}ms) | 3D FPS: ${avatarState.fps}`
      );

      currentRoute = trans.expectedUrl;
    }
  }

  await browser.close();

  const reportPath = path.join(ARTIFACTS_DIR, 'nav_benchmark_latest.json');
  fs.writeFileSync(reportPath, JSON.stringify(allMetrics, null, 2));
  console.log(`\nNavigation benchmark report saved to: ${reportPath}`);
  return allMetrics;
}

if (process.argv[1]?.includes('perfNav.ts')) {
  runNavBenchmark().catch((err) => {
    console.error('perfNav error:', err);
    process.exit(1);
  });
}
