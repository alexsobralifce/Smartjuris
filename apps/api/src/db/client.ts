import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(process.cwd(), '../../.env') });

const connectionString = process.env.DATABASE_URL || 'postgresql://lexia:lexia@localhost:5432/lexia';

// Setup postgres driver
const client = postgres(connectionString);

// Create drizzle instance
export const db = drizzle(client, { schema });
