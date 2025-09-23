import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { CommunitymemberPayload } from "../decorators/payload/CommunitymemberPayload";

export async function deletecommunityPlatformCommunityMemberCommunitiesCommunityIdRulesRuleId(props: {
  communityMember: CommunitymemberPayload;
  communityId: string & tags.Format<"uuid">;
  ruleId: string & tags.Format<"uuid">;
}): Promise<void> {
  const { communityMember, communityId, ruleId } = props;

  // 1) Load community and validate ownership and active (not soft-deleted)
  const community =
    await MyGlobal.prisma.community_platform_communities.findUniqueOrThrow({
      where: { id: communityId },
      select: {
        id: true,
        community_platform_user_id: true,
        deleted_at: true,
      },
    });

  if (community.deleted_at !== null) {
    throw new HttpException("Not Found", 404);
  }
  if (community.community_platform_user_id !== communityMember.id) {
    throw new HttpException(
      "Unauthorized: Only the community owner can remove rules",
      403,
    );
  }

  // 2) Ensure rule exists, belongs to the community, and is not already deleted
  const rule =
    await MyGlobal.prisma.community_platform_community_rules.findFirst({
      where: {
        id: ruleId,
        community_platform_community_id: communityId,
        deleted_at: null,
      },
      select: { id: true },
    });
  if (!rule) {
    throw new HttpException("Not Found", 404);
  }

  // 3) Soft delete: set deleted_at (and updated_at) to now
  const now = toISOStringSafe(new Date());
  await MyGlobal.prisma.community_platform_community_rules.update({
    where: { id: rule.id },
    data: {
      deleted_at: now,
      updated_at: now,
    },
  });

  return;
}
