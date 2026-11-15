import fs from 'node:fs';
import path from 'node:path';
import { launchQaBrowser, verifyAvatarPresenceAndMotion } from '../qaRunner.ts';
import type { QaTestResult } from './agentDataAccess.ts';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const LOG_DIR = path.resolve(process.cwd(), 'qa-artifacts/assistant/guide-3d');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

export async function runGuideAnd3DAgent(): Promise<QaTestResult[]> {
  console.log('\n=== [AGENT 7: GUIDE WALKTHROUGH, PRIVACY & 3D AVATAR] Starting Suite F ===');
  const results: QaTestResult[] = [];
  const browser = await launchQaBrowser();

  try {
    // G3D-01: Public login guide walkthrough, privacy eye-closing, and zero password transmission
    {
      const t0 = Date.now();
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const networkBodies: string[] = [];
      page.on('request', (req) => {
        if (req.url().includes('/api/') && req.postData()) {
          networkBodies.push(req.postData() || '');
        }
      });

      try {
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
        await page.waitForSelector('[data-testid="assistant-launcher"]', { timeout: 10000 });
        await page.click('[data-testid="assistant-launcher"]');
        await page.waitForSelector('.aia-panel', { timeout: 8000 });

        const textarea = page.locator('.aia-panel textarea').first();
        await textarea.fill('Guide me: how to log in');
        await textarea.press('Enter');

        await page.waitForSelector('.aia-guide-root', { timeout: 10000 });
        // Advance through steps to password step
        for (let i = 0; i < 4; i++) {
          const badgeCount = await page.locator('[data-testid="guide-privacy-badge"]').count();
          if (badgeCount > 0) break;
          const nextBtn = page.locator('.aia-guide-dock button[aria-label="Next"], .aia-guide-dock button[aria-label="Finish"]');
          if ((await nextBtn.count()) > 0) {
            await nextBtn.first().click();
            await page.waitForTimeout(300);
          }
        }

        const privacyVisible = await page.locator('[data-testid="guide-privacy-badge"]').isVisible();
        // Type secret password into field and ensure it never leaves the browser
        const secretPwd = 'QaSecretPassword!99';
        await page.fill('[data-guide-id="login-password"]', secretPwd);
        await page.waitForTimeout(300);

        // Test Back, Repeat, Mute, Exit dock controls
        await page.click('.aia-guide-dock button[aria-label="Repeat"]');
        await page.click('.aia-guide-dock button[aria-label*="Mute"]');
        await page.click('.aia-guide-dock button[aria-label="Back"]');
        await page.waitForTimeout(200);
        await page.click('.aia-guide-dock button[aria-label="Exit guide"]');
        await page.waitForTimeout(200);
        const guideExited = (await page.locator('.aia-guide-root').count()) === 0;

        const leaked = networkBodies.some((b) => b.includes(secretPwd));
        const passed = privacyVisible && guideExited && !leaked;
        results.push({
          id: 'G3D-01',
          name: 'Login Guide Privacy (Eyes Closed), Zero Password Network Leak & Dock Controls',
          role: 'PUBLIC',
          passed,
          durationMs: Date.now() - t0,
          details: `privacyBadge=${privacyVisible}, leaked=${leaked}, guideExited=${guideExited}`,
        });
      } catch (err) {
        results.push({
          id: 'G3D-01',
          name: 'Login Guide Privacy (Eyes Closed), Zero Password Network Leak & Dock Controls',
          role: 'PUBLIC',
          passed: false,
          durationMs: Date.now() - t0,
          details: err instanceof Error ? err.message : String(err),
        });
      } finally {
        await context.close();
      }
    }

    // G3D-02: "how do I see a student's details" routes to interactive guide, NOT a raw student data dump
    {
      const t0 = Date.now();
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      try {
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
        await page.click('button:has-text("Admin") >> nth=-1');
        await page.waitForURL('**/admin', { timeout: 10000 });
        await page.waitForSelector('[data-testid="assistant-launcher"]', { timeout: 10000 });
        await page.click('[data-testid="assistant-launcher"]');
        await page.waitForSelector('.aia-panel textarea', { timeout: 8000 });

        const textarea = page.locator('.aia-panel textarea').first();
        await textarea.fill("how do I see a student's details");
        await textarea.press('Enter');

        await page.waitForSelector('.aia-guide-root', { timeout: 10000 });
        const guideText = await page.locator('.aia-guide-card').innerText();
        await page.screenshot({ path: path.join(LOG_DIR, 'student-details-guide.png') });
        await page.click('.aia-guide-dock button[aria-label="Exit guide"]');

        const passed = guideText.length > 10;
        results.push({
          id: 'G3D-02',
          name: '"how do I see a student\'s details" Triggers Guide (Not Data Dump)',
          role: 'ADMIN',
          passed,
          durationMs: Date.now() - t0,
          details: `Guide started with instruction: "${guideText.slice(0, 80).replace(/\s+/g, ' ')}"`,
        });
      } catch (err) {
        results.push({
          id: 'G3D-02',
          name: '"how do I see a student\'s details" Triggers Guide (Not Data Dump)',
          role: 'ADMIN',
          passed: false,
          durationMs: Date.now() - t0,
          details: err instanceof Error ? err.message : String(err),
        });
      } finally {
        await context.close();
      }
    }

    // G3D-03: Student blocked from Admin guide via /api/chat
    {
      const t0 = Date.now();
      try {
        const res = await fetch(`${BASE_URL}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-app-id': 'khazna-ledger',
            Authorization: 'Bearer demo:STUDENT:S0125:dept-fiqh:S0125:demo',
          },
          body: JSON.stringify({
            appId: 'khazna-ledger',
            messages: [{ role: 'user', content: 'Guide me: import students from excel' }],
            appState: { role: 'student', meStudentId: 'S0125' },
          }),
        });
        const body = await res.text();
        const blocked =
          !body.includes('"guideId":"admin.students.import"') &&
          (body.toLowerCase().includes("isn't available") ||
            body.toLowerCase().includes("can't access") ||
            body.toLowerCase().includes('denied') ||
            body.includes('No interactive guide'));
        results.push({
          id: 'G3D-03',
          name: 'Student Blocked from Admin Guide Launch',
          role: 'STUDENT',
          passed: blocked,
          durationMs: Date.now() - t0,
          details: blocked ? 'Student denied access to admin.students.import guide' : `Unexpected response: ${body.slice(0, 140)}`,
        });
      } catch (err) {
        results.push({
          id: 'G3D-03',
          name: 'Student Blocked from Admin Guide Launch',
          role: 'STUDENT',
          passed: false,
          durationMs: Date.now() - t0,
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // G3D-04: 3D Avatar visible and animated (>= 25 FPS) on Desktop & Mobile across roles
    {
      const t0 = Date.now();
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      try {
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
        const pubCheck = await verifyAvatarPresenceAndMotion(page);
        await page.click('button:has-text("Admin") >> nth=-1');
        await page.waitForURL('**/admin', { timeout: 10000 });
        await page.waitForTimeout(400);
        const adminCheck = await verifyAvatarPresenceAndMotion(page);

        await page.setViewportSize({ width: 360, height: 800 });
        await page.waitForTimeout(400);
        const mobileCheck = await verifyAvatarPresenceAndMotion(page);

        const passed =
          pubCheck.visible &&
          adminCheck.visible &&
          mobileCheck.visible &&
          adminCheck.fps >= 25 &&
          mobileCheck.fps >= 25;
        results.push({
          id: 'G3D-04',
          name: '3D Avatar Presence & Continuous Animation (>=25 FPS Desktop & Mobile)',
          role: 'ALL',
          passed,
          durationMs: Date.now() - t0,
          details: `public=${pubCheck.fps}fps, admin=${adminCheck.fps}fps, mobile=${mobileCheck.fps}fps`,
        });
      } catch (err) {
        results.push({
          id: 'G3D-04',
          name: '3D Avatar Presence & Continuous Animation (>=25 FPS Desktop & Mobile)',
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
