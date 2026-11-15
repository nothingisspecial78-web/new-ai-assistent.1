import fs from 'node:fs';
import path from 'node:path';
import { runDataAccessAgent } from './agentDataAccess.ts';
import { runChipsAgent } from './agentChips.ts';
import { runResilienceAgent } from './agentResilience.ts';
import { runSecurityAgent } from './agentSecurity.ts';
import { runChatMemoryAgent } from './agentChatMemory.ts';
import { runGuideAnd3DAgent } from './agentGuideAnd3D.ts';
import { runActionsAndUploadsAgent } from './agentActionsAndUploads.ts';
import { runAssistantMobilePerfAgent } from './agentAssistantMobilePerf.ts';

export async function runAllQaAgents() {
  console.log('================================================================');
  console.log('   FULL MULTI-AGENT QA VERIFICATION SUITE — KHAZNA AI ASSISTANT ');
  console.log('================================================================');
  const overallStart = Date.now();

  const dataResults = await runDataAccessAgent();
  const chipResults = await runChipsAgent();
  const resilResults = await runResilienceAgent();
  const secResults = await runSecurityAgent();
  const memResults = await runChatMemoryAgent();
  const guide3dResults = await runGuideAnd3DAgent();
  const actionUploadResults = await runActionsAndUploadsAgent();
  const mobilePerfResults = await runAssistantMobilePerfAgent();

  const allSuites = [
    dataResults,
    chipResults,
    resilResults,
    secResults,
    memResults,
    guide3dResults,
    actionUploadResults,
    mobilePerfResults,
  ];

  const totalTests = allSuites.reduce((sum, s) => sum + s.length, 0);
  const totalPassed = allSuites.reduce((sum, s) => sum + s.filter((r) => r.passed).length, 0);
  const totalFailed = totalTests - totalPassed;
  const overallDurationSec = ((Date.now() - overallStart) / 1000).toFixed(1);

  console.log('\n================================================================');
  console.log(`   QA AGENT VERIFICATION COMPLETE: ${totalPassed}/${totalTests} PASSED (${overallDurationSec}s)`);
  console.log('================================================================');

  const avgChipLatency =
    chipResults.length > 0
      ? Math.round(chipResults.reduce((s, r) => s + r.latencyMs, 0) / chipResults.length)
      : 0;

  const report = `# Comprehensive QA Verification Report: Embedded AI Assistant

**Generated Date:** ${new Date().toISOString()}  
**Overall Execution Duration:** ${overallDurationSec} seconds  
**Total Scenarios Verified:** ${totalTests}  
**Total Passed:** ${totalPassed} (${((totalPassed / Math.max(totalTests, 1)) * 100).toFixed(1)}%)  
**Total Failed:** ${totalFailed}  
**Overall Status:** ${totalFailed === 0 ? 'PASSED (100% GREEN)' : 'FAILED'}

---

## 1. Executive Summary

An exhaustive multi-agent QA verification suite was executed across the embedded Khazna AI Assistant (API + Playwright headless Chromium E2E), covering all 5 system roles (\`SUPER_ADMIN\`, \`ADMIN\`, \`SECTOR_MANAGER\`, \`STUDENT\`, \`PUBLIC\`), governed A–Z data access, role-aware prompt chips (${avgChipLatency}ms avg latency), provider fallback resilience, guide privacy & 3D avatar FPS, write-action confirmation/undo, spreadsheet upload validation, and responsive mobile/tablet viewports.

---

## 2. Multi-Agent Test Suite Results

### Suite A: Data-Access & Scope Agent (\`scripts/qa/agentDataAccess.ts\`)
| Test ID | Scenario Name | Role | Duration | Status | Evidence Details |
| :--- | :--- | :--- | :--- | :--- | :--- |
${dataResults.map((r) => `| \`${r.id}\` | ${r.name} | \`${r.role}\` | ${r.durationMs}ms | **${r.passed ? 'PASS' : 'FAIL'}** | ${r.details} |`).join('\n')}

### Suite B: Role & Page-Aware Chips Agent (\`scripts/qa/agentChips.ts\`)
| Test ID | Scenario Name | Role | Page ID | Latency | Status | Sample Chips Returned |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${chipResults.map((r) => `| \`${r.id}\` | ${r.name} | \`${r.role}\` | \`${r.pageId}\` | ${r.latencyMs}ms | **${r.passed ? 'PASS' : 'FAIL'}** | ${r.sampleChips.join(', ')} |`).join('\n')}

### Suite C: Resilience & Fallback Agent (\`scripts/qa/agentResilience.ts\`)
| Test ID | Scenario Name | Status | Evidence Details |
| :--- | :--- | :--- | :--- |
${resilResults.map((r) => `| \`${r.id}\` | ${r.name} | **${r.passed ? 'PASS' : 'FAIL'}** | ${r.details} |`).join('\n')}

### Suite D: Security, RBAC & Secret Scan Agent (\`scripts/qa/agentSecurity.ts\`)
| Test ID | Scenario Name | Status | Evidence Details |
| :--- | :--- | :--- | :--- |
${secResults.map((r) => `| \`${r.id}\` | ${r.name} | **${r.passed ? 'PASS' : 'FAIL'}** | ${r.details} |`).join('\n')}

### Suite E: Chat Memory & Per-User Isolation Agent (\`scripts/qa/agentChatMemory.ts\`)
| Test ID | Scenario Name | Status | Evidence Details |
| :--- | :--- | :--- | :--- |
${memResults.map((r) => `| \`${r.id}\` | ${r.name} | **${r.passed ? 'PASS' : 'FAIL'}** | ${r.details} |`).join('\n')}

### Suite F: Guide Walkthrough, Privacy & 3D Avatar Agent (\`scripts/qa/agentGuideAnd3D.ts\`)
| Test ID | Scenario Name | Role | Duration | Status | Evidence Details |
| :--- | :--- | :--- | :--- | :--- | :--- |
${guide3dResults.map((r) => `| \`${r.id}\` | ${r.name} | \`${r.role}\` | ${r.durationMs}ms | **${r.passed ? 'PASS' : 'FAIL'}** | ${r.details} |`).join('\n')}

### Suite G: Write Actions, Confirmation Tokens, Undo & CSV Uploads (\`scripts/qa/agentActionsAndUploads.ts\`)
| Test ID | Scenario Name | Role | Duration | Status | Evidence Details |
| :--- | :--- | :--- | :--- | :--- | :--- |
${actionUploadResults.map((r) => `| \`${r.id}\` | ${r.name} | \`${r.role}\` | ${r.durationMs}ms | **${r.passed ? 'PASS' : 'FAIL'}** | ${r.details} |`).join('\n')}

### Suite H: Mobile/Tablet Responsiveness, Suggestions & Period Comparison (\`scripts/qa/agentAssistantMobilePerf.ts\`)
| Test ID | Scenario Name | Role | Duration | Status | Evidence Details |
| :--- | :--- | :--- | :--- | :--- | :--- |
${mobilePerfResults.map((r) => `| \`${r.id}\` | ${r.name} | \`${r.role}\` | ${r.durationMs}ms | **${r.passed ? 'PASS' : 'FAIL'}** | ${r.details} |`).join('\n')}

---

## 3. Artifacts & Reproducibility

- **Artifacts Directory:** \`qa-artifacts/assistant/\`
- **Command:** \`npm run qa:assistant\`
- **See Also:** \`QA_ASSISTANT_ASSUMPTIONS.md\`, \`QA_ISSUES.md\`, \`ASSISTANT_FEATURE_INVENTORY.md\`
`;

  const reportPath = path.resolve(process.cwd(), 'QA_ASSISTANT_REPORT.md');
  fs.writeFileSync(reportPath, report, 'utf8');
  console.log(`\nFinal report written to: ${reportPath}`);

  if (totalFailed > 0) {
    process.exit(1);
  }
}

if (process.argv[1]?.includes('runAllAgents.ts')) {
  runAllQaAgents().catch((err) => {
    console.error('QA Runner encountered unhandled error:', err);
    process.exit(1);
  });
}
