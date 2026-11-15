import fs from 'node:fs';
import path from 'node:path';

export function runBackup(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.resolve(process.cwd(), `backups/backup-${timestamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  const filesToBackup = [
    '.env',
    'package.json',
    'src/lib/khazna/data.ts',
    'src/lib/khazna/store.ts',
    'src/lib/khazna/types.ts',
    'packages/server/src/security/scope.ts',
  ];

  const manifest: Record<string, string> = {};

  for (const file of filesToBackup) {
    const srcPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(srcPath)) {
      const destPath = path.resolve(backupDir, file.replace(/[/\\]/g, '_'));
      fs.copyFileSync(srcPath, destPath);
      manifest[file] = destPath;
    }
  }

  const metaPath = path.resolve(backupDir, 'manifest.json');
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        backupDir,
        files: manifest,
        reason: 'Pre-migration snapshot before Super Admin platform split and Admin rename',
      },
      null,
      2
    )
  );

  console.log(`[Backup] Completed successfully.`);
  console.log(`[Backup] Directory: ${backupDir}`);
  return backupDir;
}

if (process.argv[1] && process.argv[1].endsWith('backup-before-superadmin.ts')) {
  runBackup();
}
