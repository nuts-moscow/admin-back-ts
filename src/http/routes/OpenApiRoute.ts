import { generateOpenAPIDocument } from "../openapi/generator";

const SWAGGER_UI_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin API - Swagger UI</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function() {
      // Поддержка nginx proxy с префиксом (например /v2): /v2/docs -> /v2/openapi.json
      const basePath = window.location.pathname.replace(/\\/docs\\/?$/, "");
      const specUrl = (basePath || "") + "/openapi.json";
      window.ui = SwaggerUIBundle({
        url: specUrl,
        dom_id: "#swagger-ui",
        docExpansion: "list",
        defaultModelsExpandDepth: 2,
        defaultModelExpandDepth: 2,
        displayRequestDuration: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
      });
    };
  </script>
</body>
</html>`;

export function openApiRoutes() {
  return {
    "/openapi.json": {
      GET: async () => {
        const doc = generateOpenAPIDocument();
        return new Response(JSON.stringify(doc, null, 2), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
    "/docs": {
      GET: async () => {
        return new Response(SWAGGER_UI_HTML, {
          headers: { "Content-Type": "text/html" },
        });
      },
    },
  };
}
