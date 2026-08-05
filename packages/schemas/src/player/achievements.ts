import { z } from 'zod';

/**
 * One achievement as the app draws it. Name, description and threshold come
 * from the backend catalogue — the app holds no list of its own.
 */
export const PlayerAchievementEntry = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  /** Grouping for the tab, in the club's own words. */
  group: z.string(),
  /** How far along, floored — the same number that was compared to the threshold. */
  reached: z.number(),
  threshold: z.number(),
  closed: z.boolean(),
  /** When it closed; null while it is still open. */
  earnedAt: z.string().nullable(),
  /** True until the player has opened the tab since it was awarded. */
  isNew: z.boolean(),
});
export type PlayerAchievementEntry = z.infer<typeof PlayerAchievementEntry>;

export const PlayerAchievements = z.object({
  entries: z.array(PlayerAchievementEntry),
  /** Drives the dot on the tab; zero once the player has looked. */
  unseenCount: z.number().int().nonnegative(),
});
export type PlayerAchievements = z.infer<typeof PlayerAchievements>;
