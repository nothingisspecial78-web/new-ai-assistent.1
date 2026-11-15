import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const DIST_DIR = path.resolve(process.cwd(), 'dist');
const ARTIFACTS_DIR = path.resolve(process.cwd(), 'qa-artifacts');
if (!fs.existsSync(ARTIFACTS_DIR)) {
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
}

interface AssetInfo {
  file: string;
  sizeBytes: number;
  sizeKb: number;
  gzipBytes: number;
  gzipKb: number;
  isInitial: boolean;
}

export function analyzeDistBundle(): {
  totalJsKb: number;
  totalGzipJsKb: number;
  initialJsKb: number;
  initialGzipJsKb: number;
  assets: AssetInfo[];
} {
  const assetsDir = path.join(DIST_DIR, 'assets');
  if (!fs.existsSync(assetsDir)) {
    throw new Error('dist/assets not found. Run "npm run build" first.');
  }

  const files = fs.readdirSync(assetsDir);
  const assets: AssetInfo[] = [];

  let totalJsBytes = 0;
  let totalGzipBytes = 0;
  let initialJsBytes = 0;
  let initialGzipBytes = 0;

  files.forEach((f) => {
    if (!f.endsWith('.js')) return;
    const fullPath = path.join(assetsDir, f);
    const content = fs.readFileSync(fullPath);
    const gzipped = zlib.gzipSync(content);

    const isInitial = f.startsWith('index-');
    totalJsBytes += content.length;
    totalGzipBytes += gzipped.length;
    if (isInitial) {
      initialJsBytes += content.length;
      initialGzipBytes += gzipped.length;
    }

    assets.push({
      file: f,
      sizeBytes: content.length,
      sizeKb: Math.round(content.length / 1024),
      gzipBytes: gzipped.length,
      gzipKb: Math.round(gzipped.length / 1024),
      isInitial,
    });
  });

  assets.sort((a, b) => b.sizeBytes - a.sizeBytes);

  return {
    totalJsKb: Math.round(totalJsBytes / 1024),
    totalGzipJsKb: Math.round(totalGzipBytes / 1024),
    initialJsKb: Math.round(initialJsBytes / 1024),
    initialGzipJsKb: Math.round(initialGzipBytes / 1024),
    assets,
  };
}

async function runBundleAnalysis() {
  console.log('=== STARTING BUNDLE ANALYSIS (scripts/perfBundle.ts) ===');
  const summary = analyzeDistBundle();

  console.log(`Initial JS Bundle: ${summary.initialJsKb} KB (${summary.initialGzipJsKb} KB gzipped)`);
  console.log(`Total Application JS: ${summary.totalJsKb} KB (${summary.totalGzipJsKb} KB gzipped)\n`);
  console.log('Top JS Chunks:');
  summary.assets.forEach((a) => {
    console.log(`  - ${a.file.padEnd(36)} : ${String(a.sizeKb).padStart(5)} KB (${String(a.gzipKb).padStart(4)} KB gzipped) ${a.isInitial ? '[INITIAL]' : ''}`);
  });

  const reportPath = path.join(ARTIFACTS_DIR, 'bundle_analysis_latest.json');
  fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));
  console.log(`\nBundle analysis saved to: ${reportPath}`);
}

if (process.argv[1]?.includes('perfBundle.ts')) {
  runBundleAnalysis().catch((err) => {
    console.error('perfBundle error:', err);
    process.exit(1);
  });
}
