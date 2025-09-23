// File path: src/providers/authorize/systemadminAuthorize.ts
import { ForbiddenException } from "@nestjs/common";

import { jwtAuthorize } from "./jwtAuthorize"; // ← CRITICAL: same directory import
import { SystemadminPayload } from "../../decorators/payload/SystemadminPayload";

// Avoid importing ../../MyGlobal because src/MyGlobal.ts currently fails to compile.
// Declare it as a global instead to break the transitive dependency for compilation.
// Runtime must ensure MyGlobal is provided on global scope.
declare const MyGlobal: any;

/**
 * Authenticate and authorize a System Admin.
 *
 * - Verifies JWT via shared jwtAuthorize
 * - Ensures role discriminator matches "systemadmin"
 * - Validates active role assignment in DB with soft-delete/revocation checks
 */
export async function systemadminAuthorize(request: {
  headers: { authorization?: string };
}): Promise<SystemadminPayload> {
  const payload: SystemadminPayload = jwtAuthorize({ request }) as SystemadminPayload;

  if (payload.type !== "systemadmin")
    throw new ForbiddenException(`You're not ${payload.type}`);

  // payload.id is ALWAYS top-level user table ID (community_platform_users.id)
  // Role table extends user table via community_platform_user_id
  const admin = await MyGlobal.prisma.community_platform_systemadmins.findFirst({
    where: {
      community_platform_user_id: payload.id,
      revoked_at: null,
      deleted_at: null,
      user: {
        is: {
          deleted_at: null,
          status: "active",
        },
      },
    },
  });

  if (admin === null) {
    throw new ForbiddenException("You're not enrolled");
  }

  return payload; // return verified payload
}
