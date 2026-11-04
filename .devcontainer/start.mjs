import { spawn } from 'node:child_process';
import { mkdirSync, openSync, closeSync } from 'node:fs';
import { codespacesEnvironment, root } from './environment.mjs';
const env = codespacesEnvironment();
const healthy = async () => {
  try {
    const [api, web] = await Promise.all([
      fetch('http://127.0.0.1:3333/api/health', { signal: AbortSignal.timeout(2000) }),
      fetch('http://127.0.0.1:5173', { signal: AbortSignal.timeout(2000) }),
    ]);
    return api.ok && (await api.json()).database === 'connected' && web.ok;
  } catch {
    return false;
  }
};
if (!(await healthy())) {
  mkdirSync(`${root}.devcontainer/.logs`, { recursive: true });
  const log = openSync(`${root}.devcontainer/.logs/dev.log`, 'a', 0o600);
  const child = spawn('npm', ['run', 'dev'], {
    cwd: root,
    env,
    detached: true,
    stdio: ['ignore', log, log],
  });
  closeSync(log);
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  child.unref();
  let ready = false;
  for (let attempt = 0; attempt < 45; attempt++) {
    if (await healthy()) {
      ready = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!ready) {
    if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        /* Já encerrou. */
      }
    }
    throw new Error('Serviços não ficaram prontos. Consulte .devcontainer/.logs/dev.log.');
  }
}
console.log('PostgreSQL conectado; API e frontend respondem.');
console.log('Em Ports, confirme 5173 = Private e use Open in Browser. Não encaminhe 3333/5432.');
