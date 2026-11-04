import { buildApp } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
const app = await buildApp({ logger: true });
try {
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
} catch (error) {
  app.log.error(error);
  await db.$disconnect();
  process.exit(1);
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    await app.close();
    await db.$disconnect();
    process.exit(0);
  });
