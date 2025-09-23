import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";

export async function getcommunityPlatformPostsPostId(props: {
  postId: string & tags.Format<"uuid">;
}): Promise<ICommunityPlatformPost> {
  /**
   * Get a single post (community_platform_posts) by ID
   *
   * Retrieves a public, active post by its identifier. Only returns posts where
   * deleted_at is null (active). Includes title, body, optional
   * author_display_name, community reference, and lifecycle timestamps. No
   * authentication is required for this read-only operation.
   *
   * @param props - Request properties
   * @param props.postId - UUID of the post to retrieve
   * @returns Full post details for display
   * @throws {HttpException} Not Found (404) when the post does not exist or is
   *   deleted
   */
  const row = await MyGlobal.prisma.community_platform_posts.findFirst({
    where: {
      id: props.postId,
      deleted_at: null,
    },
    select: {
      id: true,
      community_platform_community_id: true,
      author_user_id: true,
      title: true,
      body: true,
      author_display_name: true,
      created_at: true,
      updated_at: true,
    },
  });

  if (!row) {
    throw new HttpException("Not Found", 404);
  }

  return {
    id: row.id as string & tags.Format<"uuid">,
    community_platform_community_id:
      row.community_platform_community_id as string & tags.Format<"uuid">,
    author_user_id:
      row.author_user_id === null
        ? null
        : (row.author_user_id as string & tags.Format<"uuid">),
    title: row.title,
    body: row.body,
    author_display_name:
      row.author_display_name === null ? null : row.author_display_name,
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
    deleted_at: null,
  };
}
