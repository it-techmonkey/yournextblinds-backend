import { PrismaClient } from '../generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
// Learn more: https://pris.ly/d/help/next-js-best-practices

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Prisma 7 adapter setup
const connectionString = process.env.DATABASE_URL!;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required');
}

// Detect if this is a Render database (or other cloud provider requiring SSL)
const isRenderDb = connectionString.includes('render.com') || 
                   connectionString.includes('onrender.com') ||
                   process.env.NODE_ENV === 'production';

// Configure pool with appropriate SSL settings
const poolConfig: any = {
  connectionString,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

if (isRenderDb) {
  // Render databases require SSL with rejectUnauthorized: false
  poolConfig.ssl = {
    rejectUnauthorized: false
  };
} else {
  // Local databases might not support SSL
  poolConfig.ssl = false;
}

const pool = new Pool(poolConfig);
const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

