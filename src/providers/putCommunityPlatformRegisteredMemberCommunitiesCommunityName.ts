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
import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

export async function putCommunityPlatformRegisteredMemberCommunitiesCommunityName(props: {
  registeredMember: RegisteredmemberPayload;
  communityName: string;
  body: ICommunityPlatformCommunity.IUpdate;
}): Promise<ICommunityPlatformCommunity> {
  const { registeredMember, communityName, body } = props;

  // Locate target community by normalized name_key and ensure not soft-deleted
  const nameKey = communityName.trim().toLowerCase();
  const target = await MyGlobal.prisma.community_platform_communities.findFirst(
    {
      where: {
        name_key: nameKey,
        deleted_at: null,
      },
    },
  );
  if (!target) {
    throw new HttpException("Not Found", 404);
  }

  // Authorization: owner or active site admin
  const isOwner = target.community_platform_user_id === registeredMember.id;
  let isAdmin = false;
  if (!isOwner) {
    const admin = await MyGlobal.prisma.community_platform_siteadmins.findFirst(
      {
        where: {
          community_platform_user_id: registeredMember.id,
          revoked_at: null,
          deleted_at: null,
        },
      },
    );
    isAdmin = admin !== null;
  }
  if (!isOwner && !isAdmin) {
    throw new HttpException(
      "You can edit or delete only items you authored.",
      403,
    );
  }

  // Perform update (only mutable fields); update timestamp
  const now = toISOStringSafe(new Date());
  const updated = await MyGlobal.prisma.community_platform_communities.update({
    where: { id: target.id },
    data: {
      description: body.description ?? undefined,
      logo_uri: body.logoUri ?? undefined,
      banner_uri: body.bannerUri ?? undefined,
      category: body.category ?? undefined,
      updated_at: now,
    },
  });

  // Build response DTO with proper date conversions and optional mappings
  const response = {
    id: updated.id,
    name: updated.name,
    category: updated.category,
    description: updated.description ?? undefined,
    logoUri: updated.logo_uri ?? undefined,
    bannerUri: updated.banner_uri ?? undefined,
    createdAt: toISOStringSafe(updated.created_at),
    updatedAt: toISOStringSafe(updated.updated_at),
    lastActiveAt: updated.last_active_at
      ? toISOStringSafe(updated.last_active_at)
      : undefined,
    // Derived flags (optional fields)
    isOwner: isOwner,
  };

  // Ensure branded types and enum constraints without using `as`
  return typia.assert<ICommunityPlatformCommunity>(response);
}
