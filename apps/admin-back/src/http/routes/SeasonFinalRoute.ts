import { SeasonFinalService } from "../services/SeasonFinalService";

const seasonFinalService = new SeasonFinalService();

/**
 * Player-facing season-final announcement. Mounted under /api/player/, so
 * requirePlayerAuth gates it in server.ts. Answers the nearest future
 * month-final tournament's date, or null (unannounced).
 */
export function seasonFinalRoutes() {
  return {
    "/api/player/season-final": {
      GET: async (_req: Request): Promise<Response> => {
        const announcement = await seasonFinalService.getAnnouncement(Date.now());
        return Response.json(announcement);
      },
    },
  };
}
