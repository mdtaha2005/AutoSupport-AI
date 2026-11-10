import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('4000').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PREFIX: z.string().default('/api/v1'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NLP_SERVICE_URL: z.string().default('http://localhost:8000'),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379').transform((val) => parseInt(val, 10)),
  REDIS_PASSWORD: z.string().optional().default(''),
  REDIS_DB: z.string().default('0').transform((val) => parseInt(val, 10)),
  ROUTING_SKILL_WEIGHT: z.string().default('0.40').transform((val) => parseFloat(val)),
  ROUTING_WORKLOAD_WEIGHT: z.string().default('0.35').transform((val) => parseFloat(val)),
  ROUTING_AVAILABILITY_WEIGHT: z.string().default('0.25').transform((val) => parseFloat(val)),
  HYBRID_SEARCH_ALPHA: z.string().default('0.50').transform((val) => parseFloat(val)),
  PGVECTOR_DIMENSION: z.string().default('384').transform((val) => parseInt(val, 10)),
  RRF_K: z.string().default('60').transform((val) => parseInt(val, 10)),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters long'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).default('info'),
  DEFAULT_ADMIN_EMAIL: z.string().email().default('admin@ticketrouting.com'),
  DEFAULT_ADMIN_PASSWORD: z.string().min(8).default('AdminPassword123!'),
  DEFAULT_ADMIN_NAME: z.string().default('System Administrator'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment configuration:', parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
