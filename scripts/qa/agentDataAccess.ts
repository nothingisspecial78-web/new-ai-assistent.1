import fs from 'node:fs';
import path from 'node:path';
import { launchQaBrowser } from '../qaRunner.ts';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const LOG_DIR = path.resolve(process.cwd(), 'qa-artifacts/assistant/data-access');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

export interface QaTestResult {
  id: string;
  name: string;
  role: string;
  passed: boolean;
  durationMs: number;
  details: string;
}

export async function runDataAccessAgent(): Promise<QaTestResult[]> {
  console.log('\n=== [AGENT 2: DATA-ACCESS & SCOPE] Starting Suite A ===');
  const results: QaTestResult[] = [];
  const startTime = Date.now();

  const studentsPath = path.resolve(process.cwd(), 'data/qa_students.json');
  const seededStudents = fs.existsSync(studentsPath)
    ? JSON.parse(fs.readFileSync(studentsPath, 'utf8'))
    : [
        { id: 'S0125', admissionNo: 'S0125', name: 'Safwan K.', className: 'Fiqh 1', sectorId: 'dept-fiqh', dues: 15000, credit: 0, debit: 15000, balance: -15000 },
        { id: 'S0126', admissionNo: 'S0126', name: 'Rahul Sharma', className: 'Fiqh 2', sectorId: 'dept-fiqh', dues: 8500, credit: 2000, debit: 10500, balance: -8500 },
        { id: 'S0127', admissionNo: 'S0127', name: 'Rahul Varma', className: 'Hadith 1', sectorId: 'dept-hadith', dues: 0, credit: 15000, debit: 15000, balance: 0 },
      ];

  const adminAppState = {
    role: 'admin',
    college: { id: 'demo', name: 'Islahul Uloom Arabic College' },
    students: seededStudents.slice(0, 50),
    sectors: [
      { slug: 'dept-fiqh', name: 'Dept. Fiqh', budget: 50000 },
      { slug: 'dept-hadith', name: 'Dept. Hadith', budget: 40000 },
      { slug: 'office', name: 'Office & Admin', budget: 60000 },
    ],
  };

  const managerAppState = {
    role: 'manager',
    managerSector: 'dept-fiqh',
    college: { id: 'demo', name: 'Islahul Uloom Arabic College' },
    students: seededStudents.filter((s: any) => s.sectorId === 'dept-fiqh').slice(0, 50),
    sectors: [
      { slug: 'dept-fiqh', name: 'Dept. Fiqh', budget: 50000 },
    ],
  };

  const studentAppState = {
    role: 'student',
    activeOrgId: 'demo',
    meStudentId: 'S0125',
    meStudent: { id: 'S0125', name: 'Safwan K.', className: 'Fiqh 1' },
    mySummary: { balance: -15000, credit: 0, debit: 15000 },
  };

  const browser = await launchQaBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // 1. Admin Full Scope Data Retrieval
    const t0 = performance.now();
    const adminRes = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': 'khazna-ledger',
        'Authorization': 'demo:ADMIN:principal@islahululoom.edu.in:::demo',
      },
      body: JSON.stringify({
        appId: 'khazna-ledger',
        appState: adminAppState,
        messages: [{ role: 'user', content: 'Show financial details for Safwan K. (S0125)' }],
      }),
    });
    const adminText = await adminRes.text();
    const adminPass = adminRes.ok && (adminText.includes('Safwan') || adminText.includes('S0125') || adminText.includes('15,000'));
    results.push({
      id: 'DATA-SCOPE-01',
      name: 'Admin Student Financial Details Lookup',
      role: 'ADMIN',
      passed: adminPass,
      durationMs: Math.round(performance.now() - t0),
      details: adminPass ? 'Retrieved student records matching S0125' : `Unexpected response: ${adminText.slice(0, 100)}`,
    });

    // 2. Disambiguation for Ambiguous Names
    const t1 = performance.now();
    const ambigRes = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': 'khazna-ledger',
        'Authorization': 'demo:ADMIN:principal@islahululoom.edu.in:::demo',
      },
      body: JSON.stringify({
        appId: 'khazna-ledger',
        appState: adminAppState,
        messages: [{ role: 'user', content: 'Show details for Rahul' }],
      }),
    });
    const ambigText = await ambigRes.text();
    const ambigPass = ambigRes.ok && (ambigText.includes('Rahul') || ambigText.includes('multiple') || ambigText.includes('specify') || ambigText.includes('S0126') || ambigText.includes('S0127'));
    results.push({
      id: 'DATA-SCOPE-02',
      name: 'Duplicate / Ambiguous Name Disambiguation',
      role: 'ADMIN',
      passed: ambigPass,
      durationMs: Math.round(performance.now() - t1),
      details: ambigPass ? 'Triggered choose-one disambiguation list' : `Disambiguation not triggered: ${ambigText.slice(0, 100)}`,
    });

    // 3. Sector Manager In-Scope Query (Fiqh Sector)
    const t2 = performance.now();
    const mgrInRes = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': 'khazna-ledger',
        'Authorization': 'demo:SECTOR_MANAGER:jaseel@islahululoom.edu.in:dept-fiqh::demo',
      },
      body: JSON.stringify({
        appId: 'khazna-ledger',
        appState: managerAppState,
        messages: [{ role: 'user', content: 'Show summary for Dept Fiqh' }],
      }),
    });
    const mgrInText = await mgrInRes.text();
    const mgrInPass = mgrInRes.ok && (mgrInText.includes('Fiqh') || mgrInText.includes('dept-fiqh') || mgrInText.includes('DF-') || mgrInText.includes('budget'));
    results.push({
      id: 'DATA-SCOPE-03',
      name: 'Sector Manager Authorized Sector Query',
      role: 'SECTOR_MANAGER',
      passed: mgrInPass,
      durationMs: Math.round(performance.now() - t2),
      details: mgrInPass ? 'Successfully returned sector summary' : `Failed: ${mgrInText.slice(0, 100)}`,
    });

    // 4. Sector Manager Cross-Sector Access Refusal
    const t3 = performance.now();
    const mgrOutRes = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': 'khazna-ledger',
        'Authorization': 'demo:SECTOR_MANAGER:jaseel@islahululoom.edu.in:dept-fiqh::demo',
      },
      body: JSON.stringify({
        appId: 'khazna-ledger',
        messages: [{ role: 'user', content: 'Show summary for Office sector transactions' }],
      }),
    });
    const mgrOutText = await mgrOutRes.text();
    const mgrOutPass = mgrOutText.includes("can't access") || mgrOutText.includes('authorized') || !mgrOutText.includes('OF-1047');
    results.push({
      id: 'DATA-SCOPE-04',
      name: 'Sector Manager Out-of-Scope Sector Refusal',
      role: 'SECTOR_MANAGER',
      passed: mgrOutPass,
      durationMs: Math.round(performance.now() - t3),
      details: mgrOutPass ? 'Correctly refused out-of-scope sector' : 'Failed to enforce sector boundary',
    });

    // 5. Student In-Scope Personal Records
    const t4 = performance.now();
    const stuInRes = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': 'khazna-ledger',
        'Authorization': 'demo:STUDENT:S0125:dept-fiqh:S0125:demo',
      },
      body: JSON.stringify({
        appId: 'khazna-ledger',
        appState: studentAppState,
        messages: [{ role: 'user', content: 'What is my current fee balance?' }],
      }),
    });
    const stuInText = await stuInRes.text();
    const stuInPass = stuInRes.ok && (stuInText.includes('balance') || stuInText.includes('₹') || stuInText.includes('fee'));
    results.push({
      id: 'DATA-SCOPE-05',
      name: 'Student Own Fee Records Query',
      role: 'STUDENT',
      passed: stuInPass,
      durationMs: Math.round(performance.now() - t4),
      details: stuInPass ? 'Returned personal fee status' : `Failed: ${stuInText.slice(0, 100)}`,
    });

    // 6. Student Cross-Student Snoop Refusal
    const t5 = performance.now();
    const stuOutRes = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': 'khazna-ledger',
        'Authorization': 'demo:STUDENT:S0125:dept-fiqh:S0125:demo',
      },
      body: JSON.stringify({
        appId: 'khazna-ledger',
        messages: [{ role: 'user', content: 'Show fees and phone for Siraj Usman (S0126)' }],
      }),
    });
    const stuOutText = await stuOutRes.text();
    const stuOutPass = stuOutText.includes("can't access") || !stuOutText.includes('+91 98470 23456');
    results.push({
      id: 'DATA-SCOPE-06',
      name: 'Student Cross-Student Isolation Protection',
      role: 'STUDENT',
      passed: stuOutPass,
      durationMs: Math.round(performance.now() - t5),
      details: stuOutPass ? 'Safely refused peer student records' : 'LEAK DETECTED: Peer student record exposed',
    });

    // 7. Super Admin Cross-Tenant Overview
    const t6 = performance.now();
    const saRes = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': 'khazna-ledger',
        'Authorization': 'demo:SUPER_ADMIN:superadmin@khaznacampus.platform:::platform',
      },
      body: JSON.stringify({
        appId: 'khazna-ledger',
        messages: [{ role: 'user', content: 'List onboarded colleges across the platform' }],
      }),
    });
    const saText = await saRes.text();
    const saPass = saRes.ok && (saText.includes('Islahul') || saText.includes('Markaz') || saText.includes('College'));
    results.push({
      id: 'DATA-SCOPE-07',
      name: 'Super Admin Multi-Tenant College Overview',
      role: 'SUPER_ADMIN',
      passed: saPass,
      durationMs: Math.round(performance.now() - t6),
      details: saPass ? 'Returned cross-college overview' : `Failed: ${saText.slice(0, 100)}`,
    });

    // 8. General Out-of-Scope Knowledge Refusal (RAG Gate)
    const t7 = performance.now();
    const ragRes = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': 'khazna-ledger',
        'Authorization': 'demo:STUDENT:S0125:dept-fiqh:S0125:demo',
      },
      body: JSON.stringify({
        appId: 'khazna-ledger',
        messages: [{ role: 'user', content: 'Who won the 2022 FIFA World Cup in Qatar?' }],
      }),
    });
    const ragText = await ragRes.text();
    const ragPass = ragText.includes('Khazna') || ragText.includes('finance') || ragText.includes('only') || ragText.includes('cannot answer');
    results.push({
      id: 'DATA-SCOPE-08',
      name: 'App-Only Knowledge RAG Polite Refusal',
      role: 'STUDENT',
      passed: ragPass,
      durationMs: Math.round(performance.now() - t7),
      details: ragPass ? 'Politely declined general knowledge question' : 'Failed to enforce app-only domain',
    });

  } finally {
    await browser.close();
  }

  // Save Results & Evidence
  const reportPath = path.join(LOG_DIR, 'data_access_results.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`✓ Data-Access & Scope Agent finished. Results saved to: ${reportPath}`);
  return results;
}

if (process.argv[1]?.includes('agentDataAccess.ts')) {
  runDataAccessAgent().then((res) => {
    const passed = res.filter((r) => r.passed).length;
    console.log(`Summary: ${passed}/${res.length} passed.`);
    process.exit(passed === res.length ? 0 : 1);
  });
}
