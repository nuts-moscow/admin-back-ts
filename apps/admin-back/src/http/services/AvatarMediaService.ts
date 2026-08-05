import { playerAvatarRepository, type PublishedAvatar } from "../../postgres";

/**
 * The read side. It knows about the published store and nothing else.
 *
 * That ignorance is the design: because this service cannot see submissions, a
 * replacement waiting for a verdict cannot possibly change what any screen
 * draws. "The approved avatar keeps showing" is not a rule anyone has to
 * remember here — there is no code path that could break it.
 */
export class AvatarMediaService {
  async byAddress(address: string): Promise<PublishedAvatar | null> {
    return playerAvatarRepository.findByAddress(address);
  }

  /** The address the payloads carry, next to the nickname. Absent means initials. */
  async addressForPlayer(playerId: number): Promise<string | null> {
    return playerAvatarRepository.findAddressForPlayer(playerId);
  }

  async addressesForPlayers(playerIds: readonly number[]): Promise<Map<number, string>> {
    return playerAvatarRepository.addressesForPlayers(playerIds);
  }
}

export const avatarMediaService = new AvatarMediaService();

/**
 * An hour, not a year. The image at an address never changes — a new picture is
 * a new address — so it could be cached forever, and that is exactly the trap:
 * an admin's takedown has to reach screens that already loaded it. The bound is
 * what makes a takedown effective without anyone clearing a cache.
 */
export const AVATAR_MAX_AGE_SECONDS = 3600;
