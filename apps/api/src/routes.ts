import type { FastifyInstance } from 'fastify';
import { Prisma, RoleKey } from '@prisma/client';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { db } from './db.js';
import { authenticate, authorize } from './auth.js';
import { dateRange } from './dates.js';
const listQuery = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(12),
    search: z.string().trim().max(100).default(''),
    sort: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();
const listSchema = {
  tags: ['Cadastros'],
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      search: { type: 'string', maxLength: 100 },
      sort: { type: 'string', enum: ['asc', 'desc'] },
    },
  },
};
const number = (v: Prisma.Decimal | number) => Number(v);
export async function dataRoutes(app: FastifyInstance) {
  app.get('/api/company', { preHandler: authenticate, schema: { tags: ['Empresa'] } }, async () =>
    db.company.findFirst({ select: { name: true, city: true, timezone: true } }),
  );
  app.get(
    '/api/producers',
    { preHandler: authorize('producers'), schema: listSchema },
    async (request) => {
      const q = listQuery.parse(request.query);
      const where = { deletedAt: null, name: { contains: q.search, mode: 'insensitive' as const } };
      const [rows, total] = await db.$transaction([
        db.producer.findMany({
          where,
          orderBy: [{ name: q.sort }, { id: 'asc' }],
          skip: (q.page - 1) * q.limit,
          take: q.limit,
          select: {
            id: true,
            name: true,
            farm: true,
            city: true,
            pricePerLiter: true,
            active: true,
          },
        }),
        db.producer.count({ where }),
      ]);
      return { rows, total, page: q.page, limit: q.limit };
    },
  );
  app.get(
    '/api/products',
    { preHandler: authorize('products'), schema: listSchema },
    async (request) => {
      const q = listQuery.parse(request.query);
      const where = { deletedAt: null, name: { contains: q.search, mode: 'insensitive' as const } };
      const [rows, total] = await db.$transaction([
        db.product.findMany({
          where,
          orderBy: [{ name: q.sort }, { id: 'asc' }],
          skip: (q.page - 1) * q.limit,
          take: q.limit,
          select: {
            id: true,
            code: true,
            name: true,
            unit: true,
            category: true,
            salePrice: true,
            shelfLifeDays: true,
            expectedLitersPerUnit: true,
          },
        }),
        db.product.count({ where }),
      ]);
      return { rows, total, page: q.page, limit: q.limit };
    },
  );
  app.get(
    '/api/receipts',
    { preHandler: authorize('receipts'), schema: listSchema },
    async (request) => {
      const q = listQuery.parse(request.query);
      const where = { producer: { name: { contains: q.search, mode: 'insensitive' as const } } };
      const [data, total] = await db.$transaction([
        db.milkReceipt.findMany({
          where,
          orderBy: [{ date: q.sort === 'asc' ? 'desc' : 'asc' }, { id: 'asc' }],
          skip: (q.page - 1) * q.limit,
          take: q.limit,
          include: { producer: { select: { name: true } } },
        }),
        db.milkReceipt.count({ where }),
      ]);
      return {
        rows: data.map((r) => ({
          id: r.id,
          date: r.date,
          producer: r.producer.name,
          liters: number(r.liters),
          temperature: number(r.temperature),
          acidity: number(r.acidity),
          approved: r.approved,
        })),
        total,
        page: q.page,
        limit: q.limit,
      };
    },
  );
  app.get(
    '/api/batches',
    { preHandler: authorize('batches'), schema: listSchema },
    async (request) => {
      const q = listQuery.parse(request.query);
      const where = {
        OR: [
          { code: { contains: q.search, mode: 'insensitive' as const } },
          { product: { name: { contains: q.search, mode: 'insensitive' as const } } },
        ],
      };
      const [rows, total] = await db.$transaction([
        db.batch.findMany({
          where,
          orderBy: [{ manufacturedAt: q.sort === 'asc' ? 'desc' : 'asc' }, { id: 'asc' }],
          skip: (q.page - 1) * q.limit,
          take: q.limit,
          include: { product: { select: { name: true, unit: true } } },
        }),
        db.batch.count({ where }),
      ]);
      return {
        rows: rows.map((b) => ({
          id: b.id,
          code: b.code,
          product: b.product.name,
          expiresAt: b.expiresAt,
          status: b.status,
          quantity: number(b.availableQuantity),
          reserved: number(b.reservedQuantity),
          unit: b.product.unit,
        })),
        total,
        page: q.page,
        limit: q.limit,
      };
    },
  );
  app.get(
    '/api/supplies',
    { preHandler: authorize('supplies'), schema: listSchema },
    async (request) => {
      const q = listQuery.parse(request.query);
      const where = { deletedAt: null, name: { contains: q.search, mode: 'insensitive' as const } };
      const [rows, total] = await db.$transaction([
        db.supply.findMany({
          where,
          orderBy: [{ name: q.sort }, { id: 'asc' }],
          skip: (q.page - 1) * q.limit,
          take: q.limit,
        }),
        db.supply.count({ where }),
      ]);
      return { rows, total, page: q.page, limit: q.limit };
    },
  );
  app.get(
    '/api/customers',
    { preHandler: authorize('customers'), schema: listSchema },
    async (request) => {
      const q = listQuery.parse(request.query);
      const where = { deletedAt: null, name: { contains: q.search, mode: 'insensitive' as const } };
      const [rows, total] = await db.$transaction([
        db.customer.findMany({
          where,
          orderBy: [{ name: q.sort }, { id: 'asc' }],
          skip: (q.page - 1) * q.limit,
          take: q.limit,
          select: {
            id: true,
            name: true,
            type: true,
            city: true,
            contact: true,
            phone: true,
            status: true,
          },
        }),
        db.customer.count({ where }),
      ]);
      return { rows, total, page: q.page, limit: q.limit };
    },
  );
  app.get(
    '/api/orders',
    { preHandler: authorize('orders'), schema: listSchema },
    async (request) => {
      const q = listQuery.parse(request.query);
      const where = {
        OR: [
          { code: { contains: q.search, mode: 'insensitive' as const } },
          { customer: { name: { contains: q.search, mode: 'insensitive' as const } } },
        ],
      };
      const [rows, total] = await db.$transaction([
        db.order.findMany({
          where,
          orderBy: [{ deliveryDate: q.sort === 'asc' ? 'desc' : 'asc' }, { id: 'asc' }],
          skip: (q.page - 1) * q.limit,
          take: q.limit,
          include: { customer: { select: { name: true } } },
        }),
        db.order.count({ where }),
      ]);
      return {
        rows: rows.map((o) => ({
          id: o.id,
          code: o.code,
          customer: o.customer.name,
          deliveryDate: o.deliveryDate,
          status: o.status,
          total: number(o.total),
        })),
        total,
        page: q.page,
        limit: q.limit,
      };
    },
  );
  app.get(
    '/api/deliveries',
    { preHandler: authorize('deliveries'), schema: listSchema },
    async (request) => {
      const q = listQuery.parse(request.query);
      const today = dateRange({ period: 'today' });
      const where: Prisma.DeliveryWhereInput = {
        ...(request.viewer.role === 'DRIVER'
          ? { driverId: request.viewer.id, scheduledAt: { gte: today.start, lt: today.end } }
          : {}),
        order: { customer: { name: { contains: q.search, mode: 'insensitive' } } },
      };
      const [rows, total] = await db.$transaction([
        db.delivery.findMany({
          where,
          orderBy: [{ scheduledAt: q.sort === 'asc' ? 'desc' : 'asc' }, { id: 'asc' }],
          skip: (q.page - 1) * q.limit,
          take: q.limit,
          include: {
            order: {
              select: {
                code: true,
                status: true,
                customer: { select: { name: true, address: true, city: true } },
              },
            },
            route: { select: { name: true } },
            driver: { select: { name: true } },
          },
        }),
        db.delivery.count({ where }),
      ]);
      return {
        rows: rows.map((d) => ({
          id: d.id,
          code: d.order.code,
          customer: d.order.customer.name,
          address: d.order.customer.address,
          city: d.order.customer.city,
          route: d.route.name,
          driver: d.driver.name,
          date: d.scheduledAt,
          status: d.order.status,
        })),
        total,
        page: q.page,
        limit: q.limit,
      };
    },
  );
  app.get(
    '/api/finance',
    { preHandler: authorize('finance'), schema: listSchema },
    async (request) => {
      const q = listQuery.parse(request.query);
      const where = {
        order: { customer: { name: { contains: q.search, mode: 'insensitive' as const } } },
      };
      const [rows, total] = await db.$transaction([
        db.receivable.findMany({
          where,
          orderBy: [{ dueDate: q.sort === 'asc' ? 'desc' : 'asc' }, { id: 'asc' }],
          skip: (q.page - 1) * q.limit,
          take: q.limit,
          include: { order: { select: { code: true, customer: { select: { name: true } } } } },
        }),
        db.receivable.count({ where }),
      ]);
      return {
        rows: rows.map((r) => ({
          id: r.id,
          code: r.order.code,
          customer: r.order.customer.name,
          dueDate: r.dueDate,
          amount: number(r.amount),
          paidAmount: number(r.paidAmount),
          balance: Number(r.amount.minus(r.paidAmount)),
        })),
        total,
        page: q.page,
        limit: q.limit,
      };
    },
  );
  app.get(
    '/api/announcements',
    { preHandler: authorize('announcements'), schema: listSchema },
    async (request) => {
      const q = listQuery.parse(request.query);
      const where = { title: { contains: q.search, mode: 'insensitive' as const } };
      const [rows, total] = await db.$transaction([
        db.announcement.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: (q.page - 1) * q.limit,
          take: q.limit,
          select: {
            id: true,
            title: true,
            content: true,
            createdAt: true,
            author: { select: { name: true } },
          },
        }),
        db.announcement.count({ where }),
      ]);
      return {
        rows: rows.map((r) => ({ ...r, author: r.author.name })),
        total,
        page: q.page,
        limit: q.limit,
      };
    },
  );
  app.get(
    '/api/notifications',
    { preHandler: authenticate, schema: { tags: ['Notificações'] } },
    async (request) => ({
      rows: await db.notification.findMany({
        where: { userId: request.viewer.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 30,
      }),
    }),
  );
  app.patch(
    '/api/notifications/:id/read',
    {
      preHandler: authenticate,
      schema: {
        tags: ['Notificações'],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', maxLength: 100 } },
        },
      },
    },
    async (request, reply) => {
      const { id } = z.object({ id: z.string().min(1).max(100) }).parse(request.params);
      const result = await db.notification.updateMany({
        where: { id, userId: request.viewer.id },
        data: { readAt: new Date() },
      });
      if (!result.count)
        return reply
          .code(404)
          .send({ error: { code: 'NOT_FOUND', message: 'Notificação não encontrada.' } });
      return { ok: true };
    },
  );
  app.get('/api/users', { preHandler: authorize('users'), schema: listSchema }, async (request) => {
    const q = listQuery.parse(request.query);
    const where = { name: { contains: q.search, mode: 'insensitive' as const } };
    const [rows, total] = await db.$transaction([
      db.user.findMany({
        where,
        orderBy: [{ name: q.sort }, { id: 'asc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        select: {
          id: true,
          name: true,
          email: true,
          active: true,
          role: { select: { key: true } },
        },
      }),
      db.user.count({ where }),
    ]);
    return {
      rows: rows.map((u) => ({ ...u, role: u.role.key })),
      total,
      page: q.page,
      limit: q.limit,
    };
  });
  app.post(
    '/api/users',
    {
      preHandler: authorize('users'),
      schema: {
        tags: ['Usuários'],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'email', 'password', 'role'],
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 100 },
            email: { type: 'string', format: 'email', maxLength: 254 },
            password: { type: 'string', minLength: 10, maxLength: 72 },
            role: { type: 'string', enum: Object.values(RoleKey) },
          },
        },
      },
    },
    async (request, reply) => {
      const input = z
        .object({
          name: z.string().trim().min(2).max(100),
          email: z
            .string()
            .trim()
            .email()
            .max(254)
            .transform((s) => s.toLowerCase()),
          password: z
            .string()
            .min(10)
            .max(72)
            .refine((s) => Buffer.byteLength(s) <= 72, 'Senha deve ter no máximo 72 bytes.'),
          role: z.nativeEnum(RoleKey),
        })
        .strict()
        .parse(request.body);
      const passwordHash = await bcrypt.hash(input.password, 12);
      const role = await db.role.findUniqueOrThrow({ where: { key: input.role } });
      const user = await db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { name: input.name, email: input.email, passwordHash, roleId: role.id },
          select: {
            id: true,
            name: true,
            email: true,
            active: true,
            role: { select: { key: true } },
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: request.viewer.id,
            action: 'CREATE_USER',
            entity: 'User',
            entityId: user.id,
          },
        });
        return user;
      });
      return reply.code(201).send({ ...user, role: user.role.key });
    },
  );
}
