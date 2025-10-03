// File path: src/providers/authorize/registeredmemberAuthorize.ts
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";

import { MyGlobal } from "../../MyGlobal";
import { jwtAuthorize } from "./jwtAuthorize"; // ← CRITICAL: same-directory import
import { RegisteredmemberPayload } from "../../decorators/payload/RegisteredmemberPayload";

/**
 * Authenticate request with JWT and ensure account is an active registered member.
 *
 * - Verifies JWT via shared jwtAuthorize()
 * - Ensures payload.type === "registeredmember"
 * - Confirms a corresponding registered-member record exists and is active
 *   (deleted_at is null) and the top-level user is not soft-deleted
 *   (user.deleted_at is null)
 * - Returns the JWT payload for downstream use
 */
export async function registeredmemberAuthorize(request: {
  headers: { authorization?: string };
}): Promise<RegisteredmemberPayload> {
  // Verify token and parse payload
  const payload: RegisteredmemberPayload = jwtAuthorize({ request }) as RegisteredmemberPayload;

  // Basic payload sanity checks
  if (!payload || typeof payload !== "object" || !payload.id) {
    throw new UnauthorizedException("Invalid token payload");
  }

  // Role check
  if (payload.type !== "registeredmember") {
    throw new ForbiddenException(`You're not ${payload.type}`);
  }

  // Top-level user id is carried in payload.id
  // Role table extends user via community_platform_user_id
  const member = await MyGlobal.prisma.community_platform_registeredmembers.findFirst({
    where: {
      community_platform_user_id: payload.id,
      deleted_at: null,
      user: { deleted_at: null },
    },
  });

  if (member === null) {
    throw new ForbiddenException("You're not enrolled");
  }

  return payload;
}
