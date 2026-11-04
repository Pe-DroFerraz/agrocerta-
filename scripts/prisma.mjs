import { config } from 'dotenv';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
if (process.argv.includes('reset') && process.env.NODE_ENV === 'production')
  throw new Error('Reset proibido em produção.');
execFileSync('npx', ['--no-install', 'prisma', ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: fileURLToPath(new URL('../apps/api', import.meta.url)),
  env: process.env,
});
