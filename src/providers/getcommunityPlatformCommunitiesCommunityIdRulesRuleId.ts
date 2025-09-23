import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRule";

/**
 * Get a single rule from community_platform_community_rules by community and
 * rule identifiers.
 *
 * Public read endpoint returning an ordered rule item belonging to a community.
 * Ensures both the parent community and the rule are not soft-deleted. If the
 * rule does not belong to the specified community, or either entity is deleted,
 * a not-found error is raised.
 *
 * @param props - Request properties
 * @param props.communityId - UUID of the parent community
 * @param props.ruleId - UUID of the target rule within the community
 * @returns The community rule details (read-only DTO)
 * @throws {HttpException} 404 Not Found when community or rule does not exist
 *   or is deleted
 */
export async function getcommunityPlatformCommunitiesCommunityIdRulesRuleId(props: {
  communityId: string & tags.Format<"uuid">;
  ruleId: string & tags.Format<"uuid">;
}): Promise<ICommunityPlatformCommunityRule> {
  const { communityId, ruleId } = props;

  // Ensure parent community exists and is not soft-deleted
  const community =
    await MyGlobal.prisma.community_platform_communities.findFirst({
      where: {
        id: communityId,
        deleted_at: null,
      },
      select: { id: true },
    });
  if (!community) {
    throw new HttpException("Not Found", 404);
  }

  // Fetch the rule scoped to the community and ensure it is not soft-deleted
  const rule =
    await MyGlobal.prisma.community_platform_community_rules.findFirst({
      where: {
        id: ruleId,
        community_platform_community_id: communityId,
        deleted_at: null,
      },
      select: {
        id: true,
        community_platform_community_id: true,
        order_index: true,
        text: true,
        created_at: true,
        updated_at: true,
      },
    });
  if (!rule) {
    throw new HttpException("Not Found", 404);
  }

  // Map to API DTO with proper branding and date conversions
  return {
    id: rule.id as string & tags.Format<"uuid">,
    community_platform_community_id:
      rule.community_platform_community_id as string & tags.Format<"uuid">,
    order_index: rule.order_index as number &
      tags.Type<"int32"> &
      tags.Minimum<0>,
    text: rule.text as string & tags.MinLength<1> & tags.MaxLength<200>,
    created_at: toISOStringSafe(rule.created_at),
    updated_at: toISOStringSafe(rule.updated_at),
  };
}
