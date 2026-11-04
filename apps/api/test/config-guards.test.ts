import { it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
it('recusa acesso demo em produção, em bind público e com origem externa', () => {
  for (const env of [
    { NODE_ENV: 'production', WEB_ORIGIN: 'https://agrocerta.example' },
    { NODE_ENV: 'development', API_HOST: '0.0.0.0' },
    { NODE_ENV: 'development', WEB_ORIGIN: 'https://demo.example' },
  ]) {
    const result = spawnSync(
      process.execPath,
      ['../../node_modules/tsx/dist/cli.mjs', 'src/config.ts'],
      {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: {
          ...process.env,
          API_HOST: '127.0.0.1',
          WEB_ORIGIN: 'http://localhost:5173',
          LOCAL_DEMO_ACCESS: '1',
          ...env,
        },
        encoding: 'utf8',
      },
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Acesso direto demo só é permitido');
  }
});
