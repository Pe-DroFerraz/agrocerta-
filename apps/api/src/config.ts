import { config as dotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
dotenv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
const schema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z
    .string()
    .min(32)
    .refine((value) => !value.startsWith('troque-'), 'Gere uma chave aleatória para JWT_SECRET.'),
  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});
export const config = schema.parse(process.env);
if (config.NODE_ENV === 'production' && !config.WEB_ORIGIN.startsWith('https://'))
  throw new Error('WEB_ORIGIN deve usar HTTPS em produção.');
