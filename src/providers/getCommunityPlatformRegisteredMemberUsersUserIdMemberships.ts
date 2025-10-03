import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

export async function getCommunityPlatformRegisteredMemberUsersUserIdMemberships(props: {
  registeredMember: RegisteredmemberPayload;
  userId: string & tags.Format<"uuid">;
}): Promise<ICommunityPlatformCommunityMember.IList> {
  const { registeredMember, userId } = props;

  // Authorization: only the owner can access their memberships
  if (!registeredMember || registeredMember.id !== userId) {
    throw new HttpException(
      "Forbidden: You can only access your own memberships",
      403,
    );
  }

  // Ensure target user exists and is not soft-deleted
  const user = await MyGlobal.prisma.community_platform_users.findFirst({
    where: {
      id: userId,
      deleted_at: null,
    },
    select: { id: true },
  });
  if (user === null) {
    throw new HttpException("Not Found: User does not exist", 404);
  }

  // Fetch active memberships joined with visible communities
  const memberships =
    await MyGlobal.prisma.community_platform_community_members.findMany({
      where: {
        community_platform_user_id: userId,
        deleted_at: null,
        community: { deleted_at: null },
      },
      select: {
        community_platform_community_id: true,
        created_at: true,
        community: {
          select: {
            name: true,
            logo_uri: true,
          },
        },
      },
      orderBy: { created_at: "desc" },
    });

  if (memberships.length === 0) {
    return { data: [] };
  }

  // Compute member counts per community (only active memberships)
  const communityIds = memberships.map(
    (m) => m.community_platform_community_id,
  );

  const grouped =
    await MyGlobal.prisma.community_platform_community_members.groupBy({
      by: ["community_platform_community_id"],
      where: {
        community_platform_community_id: { in: communityIds },
        deleted_at: null,
      },
      _count: { _all: true },
    });

  const countMap = new Map<string, number>();
  for (const g of grouped) {
    countMap.set(g.community_platform_community_id, g._count._all);
  }

  // Build response DTOs
  const data = memberships.map((m) => {
    const memberCountRaw = countMap.get(m.community_platform_community_id) ?? 0;

    const communityBasic: ICommunityPlatformCommunity.IBasic = {
      name: typia.assert<ICommunityPlatformCommunity.IBasic["name"]>(
        m.community.name,
      ),
      logoUrl:
        m.community.logo_uri === null
          ? undefined
          : typia.assert<ICommunityPlatformCommunity.IBasic["logoUrl"]>(
              m.community.logo_uri,
            ),
    };

    const item: ICommunityPlatformCommunityMember = {
      community: communityBasic,
      joined: true,
      memberCount: typia.assert<number & tags.Type<"int32"> & tags.Minimum<0>>(
        Number(memberCountRaw),
      ),
      joinedAt: toISOStringSafe(m.created_at),
    };
    return item;
  });

  return { data };
}
