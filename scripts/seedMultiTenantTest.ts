import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';

export interface MultiTenantSeedData {
  organizations: Array<{
    id: string;
    name: string;
    adminName: string;
    adminEmail: string;
    demo: boolean;
  }>;
  users: Array<{
    id: string;
    email: string;
    name: string;
    role: 'SUPER_ADMIN' | 'ADMIN' | 'SECTOR_MANAGER' | 'STUDENT';
    organizationId: string | null;
    sectorIds?: string[];
    studentId?: string;
  }>;
}

export function generateMultiTenantData(): MultiTenantSeedData {
  const organizations = [
    {
      id: 'demo',
      name: 'Islahul Uloom Arabic College',
      adminName: 'Abdulla K.',
      adminEmail: 'principal@islahululoom.edu.in',
      demo: true,
    },
    {
      id: 'org-markaz',
      name: 'Markaz Knowledge Campus',
      adminName: 'Prof. Alavi Haji',
      adminEmail: 'admin@markazcampus.org',
      demo: false,
    },
    {
      id: 'org-darulhuda',
      name: 'Darul Huda University',
      adminName: 'Dr. Bahauddeen',
      adminEmail: 'vc@darulhuda.edu.in',
      demo: false,
    },
  ];

  const users: MultiTenantSeedData['users'] = [
    // Platform Super Admin
    {
      id: 'sa-platform-01',
      email: 'superadmin@khaznacampus.platform',
      name: 'Platform Super Admin',
      role: 'SUPER_ADMIN',
      organizationId: null,
    },
    // Org 1 (Islahul Uloom)
    {
      id: 'admin-islahul',
      email: 'principal@islahululoom.edu.in',
      name: 'Abdulla K.',
      role: 'ADMIN',
      organizationId: 'demo',
    },
    {
      id: 'mgr-islahul-fiqh',
      email: 'fiqh.manager@islahululoom.edu.in',
      name: 'Umar Moulavi',
      role: 'SECTOR_MANAGER',
      organizationId: 'demo',
      sectorIds: ['dept-fiqh'],
    },
    {
      id: 'stu-islahul-safwan',
      email: 'safwan@campus.edu',
      name: 'Safwan K.',
      role: 'STUDENT',
      organizationId: 'demo',
      studentId: 'S0125',
    },
    // Org 2 (Markaz Campus)
    {
      id: 'admin-markaz',
      email: 'admin@markazcampus.org',
      name: 'Prof. Alavi Haji',
      role: 'ADMIN',
      organizationId: 'org-markaz',
    },
    {
      id: 'mgr-markaz-science',
      email: 'science@markazcampus.org',
      name: 'Dr. Rasheed K.',
      role: 'SECTOR_MANAGER',
      organizationId: 'org-markaz',
      sectorIds: ['dept-sci'],
    },
    {
      id: 'stu-markaz-rahim',
      email: 'rahim@markazcampus.org',
      name: 'Abdul Rahim',
      role: 'STUDENT',
      organizationId: 'org-markaz',
      studentId: 'MK-1001',
    },
    // Org 3 (Darul Huda)
    {
      id: 'admin-darulhuda',
      email: 'vc@darulhuda.edu.in',
      name: 'Dr. Bahauddeen',
      role: 'ADMIN',
      organizationId: 'org-darulhuda',
    },
    {
      id: 'mgr-darulhuda-arts',
      email: 'arts@darulhuda.edu.in',
      name: 'Prof. Zubair',
      role: 'SECTOR_MANAGER',
      organizationId: 'org-darulhuda',
      sectorIds: ['dept-arts'],
    },
  ];

  return { organizations, users };
}

export function seedMultiTenantFile(): string {
  const data = generateMultiTenantData();
  const outPath = path.resolve(process.cwd(), 'data/seed_multi_tenant.json');
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`[Seed] Seeded ${data.organizations.length} organizations and ${data.users.length} users to ${outPath}`);
  return outPath;
}

if (process.argv[1] && process.argv[1].endsWith('seedMultiTenantTest.ts')) {
  seedMultiTenantFile();
}
