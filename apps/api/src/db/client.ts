import '../config.js';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

const connectionString = process.env.DATABASE_URL || 'postgresql://lexia:lexia@localhost:5432/lexia';

// Setup postgres driver
export const client = postgres(connectionString);

// Create drizzle instance
export const db = drizzle(client, { schema });
