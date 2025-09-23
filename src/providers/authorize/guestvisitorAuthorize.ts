// File path: src/providers/authorize/guestvisitorAuthorize.ts
import { ForbiddenException } from "@nestjs/common";

import { MyGlobal } from "../../MyGlobal";
import { jwtAuthorize } from "./jwtAuthorize"; // CORRECT: same directory import
import { GuestvisitorPayload } from "../../decorators/payload/GuestvisitorPayload";

/**
 * Authorize Guest Visitor role.
 * - Verifies JWT using shared jwtAuthorize
 * - Ensures the payload.type is "guestVisitor"
 * - Confirms the guest visitor exists and is not soft-deleted
 */
export async function guestvisitorAuthorize(request: {
  headers: { authorization?: string };
}): Promise<GuestvisitorPayload> {
  // Parse & verify token
  const payload: GuestvisitorPayload = jwtAuthorize({ request }) as GuestvisitorPayload;

  // Role discriminator check
  if (payload.type !== "guestVisitor")
    throw new ForbiddenException("You're not guestVisitor");

  // Standalone role table → query by primary key `id`
  const guest = await MyGlobal.prisma.community_platform_guestvisitors.findFirst({
    where: {
      id: payload.id,
      deleted_at: null,
    },
  });

  if (guest === null)
    throw new ForbiddenException("You're not enrolled");

  return payload; // inject the JWT payload as-is
}
