import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const LOG_DIR = path.resolve(process.cwd(), 'qa-artifacts/assistant/security');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

export interface SecurityTestResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

export async function runSecurityAgent(): Promise<SecurityTestResult[]> {
  console.log('\n=== [AGENT 5: SECURITY & ACCESS CONTROL] Starting Suite D ===');
  const results: SecurityTestResult[] = [];

  // 1. Missing App ID Header Rejection
  try {
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    });
    const pass = res.status === 400;
    results.push({
      id: 'SEC-01',
      name: 'Missing App ID Header Rejection',
      passed: pass,
      details: pass ? 'HTTP 400 Bad Request correctly returned' : `Unexpected status: ${res.status}`,
    });
  } catch (err: unknown) {
    results.push({
      id: 'SEC-01',
      name: 'Missing App ID Header Rejection',
      passed: false,
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // 2. Tampered JWT Token Rejection
  try {
    const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsInJvbGUiOiJzdXBlcl9hZG1pbiJ9.fake_signature_tampered';
    const res = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': 'khazna-ledger',
        'Authorization': `Bearer ${fakeToken}`,
      },
      body: JSON.stringify({
        appId: 'khazna-ledger',
        messages: [{ role: 'user', content: 'Give me platform overview' }],
      }),
    });
    // In khazna-ledger (which accepts demo/scope tokens), it must not elevate to SUPER_ADMIN without valid secret
    const text = await res.text();
    const pass = !text.includes('Platform Overview Across All Colleges') && !text.includes('Markaz Knowledge Campus');
    results.push({
      id: 'SEC-02',
      name: 'Forged JWT Signature Rejection & Zero Elevation',
      passed: pass,
      details: pass ? 'Tampered token blocked from elevating to super_admin' : 'CRITICAL: Tampered token gained super_admin access!',
    });
  } catch (err: unknown) {
    results.push({
      id: 'SEC-02',
      name: 'Forged JWT Signature Rejection & Zero Elevation',
      passed: false,
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // 3. Super Admin Protected Route RBAC Enforcement
  try {
    const res = await fetch(`${BASE_URL}/api/super-admin/analytics`, {
      method: 'GET',
      headers: {
        'x-app-id': 'khazna-ledger',
        'Authorization': 'demo:STUDENT:S0125:dept-fiqh:S0125:demo',
      },
    });
    const pass = res.status === 401 || res.status === 403;
    results.push({
      id: 'SEC-03',
      name: 'Student Blocked from Super Admin Endpoints',
      passed: pass,
      details: pass ? `HTTP ${res.status} correctly returned for student token` : `Unauthorized access allowed: status ${res.status}`,
    });
  } catch (err: unknown) {
    results.push({
      id: 'SEC-03',
      name: 'Student Blocked from Super Admin Endpoints',
      passed: false,
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // 4. Secret Scan in Tracked Code & Manifests
  try {
    const dangerousPatterns = [
      /sk-[A-Za-z0-9]{32,}/, // OpenAI API keys
      /AIzaSy[A-Za-z0-9_-]{33}/, // Gemini Google API keys
      /gsk_[A-Za-z0-9]{30,}/, // Groq API keys
    ];

    let secretFound = false;
    let leakedInFile = '';

    const checkFiles = [
      'package.json',
      'vercel.json',
      'packages/server/src/auth.ts',
      'packages/server/src/config.ts',
      'packages/widget/src/AssistantWidget.tsx',
    ];

    for (const f of checkFiles) {
      const fullPath = path.resolve(process.cwd(), f);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        for (const pat of dangerousPatterns) {
          if (pat.test(content)) {
            secretFound = true;
            leakedInFile = f;
            break;
          }
        }
      }
    }

    const pass = !secretFound;
    results.push({
      id: 'SEC-04',
      name: 'Hardcoded Secret & API Key Leak Scan',
      passed: pass,
      details: pass ? 'Zero raw API keys or passwords in checked source files' : `LEAK DETECTED in ${leakedInFile}`,
    });
  } catch (err: unknown) {
    results.push({
      id: 'SEC-04',
      name: 'Hardcoded Secret & API Key Leak Scan',
      passed: false,
      details: err instanceof Error ? err.message : String(err),
    });
  }

  const reportPath = path.join(LOG_DIR, 'security_results.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`✓ Security Agent finished. Results saved to: ${reportPath}`);
  return results;
}

if (process.argv[1]?.includes('agentSecurity.ts')) {
  runSecurityAgent().then((res) => {
    const passed = res.filter((r) => r.passed).length;
    console.log(`Security Summary: ${passed}/${res.length} passed.`);
    process.exit(passed === res.length ? 0 : 1);
  });
}
