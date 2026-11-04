import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { RoleKey } from '@prisma/client';
import { z } from 'zod';
import { db } from './db.js';
import { config } from './config.js';
import { allowed, permissions, type Permission } from './permissions.js';
export interface Viewer {
  id: string;
  name: string;
  email: string;
  role: RoleKey;
  permissions: readonly string[];
}
declare module 'fastify' {
  interface FastifyRequest {
    viewer: Viewer;
    sessionId: string;
  }
}
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const cookieOptions = {
  httpOnly: true,
  secure: config.NODE_ENV === 'production',
  sameSite: 'strict' as const,
};
const dummyHash = bcrypt.hash('unavailable-account-constant', 12);
const safeUser = (user: {
  id: string;
  name: string;
  email: string;
  role: { key: RoleKey };
}): Viewer => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role.key,
  permissions: permissions[user.role.key],
});
export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const token = await request.jwtVerify<{ sub: string; sid: string }>({ onlyCookie: true });
    const session = await db.refreshSession.findFirst({
      where: { id: token.sid, userId: token.sub, expiresAt: { gt: new Date() } },
      include: { user: { include: { role: true } } },
    });
    if (!session?.user.active)
      return reply
        .code(401)
        .send({ error: { code: 'UNAUTHORIZED', message: 'Sua sessão expirou. Entre novamente.' } });
    request.viewer = safeUser(session.user);
    request.sessionId = session.id;
  } catch {
    return reply
      .code(401)
      .send({ error: { code: 'UNAUTHORIZED', message: 'Entre na sua conta para continuar.' } });
  }
}
export function authorize(permission: Permission) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await authenticate(request, reply);
    if (reply.sent) return;
    if (!allowed(request.viewer.role, permission))
      return reply
        .code(403)
        .send({ error: { code: 'FORBIDDEN', message: 'Seu papel não permite esta operação.' } });
  };
}
async function sendSession(
  app: FastifyInstance,
  reply: FastifyReply,
  user: Viewer,
  sessionId: string,
  refresh: string,
) {
  const access = app.jwt.sign({ sub: user.id, sid: sessionId }, { expiresIn: '15m' });
  reply.setCookie('agro_access', access, { ...cookieOptions, path: '/api', maxAge: 900 });
  reply.setCookie('agro_refresh', refresh, { ...cookieOptions, path: '/api/auth', maxAge: 604800 });
  return reply.send({ user });
}
const userResponse = {
  type: 'object',
  properties: {
    user: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string' },
        role: { type: 'string' },
        permissions: { type: 'array', items: { type: 'string' } },
      },
    },
  },
} as const;
const errorResponse = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: { code: { type: 'string' }, message: { type: 'string' } },
    },
  },
} as const;
export async function authRoutes(app: FastifyInstance) {
  app.post(
    '/api/auth/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: {
        tags: ['Autenticação'],
        body: {
          type: 'object',
          required: ['email', 'password'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', format: 'email', maxLength: 254 },
            password: { type: 'string', minLength: 1, maxLength: 72 },
          },
        },
        response: { 200: userResponse, 401: errorResponse },
      },
    },
    async (request, reply) => {
      const input = z
        .object({
          email: z
            .string()
            .email()
            .max(254)
            .transform((s) => s.toLowerCase().trim()),
          password: z.string().min(1).max(72),
        })
        .strict()
        .parse(request.body);
      const user = await db.user.findUnique({
        where: { email: input.email },
        include: { role: true },
      });
      const valid = await bcrypt.compare(input.password, user?.passwordHash ?? (await dummyHash));
      if (!user?.active || !valid)
        return reply
          .code(401)
          .send({ error: { code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha incorretos.' } });
      const refresh = randomBytes(48).toString('hex');
      const session = await db.$transaction(async (tx) => {
        await tx.refreshSession.deleteMany({
          where: { userId: user.id, expiresAt: { lte: new Date() } },
        });
        const created = await tx.refreshSession.create({
          data: {
            userId: user.id,
            tokenHash: hash(refresh),
            expiresAt: new Date(Date.now() + 604800000),
          },
        });
        await tx.auditLog.create({
          data: { actorId: user.id, action: 'LOGIN', entity: 'Session', entityId: created.id },
        });
        return created;
      });
      return sendSession(app, reply, safeUser(user), session.id, refresh);
    },
  );
  app.post(
    '/api/auth/refresh',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { tags: ['Autenticação'], response: { 200: userResponse, 401: errorResponse } },
    },
    async (request, reply) => {
      const token = request.cookies.agro_refresh;
      if (!token || !/^[a-f0-9]{96}$/.test(token))
        return reply
          .code(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'Entre novamente.' } });
      const current = await db.refreshSession.findUnique({
        where: { tokenHash: hash(token) },
        include: { user: { include: { role: true } } },
      });
      if (!current || current.expiresAt <= new Date() || !current.user.active)
        return reply
          .code(401)
          .send({ error: { code: 'UNAUTHORIZED', message: 'Sua sessão expirou.' } });
      const next = randomBytes(48).toString('hex');
      const session = await db.$transaction(async (tx) => {
        const removed = await tx.refreshSession.deleteMany({
          where: { id: current.id, tokenHash: hash(token) },
        });
        if (removed.count !== 1) return null;
        return tx.refreshSession.create({
          data: { userId: current.userId, tokenHash: hash(next), expiresAt: current.expiresAt },
        });
      });
      if (!session)
        return reply.code(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Sessão já renovada. Entre novamente.' },
        });
      return sendSession(app, reply, safeUser(current.user), session.id, next);
    },
  );
  app.get(
    '/api/auth/me',
    {
      preHandler: authenticate,
      schema: { tags: ['Autenticação'], response: { 200: userResponse, 401: errorResponse } },
    },
    async (request) => ({ user: request.viewer }),
  );
  app.post('/api/auth/logout', { schema: { tags: ['Autenticação'] } }, async (request, reply) => {
    const token = request.cookies.agro_refresh;
    if (token) await db.refreshSession.deleteMany({ where: { tokenHash: hash(token) } });
    reply
      .clearCookie('agro_access', { ...cookieOptions, path: '/api' })
      .clearCookie('agro_refresh', { ...cookieOptions, path: '/api/auth' });
    return reply.code(204).send();
  });
}
