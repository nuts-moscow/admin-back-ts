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
    tags: [
      {
        name: "Auth",
        description: "Admin JWT: POST /api/auth/login, then Authorization: Bearer <token>",
      },
      {
        name: "Public",
        description: "Public endpoints without authentication",
      },
      {
        name: "Players",
        description: "Управление игроками: создание",
      },
      {
        name: "Tournament Structures",
        description: "Шаблоны структур турниров: создание, редактирование",
      },
      {
        name: "Tournaments",
        description: "Турниры: создание, обновление структуры",
      },
      {
        name: "Tournament Players",
        description: "Управление игроками турнира: добавление, состояние, bounty, re-entry, статус, оплата",
      },
      {
        name: "Tournament clock",
        description:
          "Турнирные часы (Redis): пауза, продление текущего уровня. Трансляция тиков: WebSocket `ws://…/ws/tournaments/{id}/clock`, тело сообщения — схема TournamentClockTick в openapi.json",
      },
    ],
  });
}
