// File path: src/providers/authorize/siteadminAuthorize.ts
import { ForbiddenException } from "@nestjs/common";

import { MyGlobal } from "../../MyGlobal";
import { jwtAuthorize } from "./jwtAuthorize"; // MUST be same directory import
import { SiteadminPayload } from "../../decorators/payload/SiteadminPayload";

/**
 * Authenticate and authorize a Site Admin using JWT.
 * - Verifies JWT via shared jwtAuthorize
 * - Ensures payload.type === "siteadmin"
 * - Confirms active admin assignment exists and is not revoked/deleted
 * - Ensures owning user account is not soft-deleted
 */
export async function siteadminAuthorize(request: {
  headers: { authorization?: string };
}): Promise<SiteadminPayload> {
  const payload: SiteadminPayload = jwtAuthorize({ request }) as SiteadminPayload;

  if (payload.type !== "siteadmin")
    throw new ForbiddenException(`You're not ${payload.type}`);

  // payload.id holds top-level user table ID (community_platform_users.id)
  const admin = await MyGlobal.prisma.community_platform_siteadmins.findFirst({
    where: {
      community_platform_user_id: payload.id, // role extends user via FK
      revoked_at: null,
      deleted_at: null,
      user: {
        deleted_at: null, // ensure owning user is active
      },
    },
  });

  if (admin === null) throw new ForbiddenException("You're not enrolled");

  // Return original payload whenever feasible
  return payload;
}
