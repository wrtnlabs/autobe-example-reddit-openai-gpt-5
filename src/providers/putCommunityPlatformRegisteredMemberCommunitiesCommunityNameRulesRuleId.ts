import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRule";
import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

export async function putCommunityPlatformRegisteredMemberCommunitiesCommunityNameRulesRuleId(props: {
  registeredMember: RegisteredmemberPayload;
  communityName: string;
  ruleId: string & tags.Format<"uuid">;
  body: ICommunityPlatformCommunityRule.IUpdate;
}): Promise<ICommunityPlatformCommunityRule> {
  const { registeredMember, communityName, ruleId, body } = props;

  // 1) Resolve community (active only)
  const community =
    await MyGlobal.prisma.community_platform_communities.findFirst({
      where: { name: communityName, deleted_at: null },
      select: { id: true, community_platform_user_id: true },
    });
  if (!community) {
    throw new HttpException("Community not found", 404);
  }

  // 2) Authorization: owner or active site admin
  const isOwner = community.community_platform_user_id === registeredMember.id;
  let isAdmin = false;
  if (!isOwner) {
    const admin = await MyGlobal.prisma.community_platform_siteadmins.findFirst(
      {
        where: {
          community_platform_user_id: registeredMember.id,
          revoked_at: null,
          deleted_at: null,
          user: { deleted_at: null },
        },
        select: { id: true },
      },
    );
    isAdmin = !!admin;
  }
  if (!isOwner && !isAdmin) {
    throw new HttpException(
      "Forbidden: Only the community owner or a site admin can update rules",
      403,
    );
  }

  // 3) Load target rule (must belong to community and be active)
  const existingRule =
    await MyGlobal.prisma.community_platform_community_rules.findFirst({
      where: {
        id: ruleId,
        community_platform_community_id: community.id,
        deleted_at: null,
      },
      select: {
        id: true,
        order_index: true,
        text: true,
        created_at: true,
        updated_at: true,
      },
    });
  if (!existingRule) {
    throw new HttpException("Rule not found", 404);
  }

  // 4) Uniqueness check for order, if provided
  if (body.order !== undefined && body.order !== null) {
    const duplicate =
      await MyGlobal.prisma.community_platform_community_rules.findFirst({
        where: {
          community_platform_community_id: community.id,
          order_index: body.order,
          NOT: { id: ruleId },
        },
        select: { id: true },
      });
    if (duplicate) {
      throw new HttpException(
        "Conflict: order already exists in this community",
        409,
      );
    }
  }

  // 5) Perform update (null → undefined to skip for non-nullable fields)
  const now = toISOStringSafe(new Date());
  const updated =
    await MyGlobal.prisma.community_platform_community_rules.update({
      where: { id: ruleId },
      data: {
        order_index:
          body.order === null ? undefined : (body.order ?? undefined),
        text: body.text === null ? undefined : (body.text ?? undefined),
        updated_at: now,
      },
      select: {
        id: true,
        order_index: true,
        text: true,
        created_at: true,
        updated_at: true,
      },
    });

  // 6) Map to DTO
  return {
    id: updated.id as string & tags.Format<"uuid">,
    orderIndex: Number(updated.order_index) as number &
      tags.Type<"int32"> &
      tags.Minimum<1>,
    text: updated.text as string & tags.MaxLength<100>,
    createdAt: toISOStringSafe(updated.created_at),
    updatedAt: toISOStringSafe(updated.updated_at),
  };
}
