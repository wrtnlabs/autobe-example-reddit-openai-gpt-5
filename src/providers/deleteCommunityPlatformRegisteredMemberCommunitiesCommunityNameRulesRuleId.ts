import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

/**
 * Delete (mark deleted_at) a community rule in
 * community_platform_community_rules
 *
 * Removes a Community Rule by soft-deleting it (setting deleted_at). The
 * operation resolves the parent community by its immutable name and enforces
 * authorization: only the community owner or a site admin may delete rules. The
 * rule must belong to the specified community. If already deleted, this
 * operation is idempotent.
 *
 * @param props - Request properties
 * @param props.registeredMember - Authenticated registered member payload (user
 *   context)
 * @param props.communityName - Immutable community name used to resolve the
 *   parent community
 * @param props.ruleId - UUID of the rule to delete
 * @returns Void (no content)
 * @throws {HttpException} 404 when community or rule not found, or rule not in
 *   community
 * @throws {HttpException} 403 when the user is neither community owner nor site
 *   admin
 */
export async function deleteCommunityPlatformRegisteredMemberCommunitiesCommunityNameRulesRuleId(props: {
  registeredMember: RegisteredmemberPayload;
  communityName: string;
  ruleId: string & tags.Format<"uuid">;
}): Promise<void> {
  const { registeredMember, communityName, ruleId } = props;

  // 1) Resolve community by name (must be active / not soft-deleted)
  const community =
    await MyGlobal.prisma.community_platform_communities.findFirst({
      where: { name: communityName, deleted_at: null },
      select: { id: true, community_platform_user_id: true },
    });
  if (!community) {
    throw new HttpException("Not Found: Community does not exist", 404);
  }

  // 2) Authorization: owner or active site admin
  const isOwner = community.community_platform_user_id === registeredMember.id;
  let isSiteAdmin = false;
  if (!isOwner) {
    const siteAdmin =
      await MyGlobal.prisma.community_platform_siteadmins.findFirst({
        where: {
          community_platform_user_id: registeredMember.id,
          revoked_at: null,
          deleted_at: null,
        },
        select: { id: true },
      });
    isSiteAdmin = !!siteAdmin;
  }
  if (!isOwner && !isSiteAdmin) {
    throw new HttpException(
      "Forbidden: Only the community owner or a site admin can delete rules",
      403,
    );
  }

  // 3) Load rule by id and verify it belongs to the resolved community
  const rule =
    await MyGlobal.prisma.community_platform_community_rules.findUnique({
      where: { id: ruleId },
      select: {
        id: true,
        community_platform_community_id: true,
        deleted_at: true,
      },
    });
  if (!rule) {
    throw new HttpException("Not Found: Rule does not exist", 404);
  }
  if (rule.community_platform_community_id !== community.id) {
    throw new HttpException(
      "Not Found: Rule not found in the specified community",
      404,
    );
  }

  // 4) Idempotent: if already deleted, succeed silently
  if (rule.deleted_at !== null) return;

  // 5) Soft delete: set deleted_at (and touch updated_at) to now
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());
  await MyGlobal.prisma.community_platform_community_rules.update({
    where: { id: ruleId },
    data: {
      deleted_at: now,
      updated_at: now,
    },
    select: { id: true },
  });

  return;
}
