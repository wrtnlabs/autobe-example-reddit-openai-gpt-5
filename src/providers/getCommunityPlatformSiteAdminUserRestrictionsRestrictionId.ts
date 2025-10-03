import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformUserRestriction } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUserRestriction";
import { IEUserRestrictionType } from "@ORGANIZATION/PROJECT-api/lib/structures/IEUserRestrictionType";
import { SiteadminPayload } from "../decorators/payload/SiteadminPayload";

export async function getCommunityPlatformSiteAdminUserRestrictionsRestrictionId(props: {
  siteAdmin: SiteadminPayload;
  restrictionId: string & tags.Format<"uuid">;
}): Promise<ICommunityPlatformUserRestriction> {
  const { siteAdmin, restrictionId } = props;

  // Authorization: ensure the caller is an active site admin and owning user is active
  const activeAdmin =
    await MyGlobal.prisma.community_platform_siteadmins.findFirst({
      where: {
        community_platform_user_id: siteAdmin.id,
        revoked_at: null,
        deleted_at: null,
        user: { deleted_at: null },
      },
      select: { id: true },
    });
  if (activeAdmin === null)
    throw new HttpException(
      "Forbidden: Only site administrators can access this resource",
      403,
    );

  // Fetch the restriction record (exclude soft-deleted)
  const record =
    await MyGlobal.prisma.community_platform_guestvisitors.findFirst({
      where: {
        id: restrictionId,
        deleted_at: null,
      },
      select: {
        id: true,
        community_platform_user_id: true,
        restriction_type: true,
        restricted_until: true,
        restriction_reason: true,
        assigned_at: true,
        revoked_at: true,
        created_at: true,
        updated_at: true,
      },
    });
  if (record === null) throw new HttpException("Not Found", 404);

  // Narrow restriction_type to union
  const isRestrictionType = (v: string): v is IEUserRestrictionType =>
    v === "read_only" || v === "suspended";
  if (!isRestrictionType(record.restriction_type))
    throw new HttpException(
      "Internal Server Error: Invalid restriction_type value",
      500,
    );

  /**
   * Map DB record to DTO with proper date conversions and null handling. Use
   * typia.assert to ensure branded formats without unsafe casts.
   */
  return typia.assert<ICommunityPlatformUserRestriction>({
    id: record.id,
    userId: record.community_platform_user_id,
    restrictionType: record.restriction_type,
    restrictedUntil: record.restricted_until
      ? toISOStringSafe(record.restricted_until)
      : undefined,
    restrictionReason: record.restriction_reason ?? undefined,
    assignedAt: toISOStringSafe(record.assigned_at),
    revokedAt: record.revoked_at
      ? toISOStringSafe(record.revoked_at)
      : undefined,
    createdAt: toISOStringSafe(record.created_at),
    updatedAt: toISOStringSafe(record.updated_at),
  });
}
