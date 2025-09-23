import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";

/**
 * Get a specific community (community_platform_communities) by ID for public
 * detail view
 *
 * Retrieves a single community by its UUID identifier from the
 * community_platform_communities table. Only communities not soft-deleted
 * (deleted_at = null) are returned. The result includes owner reference,
 * category linkage, immutable name, optional metadata (description, logo,
 * banner), last_active_at, disabled_at, and lifecycle timestamps.
 *
 * Public endpoint: no authentication required.
 *
 * @param props - Request properties
 * @param props.communityId - Unique identifier of the target community (UUID)
 * @returns Detailed community record as ICommunityPlatformCommunity
 * @throws {HttpException} Not Found (404) when the community does not exist or
 *   has been soft-deleted
 * @throws {HttpException} Internal Server Error (500) for unexpected database
 *   errors
 */
export async function getcommunityPlatformCommunitiesCommunityId(props: {
  communityId: string & tags.Format<"uuid">;
}): Promise<ICommunityPlatformCommunity> {
  try {
    const row =
      await MyGlobal.prisma.community_platform_communities.findFirstOrThrow({
        where: {
          id: props.communityId,
          deleted_at: null,
        },
        select: {
          id: true,
          community_platform_user_id: true,
          community_platform_category_id: true,
          name: true,
          description: true,
          logo: true,
          banner: true,
          last_active_at: true,
          disabled_at: true,
          created_at: true,
          updated_at: true,
          deleted_at: true,
        },
      });

    return {
      id: row.id as string & tags.Format<"uuid">,
      community_platform_user_id: row.community_platform_user_id as string &
        tags.Format<"uuid">,
      community_platform_category_id:
        row.community_platform_category_id as string & tags.Format<"uuid">,
      name: row.name as string &
        tags.MinLength<3> &
        tags.MaxLength<32> &
        tags.Pattern<"^[A-Za-z][A-Za-z0-9_-]{1,30}[A-Za-z0-9]$">,
      description: row.description ?? null,
      logo: (row.logo ?? null) as
        | (string & tags.MaxLength<80000> & tags.Format<"uri">)
        | null
        | undefined,
      banner: (row.banner ?? null) as
        | (string & tags.MaxLength<80000> & tags.Format<"uri">)
        | null
        | undefined,
      last_active_at: toISOStringSafe(row.last_active_at),
      disabled_at: row.disabled_at ? toISOStringSafe(row.disabled_at) : null,
      created_at: toISOStringSafe(row.created_at),
      updated_at: toISOStringSafe(row.updated_at),
      deleted_at: row.deleted_at ? toISOStringSafe(row.deleted_at) : null,
    };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      throw new HttpException("Not Found", 404);
    }
    throw new HttpException("Internal Server Error", 500);
  }
}
