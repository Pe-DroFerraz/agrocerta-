import Fastify, { type FastifyError } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import { docsRoutes } from './docs.js';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { config } from './config.js';
import { db } from './db.js';
import { authRoutes } from './auth.js';
import { dashboardRoutes } from './dashboard.js';
import { dataRoutes } from './routes.js';
import { operationalRoutes } from './operations.js';
import { traceRoutes } from './traceability.js';
import { reportRoutes } from './reports.js';
import { companionRoutes } from './companions.js';
import { webhookRoutes } from './whatsapp-webhook.js';
import { printRoutes } from './printouts.js';
import { alertRoutes } from './alerts.js';
export async function buildApp(options: { logger?: boolean } = {}) {
  const app = Fastify({
    logger: options.logger
      ? {
          serializers: {
            req: (r: { method?: string; url?: string }) => ({
              method: r.method,
              url: r.url?.split('?')[0],
            }),
          },
          redact: ['req.headers.cookie', 'req.headers.authorization'],
        }
      : false,
    bodyLimit: 32768,
    ajv: { customOptions: { removeAdditional: false } },
  });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: config.WEB_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(cookie);
  await app.register(jwt, {
    secret: config.JWT_SECRET,
    cookie: { cookieName: 'agro_access', signed: false },
    sign: { algorithm: 'HS256' },
    verify: { algorithms: ['HS256'] },
  });
  await app.register(rateLimit, { global: false });
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'AGRO CERTA — API',
        version: '0.1.0',
        description: 'Etapa 1: autenticação, indicadores, consultas e gestão inicial de usuários.',
      },
      components: {
        securitySchemes: { cookieAuth: { type: 'apiKey', in: 'cookie', name: 'agro_access' } },
      },
    },
  });
  await docsRoutes(app);
  app.addHook('onRequest', async (request, reply) => {
    if (
      request.routeOptions.url !== '/api/whatsapp/webhook' &&
      ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)
    ) {
      if (request.headers.origin !== config.WEB_ORIGIN)
        return reply.code(403).send({
          error: { code: 'ORIGIN_REJECTED', message: 'Origem da requisição não autorizada.' },
        });
    }
  });
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error instanceof ZodError || error.validation)
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Confira os campos informados.',
          fields: error instanceof ZodError ? error.flatten().fieldErrors : undefined,
        },
      });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025')
      return reply
        .code(404)
        .send({ error: { code: 'NOT_FOUND', message: 'Registro não encontrado.' } });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
      return reply
        .code(409)
        .send({ error: { code: 'CONFLICT', message: 'Já existe um registro com estes dados.' } });
    const status =
      error.statusCode && error.statusCode >= 400 && error.statusCode < 600
        ? error.statusCode
        : 500;
    if (status === 500) request.log.error({ err: error }, 'Erro interno');
    return reply.code(status).send({
      error: {
        code: status === 429 ? 'RATE_LIMIT' : status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
        message:
          status === 429
            ? 'Muitas tentativas. Aguarde um minuto.'
            : status === 500
              ? 'Não foi possível concluir a operação.'
              : error.message,
      },
    });
  });
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Recurso não encontrado.' } }),
  );
  app.get('/api/health', { schema: { tags: ['Saúde'] } }, async () => {
    await db.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'connected' };
  });
  await authRoutes(app);
  await dashboardRoutes(app);
  await dataRoutes(app);
  await operationalRoutes(app);
  await traceRoutes(app);
  await reportRoutes(app);
  await companionRoutes(app);
  await webhookRoutes(app);
  await printRoutes(app);
  await alertRoutes(app);
  return app;
}
