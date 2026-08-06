import type { BunRequest } from "bun";
import { AVATAR_MAX_AGE_SECONDS, avatarMediaService } from "../services/AvatarMediaService";

/**
 * Published avatars, served to anyone holding the address.
 *
 * It lives under `/public/` deliberately: an `<img>` tag cannot send a bearer
 * token, so the address itself has to be the capability. It is derived from the
 * bytes and the player and is not guessable from a player id, which is what
 * makes that safe — and what makes it unsuitable for a picture nobody has
 * approved yet.
 */
export function playerAvatarMediaRoutes() {
  return {
    "/public/avatars/:address": {
      GET: async (
        req: BunRequest<"/public/avatars/:address"> & { params: { address: string } }
      ) => {
        const avatar = await avatarMediaService.byAddress(req.params.address);
        if (!avatar) return new Response("Not Found", { status: 404 });

        return new Response(new Uint8Array(avatar.image), {
          headers: {
            "Content-Type": avatar.contentType,
            // Bounded on purpose: see AVATAR_MAX_AGE_SECONDS.
            "Cache-Control": `public, max-age=${AVATAR_MAX_AGE_SECONDS}`,
            ETag: `"${avatar.address}"`,
          },
        });
      },
    },
  };
}
