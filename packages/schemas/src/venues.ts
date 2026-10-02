import { z } from 'zod';

export const TournamentVenueId = z.enum(['mansarda', 'everest-mansion', 'custom']);
export type TournamentVenueId = z.infer<typeof TournamentVenueId>;
export const DEFAULT_TOURNAMENT_VENUE_ID: TournamentVenueId = 'mansarda';

export const CustomTournamentVenue = z.object({
  name: z.string().trim().min(1).max(150),
  address: z.string().trim().min(1).max(300),
  mapsUrl: z.string().trim().max(2048).url().refine((value) => {
    try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
  }, 'Map link must use http or https'),
});
export type CustomTournamentVenue = z.infer<typeof CustomTournamentVenue>;

export const TournamentVenueSelection = z.object({
  venueId: TournamentVenueId,
  customVenue: CustomTournamentVenue.nullish(),
}).superRefine((value, ctx) => {
  if (value.venueId === 'custom' && !value.customVenue) {
    ctx.addIssue({ code: 'custom', path: ['customVenue'], message: 'Name, address and map link are required' });
  }
});

export const TournamentVenue = z.object({
  id: TournamentVenueId,
  name: z.string(),
  address: z.string(),
  mapsUrl: z.string().url(),
});
export type TournamentVenue = z.infer<typeof TournamentVenue>;

export const TOURNAMENT_VENUES: readonly TournamentVenue[] = [
  {
    id: 'mansarda',
    name: 'Мансарда Лаунж-Бар',
    address: 'Большой Спасоглинищевский пер., 9/1с16А',
    mapsUrl: 'https://yandex.com/maps/org/mansarda_lounge_bar/83750617761/?ll=37.637362%2C55.754532&z=16',
  },
  {
    id: 'everest-mansion',
    name: 'Everest Mansion',
    address: 'Житная ул., 4',
    mapsUrl: 'https://yandex.ru/maps/org/everest_mansion/176812133557/?ll=37.622343%2C55.730223&z=16',
  },
];

/** Old API responses without a venue still point to the original location. */
export function getTournamentVenue(id?: string | null, customVenue?: CustomTournamentVenue | null): TournamentVenue {
  if (id === 'custom' && customVenue) return { id, ...customVenue };
  return TOURNAMENT_VENUES.find((venue) => venue.id === id) ?? TOURNAMENT_VENUES[0]!;
}
