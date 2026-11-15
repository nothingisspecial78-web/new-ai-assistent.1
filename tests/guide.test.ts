import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ALL_GUIDES, GuideDefSchema } from '../packages/core/src/index.ts';
import {
  inferDeterministicToolCall,
  loadConfig,
  ProfileRegistry,
  shouldUseAgentLoop,
  ToolRegistry,
} from '../packages/server/src/index.ts';
import { guideService } from '../packages/server/src/guides/guideService.ts';
import type { AccessScope } from '../packages/server/src/security/scope.ts';
import { buildAssistantAvatarModel } from '../packages/widget/src/components/avatarModel.ts';

const publicScope: AccessScope = {
  role: 'PUBLIC',
  userId: 'guest',
};

const studentScope: AccessScope = {
  role: 'STUDENT',
  userId: 'stu-1',
  studentId: 'stu-1',
  sectorId: 'dept-fiqh',
};

const managerScope: AccessScope = {
  role: 'SECTOR_MANAGER',
  userId: 'mgr-1',
  sectorIds: ['dept-fiqh'],
};

const adminScope: AccessScope = {
  role: 'ADMIN',
  userId: 'admin-1',
  organizationId: 'demo',
};

const superAdminScope: AccessScope = {
  role: 'SUPER_ADMIN',
  userId: 'sa-1',
  organizationId: null,
};

describe('Guide Skill v2 (Avatar, Voice & Step-by-Step Walkthroughs)', () => {
  it('1. Guide Definitions: authored guides pass Zod validation and have unique step IDs', () => {
    expect(ALL_GUIDES.length).toBeGreaterThanOrEqual(13);

    const guideIds = new Set<string>();
    ALL_GUIDES.forEach((guide) => {
      const parseResult = GuideDefSchema.safeParse(guide);
      expect(parseResult.success).toBe(true);

      expect(guideIds.has(guide.guideId)).toBe(false);
      guideIds.add(guide.guideId);

      const stepIds = new Set<string>();
      guide.steps.forEach((step) => {
        expect(stepIds.has(step.stepId)).toBe(false);
        stepIds.add(step.stepId);
        expect(step.instruction.en.length).toBeGreaterThan(0);
      });
    });
  });

  it('2. Role-Based Scoping: Student cannot see or access Admin / Manager guides', () => {
    const studentGuides = guideService.getGuidesForScope(studentScope);
    const studentGuideIds = studentGuides.map((g) => g.guideId);

    expect(studentGuideIds).toContain('student.view_fees');
    expect(studentGuideIds).toContain('student.profile');
    expect(studentGuideIds).toContain('public.login');

    expect(studentGuideIds).not.toContain('admin.students.import');
    expect(studentGuideIds).not.toContain('admin.sectors.create');
    expect(studentGuideIds).not.toContain('manager.ledger_entry');
    expect(studentGuideIds).not.toContain('superadmin.overview');

    const forbidden = guideService.getGuideById('admin.students.import', studentScope);
    expect(forbidden).toBeNull();
  });

  it('3. Role-Based Scoping: Manager can access Manager and Public guides, but not SuperAdmin or Institution settings', () => {
    const managerGuides = guideService.getGuidesForScope(managerScope);
    const managerGuideIds = managerGuides.map((g) => g.guideId);

    expect(managerGuideIds).toContain('manager.ledger_entry');
    expect(managerGuideIds).toContain('manager.add_deposit');
    expect(managerGuideIds).toContain('manager.bulk_entry');
    expect(managerGuideIds).not.toContain('admin.institution');
    expect(managerGuideIds).not.toContain('superadmin.overview');
  });

  it('4. Role-Based Scoping: Admin and SuperAdmin have appropriate elevated access', () => {
    const adminGuides = guideService.getGuidesForScope(adminScope);
    const adminGuideIds = adminGuides.map((g) => g.guideId);

    expect(adminGuideIds).toContain('admin.students.import');
    expect(adminGuideIds).toContain('admin.students.add');
    expect(adminGuideIds).toContain('admin.sectors.create');
    expect(adminGuideIds).not.toContain('superadmin.overview');

    const superGuides = guideService.getGuidesForScope(superAdminScope);
    const superGuideIds = superGuides.map((g) => g.guideId);
    expect(superGuideIds).toContain('superadmin.overview');
  });

  it('5. Multilingual Search: English and Malayalam queries match appropriate guides', () => {
    const enResults = guideService.searchGuides('import excel students', adminScope);
    expect(enResults.length).toBeGreaterThan(0);
    expect(enResults[0].guideId).toBe('admin.students.import');

    const mlResults = guideService.searchGuides('വിദ്യാർത്ഥികളെ ഇമ്പോർട്ട്', adminScope);
    expect(mlResults.length).toBeGreaterThan(0);
    expect(mlResults[0].guideId).toBe('admin.students.import');

    const feeResults = guideService.searchGuides('ഫീസ് വിവരങ്ങൾ', studentScope);
    expect(feeResults.length).toBeGreaterThan(0);
    expect(feeResults[0].guideId).toBe('student.view_fees');
  });

  it('6. Privacy Protection: Sensitive password fields are flagged and values are never exposed', () => {
    const loginGuide = ALL_GUIDES.find((g) => g.guideId === 'public.login');
    expect(loginGuide).toBeDefined();

    const passwordStep = loginGuide?.steps.find((s) => s.stepId === 'enter-password');
    expect(passwordStep).toBeDefined();
    expect(passwordStep?.sensitive).toBe(true);

    const registerGuide = ALL_GUIDES.find((g) => g.guideId === 'public.register');
    const regPasswordStep = registerGuide?.steps.find((s) => s.stepId === 'fill-password');
    expect(regPasswordStep?.sensitive).toBe(true);
  });

  it('7. Guide Progress Tracking & Analytics State Store', () => {
    const now = new Date().toISOString();
    guideService.recordProgress({
      userId: 'test-user-1',
      guideId: 'public.login',
      stepId: 'enter-username',
      status: 'step_reached',
      updatedAt: now,
    });

    const active = guideService.getProgress('test-user-1', 'public.login');
    expect(active?.guideId).toBe('public.login');
    expect(active?.stepId).toBe('enter-username');
    expect(active?.status).toBe('step_reached');

    guideService.recordProgress({
      userId: 'test-user-1',
      guideId: 'public.login',
      stepId: 'click-submit',
      status: 'completed',
      updatedAt: new Date().toISOString(),
    });

    const completed = guideService.getProgress('test-user-1', 'public.login');
    expect(completed?.status).toBe('completed');
  });

  it('8. PUBLIC Scope on /login sees ONLY public login/register guides and public guide tools', async () => {
    const publicGuides = guideService.getGuidesForScope(publicScope);
    expect(publicGuides.every((g) => g.roles === 'public')).toBe(true);
    expect(publicGuides.map((g) => g.guideId)).toContain('public.login');
    expect(guideService.getGuideById('admin.students.import', publicScope)).toBeNull();

    const cfg = loadConfig();
    const profiles = new ProfileRegistry();
    await profiles.loadAll(path.resolve(process.cwd(), cfg.profilesDir));
    const khaznaProfile = profiles.getProfile('khazna-ledger')!;
    const publicTools = new ToolRegistry().getToolsForProfile(khaznaProfile, publicScope);
    expect(Array.from(publicTools.keys()).sort()).toEqual(['search_guides', 'start_guide']);
  });

  it('9. Shared 3D Avatar Model builds exact 29 meshes and 15,834 triangles', () => {
    const model = buildAssistantAvatarModel({ includeContactShadow: false });
    let meshCount = 0;
    let triangleCount = 0;
    model.avatarRoot.traverse((obj: any) => {
      if (obj.isMesh && obj.geometry) {
        meshCount += 1;
        const geom = obj.geometry;
        if (geom.index) {
          triangleCount += geom.index.count / 3;
        } else if (geom.attributes?.position) {
          triangleCount += geom.attributes.position.count / 3;
        }
      }
    });
    model.geometries.forEach((g) => g.dispose());
    model.materials.forEach((m) => m.dispose());

    expect(meshCount).toBe(29);
    expect(triangleCount).toBe(15834);
  });

  it('10. Guide Intent Routing runs deterministically on khazna-ledger without breaking college-finance RAG', async () => {
    const cfg = loadConfig();
    const profiles = new ProfileRegistry();
    await profiles.loadAll(path.resolve(process.cwd(), cfg.profilesDir));
    const khaznaProfile = profiles.getProfile('khazna-ledger')!;
    const financeProfile = profiles.getProfile('college-finance')!;

    expect(shouldUseAgentLoop('How do I import students from Excel?', khaznaProfile)).toBe(true);
    expect(shouldUseAgentLoop('How do I mark a student as paid?', financeProfile)).toBe(false);

    const tools = new ToolRegistry().getToolsForProfile(khaznaProfile, adminScope);
    const inferred = inferDeterministicToolCall('Guide me to import students from Excel', tools, []);
    expect(inferred?.name).toBe('start_guide');
    expect(inferred?.args?.guideId).toBe('admin.students.import');
  });

  it('11. "how do I see a student\'s details" routes to admin.students.view guide (not data dump) and is blocked for STUDENT', async () => {
    const cfg = loadConfig();
    const profiles = new ProfileRegistry();
    await profiles.loadAll(path.resolve(process.cwd(), cfg.profilesDir));
    const khaznaProfile = profiles.getProfile('khazna-ledger')!;
    const tools = new ToolRegistry().getToolsForProfile(khaznaProfile, adminScope);

    const inferred = inferDeterministicToolCall("how do I see a student's details", tools, []);
    expect(inferred?.name).toBe('start_guide');
    expect(inferred?.args?.guideId).toBe('admin.students.view');

    expect(guideService.getGuideById('admin.students.view', adminScope)).not.toBeNull();
    expect(guideService.getGuideById('admin.students.view', studentScope)).toBeNull();
  });
});
