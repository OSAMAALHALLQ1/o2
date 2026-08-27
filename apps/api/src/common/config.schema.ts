export interface EnvironmentConfig {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  DATABASE_URL?: string;
  REDIS_HOST?: string;
  REDIS_PORT?: number;
  JWT_ACCESS_SECRET?: string;
  JWT_REFRESH_SECRET?: string;
  O2_RESTAURANT_WEBHOOK_SECRET?: string;
  O2_QR_SIGNING_SECRET?: string;
}

export function validateEnvironment(config: Record<string, unknown>): EnvironmentConfig {
  const nodeEnv = (config.NODE_ENV as string) || 'development';
  const port = parseInt((config.PORT as string) || '4000', 10);

  return {
    NODE_ENV: nodeEnv as EnvironmentConfig['NODE_ENV'],
    PORT: isNaN(port) ? 4000 : port,
    DATABASE_URL: (config.DATABASE_URL as string) || undefined,
    REDIS_HOST: (config.REDIS_HOST as string) || 'localhost',
    REDIS_PORT: parseInt((config.REDIS_PORT as string) || '6379', 10),
    JWT_ACCESS_SECRET: (config.JWT_ACCESS_SECRET as string) || 'dev-secret-access',
    JWT_REFRESH_SECRET: (config.JWT_REFRESH_SECRET as string) || 'dev-secret-refresh',
    O2_RESTAURANT_WEBHOOK_SECRET: (config.O2_RESTAURANT_WEBHOOK_SECRET as string) || 'dev-webhook-secret',
    O2_QR_SIGNING_SECRET: (config.O2_QR_SIGNING_SECRET as string) || 'dev-qr-secret',
  };
}
