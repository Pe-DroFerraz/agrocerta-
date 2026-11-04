import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
if (Number(process.versions.node.split('.')[0]) !== 20) throw new Error('Use Node 20 (nvm use).');
const run = (command, args) => execFileSync(command, args, { stdio: 'inherit', env: process.env });
if (!existsSync('.env'))
  writeFileSync(
    '.env',
    readFileSync('.env.example', 'utf8').replace(
      'troque-por-uma-chave-aleatoria-de-pelo-menos-32-caracteres',
      randomBytes(48).toString('hex'),
    ),
    { mode: 0o600 },
  );
run('npm', [existsSync('package-lock.json') ? 'ci' : 'install', '--no-audit', '--no-fund']);
// Banco externo: SKIP_DOCKER=1 npm run setup. DATABASE_URL pode vir do ambiente.
if (process.env.SKIP_DOCKER !== '1') run('docker', ['compose', 'up', '-d', '--wait', 'db']);
run('npm', ['run', 'db:generate']);
run('npm', ['run', 'db:migrate']);
run('npm', ['run', 'seed']);
console.log('Configuração concluída. Execute npm run dev.');
