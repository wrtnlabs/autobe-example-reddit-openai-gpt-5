// File path: src/providers/authorize/communitymemberAuthorize.ts
import { ForbiddenException } from "@nestjs/common";

import { MyGlobal } from "../../MyGlobal";
import { jwtAuthorize } from "./jwtAuthorize"; // MUST be same directory
import { CommunitymemberPayload } from "../../decorators/payload/CommunitymemberPayload";

/**
 * Authenticate and authorize a Community Member.
 * - Verifies JWT via jwtAuthorize
 * - Ensures payload.type === "communityMember"
 * - Confirms active role record and active user
 */
export async function communitymemberAuthorize(request: {
  headers: { authorization?: string };
}): Promise<CommunitymemberPayload> {
  const payload: CommunitymemberPayload = jwtAuthorize({ request }) as CommunitymemberPayload;

  if (payload.type !== "communityMember")
    throw new ForbiddenException(`You're not ${payload.type}`);

  // payload.id is top-level user id (community_platform_users.id)
  const member = await MyGlobal.prisma.community_platform_communitymembers.findFirst({
    where: {
      community_platform_user_id: payload.id, // FK to top-level user
      deleted_at: null,
      status: "active",
      user: {
        is: {
          deleted_at: null,
          status: "active",
        },
      },
    },
  });

  if (member === null) throw new ForbiddenException("You're not enrolled");
  return payload;
}
