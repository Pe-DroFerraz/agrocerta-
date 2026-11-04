import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { config as dotenv } from 'dotenv';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Client } = require('pg');
dotenv({ path: fileURLToPath(new URL('../.env', import.meta.url)) });
const url = new URL(process.env.DATABASE_URL);
const schema = url.searchParams.get('schema') ?? 'public';
url.searchParams.delete('schema');
if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) throw new Error('Schema PostgreSQL inválido.');
const client = new Client({ connectionString: url.toString() });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(17938021)');
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await client.query(`SET LOCAL search_path TO "${schema}"`);
  await client.query(
    'CREATE TABLE IF NOT EXISTS "_agro_migrations" (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT now())',
  );
  const root = fileURLToPath(new URL('../apps/api/prisma/migrations/', import.meta.url));
  for (const entry of readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const sql = readFileSync(`${root}${entry.name}/migration.sql`, 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const prior = await client.query('SELECT checksum FROM "_agro_migrations" WHERE name=$1', [
      entry.name,
    ]);
    if (prior.rowCount) {
      if (prior.rows[0].checksum !== checksum)
        throw new Error(`Checksum alterado na migração ${entry.name}.`);
      continue;
    }
    await client.query(sql);
    await client.query('INSERT INTO "_agro_migrations" (name,checksum) VALUES ($1,$2)', [
      entry.name,
      checksum,
    ]);
    console.log(`Migração aplicada: ${entry.name}`);
  }
  await client.query('COMMIT');
  console.log('Migrações PostgreSQL conferidas.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
