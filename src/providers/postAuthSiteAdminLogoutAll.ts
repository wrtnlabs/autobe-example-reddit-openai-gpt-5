import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { SiteadminPayload } from "../decorators/payload/SiteadminPayload";

export async function postAuthSiteAdminLogoutAll(props: {
  siteAdmin: SiteadminPayload;
}): Promise<void> {
  /**
   * Revoke all admin sessions by updating revoked_at for all of the user’s
   * community_platform_sessions.
   *
   * This operation logs the authenticated site administrator out of all devices
   * by setting revoked_at on every active session owned by the user. Active
   * sessions are those with revoked_at = null and deleted_at = null, and whose
   * owning user is not soft-deleted. The users table is not modified.
   *
   * @param props - Request properties
   * @param props.siteAdmin - The authenticated site administrator payload
   * @returns Void
   * @throws {HttpException} 401 When authentication payload is missing
   */
  const { siteAdmin } = props;
  if (!siteAdmin || !siteAdmin.id) {
    throw new HttpException("Please sign in to continue.", 401);
  }

  await MyGlobal.prisma.community_platform_sessions.updateMany({
    where: {
      community_platform_user_id: siteAdmin.id,
      revoked_at: null,
      deleted_at: null,
      user: { deleted_at: null },
    },
    data: {
      revoked_at: toISOStringSafe(new Date()),
      updated_at: toISOStringSafe(new Date()),
    },
  });
}
