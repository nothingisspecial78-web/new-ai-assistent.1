import fs from 'node:fs';
import path from 'node:path';

export interface TestSeedData {
  sectors: Array<{ id: string; name: string; code: string; target: number }>;
  classes: Array<{ id: string; name: string; sectorId: string }>;
  students: Array<{
    id: string;
    admissionNo: string;
    name: string;
    phone: string;
    email: string;
    guardian: string;
    sectorId: string;
    classId: string;
    className: string;
    dues: number;
    organizationId: string;
  }>;
  transactions: Array<{
    id: string;
    receiptNo: string;
    studentId?: string;
    sectorId: string;
    amount: number;
    type: 'credit' | 'debit';
    title: string;
    date: string;
    isVoid?: boolean;
    voidReason?: string;
    organizationId: string;
  }>;
  funds: Array<{
    id: string;
    name: string;
    sectorId: string;
    allocated: number;
    spent: number;
    organizationId: string;
  }>;
}

export function generateSeedData(): TestSeedData {
  const sectors = [
    { id: 'dept-fiqh', name: 'Department of Fiqh', code: 'FIQH', target: 500000 },
    { id: 'dept-hadith', name: 'Department of Hadith', code: 'HADITH', target: 400000 },
    { id: 'office', name: 'Campus Office & General', code: 'OFFICE', target: 800000 },
  ];

  const classes = [
    { id: 'c-f1', name: 'Fiqh 1', sectorId: 'dept-fiqh' },
    { id: 'c-f2', name: 'Fiqh 2', sectorId: 'dept-fiqh' },
    { id: 'c-h1', name: 'Hadith 1', sectorId: 'dept-hadith' },
    { id: 'c-h2', name: 'Hadith 2', sectorId: 'dept-hadith' },
    { id: 'c-gen', name: 'General', sectorId: 'office' },
  ];

  const firstNames = [
    'Safwan', 'Fahad', 'Bilal', 'Anas', 'Zubair', 'Salman', 'Yusuf', 'Ibrahim',
    'Ameen', 'Tariq', 'Hamza', 'Umar', 'Rashid', 'Adil', 'Sameer', 'Nawaf',
    'Junaid', 'Mustafa', 'Imran', 'Hassan', 'Hussein', 'Riyaz', 'Nabeel', 'Shamil'
  ];

  const students: TestSeedData['students'] = [];

  // Add disambiguation targets explicitly
  students.push({
    id: 'S0101',
    admissionNo: 'CF-2026-101',
    name: 'Rahul Sharma',
    phone: '9847000101',
    email: 'rahul.sharma@campus.edu',
    guardian: 'Vijay Sharma',
    sectorId: 'dept-fiqh',
    classId: 'c-f1',
    className: 'Fiqh 1',
    dues: 12000,
    organizationId: 'demo',
  });

  students.push({
    id: 'S0102',
    admissionNo: 'CF-2026-102',
    name: 'Rahul Varma',
    phone: '9847000102',
    email: 'rahul.varma@campus.edu',
    guardian: 'Suresh Varma',
    sectorId: 'dept-hadith',
    classId: 'c-h1',
    className: 'Hadith 1',
    dues: 15000,
    organizationId: 'demo',
  });

  students.push({
    id: 'S0125',
    admissionNo: 'CF-2026-125',
    name: 'Safwan K.',
    phone: '9847123456',
    email: 'safwan@campus.edu',
    guardian: 'K. Usman',
    sectorId: 'dept-fiqh',
    classId: 'c-f2',
    className: 'Fiqh 2',
    dues: 15000,
    organizationId: 'demo',
  });

  // Generate 40 additional students
  for (let i = 1; i <= 40; i++) {
    const fn = firstNames[i % firstNames.length];
    const seq = 100 + i;
    const sector = sectors[i % sectors.length];
    const cls = classes.find((c) => c.sectorId === sector.id) || classes[0];
    const sId = `S0${seq}`;
    students.push({
      id: sId,
      admissionNo: `CF-2026-${seq}`,
      name: `${fn} ${String.fromCharCode(65 + (i % 26))}.`,
      phone: `9847${String(i).padStart(6, '0')}`,
      email: `${fn.toLowerCase()}.${sId.toLowerCase()}@campus.edu`,
      guardian: `Guardian of ${fn}`,
      sectorId: sector.id,
      classId: cls.id,
      className: cls.name,
      dues: (i % 3 === 0) ? 0 : 3000 * (i % 5 + 1),
      organizationId: 'demo',
    });
  }

  // Generate transactions
  const transactions: TestSeedData['transactions'] = [
    {
      id: 'tx-001',
      receiptNo: 'RCP-2026-001',
      studentId: 'S0125',
      sectorId: 'dept-fiqh',
      amount: 1500,
      type: 'credit',
      title: 'Term Admission Fee',
      date: '2026-03-01',
      organizationId: 'demo',
    },
    {
      id: 'tx-002',
      receiptNo: 'RCP-2026-002',
      studentId: 'S0125',
      sectorId: 'dept-fiqh',
      amount: 500,
      type: 'credit',
      title: 'Library Caution Deposit',
      date: '2026-03-05',
      isVoid: true,
      voidReason: 'Duplicate entry created in error',
      organizationId: 'demo',
    },
    {
      id: 'tx-003',
      receiptNo: 'RCP-2026-003',
      studentId: 'S0101',
      sectorId: 'dept-fiqh',
      amount: 5000,
      type: 'credit',
      title: 'Tuition Fee Installment 1',
      date: '2026-03-10',
      organizationId: 'demo',
    },
    {
      id: 'tx-004',
      receiptNo: 'RCP-2026-004',
      studentId: 'S0102',
      sectorId: 'dept-hadith',
      amount: 4000,
      type: 'credit',
      title: 'Hadith Textbooks & Journal Fee',
      date: '2026-03-12',
      organizationId: 'demo',
    },
    {
      id: 'tx-005',
      receiptNo: 'RCP-2026-005',
      sectorId: 'dept-fiqh',
      amount: 12000,
      type: 'debit',
      title: 'Library Books Purchase',
      date: '2026-03-15',
      organizationId: 'demo',
    },
  ];

  // Generate 35 more transactions
  for (let i = 6; i <= 40; i++) {
    const stu = students[i % students.length];
    const isCredit = i % 4 !== 0;
    const isVoid = i === 13 || i === 27;
    transactions.push({
      id: `tx-0${i}`,
      receiptNo: `RCP-2026-${String(i).padStart(3, '0')}`,
      studentId: isCredit ? stu.id : undefined,
      sectorId: stu.sectorId,
      amount: 500 * (i % 10 + 1),
      type: isCredit ? 'credit' : 'debit',
      title: isCredit ? `Fee Deposit Batch ${i}` : `Operating Expense ${i}`,
      date: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
      isVoid,
      voidReason: isVoid ? 'Voided for audit correction' : undefined,
      organizationId: 'demo',
    });
  }

  // Funds
  const funds: TestSeedData['funds'] = [
    {
      id: 'f-01',
      name: 'Zakat & Student Relief Fund',
      sectorId: 'office',
      allocated: 200000,
      spent: 65000,
      organizationId: 'demo',
    },
    {
      id: 'f-02',
      name: 'Hadith Research Endowment',
      sectorId: 'dept-hadith',
      allocated: 150000,
      spent: 42000,
      organizationId: 'demo',
    },
    {
      id: 'f-03',
      name: 'Fiqh Library Digitization Fund',
      sectorId: 'dept-fiqh',
      allocated: 100000,
      spent: 38000,
      organizationId: 'demo',
    },
  ];

  return { sectors, classes, students, transactions, funds };
}

export function seedDataAccessTestFile(): string {
  const data = generateSeedData();
  const outPath = path.resolve(process.cwd(), 'data/seed_data_access.json');
  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`[Seed] Seeded ${data.students.length} students, ${data.transactions.length} transactions, and ${data.funds.length} funds to ${outPath}`);
  return outPath;
}

if (process.argv[1] && process.argv[1].endsWith('seedDataAccessTest.ts')) {
  seedDataAccessTestFile();
}
