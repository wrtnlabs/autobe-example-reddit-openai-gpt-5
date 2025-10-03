import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformSiteAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdmin";
import { SiteadminPayload } from "../decorators/payload/SiteadminPayload";

export async function getCommunityPlatformSiteAdminSiteAdminsSiteAdminId(props: {
  siteAdmin: SiteadminPayload;
  siteAdminId: string & tags.Format<"uuid">;
}): Promise<ICommunityPlatformSiteAdmin> {
  /**
   * Get details of a site administrator assignment by id (table:
   * community_platform_siteadmins).
   *
   * Retrieves a single administrator role assignment by its primary key.
   * Soft-deleted records (deleted_at not null) are hidden and treated as not
   * found. Requires site admin authentication.
   *
   * @param props - Request properties
   * @param props.siteAdmin - The authenticated site admin payload
   *   (authorization required)
   * @param props.siteAdminId - Target site administrator assignment’s UUID
   * @returns The site administrator assignment detail
   * @throws {HttpException} 401 When authentication is missing or invalid
   * @throws {HttpException} 404 When the assignment is not found or
   *   soft-deleted
   */
  const { siteAdmin, siteAdminId } = props;

  // Authorization check
  if (!siteAdmin || siteAdmin.type !== "siteadmin") {
    throw new HttpException("Please sign in to continue.", 401);
  }

  const found = await MyGlobal.prisma.community_platform_siteadmins.findFirst({
    where: {
      id: siteAdminId,
      deleted_at: null,
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

  if (!found) {
    throw new HttpException("Not Found", 404);
  }

  return {
    id: found.id as string & tags.Format<"uuid">,
    userId: found.community_platform_user_id as string & tags.Format<"uuid">,
    grantedAt: toISOStringSafe(found.granted_at),
    revokedAt: found.revoked_at ? toISOStringSafe(found.revoked_at) : null,
    createdAt: toISOStringSafe(found.created_at),
    updatedAt: toISOStringSafe(found.updated_at),
    deletedAt: found.deleted_at ? toISOStringSafe(found.deleted_at) : null,
  };
}
