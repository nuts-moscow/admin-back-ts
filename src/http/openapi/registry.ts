import { z } from "zod";
import {
  BountyCountBodySchema,
  EntryPaymentBodySchema,
  InGameUserStateSchema,
  ReentryCountBodySchema,
  ReentryPaymentBodySchema,
  StatusBodySchema,
  TableIdBodySchema,
  TournamentParamsSchema,
  TournamentPlayerParamsSchema,
} from "./schemas";
import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";

export const openApiRegistry = new OpenAPIRegistry();

const basePath = "/api/tournaments/{tournamentId}";

openApiRegistry.registerPath({
  method: "post",
  path: `${basePath}/players/{playerId}`,
  summary: "Add player to tournament",
  description: "Adds a player to a tournament and returns the initial in-game state",
  request: {
    params: TournamentPlayerParamsSchema,
  },
  responses: {
    201: {
      description: "Player added successfully",
      content: {
        "application/json": { schema: InGameUserStateSchema },
      },
    },
    500: {
      description: "Failed to add player to tournament",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
  },
});

openApiRegistry.registerPath({
  method: "get",
  path: `${basePath}/players/{playerId}`,
  summary: "Get player state",
  description: "Returns the in-game state for a player in a tournament",
  request: {
    params: TournamentPlayerParamsSchema,
  },
  responses: {
    200: {
      description: "Player state",
      content: {
        "application/json": { schema: InGameUserStateSchema },
      },
    },
    404: {
      description: "Player not found",
    },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: `${basePath}/players/{playerId}/update`,
  summary: "Update bounty count",
  description: "Adds bounty count to a player",
  request: {
    params: TournamentPlayerParamsSchema,
    body: {
      content: {
        "application/json": { schema: BountyCountBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Updated player state",
      content: {
        "application/json": { schema: InGameUserStateSchema },
      },
    },
    400: {
      description: "Invalid request body",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    404: {
      description: "Player not found",
    },
  },
});

openApiRegistry.registerPath({
  method: "get",
  path: `${basePath}/players`,
  summary: "List players in tournament",
  description: "Returns all in-game player states for a tournament",
  request: {
    params: TournamentParamsSchema,
  },
  responses: {
    200: {
      description: "List of player states",
      content: {
        "application/json": {
          schema: z.array(InGameUserStateSchema),
        },
      },
    },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: `${basePath}/players/{playerId}/reentry`,
  summary: "Add re-entry count",
  description: "Adds re-entry count to a player",
  request: {
    params: TournamentPlayerParamsSchema,
    body: {
      content: {
        "application/json": { schema: ReentryCountBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Updated player state",
      content: {
        "application/json": { schema: InGameUserStateSchema },
      },
    },
    400: {
      description: "Invalid request body",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    404: {
      description: "Player not found",
    },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: `${basePath}/players/{playerId}/status`,
  summary: "Update player status",
  description: "Updates the in-game status of a player",
  request: {
    params: TournamentPlayerParamsSchema,
    body: {
      content: {
        "application/json": { schema: StatusBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Updated player state",
      content: {
        "application/json": { schema: InGameUserStateSchema },
      },
    },
    400: {
      description: "Invalid status",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    404: {
      description: "Player not found",
    },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: `${basePath}/players/{playerId}/entry-payment`,
  summary: "Update entry payment method",
  description: "Sets the entry payment method for a player",
  request: {
    params: TournamentPlayerParamsSchema,
    body: {
      content: {
        "application/json": { schema: EntryPaymentBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Updated player state",
      content: {
        "application/json": { schema: InGameUserStateSchema },
      },
    },
    400: {
      description: "Invalid entry payment method",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    404: {
      description: "Player not found",
    },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: `${basePath}/players/{playerId}/table`,
  summary: "Update player table",
  description: "Updates the table ID assigned to a player. Pass null or empty string to clear.",
  request: {
    params: TournamentPlayerParamsSchema,
    body: {
      content: {
        "application/json": { schema: TableIdBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Updated player state",
      content: {
        "application/json": { schema: InGameUserStateSchema },
      },
    },
    400: {
      description: "Invalid request body",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    404: {
      description: "Player not found",
    },
  },
});

openApiRegistry.registerPath({
  method: "post",
  path: `${basePath}/players/{playerId}/reentry-payment`,
  summary: "Add re-entry payments",
  description: "Adds re-entry payment methods for a player",
  request: {
    params: TournamentPlayerParamsSchema,
    body: {
      content: {
        "application/json": { schema: ReentryPaymentBodySchema },
      },
    },
  },
  responses: {
    200: {
      description: "Updated player state",
      content: {
        "application/json": { schema: InGameUserStateSchema },
      },
    },
    400: {
      description: "Invalid payment methods",
      content: {
        "application/json": {
          schema: { type: "object", properties: { error: { type: "string" } } },
        },
      },
    },
    404: {
      description: "Player not found",
    },
  },
});
