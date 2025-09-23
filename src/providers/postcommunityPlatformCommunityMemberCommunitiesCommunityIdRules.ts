import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRule";
import { CommunitymemberPayload } from "../decorators/payload/CommunitymemberPayload";

export async function postcommunityPlatformCommunityMemberCommunitiesCommunityIdRules(props: {
  communityMember: CommunitymemberPayload;
  communityId: string & tags.Format<"uuid">;
  body: ICommunityPlatformCommunityRule.ICreate;
}): Promise<ICommunityPlatformCommunityRule> {
  /**
   * Create a community rule (community_platform_community_rules) for the
   * specified community
   *
   * Inserts a new ordered rule under the given community. Only the community
   * owner may create rules. Ensures per-community order_index uniqueness and
   * enforces text length constraints. Timestamps and id are populated by the
   * server.
   *
   * Authorization: requires communityMember authentication; must also be the
   * owner of the target community.
   *
   * @param props - Request properties
   * @param props.communityMember - Authenticated community member payload
   * @param props.communityId - Parent community ID (UUID)
   * @param props.body - Rule creation payload (order_index, text)
   * @returns The newly created rule entity
   * @throws {HttpException} 400 when validation fails
   * @throws {HttpException} 403 when not the owner or community disabled
   * @throws {HttpException} 404 when community not found (or soft-deleted)
   * @throws {HttpException} 409 when order_index duplicates within the
   *   community
   * @throws {HttpException} 500 on unexpected database errors
   */
  const { communityMember, communityId, body } = props;

  // Basic input validations (do not skip)
  if (body.text.length < 1 || body.text.length > 200) {
    throw new HttpException(
      "Bad Request: text must be between 1 and 200 characters",
      400,
    );
  }
  if (body.order_index < 0) {
    throw new HttpException(
      "Bad Request: order_index must be a non-negative integer",
      400,
    );
  }

  // Verify community exists and ownership
  const community =
    await MyGlobal.prisma.community_platform_communities.findUnique({
      where: { id: communityId },
      select: {
        id: true,
        community_platform_user_id: true,
        disabled_at: true,
        deleted_at: true,
      },
    });
  if (!community || community.deleted_at !== null) {
    throw new HttpException("Not Found: Community does not exist", 404);
  }
  if (community.community_platform_user_id !== communityMember.id) {
    throw new HttpException(
      "Forbidden: Only the community owner can create rules",
      403,
    );
  }
  if (community.disabled_at !== null) {
    throw new HttpException("Forbidden: Community is disabled", 403);
  }

  // Prepare identifiers and timestamps
  const id = v4() as string & tags.Format<"uuid">;
  const now = toISOStringSafe(new Date());

  try {
    await MyGlobal.prisma.community_platform_community_rules.create({
      data: {
        id,
        community_platform_community_id: communityId,
        order_index: body.order_index,
        text: body.text,
        created_at: now,
        updated_at: now,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        // Unique constraint violation on (community_platform_community_id, order_index)
        throw new HttpException(
          "Conflict: A rule with the same order_index already exists in this community",
          409,
        );
      }
    }
    throw new HttpException("Internal Server Error", 500);
  }

  // Return DTO using prepared values (avoid re-reading nullable dates)
  return {
    id,
    community_platform_community_id: communityId,
    order_index: body.order_index,
    text: body.text,
    created_at: now,
    updated_at: now,
  };
}
