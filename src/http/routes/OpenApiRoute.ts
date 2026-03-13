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
      window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
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
        return Response.json(doc, {
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
