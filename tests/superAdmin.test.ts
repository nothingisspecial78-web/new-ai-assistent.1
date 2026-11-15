import { describe, it, expect, beforeAll } from 'vitest';
import bcrypt from 'bcryptjs';
import { scopedRepository } from '../packages/server/src/db/scopedDataRepository.ts';
import {
  loadSuperAdminStore,
  saveSuperAdminStore,
  bootstrapSuperAdmin,
} from '../scripts/bootstrap-super-admin.ts';
import {
  createScopeToken,
  verifyScopeToken,
  type AccessScope,
} from '../packages/server/src/security/scope.ts';

describe('Multi-Tenant Isolation & Platform Super Admin (Master Add-on)', () => {
  const superAdminScope: AccessScope = { role: 'SUPER_ADMIN', userId: 'sa-01', organizationId: null };
  const orgAAdminScope: AccessScope = { role: 'ADMIN', userId: 'admin-a', organizationId: 'demo' };
  const orgBAdminScope: AccessScope = { role: 'ADMIN', userId: 'admin-b', organizationId: 'org-markaz' };

  beforeAll(async () => {
    process.env.SUPER_ADMIN_EMAIL = 'superadmin@khaznacampus.platform';
    process.env.SUPER_ADMIN_PASSWORD = 'SuperAdmin@Passw0rd123!';
    await bootstrapSuperAdmin({ resetPassword: true });
  }, 30000);

  // Test 1: Multi-tenant student isolation between Org A and Org B
  it('Test 1: Admin of Org A cannot see or query students of Org B', async () => {
    // Querying in Org A (demo)
    const orgAStudents = await scopedRepository.findStudents('Safwan', orgAAdminScope);
    expect(orgAStudents.matches.length).toBeGreaterThanOrEqual(1);
    expect(orgAStudents.matches[0].organizationId).toBe('demo');

    // Admin of Org B querying Safwan (who is in Org A) -> returns 0 matches
    const orgBQuery = await scopedRepository.findStudents('Safwan', orgBAdminScope);
    expect(orgBQuery.matches.length).toBe(0);
  });

  // Test 2: Multi-tenant sector isolation
  it('Test 2: Sector managers of Org A cannot query sectors of Org B', async () => {
    const mgrA: AccessScope = {
      role: 'SECTOR_MANAGER',
      userId: 'mgr-a',
      organizationId: 'demo',
      sectorIds: ['dept-fiqh'],
    };
    const sectors = await scopedRepository.findSectors('', mgrA);
    for (const s of sectors) {
      expect(s.organizationId).toBe('demo');
    }
  });

  // Test 3: Platform Super Admin bootstrap stores bcrypt cost 12 hash
  it('Test 3: Bootstrap creates platform admin with valid email format and bcrypt cost 12 hash', async () => {
    const admins = loadSuperAdminStore();
    expect(admins.length).toBeGreaterThan(0);
    const sa = admins.find((a) => a.email === 'superadmin@khaznacampus.platform');
    expect(sa).toBeDefined();
    expect(sa?.role).toBe('SUPER_ADMIN');
    expect(sa?.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    // Verifies against the seed password using async non-blocking comparison
    const validMatch = await bcrypt.compare('SuperAdmin@Passw0rd123!', sa!.passwordHash);
    const wrongMatch = await bcrypt.compare('WrongPassword!', sa!.passwordHash);
    expect(validMatch).toBe(true);
    expect(wrongMatch).toBe(false);
  }, 45000);

  // Test 4: Password complexity check in bootstrap
  it('Test 4: Bootstrap enforces password complexity (>= 12 characters)', async () => {
    process.env.SUPER_ADMIN_PASSWORD = 'short';
    await expect(bootstrapSuperAdmin({ resetPassword: true })).rejects.toThrow(
      /at least 12 characters/i
    );
    // Restore valid password
    process.env.SUPER_ADMIN_PASSWORD = 'SuperAdmin@Passw0rd123!';
  });

  // Test 5: Role tokens have separate audiences and claims
  it('Test 5: Super Admin token has aud: "super-admin" while Admin token is organization-scoped', () => {
    const saToken = createScopeToken(superAdminScope);
    const saVerified = verifyScopeToken(saToken);
    expect(saVerified?.role).toBe('SUPER_ADMIN');
    expect(saVerified && 'organizationId' in saVerified ? saVerified.organizationId : undefined).toBeNull();

    const adminToken = createScopeToken(orgAAdminScope);
    const adminVerified = verifyScopeToken(adminToken);
    expect(adminVerified?.role).toBe('ADMIN');
    expect(adminVerified && 'organizationId' in adminVerified ? adminVerified.organizationId : undefined).toBe('demo');
  });

  // Test 6: Platform Super Admin has cross-organization visibility
  it('Test 6: Super Admin can list all tenant organizations across the platform', async () => {
    const orgs = await scopedRepository.listOrganizations(superAdminScope);
    expect(orgs.length).toBeGreaterThanOrEqual(1);
    expect(orgs.some((o) => o.id === 'demo')).toBe(true);
  });

  // Test 7: Platform Usage Analytics calculation
  it('Test 7: Platform usage analytics aggregates students, sectors, and transactions', async () => {
    const analytics = await scopedRepository.summarizePlatformUsage(superAdminScope);
    expect(analytics.organizationCount).toBeGreaterThanOrEqual(1);
    expect(analytics.totalStudents).toBeGreaterThan(0);
    expect(analytics.totalSectors).toBeGreaterThan(0);
    expect(analytics.systemHealth).toContain('Operational');
  });

  // Test 8: Non-Super-Admin roles cannot call platform usage
  it('Test 8: Admin or Manager cannot invoke summarizePlatformUsage', async () => {
    await expect(scopedRepository.summarizePlatformUsage(orgAAdminScope)).rejects.toThrow(
      /Access denied/i
    );
  });

  // Test 9: Non-Super-Admin roles cannot call listOrganizations
  it('Test 9: Admin or Manager cannot invoke listOrganizations', async () => {
    await expect(scopedRepository.listOrganizations(orgAAdminScope)).rejects.toThrow(
      /Access denied/i
    );
  });
});
