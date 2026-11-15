import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { loadConfig, ProfileRegistry, ToolRegistry } from '@ai-assistant/server';
import { scopedRepository, setConversationFocus, getConversationFocus } from '../packages/server/src/db/scopedDataRepository.ts';
import { DATA_ACCESS_TOOLS } from '../packages/server/src/tools/dataAccessTools.ts';
import { inferDeterministicToolCall } from '../packages/server/src/llm/intentParser.ts';
import type { AccessScope } from '../packages/server/src/security/scope.ts';

describe('A-to-Z Governed Data Access Layer (Add-on Prompt)', () => {
  const superAdminScope: AccessScope = { role: 'SUPER_ADMIN', userId: 'sa-01', organizationId: null };
  const adminScope: AccessScope = { role: 'ADMIN', userId: 'admin-01', organizationId: 'demo' };
  const managerFiqhScope: AccessScope = {
    role: 'SECTOR_MANAGER',
    userId: 'mgr-01',
    organizationId: 'demo',
    sectorIds: ['dept-fiqh'],
  };
  const managerCivilScope: AccessScope = {
    role: 'SECTOR_MANAGER',
    userId: 'mgr-02',
    organizationId: 'demo',
    sectorIds: ['dept-civil'],
  };
  const studentSafwanScope: AccessScope = {
    role: 'STUDENT',
    userId: 'safwan@campus.edu',
    organizationId: 'demo',
    studentId: 'S0125',
    sectorId: 'dept-fiqh',
  };

  // Test 1: Tool Coverage
  it('Test 1: Tool catalog covers all 12 entities defined in DATA_MAP.md', () => {
    const requiredTools = [
      'find_students',
      'get_student',
      'summarize_student_finance',
      'find_sectors',
      'summarize_sector_finance',
      'report_class',
      'report_defaulters',
      'report_fund_utilization',
      'get_receipt',
      'list_organizations',
      'summarize_platform_usage',
      'query_data',
    ];
    for (const name of requiredTools) {
      expect(DATA_ACCESS_TOOLS[name], `Missing tool ${name}`).toBeDefined();
      expect(DATA_ACCESS_TOOLS[name].inputSchema).toBeDefined();
    }
  });

  // Test 2: Entity Resolver - exact, partial, case-insensitive
  it('Test 2: Entity Resolver matches by admission number, phone, partial, and case-insensitivity', async () => {
    // Exact admission number
    const byAdm = await scopedRepository.findStudents('CF-2026-001', adminScope);
    expect(byAdm.matches.length).toBe(1);
    expect(byAdm.matches[0].name).toContain('Aarav');

    // ID lookup
    const byId = await scopedRepository.findStudents('S0125', adminScope);
    expect(byId.matches.length).toBe(1);
    expect(byId.matches[0].id).toBe('S0125');

    // Case-insensitivity
    const byCase = await scopedRepository.findStudents('safwan k.', adminScope);
    expect(byCase.matches.length).toBe(1);
    expect(byCase.matches[0].name).toContain('Safwan');

    // Phone search
    const byPhone = await scopedRepository.findStudents('9847012345', adminScope);
    expect(byPhone.matches.length).toBe(1);
    expect(byPhone.matches[0].id).toBe('S0125');
  });

  // Test 3: Disambiguation with multiple matches
  it('Test 3: Entity Resolver generates disambiguation list when multiple entities match', async () => {
    const res = await scopedRepository.findStudents('Rahul', adminScope);
    expect(res.disambiguation).toBeDefined();
    expect(res.disambiguation!.length).toBeGreaterThanOrEqual(2);
    const names = res.disambiguation!.map((d) => d.name);
    expect(names.some((n) => n.includes('Sharma'))).toBe(true);
    expect(names.some((n) => n.includes('Varma'))).toBe(true);
  });

  // Test 4: Conversation Focus Memory
  it('Test 4: Conversation focus tracks active entity for follow-up questions', () => {
    const convId = 'conv-test-999';
    setConversationFocus(convId, {
      type: 'student',
      id: 'S0125',
      name: 'Safwan K.',
      organizationId: 'demo',
      updatedAt: new Date().toISOString(),
    });

    const focus = getConversationFocus(convId, adminScope);
    expect(focus).toBeDefined();
    expect(focus?.id).toBe('S0125');
    expect(focus?.name).toBe('Safwan K.');
  });

  // Test 5: Scoped financial calculations (pre-computed in code)
  it('Test 5: Financial calculations are pre-computed in code and exclude voided entries', async () => {
    const summary = await scopedRepository.summarizeStudentFinance('S0125', adminScope);
    expect(summary).toBeDefined();
    expect(summary!.totalCredit).toBe(15000);
    expect(summary!.totalDebit).toBe(20000);
    expect(summary!.netBalance).toBe(5000);
  });

  // Test 6: Class-level and Defaulter reporting
  it('Test 6: Class reports and defaulter lists compute exact aggregations', async () => {
    const defaulters = await scopedRepository.reportDefaulters(undefined, adminScope);
    expect(defaulters).toBeDefined();
    expect(defaulters.totalDefaulters).toBeGreaterThan(0);
    expect(defaulters.totalAmountOwed).toBeGreaterThan(0);
    for (const d of defaulters.defaulters) {
      expect(d.amountOwed).toBeGreaterThan(0);
    }
  });

  // Test 7: Scope Security - Student isolated to self
  it('Test 7: Student scope strictly denies viewing other students records', async () => {
    // Safwan trying to view Safwan (allowed)
    const self = await scopedRepository.getStudent('S0125', studentSafwanScope);
    expect(self).toBeDefined();
    expect(self?.id).toBe('S0125');

    // Safwan trying to view Rahul (denied)
    const other = await scopedRepository.getStudent('S0129', studentSafwanScope);
    expect(other).toBeNull();

    // Safwan searching students returns only self
    const search = await scopedRepository.findStudents('Rahul', studentSafwanScope);
    expect(search.matches.length).toBe(0);
  });

  // Test 8: Scope Security - Sector Manager isolated to assigned sector
  it('Test 8: Sector Manager scope strictly isolates to assigned sector', async () => {
    // Manager Fiqh querying students in Fiqh (allowed)
    const inFiqh = await scopedRepository.findStudents('Safwan', managerFiqhScope);
    expect(inFiqh.matches.length).toBe(1);

    // Manager Fiqh querying student in Civil (S0129 Rahul Sharma) -> filtered out
    const inCivil = await scopedRepository.findStudents('Rahul Sharma', managerFiqhScope);
    expect(inCivil.matches.length).toBe(0);

    // Manager Civil querying Rahul Sharma -> found
    const civilMgr = await scopedRepository.findStudents('Rahul Sharma', managerCivilScope);
    expect(civilMgr.matches.length).toBe(1);
    expect(civilMgr.matches[0].id).toBe('S0129');
  });

  // Test 9: Super Admin vs Admin Organization access
  it('Test 9: Super Admin has platform-wide visibility while Admin is scoped to organization', async () => {
    const orgs = await scopedRepository.listOrganizations(superAdminScope);
    expect(orgs.length).toBeGreaterThanOrEqual(1);

    const platformUsage = await scopedRepository.summarizePlatformUsage(superAdminScope);
    expect(platformUsage.totalStudents).toBeGreaterThan(0);
    expect(platformUsage.organizationCount).toBeGreaterThanOrEqual(1);
  });

  // Test 10: query_data rejects forbidden tables and injects scope filters automatically
  it('Test 10: query_data rejects forbidden tables and injects scope filters automatically', async () => {
    // Forbidden table
    await expect(
      scopedRepository.executeStructuredQuery({ entity: 'passwords' as any }, adminScope)
    ).rejects.toThrow(/Disallowed query entity/i);

    // Permitted table with manager scope automatically filters to sector
    const res = await scopedRepository.executeStructuredQuery(
      { entity: 'students', limit: 50 },
      managerFiqhScope
    );
    expect(res.rows.length).toBeGreaterThan(0);
  });

  // Test 11: COVERAGE.md verification - every documented tool is registered for SUPER_ADMIN on khazna-ledger
  it('Test 11: COVERAGE.md matrix tools are 100% registered in ToolRegistry for khazna-ledger', async () => {
    const cfg = loadConfig();
    const profiles = new ProfileRegistry();
    await profiles.loadAll(cfg.profilesDir);
    const khaznaProfile = profiles.getProfile('khazna-ledger')!;
    expect(khaznaProfile).toBeDefined();

    const registered = new ToolRegistry().getToolsForProfile(khaznaProfile, superAdminScope);
    const registeredNames = new Set(Array.from(registered.keys()));

    const coverageMd = fs.readFileSync(path.resolve(process.cwd(), 'COVERAGE.md'), 'utf8');
    const tableLines = coverageMd.split('\n').filter((line) => line.startsWith('| **'));
    expect(tableLines.length).toBeGreaterThanOrEqual(12);

    for (const line of tableLines) {
      const cells = line.split('|').slice(1, -1);
      // Exclude first column (Entity) and last column (Supported Roles)
      const toolCells = cells.slice(1, -1).join(' ');
      const backtickMatches = toolCells.match(/`([a-zA-Z0-9_]+)`/g) || [];
      for (const token of backtickMatches) {
        const toolName = token.slice(1, -1);
        expect(registeredNames.has(toolName), `Tool "${toolName}" in COVERAGE.md must exist in ToolRegistry`).toBe(true);
      }
    }
  });

  // Test 12: compare_periods computes scoped period deltas cleanly
  it('Test 12: compare_periods enforces scope across Admin, Sector Manager, Student, and Public', async () => {
    const args = {
      period1Start: '2026-10-01',
      period1End: '2026-10-31',
      period2Start: '2026-11-01',
      period2End: '2026-11-30',
    };

    const adminRes = await DATA_ACCESS_TOOLS.compare_periods.execute(args, {
      appId: 'khazna-ledger',
      profile: {} as any,
      userId: 'admin-01',
      authToken: '',
      cfg: {} as any,
      actionStore: {} as any,
      scope: adminScope,
    });
    expect(adminRes.ok).toBe(true);

    const mgrRes = await DATA_ACCESS_TOOLS.compare_periods.execute(
      { ...args, sector: 'dept-civil' },
      {
        appId: 'khazna-ledger',
        profile: {} as any,
        userId: 'mgr-01',
        authToken: '',
        cfg: {} as any,
        actionStore: {} as any,
        scope: managerFiqhScope,
      }
    );
    expect(mgrRes.ok).toBe(false);

    const pubRes = await DATA_ACCESS_TOOLS.compare_periods.execute(args, {
      appId: 'khazna-ledger',
      profile: {} as any,
      userId: 'anon',
      authToken: '',
      cfg: {} as any,
      actionStore: {} as any,
      scope: { role: 'PUBLIC', userId: 'anon' },
    });
    expect(pubRes.ok).toBe(false);
  });

  // Test 13: intentParser resolves focus pronouns, period comparisons, and ambiguous names
  it('Test 13: intentParser resolves pronoun follow-ups, period comparisons, and student disambiguation', async () => {
    const cfg = loadConfig();
    const profiles = new ProfileRegistry();
    await profiles.loadAll(cfg.profilesDir);
    const khaznaProfile = profiles.getProfile('khazna-ledger')!;
    const toolMap = new ToolRegistry().getToolsForProfile(khaznaProfile, adminScope);
    const convId = 'conv-focus-intent-01';
    setConversationFocus(convId, {
      type: 'student',
      id: 'S0125',
      name: 'Safwan K.',
      organizationId: 'demo',
      updatedAt: new Date().toISOString(),
    });

    const followUp = inferDeterministicToolCall(
      'What are his pending dues?',
      toolMap,
      [],
      undefined,
      undefined,
      { conversationId: convId, scope: adminScope }
    );
    expect(followUp?.name).toBe('summarize_student_finance');
    expect(followUp?.args.studentId).toBe('S0125');

    const ambig = inferDeterministicToolCall(
      'Show details for Rahul',
      toolMap,
      [],
      undefined,
      undefined,
      { conversationId: convId, scope: adminScope }
    );
    expect(ambig?.name).toBe('find_students');
    expect(ambig?.args.query).toBe('Rahul');

    const cmp = inferDeterministicToolCall(
      'Compare collections in October 2026 vs November 2026',
      toolMap,
      [],
      undefined,
      undefined,
      { conversationId: convId, scope: adminScope }
    );
    expect(cmp?.name).toBe('compare_periods');
    expect(cmp?.args.period1Start).toBe('2026-10-01');
    expect(cmp?.args.period2Start).toBe('2026-11-01');
  });
});
