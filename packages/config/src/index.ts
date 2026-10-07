import { z } from 'zod';

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  apiPort: number;
  databaseUrl: string;
  redisUrl: string;
  authSecret: string;
  apiJwtSecret: string;
  internalApiSecret: string;
  webOrigin: string;
  enableCodeChefAdapter: boolean;
  enableGfgAdapter: boolean;
}

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  AUTH_SECRET: z.string().min(1),
  API_JWT_SECRET: z.string().min(1).optional(),
  INTERNAL_API_SECRET: z.string().min(1),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  ENABLE_CODECHEF_ADAPTER: z.coerce.boolean().default(false),
  ENABLE_GFG_ADAPTER: z.coerce.boolean().default(false),
});

export function getConfig(): AppConfig {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  return {
    nodeEnv: result.data.NODE_ENV,
    apiPort: result.data.API_PORT,
    databaseUrl: result.data.DATABASE_URL,
    redisUrl: result.data.REDIS_URL,
    authSecret: result.data.AUTH_SECRET,
    apiJwtSecret: result.data.API_JWT_SECRET ?? result.data.AUTH_SECRET,
    internalApiSecret: result.data.INTERNAL_API_SECRET,
    webOrigin: result.data.WEB_ORIGIN,
    enableCodeChefAdapter: result.data.ENABLE_CODECHEF_ADAPTER,
    enableGfgAdapter: result.data.ENABLE_GFG_ADAPTER,
  };
}
