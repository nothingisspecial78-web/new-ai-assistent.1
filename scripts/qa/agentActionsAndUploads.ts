import fs from 'node:fs';
import path from 'node:path';
import type { QaTestResult } from './agentDataAccess.ts';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const LOG_DIR = path.resolve(process.cwd(), 'qa-artifacts/assistant/actions-uploads');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function parseSseEvents(raw: string): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [];
  for (const chunk of raw.split('\n\n')) {
    const line = chunk.split('\n').find((l) => l.startsWith('data: '));
    if (!line) continue;
    try {
      events.push(JSON.parse(line.slice(6)));
    } catch {
      // ignore non-json
    }
  }
  return events;
}

export async function runActionsAndUploadsAgent(): Promise<QaTestResult[]> {
  console.log('\n=== [AGENT 8: ACTIONS, CONFIRMATIONS, UNDO & UPLOADS] Starting Suite G ===');
  const results: QaTestResult[] = [];
  const adminToken = 'demo:ADMIN:principal@islahululoom.edu.in:::demo';
  const studentToken = 'demo:STUDENT:S0125:dept-fiqh:S0125:demo';

  const adminAppState = {
    role: 'admin',
    college: { id: 'demo', name: 'Islahul Uloom Arabic College' },
    students: [{ id: 'S0125', name: 'Safwan K.', className: 'Fiqh 2' }],
    sectors: [{ slug: 'dept-fiqh', name: 'Dept Fiqh', receiptPrefix: 'DF-' }],
  };

  // ACT-01: Write action preview -> confirm -> single-use token rejection -> undo
  {
    const t0 = Date.now();
    try {
      const chatRes = await fetch(`${BASE_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-app-id': 'khazna-ledger',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          appId: 'khazna-ledger',
          messages: [{ role: 'user', content: 'Create a new student named QA Test Student in Fiqh 2' }],
          appState: adminAppState,
        }),
      });
      const events = parseSseEvents(await chatRes.text());
      const confirmEv = events.find((e) => e.type === 'confirmation_required');

      if (!confirmEv || !confirmEv.actionId || !confirmEv.confirmationToken) {
        results.push({
          id: 'ACT-01',
          name: 'Write Action Confirmation, Token Single-Use & Undo Flow',
          role: 'ADMIN',
          passed: false,
          durationMs: Date.now() - t0,
          details: `Expected confirmation_required event, got types: ${events.map((e) => e.type).join(',')}`,
        });
      } else {
        const actionId = String(confirmEv.actionId);
        const token = String(confirmEv.confirmationToken);

        const c1 = await fetch(`${BASE_URL}/api/actions/${encodeURIComponent(actionId)}/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-app-id': 'khazna-ledger',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            appId: 'khazna-ledger',
            confirmationToken: token,
            decision: 'confirm',
            appState: adminAppState,
          }),
        });
        const c1Json = (await c1.json()) as { ok?: boolean };

        // Replay same single-use confirmation token -> must be rejected
        const cReplay = await fetch(`${BASE_URL}/api/actions/${encodeURIComponent(actionId)}/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-app-id': 'khazna-ledger',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            appId: 'khazna-ledger',
            confirmationToken: token,
            decision: 'confirm',
            appState: adminAppState,
          }),
        });

        // Undo executed action
        const undoRes = await fetch(`${BASE_URL}/api/actions/${encodeURIComponent(actionId)}/undo`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-app-id': 'khazna-ledger',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ appId: 'khazna-ledger' }),
        });

        const passed = c1.ok && Boolean(c1Json.ok) && !cReplay.ok && undoRes.ok;
        results.push({
          id: 'ACT-01',
          name: 'Write Action Confirmation, Token Single-Use & Undo Flow',
          role: 'ADMIN',
          passed,
          durationMs: Date.now() - t0,
          details: `confirm=${c1.status}, replayStatus=${cReplay.status}, undo=${undoRes.status}`,
        });
      }
    } catch (err) {
      results.push({
        id: 'ACT-01',
        name: 'Write Action Confirmation, Token Single-Use & Undo Flow',
        role: 'ADMIN',
        passed: false,
        durationMs: Date.now() - t0,
        details: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // UPL-01: Valid CSV upload preview -> confirm import as ADMIN
  {
    const t0 = Date.now();
    try {
      const csv = 'id,name,className,phone,guardian\nS0991,QA Upload One,Fiqh 2,9847009911,Haji Ali\n';
      const fd = new FormData();
      fd.append('appId', 'khazna-ledger');
      fd.append('role', 'admin');
      fd.append('file', new Blob([csv], { type: 'text/csv' }), 'qa-students.csv');

      const res = await fetch(`${BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'x-app-id': 'khazna-ledger',
          Authorization: `Bearer ${adminToken}`,
        },
        body: fd,
      });
      const json = (await res.json()) as {
        formatMatched?: boolean;
        validCount?: number;
        actionId?: string;
        confirmationToken?: string;
      };

      let confirmed = false;
      if (json.actionId && json.confirmationToken) {
        const conf = await fetch(`${BASE_URL}/api/actions/${encodeURIComponent(json.actionId)}/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-app-id': 'khazna-ledger',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            appId: 'khazna-ledger',
            confirmationToken: json.confirmationToken,
            decision: 'confirm',
            appState: adminAppState,
          }),
        });
        confirmed = conf.ok;
      }

      const passed = res.ok && json.formatMatched === true && (json.validCount ?? 0) >= 1 && confirmed;
      results.push({
        id: 'UPL-01',
        name: 'Valid CSV Upload Preview & Import Confirmation (Admin)',
        role: 'ADMIN',
        passed,
        durationMs: Date.now() - t0,
        details: `formatMatched=${json.formatMatched}, validCount=${json.validCount}, confirmed=${confirmed}`,
      });
    } catch (err) {
      results.push({
        id: 'UPL-01',
        name: 'Valid CSV Upload Preview & Import Confirmation (Admin)',
        role: 'ADMIN',
        passed: false,
        durationMs: Date.now() - t0,
        details: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // UPL-02: Malformed CSV upload blocked with clear missing columns
  {
    const t0 = Date.now();
    try {
      const badCsv = 'foo,bar\n1,2\n';
      const fd = new FormData();
      fd.append('appId', 'khazna-ledger');
      fd.append('role', 'admin');
      fd.append('file', new Blob([badCsv], { type: 'text/csv' }), 'bad-format.csv');

      const res = await fetch(`${BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'x-app-id': 'khazna-ledger',
          Authorization: `Bearer ${adminToken}`,
        },
        body: fd,
      });
      const json = (await res.json()) as { formatMatched?: boolean; missingRequiredColumns?: string[] };
      const passed = json.formatMatched === false;
      results.push({
        id: 'UPL-02',
        name: 'Malformed CSV Upload Blocked with Missing-Column Validation',
        role: 'ADMIN',
        passed,
        durationMs: Date.now() - t0,
        details: `formatMatched=${json.formatMatched}, missing=${(json.missingRequiredColumns || []).join(',')}`,
      });
    } catch (err) {
      results.push({
        id: 'UPL-02',
        name: 'Malformed CSV Upload Blocked with Missing-Column Validation',
        role: 'ADMIN',
        passed: false,
        durationMs: Date.now() - t0,
        details: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // UPL-03: Student upload blocked
  {
    const t0 = Date.now();
    try {
      const csv = 'id,name,className\nS0992,Hack Student,Fiqh 2\n';
      const fd = new FormData();
      fd.append('appId', 'khazna-ledger');
      fd.append('role', 'student');
      fd.append('file', new Blob([csv], { type: 'text/csv' }), 'student-try.csv');

      const res = await fetch(`${BASE_URL}/api/upload`, {
        method: 'POST',
        headers: {
          'x-app-id': 'khazna-ledger',
          Authorization: `Bearer ${studentToken}`,
        },
        body: fd,
      });
      const json = (await res.json()) as { permissionError?: string; error?: string };
      const passed = res.status === 403 || Boolean(json.permissionError) || Boolean(json.error);
      results.push({
        id: 'UPL-03',
        name: 'Student Role Blocked from Spreadsheet Upload',
        role: 'STUDENT',
        passed,
        durationMs: Date.now() - t0,
        details: `status=${res.status}, message=${json.permissionError || json.error || 'blocked'}`,
      });
    } catch (err) {
      results.push({
        id: 'UPL-03',
        name: 'Student Role Blocked from Spreadsheet Upload',
        role: 'STUDENT',
        passed: false,
        durationMs: Date.now() - t0,
        details: err instanceof Error ? err.message : String(err),
      });
    }
  }

  fs.writeFileSync(path.join(LOG_DIR, 'actions-uploads.json'), JSON.stringify(results, null, 2));
  return results;
}
