import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';

export interface PlatformSuperAdmin {
  id: string;
  email: string;
  passwordHash: string;
  role: 'SUPER_ADMIN';
  organizationId: null;
  status: 'active';
  mustChangePassword: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

const STORE_PATH = path.resolve(process.cwd(), 'data/platform_admins.json');

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!user || !domain) return '***';
  const maskedUser = user.length <= 2 ? `${user[0]}*` : `${user[0]}***${user.slice(-1)}`;
  return `${maskedUser}@${domain}`;
}

export function loadSuperAdminStore(): PlatformSuperAdmin[] {
  if (!fs.existsSync(STORE_PATH)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    return JSON.parse(raw) as PlatformSuperAdmin[];
  } catch {
    return [];
  }
}

export function saveSuperAdminStore(admins: PlatformSuperAdmin[]): void {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(STORE_PATH, JSON.stringify(admins, null, 2), 'utf-8');
}

export async function bootstrapSuperAdmin(options: { resetPassword?: boolean } = {}): Promise<{
  created: boolean;
  email: string;
  message: string;
}> {
  const email = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD || '';

  if (!email || !password) {
    const existing = loadSuperAdminStore();
    if (existing.length > 0) {
      return {
        created: false,
        email: existing[0].email,
        message: 'Super Admin already initialized and active in database.',
      };
    }
    throw new Error(
      'Missing SUPER_ADMIN_EMAIL or SUPER_ADMIN_PASSWORD in environment. Cannot bootstrap platform Super Admin.'
    );
  }

  // Email format validation
  const emailRegex = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
  if (!emailRegex.test(email)) {
    throw new Error('Invalid SUPER_ADMIN_EMAIL format.');
  }

  // Password complexity validation: at least 12 characters
  if (password.length < 12) {
    throw new Error('SUPER_ADMIN_PASSWORD must be at least 12 characters long.');
  }

  const existing = loadSuperAdminStore();
  const foundIndex = existing.findIndex((a) => a.email.toLowerCase() === email);

  if (foundIndex >= 0 && !options.resetPassword) {
    console.log(`[Bootstrap] Super Admin account for ${maskEmail(email)} already exists. Skipping.`);
    return {
      created: false,
      email,
      message: 'Super Admin account already exists. Use --reset-password to overwrite.',
    };
  }

  // Hash password using bcrypt with cost 12
  const salt = bcrypt.genSaltSync(12);
  const passwordHash = bcrypt.hashSync(password, salt);

  const adminRecord: PlatformSuperAdmin = {
    id: foundIndex >= 0 ? existing[foundIndex].id : 'sa-platform-01',
    email,
    passwordHash,
    role: 'SUPER_ADMIN',
    organizationId: null,
    status: 'active',
    mustChangePassword: false,
    createdAt: foundIndex >= 0 ? existing[foundIndex].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (foundIndex >= 0) {
    existing[foundIndex] = adminRecord;
  } else {
    existing.push(adminRecord);
  }

  saveSuperAdminStore(existing);

  console.log(`[Bootstrap] Super Admin account successfully initialized for ${maskEmail(email)}.`);
  return {
    created: true,
    email,
    message: 'Super Admin successfully initialized with bcrypt cost 12 hash.',
  };
}

if (process.argv[1] && process.argv[1].endsWith('bootstrap-super-admin.ts')) {
  const reset = process.argv.includes('--reset-password');
  bootstrapSuperAdmin({ resetPassword: reset })
    .then((res) => console.log(res.message))
    .catch((err) => {
      console.error('[Bootstrap Error]', err.message);
      process.exit(1);
    });
}
