import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('postgresql://postgres:postgres@localhost:5432/shopright?schema=public'),
  JWT_ACCESS_SECRET: z.string().default('dev_jwt_access_secret_do_not_use_in_prod_12345'),
  JWT_REFRESH_SECRET: z.string().default('dev_jwt_refresh_secret_do_not_use_in_prod_67890'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176'),
  GOOGLE_CLIENT_ID: z.string().default('582096119859-2frlksmhqmtaoris57b8c43br29hembu.apps.googleusercontent.com'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  throw new Error('Invalid environment configuration');
}

export const config = {
  ...parsed.data,
  corsOriginsList: parsed.data.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
};
