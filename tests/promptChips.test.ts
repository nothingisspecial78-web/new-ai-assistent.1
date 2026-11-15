import { describe, expect, it } from 'vitest';
import { getRankedChips, resolvePageId } from '../packages/server/src/chips/pageRegistry.ts';
import { AssistantRepository } from '../packages/server/src/db/assistantRepository.ts';
import { loadConfig } from '../packages/server/src/config.ts';
import type { AccessScope } from '../packages/server/src/security/scope.ts';

describe('Role-Aware & Page-Aware Prompt Chips (Add-on Prompt Section 11, Tests 1–9)', () => {
  const cfg = loadConfig();
  const repo = new AssistantRepository(cfg);

  const studentScope: AccessScope = {
    role: 'STUDENT',
    userId: 'user-stu-1',
    studentId: 'stu-eng-2',
    sectorId: 'dept-eng',
  };

  const adminScope: AccessScope = {
    role: 'SUPER_ADMIN',
    userId: 'user-admin-1',
  };

  it('Test 1: Chips for student dashboard: includes dynamic "Why do I have pending fees?" when dues > 0', () => {
    const pageId = resolvePageId('/app');
    const chips = getRankedChips({
      scope: studentScope,
      pageId,
      lang: 'en',
      context: {
        scope: studentScope,
        dueAmount: 15000,
      },
    });

    expect(chips.length).toBeGreaterThan(0);
    const whyPending = chips.find((c) => c.id === 'student.dashboard.why-pending');
    expect(whyPending).toBeDefined();
    expect(whyPending?.label).toContain('₹15000');
    expect(whyPending?.prompt).toContain('₹15000');
  });

  it('Test 2: Chips for admin sectors: includes "Which sectors have no manager assigned?" when unassigned > 0', () => {
    const pageId = resolvePageId('/admin/sectors');
    const chips = getRankedChips({
      scope: adminScope,
      pageId,
      lang: 'en',
      context: {
        scope: adminScope,
        unassignedSectorsCount: 2,
      },
    });

    const unassignedChip = chips.find((c) => c.id === 'admin.dashboard.unassigned-sectors');
    expect(unassignedChip).toBeDefined();
    expect(unassignedChip?.label).toContain('2 Sectors Without Manager');
  });

  it('Test 3: Student requesting admin page chips -> sanitized by role, NEVER leaks admin prompts', () => {
    const pageId = resolvePageId('/admin/sectors');
    const chips = getRankedChips({
      scope: studentScope,
      pageId,
      lang: 'en',
    });

    // Must NOT return admin chips
    for (const chip of chips) {
      expect(chip.id).not.toContain('admin.');
      expect(chip.prompt.toLowerCase()).not.toContain('campus overview');
      expect(chip.prompt.toLowerCase()).not.toContain('sectors without manager');
    }
  });

  it('Test 4: Dynamic chip ranking executes within 80ms budget', () => {
    const start = performance.now();
    getRankedChips({
      scope: adminScope,
      pageId: 'admin.dashboard',
      lang: 'en',
      context: {
        scope: adminScope,
        unassignedSectorsCount: 1,
      },
    });
    const duration = performance.now() - start;
    expect(duration).toBeLessThan(80);
  });

  it('Test 5: Personalization ranking: 5 clicks on lower-priority chip boosts it to rank 1; 5 impressions without clicks penalizes', () => {
    const usageMap = new Map<string, { shownCount: number; clickCount: number; lastClickedAt?: string }>();

    // Chip A has base priority 40, but 5 clicks
    usageMap.set('global.guide-tour', { shownCount: 5, clickCount: 5, lastClickedAt: new Date().toISOString() });
    // Chip B has base priority 50, but shown 6 times with 0 clicks (fatigue penalty -3)
    usageMap.set('global.help-shortcuts', { shownCount: 6, clickCount: 0 });

    const ranked = getRankedChips({
      scope: studentScope,
      pageId: 'global',
      lang: 'en',
      chipUsageMap: usageMap,
    });

    // global.guide-tour: 40 + (5*2) + 3 (recency) = 53
    // global.help-shortcuts: 50 - 3 (fatigue) = 47
    expect(ranked[0].id).toBe('global.guide-tour');
    expect(ranked[1].id).toBe('global.help-shortcuts');
  });

  it('Test 6: Language: request lang=ml returns Malayalam labels and prompts', () => {
    const chips = getRankedChips({
      scope: studentScope,
      pageId: 'student.dashboard',
      lang: 'ml',
    });

    expect(chips.length).toBeGreaterThan(0);
    // Check Malayalam script unicode range
    expect(chips[0].label).toMatch(/[\u0D00-\u0D7F]/);
    expect(chips[0].prompt).toMatch(/[\u0D00-\u0D7F]/);
  });

  it('Test 7: Follow-up chips: returns top 3 ranked chips for active context', () => {
    const chips = getRankedChips({
      scope: studentScope,
      pageId: 'student.dashboard',
      lang: 'en',
      limit: 3,
    });

    expect(chips.length).toBe(3);
    expect(chips[0].label).toBeTruthy();
    expect(chips[0].prompt).toBeTruthy();
  });

  it('Test 8: Click logging: recordChipClick updates clickCount in assistant_chip_usage repository', async () => {
    await repo.recordChipClick('user-test-click', 'student.dashboard', 'student.dashboard.my-balance');
    await repo.recordChipClick('user-test-click', 'student.dashboard', 'student.dashboard.my-balance');

    const usages = await repo.getChipUsages('user-test-click', 'student.dashboard');
    const chip = usages.find((u) => u.chipId === 'student.dashboard.my-balance');

    expect(chip).toBeDefined();
    expect(chip?.clickCount).toBe(2);
    expect(chip?.lastClickedAt).toBeDefined();
  });

  it("Test 9: Cross-user isolation: User A's clicks do not affect User B's chip ranking", async () => {
    await repo.recordChipClick('user-A', 'student.dashboard', 'student.dashboard.download-statement');
    await repo.recordChipClick('user-A', 'student.dashboard', 'student.dashboard.download-statement');
    await repo.recordChipClick('user-A', 'student.dashboard', 'student.dashboard.download-statement');

    const usagesB = await repo.getChipUsages('user-B', 'student.dashboard');
    const chipB = usagesB.find((u) => u.chipId === 'student.dashboard.download-statement');

    expect(chipB?.clickCount || 0).toBe(0);
  });

  it('Test 10: PUBLIC role on /login returns only safe public login/register guide chips and zero PII', () => {
    const publicScope: AccessScope = { role: 'PUBLIC', userId: 'guest' };
    const pageId = resolvePageId('/login');
    expect(pageId).toBe('auth.login');

    const chips = getRankedChips({
      scope: publicScope,
      pageId,
      lang: 'en',
      limit: 4,
    });

    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      expect(
        chip.id.startsWith('public.') ||
          chip.id === 'guide.login' ||
          chip.id.startsWith('auth.') ||
          chip.id.startsWith('global.')
      ).toBe(true);
      expect(chip.prompt.toLowerCase()).not.toContain('student');
      expect(chip.prompt.toLowerCase()).not.toContain('admin overview');
    }

    // Also ensure ADMIN cannot obtain superadmin.* chips by tampering with pageId
    const adminScope: AccessScope = { role: 'ADMIN', userId: 'admin-1', organizationId: 'demo' };
    const tampered = getRankedChips({
      scope: adminScope,
      pageId: 'super_admin.dashboard',
      lang: 'en',
      limit: 10,
    });
    expect(tampered.some((c) => c.id.startsWith('superadmin.'))).toBe(false);
  });
});
