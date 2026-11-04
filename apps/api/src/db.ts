import { config } from './config.js';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
export function createDb(url = config.DATABASE_URL) {
  const connection = new URL(url);
  const schema = connection.searchParams.get('schema') ?? 'public';
  connection.searchParams.delete('schema');
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: connection.toString(), max: 8 }, { schema }),
  });
}
export const db = createDb();
