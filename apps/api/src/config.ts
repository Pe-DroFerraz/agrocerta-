import { config as dotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
dotenv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });
z.config(z.locales.pt());
const schema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z
    .string()
    .min(32)
    .refine((value) => !value.startsWith('troque-'), 'Gere uma chave aleatória para JWT_SECRET.'),
  WEB_ORIGIN: z
    .string()
    .url()
    .refine(
      (v) => ['http:', 'https:'].includes(new URL(v).protocol),
      'Use uma origem HTTP ou HTTPS.',
    )
    .transform((v) => new URL(v).origin)
    .default('http://localhost:5173'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3333),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_HOST: z.string().default('127.0.0.1'),
  LOCAL_DEMO_ACCESS: z.enum(['0', '1']).default('0'),
  WHATSAPP_APP_SECRET: z.preprocess((v) => v || undefined, z.string().min(16).optional()),
  WHATSAPP_PHONE_NUMBER_ID: z.preprocess(
    (v) => v || undefined,
    z
      .string()
      .regex(/^\d{5,40}$/)
      .optional(),
  ),
  WHATSAPP_VERIFY_TOKEN: z.preprocess((v) => v || undefined, z.string().min(16).optional()),
});
export const config = schema.parse(process.env);
if (config.NODE_ENV === 'production' && !config.WEB_ORIGIN.startsWith('https://'))
  throw new Error('WEB_ORIGIN deve usar HTTPS em produção.');

if (
  config.LOCAL_DEMO_ACCESS === '1' &&
  (config.NODE_ENV !== 'development' ||
    !['127.0.0.1', '::1'].includes(config.API_HOST) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(new URL(config.WEB_ORIGIN).hostname))
)
  throw new Error('Acesso direto demo só é permitido em desenvolvimento com API e origem locais.');
