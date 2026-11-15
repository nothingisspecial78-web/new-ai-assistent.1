import fs from 'node:fs';
import path from 'node:path';
import { launchQaBrowser } from '../qaRunner.ts';
import type { QaTestResult } from './agentDataAccess.ts';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const LOG_DIR = path.resolve(process.cwd(), 'qa-artifacts/assistant/mobile-perf');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

export async function runAssistantMobilePerfAgent(): Promise<QaTestResult[]> {
  console.log('\n=== [AGENT 9: MOBILE, SUGGESTIONS, PERIOD COMPARISON & ZERO-ERROR PERF] Starting Suite H ===');
  const results: QaTestResult[] = [];
  const browser = await launchQaBrowser();

  try {
    // AMP-01: Opening assistant starts clean new chat; suggestions visible at start & disappear after first message
    {
      const t0 = Date.now();
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      page.on('pageerror', (e) => errors.push(e.message));

      try {
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
        await page.click('button:has-text("Admin") >> nth=-1');
        await page.waitForURL('**/admin', { timeout: 10000 });
        await page.waitForSelector('[data-testid="assistant-launcher"]', { timeout: 10000 });
        await page.click('[data-testid="assistant-launcher"]');
        await page.waitForSelector('.aia-suggestion-btn', { timeout: 8000 });

        const initialSuggestionCount = await page.locator('.aia-suggestion-btn').count();
        const textarea = page.locator('.aia-panel textarea').first();
        await textarea.fill('How many students are enrolled?');
        await textarea.press('Enter');

        await page.waitForTimeout(800);
        const suggestionsAfterSend = await page.locator('.aia-suggestion-btn').count();
        const passed = initialSuggestionCount > 0 && suggestionsAfterSend === 0 && errors.length === 0;
        results.push({
          id: 'AMP-01',
          name: 'Clean New Chat on Open + Suggested Actions Disappear When Chat Starts',
          role: 'ADMIN',
          passed,
          durationMs: Date.now() - t0,
          details: `initialSuggestions=${initialSuggestionCount}, afterSend=${suggestionsAfterSend}, errors=${errors.length}`,
        });
      } catch (err) {
        results.push({
          id: 'AMP-01',
          name: 'Clean New Chat on Open + Suggested Actions Disappear When Chat Starts',
          role: 'ADMIN',
          passed: false,
          durationMs: Date.now() - t0,
          details: err instanceof Error ? err.message : String(err),
        });
      } finally {
        await context.close();
      }
    }

    // AMP-02: Period comparison + pronoun follow-up focus resolution via /api/chat
    {
      const t0 = Date.now();
      try {
        const adminToken = 'demo:ADMIN:principal@islahululoom.edu.in:::demo';
        const appState = {
          role: 'admin',
          college: { id: 'demo', name: 'Islahul Uloom Arabic College' },
          sectors: [{ slug: 'dept-fiqh', name: 'Dept Fiqh', receiptPrefix: 'DF-' }],
          students: [{ id: 'S0125', name: 'Safwan K.', className: 'Fiqh 2', phone: '9847012125', guardian: 'Moideen Kutty' }],
          transactions: [
            { id: 'T1', studentId: 'S0125', sector: 'dept-fiqh', type: 'credit', title: 'Fee', amount: 1500, date: '2026-11-05', receiptNo: 'DF-221' },
            { id: 'T2', studentId: 'S0125', sector: 'dept-fiqh', type: 'credit', title: 'Fee', amount: 1000, date: '2026-10-12', receiptNo: 'DF-210' },
          ],
        };

        const cmpRes = await fetch(`${BASE_URL}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-app-id': 'khazna-ledger',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            appId: 'khazna-ledger',
            messages: [{ role: 'user', content: 'Compare Dept Fiqh collection this month vs last month' }],
            appState,
          }),
        });
        const cmpBody = await cmpRes.text();

        const followRes = await fetch(`${BASE_URL}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-app-id': 'khazna-ledger',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            appId: 'khazna-ledger',
            messages: [
              { role: 'user', content: 'Show details for Safwan K.' },
              { role: 'assistant', content: 'Safwan K. (S0125) is in Fiqh 2.' },
              { role: 'user', content: 'What about his balance?' },
            ],
            appState,
          }),
        });
        const followBody = await followRes.text();

        const cmpOk = cmpBody.includes('compare_periods') && cmpBody.includes('1,500');
        const followOk = followBody.includes('S0125') || followBody.includes('Safwan');
        results.push({
          id: 'AMP-02',
          name: 'Period Comparison (compare_periods) & Pronoun Follow-Up Resolution',
          role: 'ADMIN',
          passed: cmpOk && followOk,
          durationMs: Date.now() - t0,
          details: `comparePeriods=${cmpOk}, pronounFollowUp=${followOk}`,
        });
      } catch (err) {
        results.push({
          id: 'AMP-02',
          name: 'Period Comparison (compare_periods) & Pronoun Follow-Up Resolution',
          role: 'ADMIN',
          passed: false,
          durationMs: Date.now() - t0,
          details: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // AMP-03: Mobile (360x800) & Tablet (768x1024) Assistant Panel Layout, No Horizontal Overflow, Zero Console Errors
    {
      const t0 = Date.now();
      const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
      const page = await context.newPage();
      const consoleErrors: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push(m.text());
      });
      page.on('pageerror', (e) => consoleErrors.push(e.message));

      try {
        await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
        await page.click('button:has-text("Admin") >> nth=-1');
        await page.waitForURL('**/admin', { timeout: 10000 });
        await page.waitForSelector('[data-testid="assistant-launcher"]', { timeout: 10000 });
        await page.click('[data-testid="assistant-launcher"]');
        await page.waitForSelector('.aia-panel', { timeout: 8000 });

        const mobileOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 1
        );
        await page.screenshot({ path: path.join(LOG_DIR, 'mobile-assistant-360x800.png') });

        await page.setViewportSize({ width: 768, height: 1024 });
        await page.waitForTimeout(300);
        const tabletOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 1
        );

        const passed = !mobileOverflow && !tabletOverflow && consoleErrors.length === 0;
        results.push({
          id: 'AMP-03',
          name: 'Mobile (360x800) & Tablet (768x1024) Assistant Panel Responsive Zero-Overflow',
          role: 'ADMIN',
          passed,
          durationMs: Date.now() - t0,
          details: `mobileOverflow=${mobileOverflow}, tabletOverflow=${tabletOverflow}, consoleErrors=${consoleErrors.length}`,
        });
      } catch (err) {
        results.push({
          id: 'AMP-03',
          name: 'Mobile (360x800) & Tablet (768x1024) Assistant Panel Responsive Zero-Overflow',
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

  return results;
}
