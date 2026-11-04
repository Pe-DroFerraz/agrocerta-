import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export function codespacesEnvironment(input = process.env) {
  if (input.CODESPACES !== 'true')
    throw new Error(
      'Execute este comando dentro do GitHub Codespaces. Para uso local: npm run dev.',
    );
  const name = input.CODESPACE_NAME;
  const domain = input.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN || 'app.github.dev';
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || domain !== 'app.github.dev')
    throw new Error('Nome/domínio do Codespaces inválido. Não será liberado um host genérico.');
  const file = `${root}.env.codespaces`;
  if (!existsSync(file))
    writeFileSync(file, `JWT_SECRET=${randomBytes(48).toString('hex')}\n`, { mode: 0o600 });
  const secret = readFileSync(file, 'utf8').match(/^JWT_SECRET=([a-f0-9]{96})$/m)?.[1];
  if (!secret)
    throw new Error('Chave local .env.codespaces inválida. Não substitua uma chave em uso.');
  const origin = `https://${name}-5173.${domain}`;
  return {
    ...input,
    DATABASE_URL: 'postgresql://agrocerta:agrocerta_local@db:5432/agrocerta?schema=public',
    JWT_SECRET: secret,
    WEB_ORIGIN: origin,
    AGRO_PREVIEW_HOST: new URL(origin).hostname,
    API_HOST: '127.0.0.1',
    PORT: '3333',
    NODE_ENV: 'development',
    LOCAL_DEMO_ACCESS: '0',
    SKIP_DOCKER: '1',
  };
}
