// File path: src/providers/authorize/guestvisitorAuthorize.ts
import { ForbiddenException } from "@nestjs/common";

import { MyGlobal } from "../../MyGlobal";
import { jwtAuthorize } from "./jwtAuthorize"; // MUST be same directory import
import { GuestvisitorPayload } from "../../decorators/payload/GuestvisitorPayload";

/**
 * Authenticate and authorize a guestvisitor role.
 *
 * - payload.id is ALWAYS the top-level user table ID (community_platform_users.id)
 * - Role table extends user via community_platform_user_id
 */
export async function guestvisitorAuthorize(request: {
  headers: { authorization?: string };
}): Promise<GuestvisitorPayload> {
  const payload: GuestvisitorPayload = jwtAuthorize({ request }) as GuestvisitorPayload;

  if (payload.type !== "guestvisitor")
    throw new ForbiddenException("You're not guestvisitor");

  const now = new Date();

  const record = await MyGlobal.prisma.community_platform_guestvisitors.findFirst({
    where: {
      community_platform_user_id: payload.id,
      restriction_type: "read_only",
      revoked_at: null,
      deleted_at: null,
      OR: [{ restricted_until: null }, { restricted_until: { gt: now } }],
      user: { is: { deleted_at: null } },
    },
  });

  if (record === null)
    throw new ForbiddenException("You're not enrolled");

  return payload;
}
