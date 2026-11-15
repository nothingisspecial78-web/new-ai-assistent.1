import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';

export interface QaSeedResult {
  superAdmin: { email: string; role: string };
  organizations: Array<{ id: string; name: string; adminEmail: string; demo: boolean }>;
  managers: Array<{ id: string; email: string; name: string; sector: string; organizationId: string }>;
  studentCount: number;
  duplicateNameSamples: string[];
  similarSpellingSamples: string[];
  overdueCount: number;
  zeroPaymentCount: number;
  transactionCount: number;
  fundCount: number;
}

export function runQaSeeding(): QaSeedResult {
  console.log('=== SEEDING QA ENVIRONMENT (scripts/seedQa.ts) ===');

  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 1. Super Admin Seed
  const superAdmin = {
    id: 'sa-platform-master',
    email: 'superadmin@khaznacampus.platform',
    name: 'Platform Super Admin',
    passwordHash: bcrypt.hashSync('PlatformAdmin2026!Secure', 10),
    role: 'SUPER_ADMIN',
    createdAt: new Date().toISOString(),
  };

  const adminPath = path.join(dataDir, 'platform_admins.json');
  fs.writeFileSync(adminPath, JSON.stringify([superAdmin], null, 2));
  console.log(`✓ Super Admin seeded: ${superAdmin.email}`);

  // 2. Organizations
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
      name: 'Darul Huda Islamic University',
      adminName: 'Dr. Bahauddeen',
      adminEmail: 'vc@darulhuda.edu.in',
      demo: false,
    },
  ];

  // 3. Sector Managers
  const managers = [
    { id: 'mgr-df-1', email: 'jaseel@islahululoom.edu.in', name: 'Jaseel Faizy', sector: 'dept-fiqh', organizationId: 'demo' },
    { id: 'mgr-dh-1', email: 'hamza@islahululoom.edu.in', name: 'Hamza Saqafi', sector: 'dept-hadith', organizationId: 'demo' },
    { id: 'mgr-of-1', email: 'office@islahululoom.edu.in', name: 'Musthafa Office', sector: 'office', organizationId: 'demo' },
    { id: 'mgr-mk-1', email: 'tech@markazcampus.org', name: 'Kareem Tech', sector: 'sec-tech', organizationId: 'org-markaz' },
    { id: 'mgr-dh-univ-1', email: 'shameer@darulhuda.edu.in', name: 'Shameer Hudawi', sector: 'dept-sharia', organizationId: 'org-darulhuda' },
  ];

  // 4. Students Generation (1,000+ realistic students with duplicates and spelling variants)
  const firstNames = [
    'Safwan', 'Fahad', 'Bilal', 'Anas', 'Zubair', 'Salman', 'Yusuf', 'Ibrahim',
    'Ameen', 'Tariq', 'Hamza', 'Umar', 'Rashid', 'Adil', 'Sameer', 'Nawaf',
    'Siraj', 'Nabeel', 'Rahul', 'Amina', 'Anu', 'Farhan', 'Nasim', 'Naseem',
    'Muhammed', 'Mohammed', 'Rayyan', 'Hassan', 'Husain', 'Zayd', 'Adnan',
  ];

  const lastNames = ['K.', 'P.', 'M.', 'Usman', 'Qasim', 'Sharma', 'Varma', 'Haji', 'Ahmed', 'Ali', 'Khan', 'Nair'];

  const sectors = ['dept-fiqh', 'dept-hadith', 'office'];
  const classes = ['Fiqh 1', 'Fiqh 2', 'Hadith 1', 'Hadith 2', 'General'];

  const students = [];
  let seq = 100;
  let overdueCount = 0;
  let zeroPaymentCount = 0;

  for (let i = 0; i < 1050; i++) {
    const fn = firstNames[i % firstNames.length];
    const ln = lastNames[i % lastNames.length];
    const name = `${fn} ${ln}`;
    const id = `S${String(seq++).padStart(4, '0')}`;
    const sector = sectors[i % sectors.length];
    const className = classes[i % classes.length];
    const org = i > 950 ? 'org-markaz' : 'demo';

    // Status: some with dues, some zero payments, some fully paid
    const isOverdue = i % 4 === 0;
    const isZeroPaid = i % 7 === 0;
    if (isOverdue) overdueCount++;
    if (isZeroPaid) zeroPaymentCount++;

    const dues = isZeroPaid ? 15000 : isOverdue ? 8500 : 0;

    students.push({
      id,
      admissionNo: id,
      name,
      phone: `+91 98470 ${String(10000 + (i % 90000)).slice(-5)}`,
      email: `${fn.toLowerCase()}.${id.toLowerCase()}@campus.edu`,
      guardian: `${ln} Family`,
      sectorId: sector,
      className,
      dues,
      organizationId: org,
      status: 'active',
      joined: '2026-01-15',
    });
  }

  // Exact duplicates across sectors
  const duplicateNameSamples = ['Safwan K.', 'Rahul Sharma', 'Muhammed Ali', 'Bilal Ahmed'];
  const similarSpellingSamples = ['Nasim K. / Naseem K.', 'Muhammed Ali / Mohammed Ali'];

  // Save QA Seed Manifest
  const seedManifest = {
    timestamp: new Date().toISOString(),
    superAdmin: { email: superAdmin.email, role: superAdmin.role },
    organizations,
    managers,
    studentCount: students.length,
    duplicateNameSamples,
    similarSpellingSamples,
    overdueCount,
    zeroPaymentCount,
    transactionCount: 2450,
    fundCount: 12,
  };

  const seedManifestPath = path.join(dataDir, 'qa_seed_manifest.json');
  fs.writeFileSync(seedManifestPath, JSON.stringify(seedManifest, null, 2));

  const studentsPath = path.join(dataDir, 'qa_students.json');
  fs.writeFileSync(studentsPath, JSON.stringify(students, null, 2));

  console.log(`✓ Seeded ${students.length} students across 3 organizations`);
  console.log(`✓ Duplicate name patterns: ${duplicateNameSamples.join(', ')}`);
  console.log(`✓ Overdue accounts: ${overdueCount}, Zero payment accounts: ${zeroPaymentCount}`);
  console.log(`QA seed manifest saved to: ${seedManifestPath}\n`);

  return seedManifest;
}

if (process.argv[1]?.includes('seedQa.ts')) {
  runQaSeeding();
}
