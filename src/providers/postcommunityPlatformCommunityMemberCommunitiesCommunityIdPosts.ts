import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import { CommunitymemberPayload } from "../decorators/payload/CommunitymemberPayload";

export async function postcommunityPlatformCommunityMemberCommunitiesCommunityIdPosts(props: {
  communityMember: CommunitymemberPayload;
  communityId: string & tags.Format<"uuid">;
  body: ICommunityPlatformPost.ICreate;
}): Promise<ICommunityPlatformPost> {
  /**
   * Create a post (community_platform_posts) within a specific community
   *
   * Creates a new text-only post associated with the target community (via path
   * parameter) and the authenticated author (community member). Applies
   * application-layer constraints for title/body length and optional author
   * display name. Sets created_at/updated_at timestamps and returns the created
   * post.
   *
   * Authorization: Requires an authenticated community member. The target
   * community must exist and not be disabled or deleted.
   *
   * @param props - Request context
   * @param props.communityMember - Authenticated community member payload
   * @param props.communityId - Target community UUID path parameter
   * @param props.body - Post creation payload (title, body, optional display
   *   name)
   * @returns The created post with full details
   * @throws {HttpException} 401 When authentication is missing
   * @throws {HttpException} 404 When target community is not found or inactive
   * @throws {HttpException} 400 When validation constraints are violated
   */
  const { communityMember, communityId, body } = props;

  // Auth presence check (defensive; decorator should guarantee)
  if (!communityMember) {
    throw new HttpException("Unauthorized", 401);
  }

  // Validate inputs according to business rules
  const title = body.title;
  const content = body.body;
  const displayName = body.author_display_name ?? null;

  if (typeof title !== "string" || title.length < 5 || title.length > 120) {
    throw new HttpException(
      "Bad Request: Title must be 5–120 characters.",
      400,
    );
  }
  if (
    typeof content !== "string" ||
    content.length < 10 ||
    content.length > 10000
  ) {
    throw new HttpException(
      "Bad Request: Body must be 10–10,000 characters.",
      400,
    );
  }
  if (
    displayName !== null &&
    (typeof displayName !== "string" || displayName.length > 32)
  ) {
    throw new HttpException(
      "Bad Request: author_display_name must be a string up to 32 characters.",
      400,
    );
  }

  // Ensure target community exists and is active (not disabled/deleted)
  const targetCommunity =
    await MyGlobal.prisma.community_platform_communities.findFirst({
      where: {
        id: communityId,
        deleted_at: null,
        disabled_at: null,
      },
      select: { id: true },
    });
  if (!targetCommunity) {
    throw new HttpException(
      "Not Found: Target community does not exist or is inactive.",
      404,
    );
  }

  // Prepare identifiers and timestamps
  const postId = v4() as string & tags.Format<"uuid">;
  const now = toISOStringSafe(new Date());

  // Create the post (inline data per rules)
  await MyGlobal.prisma.community_platform_posts.create({
    data: {
      id: postId,
      community_platform_community_id: communityId,
      author_user_id: communityMember.id,
      title: title,
      body: content,
      author_display_name: displayName ?? null,
      created_at: now,
      updated_at: now,
      // deleted_at omitted on creation (defaults to NULL)
    },
  });

  // Build and return API response using prepared values
  return {
    id: postId,
    community_platform_community_id: communityId,
    author_user_id: communityMember.id,
    title: title,
    body: content,
    author_display_name: displayName ?? null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}
