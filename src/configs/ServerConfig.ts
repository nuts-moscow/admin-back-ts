export interface ServerConfig {
  port: number;
  corsOrigin: string;
  corsMethods: string;
  corsHeaders: string;
}

export function loadServerConfig(): ServerConfig {
  return {
    port: parseInt(process.env.PORT ?? "3000", 10),
    corsOrigin: process.env.CORS_ORIGIN ?? "*",
    corsMethods: process.env.CORS_METHODS ?? "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    corsHeaders: process.env.CORS_HEADERS ?? "Content-Type, Authorization",
  };
}
