import { z } from 'zod';

export const SeasonFinalAnnouncement = z.object({
  /**
   * Epoch ms of the nearest FUTURE tournament flagged «финал месяца», or null
   * when no such tournament exists (panel shows «дата пока не анонсирована»).
   */
  date: z.number().int().nullable(),
});
export type SeasonFinalAnnouncement = z.infer<typeof SeasonFinalAnnouncement>;
