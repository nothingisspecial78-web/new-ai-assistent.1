import fs from 'node:fs';
import path from 'node:path';
import { launchQaBrowser, verifyAvatarPresenceAndMotion } from './qaRunner.ts';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ARTIFACTS_DIR = path.resolve(process.cwd(), 'qa-artifacts');
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

interface ScrollMetric {
  pageUrl: string;
  role: string;
  scrollDurationMs: number;
  measuredFps: number;
  longTasksDuringScroll: number;
  jankDetected: boolean;
  avatarFps: number;
}

const PAGES_TO_SCROLL = [
  { role: 'admin', url: '/admin/students', name: 'Admin Student Directory' },
  { role: 'admin', url: '/admin/audit', name: 'Admin Audit Log' },
  { role: 'manager', url: '/m/dept-fiqh/ledger', name: 'Manager Sector Ledger' },
  { role: 'student', url: '/app', name: 'Student Overview Cards' },
];

async function runScrollBenchmark() {
  console.log('=== STARTING SCROLL BENCHMARK (scripts/perfScroll.ts) ===');
  const browser = await launchQaBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Inject Long Tasks recorder
  await page.addInitScript(() => {
    (window as any).__scrollLongTasks = [];
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          (window as any).__scrollLongTasks.push(entry.duration);
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      // ignore
    }
  });

  const results: ScrollMetric[] = [];

  for (const item of PAGES_TO_SCROLL) {
    console.log(`\n--- Testing Scroll: ${item.name} (${item.url}) ---`);
    await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(`localStorage.setItem('khazna_current_role_v1', '${item.role}')`);
    await page.goto(`${BASE_URL}${item.url}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Reset long tasks
    await page.evaluate(() => {
      (window as any).__scrollLongTasks = [];
    });

    // Measure FPS during smooth and rapid programmatic scroll
    const fps: number = await page.evaluate(`
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const duration = 1800;
        const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;

        function step() {
          frames++;
          const now = performance.now();
          const elapsed = now - start;
          const progress = Math.min(1, elapsed / duration);

          // Scroll down then back up
          const phase = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
          window.scrollTo(0, phase * scrollHeight);

          if (elapsed < duration) {
            requestAnimationFrame(step);
          } else {
            resolve(Math.round(frames / (elapsed / 1000)));
          }
        }
        requestAnimationFrame(step);
      })
    `);

    const longTasks: number[] = await page.evaluate(() => (window as any).__scrollLongTasks || []);
    const avatar = await verifyAvatarPresenceAndMotion(page);

    const safeName = item.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, `scroll_${safeName}.png`) });

    const metric: ScrollMetric = {
      pageUrl: item.url,
      role: item.role,
      scrollDurationMs: 1800,
      measuredFps: fps,
      longTasksDuringScroll: longTasks.length,
      jankDetected: fps < 45 || longTasks.length > 2,
      avatarFps: avatar.fps,
    };

    results.push(metric);
    console.log(`✓ ${item.name.padEnd(26)} | Scroll FPS: ${String(fps).padStart(2)} | Long Tasks: ${longTasks.length} | Avatar 3D FPS: ${avatar.fps}`);
  }

  await browser.close();

  const reportPath = path.join(ARTIFACTS_DIR, 'scroll_benchmark_latest.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nScroll benchmark report saved to: ${reportPath}`);
  return results;
}

if (process.argv[1]?.includes('perfScroll.ts')) {
  runScrollBenchmark().catch((err) => {
    console.error('perfScroll error:', err);
    process.exit(1);
  });
}
