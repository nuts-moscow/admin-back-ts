import { ApplicationConfigs } from "../configs";

export function corsHeaders(): Record<string, string> {
  const { corsOrigin, corsMethods, corsHeaders: allowedHeaders } =
    ApplicationConfigs.instance.server;
  return {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Methods": corsMethods,
    "Access-Control-Allow-Headers": allowedHeaders,
    "Access-Control-Max-Age": "86400",
  };
}

export function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders())) {
    headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
