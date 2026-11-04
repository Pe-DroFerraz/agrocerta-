import type { FastifyInstance } from 'fastify';
import { Readable } from 'node:stream';
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { config } from './config.js';
import { db } from './db.js';
import { operate, fail } from './operations-core.js';
declare module 'fastify' {
  interface FastifyRequest {
    webhookRaw?: Buffer;
  }
}
const equal = (a: string, b: string) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
export async function webhookRoutes(app: FastifyInstance) {
  app.get('/api/whatsapp/webhook', async (request, reply) => {
    if (!config.WHATSAPP_VERIFY_TOKEN)
      return reply.code(503).send({
        error: { code: 'NOT_CONFIGURED', message: 'Webhook oficial ainda não configurado.' },
      });
    const q = z
      .object({
        'hub.mode': z.literal('subscribe'),
        'hub.verify_token': z.string().max(256),
        'hub.challenge': z.string().max(256),
      })
      .strict()
      .parse(request.query);
    if (!equal(q['hub.verify_token'], config.WHATSAPP_VERIFY_TOKEN))
      return reply
        .code(403)
        .send({ error: { code: 'FORBIDDEN', message: 'Verificação recusada.' } });
    return reply.type('text/plain').send(q['hub.challenge']);
  });
  app.post(
    '/api/whatsapp/webhook',
    {
      bodyLimit: 262144,
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      preParsing: async (request, _reply, payload) => {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of payload) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buffer.length;
          if (size > 262144) fail('Webhook excede o limite permitido.', 413);
          chunks.push(buffer);
        }
        request.webhookRaw = Buffer.concat(chunks);
        return Readable.from(request.webhookRaw);
      },
    },
    async (request, reply) => {
      if (!config.WHATSAPP_APP_SECRET || !config.WHATSAPP_PHONE_NUMBER_ID)
        return reply.code(503).send({
          error: { code: 'NOT_CONFIGURED', message: 'Webhook oficial ainda não configurado.' },
        });
      const signature = request.headers['x-hub-signature-256'];
      if (
        typeof signature !== 'string' ||
        !/^sha256=[a-f0-9]{64}$/.test(signature) ||
        !equal(
          signature,
          `sha256=${createHmac('sha256', config.WHATSAPP_APP_SECRET)
            .update(request.webhookRaw ?? Buffer.alloc(0))
            .digest('hex')}`,
        )
      )
        return reply.code(401).send({
          error: { code: 'INVALID_SIGNATURE', message: 'Assinatura do webhook inválida.' },
        });
      const message = z.object({
        id: z.string().min(1).max(200),
        from: z.string().regex(/^\d{8,15}$/),
        type: z.string(),
        text: z.object({ body: z.string().max(4000) }).optional(),
      });
      const input = z
        .object({
          object: z.literal('whatsapp_business_account'),
          entry: z
            .array(
              z.object({
                changes: z
                  .array(
                    z.object({
                      value: z.object({
                        metadata: z.object({ phone_number_id: z.string().max(40) }).optional(),
                        messages: z.array(message).max(50).optional(),
                      }),
                    }),
                  )
                  .max(20),
              }),
            )
            .max(20),
        })
        .parse(request.body);
      const actor = await db.user.findFirst({
        where: { active: true, role: { key: 'OWNER' } },
        select: { id: true },
      });
      if (!actor) fail('Não há gestor ativo para processar a integração.', 503);
      let accepted = 0;
      let ignored = 0;
      for (const entry of input.entry)
        for (const change of entry.changes)
          for (const message of change.value.messages ?? []) {
            if (change.value.metadata?.phone_number_id !== config.WHATSAPP_PHONE_NUMBER_ID) {
              ignored++;
              continue;
            }
            if (message.type !== 'text' || !message.text) {
              ignored++;
              continue;
            }
            const customers = (
              await db.customer.findMany({
                where: { deletedAt: null, status: 'ACTIVE' },
                select: { id: true, phone: true },
              })
            ).filter((c) => c.phone.replace(/\D/g, '') === message.from);
            if (customers.length !== 1) {
              ignored++;
              continue;
            }
            await operate(
              actor.id,
              `meta:${message.id}`,
              'WHATSAPP_META_INBOUND',
              { from: message.from, text: message.text.body },
              (tx) =>
                tx.whatsAppMessage.create({
                  data: {
                    customerId: customers[0].id,
                    content: message.text!.body,
                    direction: 'INBOUND_OFFICIAL',
                  },
                }),
            );
            accepted++;
          }
      return { accepted, ignored };
    },
  );
}
