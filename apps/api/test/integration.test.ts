import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { config as dotenv } from 'dotenv';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
dotenv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
const origin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
const schema = `agro_test_${randomBytes(6).toString('hex')}`;
const url = new URL(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!);
url.searchParams.set('schema', schema);
process.env.DATABASE_URL = url.toString();
process.env.NODE_ENV = 'test';
process.env.LOCAL_DEMO_ACCESS = '0';
process.env.JWT_SECRET ??= randomBytes(48).toString('hex');
let app: FastifyInstance;
let db: PrismaClient;
const sessions: Record<string, string> = {};
function cookies(response: { cookies: { name: string; value: string }[] }) {
  return response.cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}
beforeAll(async () => {
  execFileSync(process.execPath, ['../../scripts/prisma.mjs', 'migrate', 'deploy'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdio: 'pipe',
    env: process.env,
  });
  execFileSync(process.execPath, ['../../node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdio: 'pipe',
    env: process.env,
  });
  db = (await import('../src/db.js')).db;
  app = await (await import('../src/app.js')).buildApp();
  await app.ready();
  for (const role of ['dono', 'producao', 'comercial', 'entregador']) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin },
      payload: { email: `${role}@agrocerta.com`, password: 'agro123' },
    });
    expect(response.statusCode).toBe(200);
    sessions[role] = cookies(response);
  }
});
afterAll(async () => {
  if (app) await app.close();
  if (db) {
    await db.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await db.$disconnect();
  }
});
describe('Autenticação e segurança', () => {
  it('recusa anônimo, credenciais erradas e origem não autorizada', async () => {
    expect((await app.inject('/api/auth/me')).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          headers: { origin },
          payload: { email: 'dono@agrocerta.com', password: 'errada' },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          headers: { origin: 'https://malicioso.example' },
          payload: { email: 'dono@agrocerta.com', password: 'agro123' },
        })
      ).statusCode,
    ).toBe(403);
  });
  it('usa cookies httpOnly, rotaciona refresh e invalida a sessão anterior', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { origin },
      payload: { email: 'dono@agrocerta.com', password: 'agro123' },
    });
    expect(login.cookies.every((c) => c.httpOnly && c.sameSite === 'Strict')).toBe(true);
    expect(login.json()).not.toHaveProperty('token');
    const old = cookies(login);
    const refresh = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { origin, cookie: old },
    });
    expect(refresh.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/refresh',
          headers: { origin, cookie: old },
        })
      ).statusCode,
    ).toBe(401);
    expect((await app.inject({ url: '/api/auth/me', headers: { cookie: old } })).statusCode).toBe(
      401,
    );
    const next = cookies(refresh);
    expect((await app.inject({ url: '/api/auth/me', headers: { cookie: next } })).statusCode).toBe(
      200,
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/logout',
          headers: { origin, cookie: next },
        })
      ).statusCode,
    ).toBe(204);
    expect((await app.inject({ url: '/api/auth/me', headers: { cookie: next } })).statusCode).toBe(
      401,
    );
  });
  it('reflete desativação imediatamente e nunca retorna hash da senha', async () => {
    const me = await app.inject({ url: '/api/auth/me', headers: { cookie: sessions.comercial } });
    expect(me.json().user).not.toHaveProperty('passwordHash');
    await db.user.update({ where: { id: 'sales' }, data: { active: false } });
    expect(
      (await app.inject({ url: '/api/auth/me', headers: { cookie: sessions.comercial } }))
        .statusCode,
    ).toBe(401);
    await db.user.update({ where: { id: 'sales' }, data: { active: true } });
  });
  it('limita tentativas de login', async () => {
    let status = 0;
    for (let i = 0; i < 11; i++) {
      status = (
        await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          headers: { origin },
          payload: { email: 'inexistente@example.com', password: 'errada' },
        })
      ).statusCode;
      if (status === 429) break;
    }
    expect(status).toBe(429);
  });
});
describe('Permissões no backend e consultas', () => {
  it('aplica a matriz de acesso em todas as rotas de consulta', async () => {
    const { permissions } = await import('../src/permissions.js');
    for (const [role, roleKey] of [
      ['dono', 'OWNER'],
      ['producao', 'PRODUCTION'],
      ['comercial', 'SALES'],
      ['entregador', 'DRIVER'],
    ] as const) {
      for (const resource of permissions.OWNER) {
        const response = await app.inject({
          url: `/api/${resource}`,
          headers: { cookie: sessions[role] },
        });
        expect(response.statusCode, `${role}: ${resource}`).toBe(
          (permissions[roleKey] as readonly string[]).includes(resource) ? 200 : 403,
        );
      }
    }
  });
  it('filtra e pagina no servidor; rejeita limites e campos inesperados', async () => {
    const r = await app.inject({
      url: '/api/producers?limit=2&page=2',
      headers: { cookie: sessions.dono },
    });
    expect(r.json().rows).toHaveLength(2);
    expect(r.json().total).toBe(10);
    const s = await app.inject({
      url: '/api/producers?search=Maria',
      headers: { cookie: sessions.dono },
    });
    expect(s.json().rows).toHaveLength(1);
    for (const q of ['limit=999', 'page=0', 'injetado=true'])
      expect(
        (await app.inject({ url: `/api/producers?${q}`, headers: { cookie: sessions.dono } }))
          .statusCode,
      ).toBe(400);
  });
  it('entregador recebe somente as próprias entregas de hoje', async () => {
    const r = await app.inject({
      url: '/api/deliveries',
      headers: { cookie: sessions.entregador },
    });
    const { dateRange } = await import('../src/dates.js');
    const today = dateRange({ period: 'today' });
    const count = await db.delivery.count({
      where: { driverId: 'driver-0', scheduledAt: { gte: today.start, lt: today.end } },
    });
    expect(r.json().total).toBe(count);
    for (const row of r.json().rows) expect(row.driver).toBe('João Mendes');
  });
  it('cria um usuário auditado e recusa duplicação e escalada de papel', async () => {
    const payload = {
      name: 'Pessoa Teste',
      email: 'teste@example.com',
      password: 'Senha-Forte-123',
      role: 'PRODUCTION',
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/users',
          headers: { origin, cookie: sessions.comercial },
          payload,
        })
      ).statusCode,
    ).toBe(403);
    const created = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { origin, cookie: sessions.dono },
      payload,
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).not.toHaveProperty('passwordHash');
    expect(
      await db.auditLog.count({ where: { action: 'CREATE_USER', entityId: created.json().id } }),
    ).toBe(1);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/users',
          headers: { origin, cookie: sessions.dono },
          payload,
        })
      ).statusCode,
    ).toBe(409);
  });
  it('isola notificações entre usuários', async () => {
    const row = await db.notification.findFirstOrThrow({ where: { userId: 'owner' } });
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/notifications/${row.id}/read`,
          headers: { origin, cookie: sessions.comercial },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/notifications/${row.id}/read`,
          headers: { origin, cookie: sessions.dono },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await db.notification.findUniqueOrThrow({ where: { id: row.id } })).readAt,
    ).not.toBeNull();
  });
  it('gera OpenAPI e verifica conexão com PostgreSQL', async () => {
    expect((await app.inject('/api/health')).json()).toEqual({
      status: 'ok',
      database: 'connected',
    });
    expect((await app.inject('/docs/json')).json().paths).toHaveProperty('/api/auth/login');
  });
});
describe('Indicadores e integridade da demonstração', () => {
  it('carrega o volume esperado de dados', async () => {
    expect(await db.milkReceipt.count()).toBe(900);
    expect(await db.batch.count()).toBe(120);
    expect(await db.order.count()).toBe(600);
    expect(await db.customer.count()).toBe(35);
    expect(await db.product.count()).toBe(11);
    expect(await db.supply.count()).toBe(25);
    expect(await db.batch.count({ where: { status: 'BLOCKED' } })).toBe(2);
  });
  it('concilia saldos, reservas, leite, recebíveis e rastreabilidade por relações reais', async () => {
    const batches = await db.batch.findMany({
      include: {
        movements: true,
        orderItems: { include: { order: true } },
        production: { include: { sources: { include: { receipt: true } } } },
      },
    });
    for (const b of batches) {
      expect(Number(b.availableQuantity)).toBeCloseTo(
        b.movements.reduce((s, m) => s + Number(m.quantity), 0),
        3,
      );
      expect(Number(b.availableQuantity)).toBeGreaterThanOrEqual(Number(b.reservedQuantity));
      const reserved = b.orderItems
        .filter((i) => !['DELIVERED', 'CANCELLED', 'NEW'].includes(i.order.status))
        .reduce((s, i) => s + Number(i.quantity), 0);
      expect(Number(b.reservedQuantity)).toBeCloseTo(reserved, 3);
      expect(b.production.sources.every((s) => s.receipt.approved)).toBe(true);
      expect(b.production.sources.reduce((s, m) => s + Number(m.liters), 0)).toBeCloseTo(
        Number(b.production.litersUsed),
        2,
      );
    }
    const receipts = await db.milkReceipt.findMany({ include: { sources: true } });
    for (const r of receipts)
      expect(r.sources.reduce((s, m) => s + Number(m.liters), 0)).toBeLessThanOrEqual(
        Number(r.liters) + 0.001,
      );
    const orders = await db.order.findMany({
      include: {
        receivable: { include: { payments: true } },
        delivery: true,
        items: { include: { batch: true } },
      },
    });
    for (const o of orders) {
      expect(Number(o.total)).toBeCloseTo(
        o.items.reduce(
          (s, i) => s + Number(i.quantity) * Number(i.unitPrice) - Number(i.discount),
          0,
        ),
        2,
      );
      if (o.status === 'DELIVERED') {
        expect(Number(o.receivable!.amount)).toBe(Number(o.total));
        expect(o.delivery!.deliveredAt).not.toBeNull();
        expect(Number(o.receivable!.paidAmount)).toBeCloseTo(
          o.receivable!.payments.reduce((s, p) => s + Number(p.amount), 0),
          2,
        );
        for (const i of o.items) {
          expect(i.batch!.status).not.toBe('BLOCKED');
          expect(+o.delivery!.deliveredAt!).toBeLessThan(+i.batch!.expiresAt);
        }
      } else expect(o.receivable).toBeNull();
    }
    const supplies = await db.supply.findMany({ include: { movements: true } });
    for (const s of supplies)
      expect(Number(s.stock)).toBeCloseTo(
        s.movements.reduce((sum, m) => sum + Number(m.quantity), 0),
        1,
      );
  });
  it('calcula KPIs e gráficos a partir do mesmo período e esconde margens de outros papéis', async () => {
    const r = await app.inject({
      url: '/api/dashboard?period=7',
      headers: { cookie: sessions.dono },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.series).toHaveLength(7);
    expect(body.kpis.find((k: { key: string }) => k.key === 'milk').value).toBeCloseTo(
      body.series.reduce((s: number, d: { milk: number }) => s + d.milk, 0),
      1,
    );
    expect(body.kpis.find((k: { key: string }) => k.key === 'revenue').value).toBeCloseTo(
      body.series.reduce((s: number, d: { revenue: number }) => s + d.revenue, 0),
      1,
    );
    for (const role of ['comercial', 'producao']) {
      const x = (
        await app.inject({ url: '/api/dashboard', headers: { cookie: sessions[role] } })
      ).json();
      expect(
        x.kpis.some((k: { key: string }) => ['margin', 'costLiter', 'costKg'].includes(k.key)),
      ).toBe(false);
      expect(x.overdueAmount).toBeNull();
    }
    expect(
      (
        await app.inject({
          url: '/api/dashboard?period=custom&from=2026-02-30&to=2026-03-01',
          headers: { cookie: sessions.dono },
        })
      ).statusCode,
    ).toBe(400);
  });
});
