import { ApplicationConfigs } from "../configs";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

/** Parses CORS_ORIGIN env value into a set of allowed origins.
 * Supports comma-separated list: "https://nuts.moscow,http://localhost:3001"
 * Single "*" means allow all (no credentials support). */
function getAllowedOrigins(): Set<string> | "*" {
  const raw = ApplicationConfigs.instance.server.corsOrigin.trim();
  if (raw === "*") return "*";
  return new Set(raw.split(",").map((o) => o.trim()).filter(Boolean));
}

/** Returns the value for Access-Control-Allow-Origin given the request Origin header.
 * Returns matched origin (for credentials support) or null if not allowed. */
export function resolveAllowedOrigin(requestOrigin: string | null): string | null {
  const allowed = getAllowedOrigins();
  if (allowed === "*") return "*";
  if (requestOrigin && allowed.has(requestOrigin)) return requestOrigin;
  // Fallback: return first origin for non-browser clients (no Origin header)
  if (!requestOrigin) return allowed.values().next().value ?? null;
  return null;
}

export function corsHeaders(requestOrigin?: string | null): Record<string, string> {
  const { corsMethods, corsHeaders: allowedHeaders } =
    ApplicationConfigs.instance.server;

  const resolvedOrigin = resolveAllowedOrigin(requestOrigin ?? null);

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": corsMethods,
    "Access-Control-Allow-Headers": allowedHeaders,
    "Access-Control-Max-Age": "86400",
  };

  if (resolvedOrigin) {
    headers["Access-Control-Allow-Origin"] = resolvedOrigin;
    if (resolvedOrigin !== "*") {
      // Required for fetch with credentials: "include" from a different origin
      headers["Access-Control-Allow-Credentials"] = "true";
      // Required when returning a specific origin (prevents caching wrong origin)
      headers["Vary"] = "Origin";
    }
  }

  return headers;
}

export function withCors(response: Response, requestOrigin?: string | null): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(requestOrigin))) {
    headers.set(k, v);
  }
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
