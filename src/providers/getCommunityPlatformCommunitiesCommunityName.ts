import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import { IECommunityPlatformCommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityCategory";
import { ICommunityPlatformCommunityRuleArray } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRuleArray";
import { ICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRule";

/**
 * Get a community by name from community_platform_communities.
 *
 * Publicly fetches a community using its immutable name. The name is normalized
 * to the case-insensitive key (name_key) for lookup, excluding soft-deleted
 * records. Returns branding fields, category, activity timestamps, and a
 * derived memberCount.
 *
 * @param props - Request properties
 * @param props.communityName - Immutable community name (user-facing)
 * @returns Detailed community information DTO
 * @throws {HttpException} 404 Not Found when the community does not exist or is
 *   soft-deleted
 */
export async function getCommunityPlatformCommunitiesCommunityName(props: {
  communityName: string;
}): Promise<ICommunityPlatformCommunity> {
  const nameKey = props.communityName.trim().toLowerCase();

  const community =
    await MyGlobal.prisma.community_platform_communities.findFirst({
      where: {
        name_key: nameKey,
        deleted_at: null,
      },
      select: {
        id: true,
        name: true,
        category: true,
        description: true,
        logo_uri: true,
        banner_uri: true,
        last_active_at: true,
        created_at: true,
        updated_at: true,
      },
    });

  if (!community) {
    throw new HttpException("Not Found", 404);
  }

  const memberCount =
    await MyGlobal.prisma.community_platform_community_members.count({
      where: {
        community_platform_community_id: community.id,
        deleted_at: null,
      },
    });

  return {
    id: community.id as string & tags.Format<"uuid">,
    name: community.name,
    category: community.category as IECommunityPlatformCommunityCategory,
    description: community.description ?? undefined,
    logoUri: community.logo_uri ?? undefined,
    bannerUri: community.banner_uri ?? undefined,
    createdAt: toISOStringSafe(community.created_at),
    updatedAt: toISOStringSafe(community.updated_at),
    lastActiveAt: community.last_active_at
      ? toISOStringSafe(community.last_active_at)
      : undefined,
    memberCount: Number(memberCount) as number &
      tags.Type<"int32"> &
      tags.Minimum<0>,
  };
}
