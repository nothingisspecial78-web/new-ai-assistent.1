import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const LOG_DIR = path.resolve(process.cwd(), 'qa-artifacts/assistant/chips');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

export interface ChipTestResult {
  id: string;
  name: string;
  role: string;
  pageId: string;
  passed: boolean;
  latencyMs: number;
  chipCount: number;
  sampleChips: string[];
  details: string;
}

export async function runChipsAgent(): Promise<ChipTestResult[]> {
  console.log('\n=== [AGENT 3: ROLE & PAGE-AWARE PROMPT CHIPS] Starting Suite B ===');
  const results: ChipTestResult[] = [];

  const scenarios = [
    {
      id: 'CHIP-TEST-01',
      name: 'Super Admin Platform Portal Chips',
      role: 'SUPER_ADMIN',
      token: 'demo:SUPER_ADMIN:superadmin@khaznacampus.platform:::platform',
      pageId: '/super-admin',
      lang: 'en',
      expectedKeywords: ['college', 'platform', 'colleges', 'overview'],
    },
    {
      id: 'CHIP-TEST-02',
      name: 'Admin Student Directory Chips',
      role: 'ADMIN',
      token: 'demo:ADMIN:principal@islahululoom.edu.in:::demo',
      pageId: 'admin.students',
      lang: 'en',
      expectedKeywords: ['student', 'add', 'import', 'roster'],
    },
    {
      id: 'CHIP-TEST-03',
      name: 'Admin Sector Management Chips',
      role: 'ADMIN',
      token: 'demo:ADMIN:principal@islahululoom.edu.in:::demo',
      pageId: 'admin.sectors',
      lang: 'en',
      expectedKeywords: ['sector', 'unassigned', 'create', 'budget'],
    },
    {
      id: 'CHIP-TEST-04',
      name: 'Sector Manager Ledger Chips',
      role: 'SECTOR_MANAGER',
      token: 'demo:SECTOR_MANAGER:jaseel@islahululoom.edu.in:dept-fiqh::demo',
      pageId: 'manager.entries',
      lang: 'en',
      expectedKeywords: ['pending', 'entry', 'balance', 'fiqh', 'ledger', 'collect'],
    },
    {
      id: 'CHIP-TEST-05',
      name: 'Student Personal Dashboard Chips',
      role: 'STUDENT',
      token: 'demo:STUDENT:S0125:dept-fiqh:S0125:demo',
      pageId: 'student.dashboard',
      lang: 'en',
      expectedKeywords: ['balance', 'fees', 'receipt', 'due'],
    },
    {
      id: 'CHIP-TEST-06',
      name: 'Malayalam Localized Chips',
      role: 'STUDENT',
      token: 'demo:STUDENT:S0125:dept-fiqh:S0125:demo',
      pageId: 'student.dashboard',
      lang: 'ml',
      expectedKeywords: ['ഫീസ്', 'ബാക്കി', 'ബാലൻസ്', 'രസീത്'],
    },
    {
      id: 'CHIP-TEST-07',
      name: 'Public Unauthenticated Sign-in Chips',
      role: 'PUBLIC',
      token: '',
      pageId: 'public.login',
      lang: 'en',
      expectedKeywords: ['sign in', 'log in', 'login', 'register', 'guide'],
    },
  ];

  for (const s of scenarios) {
    const t0 = performance.now();
    try {
      const headers: Record<string, string> = { 'x-app-id': 'khazna-ledger' };
      if (s.token) headers.Authorization = s.token;

      const res = await fetch(
        `${BASE_URL}/api/assistant/chips?pageId=${encodeURIComponent(s.pageId)}&lang=${encodeURIComponent(s.lang)}`,
        { headers }
      );
      const latencyMs = Math.round(performance.now() - t0);

      if (!res.ok) {
        results.push({
          id: s.id,
          name: s.name,
          role: s.role,
          pageId: s.pageId,
          passed: false,
          latencyMs,
          chipCount: 0,
          sampleChips: [],
          details: `HTTP ${res.status}: ${await res.text()}`,
        });
        continue;
      }

      const data = (await res.json()) as { chips?: Array<{ id: string; label: string; prompt: string }> };
      const chips = data.chips || [];
      const labels = chips.map((c) => c.label);
      const allText = chips.map((c) => `${c.label} ${c.prompt}`).join(' ').toLowerCase();

      const matchedKeyword = s.expectedKeywords.some((kw) => allText.includes(kw.toLowerCase()));
      const withinSla = latencyMs < 200; // SLA <200ms

      const passed = chips.length > 0 && matchedKeyword;

      results.push({
        id: s.id,
        name: s.name,
        role: s.role,
        pageId: s.pageId,
        passed,
        latencyMs,
        chipCount: chips.length,
        sampleChips: labels.slice(0, 4),
        details: passed
          ? `Returned ${chips.length} chips in ${latencyMs}ms matching role context`
          : `Keyword mismatch or empty chips list`,
      });
    } catch (err: unknown) {
      const latencyMs = Math.round(performance.now() - t0);
      results.push({
        id: s.id,
        name: s.name,
        role: s.role,
        pageId: s.pageId,
        passed: false,
        latencyMs,
        chipCount: 0,
        sampleChips: [],
        details: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const reportPath = path.join(LOG_DIR, 'chips_results.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`✓ Chips Agent finished. Results saved to: ${reportPath}`);
  return results;
}

if (process.argv[1]?.includes('agentChips.ts')) {
  runChipsAgent().then((res) => {
    const passed = res.filter((r) => r.passed).length;
    console.log(`Chips Summary: ${passed}/${res.length} passed.`);
    process.exit(passed === res.length ? 0 : 1);
  });
}
