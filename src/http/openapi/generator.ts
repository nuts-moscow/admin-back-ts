import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { ApplicationConfigs } from "../../configs";
import { openApiRegistry } from "./registry";

/**
 * Generates the full OpenAPI document for the Admin API.
 */
export function generateOpenAPIDocument() {
  const port = ApplicationConfigs.instance.server.port;
  const generator = new OpenApiGeneratorV3(openApiRegistry.definitions);

  return generator.generateDocument({
    openapi: "3.0.0",
    info: {
      version: "1.0.0",
      title: "Admin API",
      description: "Admin backend API for tournament and in-game player management",
    },
    servers: [{ url: `http://localhost:${port}` }],
  });
}
