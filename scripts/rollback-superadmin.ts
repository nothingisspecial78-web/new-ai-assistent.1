import fs from 'node:fs';
import path from 'node:path';

export function runRollback(backupDir?: string): boolean {
  let targetDir = backupDir;
  if (!targetDir) {
    const backupsRoot = path.resolve(process.cwd(), 'backups');
    if (!fs.existsSync(backupsRoot)) {
      console.error('[Rollback] No backups directory found.');
      return false;
    }
    const entries = fs.readdirSync(backupsRoot).filter((e) => e.startsWith('backup-')).sort().reverse();
    if (entries.length === 0) {
      console.error('[Rollback] No backup snapshots found.');
      return false;
    }
    targetDir = path.resolve(backupsRoot, entries[0]);
  }

  const manifestPath = path.resolve(targetDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`[Rollback] Manifest not found in ${targetDir}`);
    return false;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
    files: Record<string, string>;
  };

  for (const [relPath, backupPath] of Object.entries(manifest.files)) {
    if (fs.existsSync(backupPath)) {
      const origPath = path.resolve(process.cwd(), relPath);
      fs.copyFileSync(backupPath, origPath);
      console.log(`[Rollback] Restored: ${relPath}`);
    }
  }

  console.log(`[Rollback] Completed successfully from snapshot: ${targetDir}`);
  return true;
}

if (process.argv[1] && process.argv[1].endsWith('rollback-superadmin.ts')) {
  const customDir = process.argv[2];
  runRollback(customDir);
}
