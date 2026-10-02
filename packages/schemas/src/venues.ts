import { z } from 'zod';

export const TournamentVenueId = z.enum(['mansarda', 'everest-mansion']);
export type TournamentVenueId = z.infer<typeof TournamentVenueId>;
export const DEFAULT_TOURNAMENT_VENUE_ID: TournamentVenueId = 'mansarda';

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
export function getTournamentVenue(id?: string | null): TournamentVenue {
  return TOURNAMENT_VENUES.find((venue) => venue.id === id) ?? TOURNAMENT_VENUES[0]!;
}
