import { afterAll, beforeAll, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { db } from '../src/db.js';
let app: FastifyInstance;
beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});
afterAll(async () => {
  if (app) await app.close();
  await db.$disconnect();
});
it('nega acesso anônimo e JWT adulterado antes de consultar dados', async () => {
  for (const path of [
    '/api/auth/me',
    '/api/dashboard',
    '/api/users',
    '/api/finance',
    '/api/deliveries',
  ])
    expect((await app.inject(path)).statusCode).toBe(401);
  const response = await app.inject({
    url: '/api/auth/me',
    headers: { cookie: 'agro_access=jwt-adulterado' },
  });
  expect(response.statusCode).toBe(401);
  expect(response.json().error.code).toBe('UNAUTHORIZED');
});
it('protege mutações contra origens externas e requisições sem Origin', async () => {
  for (const headers of [{}, { origin: 'https://externo.example' }]) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers,
      payload: { email: 'dono@agrocerta.com', password: 'agro123' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('ORIGIN_REJECTED');
  }
});
it('documenta a API e serve assets locais do Swagger sem CDN', async () => {
  const docs = await app.inject('/docs');
  expect(docs.statusCode).toBe(200);
  expect(docs.body).toContain('/docs/swagger-ui-bundle.js');
  const spec = (await app.inject('/docs/json')).json();
  expect(spec.openapi).toBe('3.0.3');
  expect(spec.paths).toHaveProperty('/api/auth/login');
  expect(spec.paths).toHaveProperty('/api/users');
  expect((await app.inject('/docs/swagger-ui.css')).headers['content-type']).toContain('text/css');
});
it('valida o login e limita tentativas sem consultar o banco', async () => {
  const origin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  let status = 0;
  for (let i = 0; i < 11; i++) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin },
      payload: { email: 'email-invalido', password: '' },
    });
    status = response.statusCode;
    if (i === 0) {
      expect(status).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    }
    if (status === 429) {
      expect(response.json().error.code).toBe('RATE_LIMIT');
      break;
    }
  }
  expect(status).toBe(429);
});
it('padroniza respostas de recurso inexistente', async () => {
  const response = await app.inject('/api/inexistente');
  expect(response.statusCode).toBe(404);
  expect(response.json().error).toEqual({ code: 'NOT_FOUND', message: 'Recurso não encontrado.' });
});
