import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRule";

/**
 * Get a community rule (community_platform_community_rules) by ID within a
 * named community.
 *
 * Retrieves a single rule item under the specified community, ensuring both the
 * community and the rule are not soft-deleted and that the rule belongs to the
 * resolved community. This endpoint is public (read-only) and requires no
 * authentication.
 *
 * @param props - Request properties
 * @param props.communityName - Immutable community name used to resolve the
 *   parent community
 * @param props.ruleId - Target rule identifier (UUID) within the specified
 *   community
 * @returns The community rule entity matching the requested identifiers
 * @throws {HttpException} Not Found (404) when the community or rule does not
 *   exist, is deleted, or the rule does not belong to the community
 */
export async function getCommunityPlatformCommunitiesCommunityNameRulesRuleId(props: {
  communityName: string;
  ruleId: string & tags.Format<"uuid">;
}): Promise<ICommunityPlatformCommunityRule> {
  const { communityName, ruleId } = props;

  // Application-level normalization for name_key matching (lowercased, trimmed)
  const normalizedKey = communityName.trim().toLowerCase();

  // 1) Resolve community by name or name_key, excluding soft-deleted
  const community =
    await MyGlobal.prisma.community_platform_communities.findFirst({
      where: {
        deleted_at: null,
        OR: [{ name: communityName }, { name_key: normalizedKey }],
      },
      select: {
        id: true,
      },
    });
  if (!community) throw new HttpException("Not Found", 404);

  // 2) Resolve the rule by id scoped to community, excluding soft-deleted
  const rule =
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
  if (!rule) throw new HttpException("Not Found", 404);

  // 3) Map to API DTO with proper date conversions and branding
  const output = {
    id: rule.id as string & tags.Format<"uuid">,
    orderIndex: Number(rule.order_index) as number &
      tags.Type<"int32"> &
      tags.Minimum<1>,
    text: rule.text as string & tags.MaxLength<100>,
    createdAt: toISOStringSafe(rule.created_at),
    updatedAt: toISOStringSafe(rule.updated_at),
  } satisfies ICommunityPlatformCommunityRule;

  return output;
}
