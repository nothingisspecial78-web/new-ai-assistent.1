import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const LOG_DIR = path.resolve(process.cwd(), 'qa-artifacts/assistant/resilience');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

export interface ResilienceTestResult {
  id: string;
  name: string;
  passed: boolean;
  details: string;
}

export async function runResilienceAgent(): Promise<ResilienceTestResult[]> {
  console.log('\n=== [AGENT 4: RESILIENCE & PROVIDER FALLBACK] Starting Suite C ===');
  const results: ResilienceTestResult[] = [];

  // 1. Inspect Debug Providers Endpoint
  try {
    const res = await fetch(`${BASE_URL}/api/assistant/debug/providers`);
    const data = (await res.json()) as {
      providers?: Array<{ name: string; priority: number; state: string }>;
    };
    const providers = data.providers || [];

    const hasOpenRouter = providers.some((p) => p.name === 'openrouter');
    const hasGemini = providers.some((p) => p.name === 'gemini');
    const hasGroq = providers.some((p) => p.name === 'groq');

    const orderValid =
      providers.findIndex((p) => p.name === 'openrouter') <
        providers.findIndex((p) => p.name === 'gemini') &&
      providers.findIndex((p) => p.name === 'gemini') <
        providers.findIndex((p) => p.name === 'groq');

    const pass = hasOpenRouter && hasGemini && hasGroq && orderValid;
    results.push({
      id: 'RESIL-01',
      name: 'Strict Sequential Fallback Chain Order (OpenRouter -> Gemini -> Groq)',
      passed: pass,
      details: pass
        ? `Configured 3 providers in exact priority order: ${providers.map((p) => p.name).join(' -> ')}`
        : `Invalid provider ordering: ${JSON.stringify(providers)}`,
    });
  } catch (err: unknown) {
    results.push({
      id: 'RESIL-01',
      name: 'Strict Sequential Fallback Chain Order (OpenRouter -> Gemini -> Groq)',
      passed: false,
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // 2. Circuit Breaker Configuration & Health Check
  try {
    const healthRes = await fetch(`${BASE_URL}/health`);
    const healthData = (await healthRes.json()) as { status: string; hasLiveLlm: boolean };
    const pass = healthRes.ok && healthData.status === 'ok' && healthData.hasLiveLlm === true;
    results.push({
      id: 'RESIL-02',
      name: 'LLM Gateway Live Availability & Health Status',
      passed: pass,
      details: pass
        ? 'LLM Gateway active and responding with live provider configuration'
        : `Health check reported: ${JSON.stringify(healthData)}`,
    });
  } catch (err: unknown) {
    results.push({
      id: 'RESIL-02',
      name: 'LLM Gateway Live Availability & Health Status',
      passed: false,
      details: err instanceof Error ? err.message : String(err),
    });
  }

  // 3. Chat Endpoint End-to-End Fallback Response
  try {
    const t0 = performance.now();
    const chatRes = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-app-id': 'khazna-ledger',
        'Authorization': 'demo:STUDENT:S0125:dept-fiqh:S0125:demo',
      },
      body: JSON.stringify({
        appId: 'khazna-ledger',
        messages: [{ role: 'user', content: 'What is Khazna Campus Ledger?' }],
      }),
    });
    const chatText = await chatRes.text();
    const durationMs = Math.round(performance.now() - t0);
    const pass = chatRes.ok && chatText.includes('Khazna') && chatText.includes('event: done');

    results.push({
      id: 'RESIL-03',
      name: 'End-to-End Chat Stream Execution via Fallback Chain',
      passed: pass,
      details: pass
        ? `Successfully streamed response in ${durationMs}ms without errors`
        : `Stream failure: ${chatText.slice(0, 120)}`,
    });
  } catch (err: unknown) {
    results.push({
      id: 'RESIL-03',
      name: 'End-to-End Chat Stream Execution via Fallback Chain',
      passed: false,
      details: err instanceof Error ? err.message : String(err),
    });
  }

  const reportPath = path.join(LOG_DIR, 'resilience_results.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`✓ Resilience Agent finished. Results saved to: ${reportPath}`);
  return results;
}

if (process.argv[1]?.includes('agentResilience.ts')) {
  runResilienceAgent().then((res) => {
    const passed = res.filter((r) => r.passed).length;
    console.log(`Resilience Summary: ${passed}/${res.length} passed.`);
    process.exit(passed === res.length ? 0 : 1);
  });
}
