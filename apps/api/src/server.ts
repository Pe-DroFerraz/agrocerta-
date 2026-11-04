import { buildApp } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
import { startJobs } from './jobs.js';
const app = await buildApp({ logger: true });
try {
  await app.listen({ port: config.PORT, host: config.API_HOST });
} catch (error) {
  app.log.error(error);
  await db.$disconnect();
  process.exit(1);
}
const stopJobs = config.NODE_ENV === 'test' ? () => {} : startJobs();
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, async () => {
    stopJobs();
    await app.close();
    await db.$disconnect();
    process.exit(0);
  });
