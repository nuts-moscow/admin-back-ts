import { z } from 'zod';

export const HallOfFameEntry = z.object({
  id: z.number().int(),
  year: z.number().int(),
  playerId: z.number().int().nullable(),
  nickname: z.string(),
  name: z.string().nullable(),
  title: z.string(),
  stat: z.string(),
  position: z.number().int(),
});
export type HallOfFameEntry = z.infer<typeof HallOfFameEntry>;

export const HallOfFameCreateRequest = z.object({
  year: z.number().int().min(1900).max(3000),
  playerId: z.number().int().nullable(),
  nickname: z.string().min(1),
  name: z.string().nullable().optional(),
  title: z.string().min(1),
  stat: z.string().min(1),
  position: z.number().int().min(1),
});
export type HallOfFameCreateRequest = z.infer<typeof HallOfFameCreateRequest>;

export const HallOfFameUpdateRequest = HallOfFameCreateRequest.partial();
export type HallOfFameUpdateRequest = z.infer<typeof HallOfFameUpdateRequest>;
