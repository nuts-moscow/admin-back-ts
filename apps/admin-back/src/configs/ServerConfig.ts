export interface ServerConfig {
  port: number;
  corsOrigin: string;
  corsMethods: string;
  corsHeaders: string;
  /** HS256 signing key; must be at least 32 characters. */
  jwtSecret: string;
}

const JWT_SECRET_MIN_LEN = 32;

export function loadServerConfig(): ServerConfig {
  const jwtSecret = process.env.JWT_SECRET ?? "";
  if (jwtSecret.length < JWT_SECRET_MIN_LEN) {
    throw new Error(
      `JWT_SECRET must be set and at least ${JWT_SECRET_MIN_LEN} characters (HS256 key)`
    );
  }
  return {
    port: parseInt(process.env.PORT ?? "3000", 10),
    corsOrigin: process.env.CORS_ORIGIN ?? "*",
    corsMethods: process.env.CORS_METHODS ?? "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    corsHeaders: process.env.CORS_HEADERS ?? "Content-Type, Authorization",
    jwtSecret,
  };
}
