import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ARTIFACTS_DIR = path.resolve(process.cwd(), 'qa-artifacts');
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

interface EndpointTest {
  name: string;
  url: string;
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

const ENDPOINTS: EndpointTest[] = [
  {
    name: 'Health Check',
    url: '/health',
  },
  {
    name: 'Prompt Chips API (Student)',
    url: '/api/assistant/chips?pageId=student.dashboard&lang=en',
    headers: { 'x-app-id': 'khazna-ledger' },
  },
  {
    name: 'Prompt Chips API (Admin)',
    url: '/api/assistant/chips?pageId=admin.dashboard&lang=en',
    headers: { 'x-app-id': 'khazna-ledger' },
  },
  {
    name: 'Guide Search API',
    url: '/api/assistant/guides/search?q=import',
    headers: { 'x-app-id': 'khazna-ledger' },
  },
  {
    name: 'Guide Catalog List',
    url: '/api/assistant/guides',
    headers: { 'x-app-id': 'khazna-ledger' },
  },
];

async function measureEndpointLatency(endpoint: EndpointTest, iterations = 25): Promise<{
  name: string;
  p50: number;
  p95: number;
  p99: number;
  avg: number;
  min: number;
  max: number;
}> {
  const durations: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    try {
      const res = await fetch(`${BASE_URL}${endpoint.url}`, {
        method: endpoint.method || 'GET',
        headers: endpoint.headers || {},
        body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
      });
      await res.text();
      const elapsed = performance.now() - start;
      durations.push(elapsed);
    } catch {
      // ignore
    }
  }

  durations.sort((a, b) => a - b);
  const p50 = Math.round(durations[Math.floor(durations.length * 0.5)] || 0);
  const p95 = Math.round(durations[Math.floor(durations.length * 0.95)] || 0);
  const p99 = Math.round(durations[Math.floor(durations.length * 0.99)] || 0);
  const avg = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length || 0);

  return {
    name: endpoint.name,
    p50,
    p95,
    p99,
    avg,
    min: Math.round(durations[0] || 0),
    max: Math.round(durations[durations.length - 1] || 0),
  };
}

async function runApiBenchmark() {
  console.log('=== STARTING BACKEND API BENCHMARK (scripts/perfApi.ts) ===');
  const results = [];

  for (const ep of ENDPOINTS) {
    const stats = await measureEndpointLatency(ep, 20);
    results.push(stats);
    console.log(
      `✓ ${stats.name.padEnd(28)} | p50: ${String(stats.p50).padStart(3)}ms | p95: ${String(stats.p95).padStart(3)}ms | p99: ${String(stats.p99).padStart(3)}ms | avg: ${String(stats.avg).padStart(3)}ms`
    );
  }

  const reportPath = path.join(ARTIFACTS_DIR, 'api_benchmark_latest.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nAPI benchmark report saved to: ${reportPath}`);
  return results;
}

if (process.argv[1]?.includes('perfApi.ts')) {
  runApiBenchmark().catch((err) => {
    console.error('perfApi error:', err);
    process.exit(1);
  });
}
