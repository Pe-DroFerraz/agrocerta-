import cron from 'node-cron';
import { db } from './db.js';
import { operate } from './operations-core.js';
import { generateRecurring } from './companions.js';
import { localDay } from './dates.js';
export function startJobs() {
  const recurring = cron.schedule(
    '0 5 * * *',
    async () => {
      try {
        const actor = await db.user.findFirst({
          where: { active: true, role: { key: 'OWNER' } },
          select: { id: true },
        });
        if (actor)
          await operate(actor.id, `recurring-job:${localDay()}`, 'RECURRING_JOB', {}, (tx) =>
            generateRecurring(tx, actor.id),
          );
      } catch {
        console.error(
          'Falha no job de pedidos fixos. Consulte os pedidos e tente a geração manual.',
        );
      }
    },
    { timezone: 'America/Sao_Paulo' },
  );
  const expiry = cron.schedule(
    '0 * * * *',
    async () => {
      try {
        const actor = await db.user.findFirst({
          where: { active: true, role: { key: 'OWNER' } },
          select: { id: true },
        });
        if (actor)
          await operate(
            actor.id,
            `expiry-job:${new Date().toISOString().slice(0, 13)}`,
            'EXPIRY_JOB',
            {},
            async (tx) => {
              const result = await tx.batch.updateMany({
                where: {
                  expiresAt: { lte: new Date() },
                  status: { notIn: ['BLOCKED', 'EXHAUSTED', 'EXPIRED'] },
                },
                data: { status: 'EXPIRED' },
              });
              return { expired: result.count };
            },
          );
      } catch {
        console.error('Falha na atualização de validade dos lotes.');
      }
    },
    { timezone: 'America/Sao_Paulo' },
  );
  return () => {
    void recurring.stop();
    void expiry.stop();
  };
}
