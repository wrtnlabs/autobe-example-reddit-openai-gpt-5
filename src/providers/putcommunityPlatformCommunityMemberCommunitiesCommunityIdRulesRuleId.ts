import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRule";
import { CommunitymemberPayload } from "../decorators/payload/CommunitymemberPayload";

/**
 * Update a community rule in community_platform_community_rules
 *
 * Modifies an existing rule (order_index, text) under the specified community.
 * Ensures the rule exists, is not soft-deleted, and belongs to the provided
 * community. Only the community owner is authorized to update rules. The
 * operation enforces per-community order_index uniqueness and updates
 * updated_at.
 *
 * @param props - Request properties
 * @param props.communityMember - Authenticated community member (must own the
 *   community)
 * @param props.communityId - UUID of the parent community owning the rule
 * @param props.ruleId - UUID of the rule to update
 * @param props.body - Update payload (order_index and/or text)
 * @returns The updated rule record
 * @throws {HttpException} 403 when caller is not the community owner
 * @throws {HttpException} 404 when community/rule not found or rule deleted
 * @throws {HttpException} 409 when order_index duplicates within the community
 */
export async function putcommunityPlatformCommunityMemberCommunitiesCommunityIdRulesRuleId(props: {
  communityMember: CommunitymemberPayload;
  communityId: string & tags.Format<"uuid">;
  ruleId: string & tags.Format<"uuid">;
  body: ICommunityPlatformCommunityRule.IUpdate;
}): Promise<ICommunityPlatformCommunityRule> {
  const { communityMember, communityId, ruleId, body } = props;

  // Authorization: verify community exists, not deleted, and owned by caller
  const community =
    await MyGlobal.prisma.community_platform_communities.findFirst({
      where: {
        id: communityId,
        deleted_at: null,
      },
      select: {
        id: true,
        community_platform_user_id: true,
      },
    });
  if (!community) throw new HttpException("Not Found", 404);
  if (community.community_platform_user_id !== communityMember.id) {
    throw new HttpException(
      "Forbidden: Only the community owner can update rules",
      403,
    );
  }

  // Ensure rule exists within the community and is active (not soft-deleted)
  const rule =
    await MyGlobal.prisma.community_platform_community_rules.findFirst({
      where: {
        id: ruleId,
        community_platform_community_id: communityId,
        deleted_at: null,
      },
      select: { id: true },
    });
  if (!rule) throw new HttpException("Not Found", 404);

  // Enforce unique order_index per community when provided
  if (body.order_index !== undefined && body.order_index !== null) {
    const duplicate =
      await MyGlobal.prisma.community_platform_community_rules.findFirst({
        where: {
          community_platform_community_id: communityId,
          deleted_at: null,
          order_index: body.order_index,
          id: { not: ruleId },
        },
        select: { id: true },
      });
    if (duplicate) {
      throw new HttpException(
        "Conflict: order_index must be unique within the community",
        409,
      );
    }
  }

  // Prepare timestamp
  const now = toISOStringSafe(new Date());

  try {
    const updated =
      await MyGlobal.prisma.community_platform_community_rules.update({
        where: { id: ruleId },
        data: {
          order_index:
            body.order_index === null
              ? undefined
              : (body.order_index ?? undefined),
          text: body.text === null ? undefined : (body.text ?? undefined),
          updated_at: now,
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

    return {
      id: updated.id,
      community_platform_community_id: updated.community_platform_community_id,
      order_index: updated.order_index,
      text: updated.text,
      created_at: toISOStringSafe(updated.created_at),
      updated_at: now,
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // Unique constraint violation (order_index per community)
      if (err.code === "P2002") {
        throw new HttpException(
          "Conflict: order_index already exists in this community",
          409,
        );
      }
    }
    throw err;
  }
}
