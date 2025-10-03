import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import { SiteadminPayload } from "../decorators/payload/SiteadminPayload";

export async function getCommunityPlatformSiteAdminRegisteredMembersRegisteredMemberId(props: {
  siteAdmin: SiteadminPayload;
  registeredMemberId: string & tags.Format<"uuid">;
}): Promise<ICommunityPlatformRegisteredMember> {
  /**
   * Get details of a registered member assignment by id (table:
   * community_platform_registeredmembers).
   *
   * Retrieves a single registered member assignment by its primary key. Only
   * accessible to Site Admins. Hidden (soft-deleted) rows are treated as not
   * found.
   *
   * @param props - Request properties
   * @param props.siteAdmin - The authenticated site administrator performing
   *   the request
   * @param props.registeredMemberId - Target registered member assignment’s
   *   UUID
   * @returns Registered member assignment detail
   * @throws {HttpException} 401 When authentication is missing
   * @throws {HttpException} 404 When the assignment does not exist or is hidden
   */
  const { siteAdmin, registeredMemberId } = props;

  // Authentication check (guarded upstream, but enforced here as contract)
  if (!siteAdmin) {
    throw new HttpException("Please sign in to continue.", 401);
  }

  const row =
    await MyGlobal.prisma.community_platform_registeredmembers.findFirst({
      where: {
        id: registeredMemberId,
        deleted_at: null,
      },
      select: {
        id: true,
        community_platform_user_id: true,
        registered_at: true,
        created_at: true,
        updated_at: true,
        deleted_at: true,
      },
    });

  if (!row) {
    throw new HttpException("Not Found", 404);
  }

  return {
    id: registeredMemberId,
    community_platform_user_id: row.community_platform_user_id as string &
      tags.Format<"uuid">,
    registered_at: toISOStringSafe(row.registered_at),
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
    deleted_at: null,
  };
}
