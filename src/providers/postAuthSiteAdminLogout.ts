import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { SiteadminPayload } from "../decorators/payload/SiteadminPayload";

export async function postAuthSiteAdminLogout(props: {
  siteAdmin: SiteadminPayload;
}): Promise<void> {
  /**
   * Revoke the current admin session by setting revoked_at in
   * community_platform_sessions.
   *
   * Finds the most recent active session for the authenticated site admin and
   * marks it as revoked. If no active session exists (already
   * revoked/expired/missing), the operation is idempotent and completes without
   * error. Other sessions remain intact.
   *
   * @param props - Request properties
   * @param props.siteAdmin - The authenticated site administrator payload
   * @returns Void
   * @throws {HttpException} 401 When authentication is missing (handled by
   *   decorator)
   */
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());

  // Find the latest active (non-revoked, non-deleted, unexpired) session for this admin
  const session = await MyGlobal.prisma.community_platform_sessions.findFirst({
    where: {
      community_platform_user_id: props.siteAdmin.id,
      revoked_at: null,
      deleted_at: null,
      expires_at: { gt: now },
      user: { deleted_at: null },
    },
    orderBy: [{ last_seen_at: "desc" }, { created_at: "desc" }],
    select: { id: true },
  });

  // Idempotent: if no active session found, nothing to do
  if (!session) return;

  // Revoke only the found session
  await MyGlobal.prisma.community_platform_sessions.update({
    where: { id: session.id },
    data: {
      revoked_at: now,
      updated_at: now,
    },
  });
}
