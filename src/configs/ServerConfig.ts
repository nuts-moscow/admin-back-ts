export interface ServerConfig {
  port: number;
}

export function loadServerConfig(): ServerConfig {
  return {
    port: parseInt(process.env.PORT ?? "3000", 10),
  };
}
