import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import { CommunitymemberPayload } from "../decorators/payload/CommunitymemberPayload";

/**
 * Create a post (community_platform_posts) via global composer
 *
 * Creates a new text-only post in the specified community. The target community
 * is provided in the request body, and authorship is attributed to the
 * authenticated community member. Enforces business constraints on title/body
 * lengths and author_display_name length. Community must be active (not
 * disabled/deleted) and user must be active.
 *
 * @param props - Request properties
 * @param props.communityMember - The authenticated community member (top-level
 *   user payload)
 * @param props.body - The post creation payload including target community id,
 *   title, body, and optional author_display_name
 * @returns The created post with full details
 * @throws {HttpException} 400 When input validation fails (missing community
 *   id, invalid lengths)
 * @throws {HttpException} 403 When the authenticated user is not active
 * @throws {HttpException} 404 When the target community does not exist or is
 *   disabled/deleted
 */
export async function postcommunityPlatformCommunityMemberPosts(props: {
  communityMember: CommunitymemberPayload;
  body: ICommunityPlatformPost.ICreate;
}): Promise<ICommunityPlatformPost> {
  const { communityMember, body } = props;

  // 1) Validate required community id in global composer body
  if (
    body.community_platform_community_id === null ||
    body.community_platform_community_id === undefined
  ) {
    throw new HttpException(
      "Bad Request: community_platform_community_id is required for global composer",
      400,
    );
  }

  // 2) Validate title/body length constraints
  const title = body.title;
  if (title.length < 5 || title.length > 120) {
    throw new HttpException(
      "Bad Request: title length must be between 5 and 120 characters",
      400,
    );
  }
  const content = body.body;
  if (content.length < 10 || content.length > 10000) {
    throw new HttpException(
      "Bad Request: body length must be between 10 and 10000 characters",
      400,
    );
  }

  // 3) Validate author_display_name when provided (0..32, allow empty string and null)
  const display = body.author_display_name;
  if (display !== undefined && display !== null) {
    if (display.length > 32) {
      throw new HttpException(
        "Bad Request: author_display_name must be 0 to 32 characters",
        400,
      );
    }
  }

  // 4) Authorization: ensure user is active and not deleted
  const user = await MyGlobal.prisma.community_platform_users.findFirst({
    where: {
      id: communityMember.id,
      deleted_at: null,
      status: "active",
    },
  });
  if (user === null) {
    throw new HttpException("Forbidden: inactive or unknown user", 403);
  }

  // 5) Ensure target community exists and is not disabled/deleted
  const community =
    await MyGlobal.prisma.community_platform_communities.findFirst({
      where: {
        id: body.community_platform_community_id,
        deleted_at: null,
        disabled_at: null,
      },
    });
  if (community === null) {
    throw new HttpException(
      "Not Found: community unavailable for posting",
      404,
    );
  }

  // 6) Prepare identifiers and timestamps
  const id = v4() as string & tags.Format<"uuid">;
  const now = toISOStringSafe(new Date());

  // 7) Create the post
  await MyGlobal.prisma.community_platform_posts.create({
    data: {
      id,
      community_platform_community_id: body.community_platform_community_id,
      author_user_id: communityMember.id,
      title,
      body: content,
      author_display_name: display === null ? null : (display ?? undefined),
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
  });

  // 8) Build and return API DTO using prepared values to avoid Date leakage
  const result: ICommunityPlatformPost = {
    id,
    community_platform_community_id: body.community_platform_community_id,
    author_user_id: communityMember.id,
    title,
    body: content,
    author_display_name: display ?? null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  return result;
}
