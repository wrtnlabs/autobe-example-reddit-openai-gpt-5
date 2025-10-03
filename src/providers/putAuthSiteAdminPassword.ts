import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformSiteAdminPassword } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdminPassword";
import { ICommunityPlatformSiteAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdmin";
import { SiteadminPayload } from "../decorators/payload/SiteadminPayload";

/**
 * Change the authenticated admin’s password by updating password_hash in
 * community_platform_users.
 *
 * Validates the current password, rotates password_hash, and updates
 * users.updated_at. Does not modify role assignments in
 * community_platform_siteadmins. If requested, revokes other sessions by
 * setting community_platform_sessions.revoked_at. Deactivated accounts
 * (users.deleted_at not null) cannot change passwords.
 *
 * @param props - Request properties
 * @param props.siteAdmin - Authenticated SiteadminPayload (must be present)
 * @param props.body - Password change payload with currentPassword/newPassword
 *   and optional revokeOtherSessions
 * @returns ICommunityPlatformSiteAdmin summary of the admin assignment
 * @throws {HttpException} 401 When authentication is missing
 * @throws {HttpException} 403 When the account is deactivated
 * @throws {HttpException} 400 When the current password is invalid
 * @throws {HttpException} 404 When admin assignment cannot be found
 */
export async function putAuthSiteAdminPassword(props: {
  siteAdmin: SiteadminPayload;
  body: ICommunityPlatformSiteAdminPassword.IUpdate;
}): Promise<ICommunityPlatformSiteAdmin> {
  const { siteAdmin, body } = props;

  if (!siteAdmin) throw new HttpException("Please sign in to continue.", 401);

  // Fetch user and ensure not soft-deleted
  const user = await MyGlobal.prisma.community_platform_users.findUniqueOrThrow(
    {
      where: { id: siteAdmin.id },
      select: {
        id: true,
        password_hash: true,
        deleted_at: true,
      },
    },
  );

  if (user.deleted_at !== null)
    throw new HttpException("Forbidden: Account is deactivated.", 403);

  // Verify current password
  const ok = await PasswordUtil.verify(
    body.currentPassword,
    user.password_hash,
  );
  if (!ok)
    throw new HttpException("Bad Request: Invalid current password.", 400);

  // Rotate password hash
  const newHash = await PasswordUtil.hash(body.newPassword);
  const now = toISOStringSafe(new Date());

  await MyGlobal.prisma.community_platform_users.update({
    where: { id: user.id },
    data: {
      password_hash: newHash,
      updated_at: now,
    },
  });

  // Optionally revoke other sessions
  if (body.revokeOtherSessions === true) {
    await MyGlobal.prisma.community_platform_sessions.updateMany({
      where: {
        community_platform_user_id: user.id,
        revoked_at: null,
      },
      data: {
        revoked_at: now,
      },
    });
  }

  // Return the active admin assignment summary
  const admin =
    await MyGlobal.prisma.community_platform_siteadmins.findFirstOrThrow({
      where: {
        community_platform_user_id: user.id,
        deleted_at: null,
        revoked_at: null,
      },
      select: {
        id: true,
        community_platform_user_id: true,
        granted_at: true,
        revoked_at: true,
        created_at: true,
        updated_at: true,
        deleted_at: true,
      },
    });

  return {
    id: admin.id as string & tags.Format<"uuid">,
    userId: admin.community_platform_user_id as string & tags.Format<"uuid">,
    grantedAt: toISOStringSafe(admin.granted_at),
    revokedAt: admin.revoked_at ? toISOStringSafe(admin.revoked_at) : null,
    createdAt: toISOStringSafe(admin.created_at),
    updatedAt: toISOStringSafe(admin.updated_at),
    deletedAt: admin.deleted_at ? toISOStringSafe(admin.deleted_at) : null,
  };
}
