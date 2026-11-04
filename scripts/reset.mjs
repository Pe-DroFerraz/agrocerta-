import { execFileSync } from 'node:child_process';
if (!process.argv.includes('--yes')) {
  console.error('Apaga os dados do banco configurado. Para confirmar: npm run reset -- --yes');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production')
  throw new Error('Reset de demonstração proibido em produção.');
execFileSync('node', ['scripts/prisma.mjs', 'migrate', 'reset', '--force'], { stdio: 'inherit' });
