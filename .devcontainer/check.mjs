import assert from 'node:assert/strict';
import http from 'node:http';
import { codespacesEnvironment } from './environment.mjs';
const env = codespacesEnvironment();
const host = new URL(env.WEB_ORIGIN).hostname;
const request = (path, headers = {}, body, method = 'GET') =>
  new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: 5173, path, method, headers: { Host: host, ...headers } },
      (res) => {
        let text = '';
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text }));
      },
    );
    req.setTimeout(10000, () => req.destroy(new Error('Timeout no proxy local.')));
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
assert.equal((await request('/')).status, 200, 'Frontend indisponível no host exato.');
assert.equal((await request('/', { Host: 'untrusted.example' })).status, 403);
const health = await request('/api/health');
assert.equal(health.status, 200);
assert.equal(JSON.parse(health.text).database, 'connected');
const login = await request(
  '/api/auth/login',
  { Origin: env.WEB_ORIGIN, 'Content-Type': 'application/json' },
  { email: 'dono@agrocerta.com', password: 'agro123' },
  'POST',
);
assert.equal(login.status, 200, 'Login demonstrativo indisponível. Confira seed e origem.');
const cookie = login.headers['set-cookie'].map((value) => value.split(';')[0]).join('; ');
try {
  assert.equal(
    (
      await request(
        '/api/auth/logout',
        { Origin: 'https://untrusted.example', Cookie: cookie },
        undefined,
        'POST',
      )
    ).status,
    403,
  );
  for (const path of [
    'auth/me',
    'dashboard',
    'producers',
    'receipts',
    'products',
    'batches',
    'supplies',
    'stock',
    'customers',
    'orders',
    'deliveries',
    'finance',
    'announcements',
    'users',
    'recurring',
    'whatsapp',
    'reports?type=sales',
    'settings',
    'traceability/options',
  ]) {
    assert.equal((await request(`/api/${path}`, { Cookie: cookie })).status, 200, path);
    console.log(`${path.split('?')[0]}: OK`);
  }
  assert.equal(
    (await request('/api/auth/demo', { Origin: env.WEB_ORIGIN }, undefined, 'POST')).status,
    404,
  );
} finally {
  assert.equal(
    (
      await request(
        '/api/auth/logout',
        { Origin: env.WEB_ORIGIN, Cookie: cookie },
        undefined,
        'POST',
      )
    ).status,
    204,
  );
}
console.log('Proxy local, PostgreSQL, login, módulos e restrições de Host/Origin: OK.');
console.log(
  'Este teste não comprova a visibilidade da porta no GitHub: confira 5173 = Private em Ports.',
);
