import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { config as dotenv } from 'dotenv';
dotenv({ path: new URL('../.env', import.meta.url) });
if (!process.argv.includes('--yes')) {
  console.error('Apaga os dados configurados. Confirme: npm run reset -- --yes');
  process.exit(1);
}
if (process.env.NODE_ENV === 'production') throw new Error('Reset proibido em produção.');
const url = new URL(process.env.DATABASE_URL);
const schema = url.searchParams.get('schema') ?? 'public';
url.searchParams.delete('schema');
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) throw new Error('Schema inválido.');
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = require('pg');
const client = new Client({ connectionString: url.toString() });
await client.connect();
try {
  await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
} finally {
  await client.end();
}
execFileSync(process.execPath, [new URL('./migrate.mjs', import.meta.url).pathname], {
  stdio: 'inherit',
});
execFileSync('npm', ['run', 'seed'], { stdio: 'inherit' });
