import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const args = process.argv.slice(2);
const command =
  args[0] === 'generate'
    ? 'generate-client.mjs'
    : args[0] === 'migrate' && args[1] === 'deploy'
      ? 'migrate.mjs'
      : null;
if (!command)
  throw new Error(
    'Use generate ou migrate deploy. As migrações SQL deste projeto são aplicadas pelo runner PostgreSQL com checksum.',
  );
execFileSync(process.execPath, [fileURLToPath(new URL(command, import.meta.url))], {
  stdio: 'inherit',
  env: process.env,
});
