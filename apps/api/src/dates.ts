import { z } from 'zod';
export function localDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T12:00:00Z`);
    return !isNaN(+d) && d.toISOString().slice(0, 10) === v;
  }, 'Data inválida.');
export const periodSchema = z
  .object({
    period: z.enum(['today', '7', '30', 'month', 'custom']).default('30'),
    from: day.optional(),
    to: day.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.period === 'custom' && (!v.from || !v.to || v.from > v.to))
      ctx.addIssue({ code: 'custom', message: 'Informe um período válido.' });
  });
export function dateRange(input: z.infer<typeof periodSchema>, now = new Date()) {
  const today = localDay(now);
  const start = new Date(`${today}T00:00:00-03:00`);
  let end = new Date(+start + 86400000);
  if (input.period === '7') start.setUTCDate(start.getUTCDate() - 6);
  if (input.period === '30') start.setUTCDate(start.getUTCDate() - 29);
  if (input.period === 'month') start.setUTCDate(1);
  if (input.period === 'custom') {
    start.setTime(+new Date(`${input.from}T00:00:00-03:00`));
    end = new Date(+new Date(`${input.to}T00:00:00-03:00`) + 86400000);
  }
  if (+end - +start > 366 * 86400000)
    throw Object.assign(new Error('Selecione no máximo 366 dias.'), { statusCode: 400 });
  return { start, end };
}
