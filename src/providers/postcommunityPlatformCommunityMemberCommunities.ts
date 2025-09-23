import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import { CommunitymemberPayload } from "../decorators/payload/CommunitymemberPayload";

/**
 * Create a community (community_platform_communities) with immutable name,
 * category, and optional metadata.
 *
 * Creates a new community owned by the authenticated community member. It
 * verifies:
 *
 * - The requester is a community member (payload.type === "communityMember")
 * - The category exists, is active, and not soft-deleted
 * - The name is not a reserved term for applies_to = "community_name"
 *   (case-insensitive via term_normalized)
 * - The name is unique (pre-check and DB unique constraint handling)
 *
 * Sets lifecycle timestamps (created_at, updated_at, last_active_at) to now
 * (ISO-8601) and initializes disabled_at and deleted_at as null. The community
 * name is immutable post-creation by business rules.
 *
 * @param props - Request properties
 * @param props.communityMember - The authenticated community member payload
 *   (owner user id)
 * @param props.body - Creation payload containing name, category id, and
 *   optional description/logo/banner
 * @returns The created community entity
 * @throws {HttpException} 401/403 when payload type is not communityMember
 * @throws {HttpException} 404 when category does not exist or is
 *   inactive/deleted
 * @throws {HttpException} 409 when name conflicts or is reserved
 */
export async function postcommunityPlatformCommunityMemberCommunities(props: {
  communityMember: CommunitymemberPayload;
  body: ICommunityPlatformCommunity.ICreate;
}): Promise<ICommunityPlatformCommunity> {
  const { communityMember, body } = props;

  if (!communityMember || communityMember.type !== "communityMember") {
    throw new HttpException(
      "Unauthorized: community member role required",
      403,
    );
  }

  // Prepare values
  const ownerUserId = communityMember.id; // branded uuid from payload
  const categoryId = body.community_platform_category_id; // branded uuid from request
  const name = body.name;
  const normalizedName = name.toLowerCase();

  // 1) Reserved term check (case-insensitive via term_normalized)
  const reserved =
    await MyGlobal.prisma.community_platform_reserved_terms.findFirst({
      where: {
        applies_to: "community_name",
        active: true,
        deleted_at: null,
        term_normalized: normalizedName,
      },
      select: { id: true },
    });
  if (reserved) {
    throw new HttpException("Conflict: Reserved community name", 409);
  }

  // 2) Validate category exists and active (and not soft-deleted)
  const category =
    await MyGlobal.prisma.community_platform_categories.findFirst({
      where: {
        id: categoryId,
        active: true,
        deleted_at: null,
      },
      select: { id: true },
    });
  if (!category) {
    throw new HttpException("Not Found: Invalid or inactive category id", 404);
  }

  // 3) Pre-check name uniqueness (complimentary to DB unique)
  const existingByName =
    await MyGlobal.prisma.community_platform_communities.findFirst({
      where: { name },
      select: { id: true },
    });
  if (existingByName) {
    throw new HttpException("Conflict: Community name already exists", 409);
  }

  const id = v4() as string & tags.Format<"uuid">;
  const now = toISOStringSafe(new Date());

  try {
    await MyGlobal.prisma.community_platform_communities.create({
      data: {
        id,
        community_platform_user_id: ownerUserId,
        community_platform_category_id: categoryId,
        name,
        description: body.description ?? null,
        logo: body.logo ?? null,
        banner: body.banner ?? null,
        last_active_at: now,
        disabled_at: null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // Unique constraint violation (e.g., name)
      if (err.code === "P2002") {
        throw new HttpException("Conflict: Community name already exists", 409);
      }
    }
    throw err;
  }

  // Build response using prepared values for timestamps (avoid Date conversions from Prisma)
  const response: ICommunityPlatformCommunity = {
    id,
    community_platform_user_id: ownerUserId,
    community_platform_category_id: categoryId,
    name,
    description: body.description ?? null,
    logo: body.logo ?? null,
    banner: body.banner ?? null,
    last_active_at: now,
    disabled_at: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  return response;
}
