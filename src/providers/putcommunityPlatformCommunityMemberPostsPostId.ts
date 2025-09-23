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
 * Update an existing post (community_platform_posts) by ID
 *
 * Modify a post’s mutable fields (title, body, author_display_name). The
 * community and author are immutable here. Only the original author may update;
 * otherwise a 403 is thrown with the standardized message.
 *
 * Business validation enforced:
 *
 * - Title: 5–120 characters (when provided)
 * - Body: 10–10,000 characters; plain text only (no HTML/scripts) (when provided)
 * - Author_display_name: 0–32 characters (when provided; null clears)
 *
 * Side effect: Appends a snapshot to community_platform_post_snapshots
 * capturing the pre-update state for audit/versioning.
 *
 * @param props - Request properties
 * @param props.communityMember - The authenticated community member (author)
 * @param props.postId - UUID of the post to update
 * @param props.body - Fields to update (title/body/author_display_name)
 * @returns The updated post resource
 * @throws {HttpException} 403 When the requester is not the author
 * @throws {HttpException} 404 When the post is not found
 * @throws {HttpException} 400 When validation fails
 */
export async function putcommunityPlatformCommunityMemberPostsPostId(props: {
  communityMember: CommunitymemberPayload;
  postId: string & tags.Format<"uuid">;
  body: ICommunityPlatformPost.IUpdate;
}): Promise<ICommunityPlatformPost> {
  const { communityMember, postId, body } = props;

  // 1) Load target post (throws 404 if not found)
  const existing =
    await MyGlobal.prisma.community_platform_posts.findUniqueOrThrow({
      where: { id: postId },
      select: {
        id: true,
        community_platform_community_id: true,
        author_user_id: true,
        title: true,
        body: true,
        author_display_name: true,
        created_at: true,
        updated_at: true,
        deleted_at: true,
      },
    });

  // 2) Authorization: only the author can edit
  if (
    !existing.author_user_id ||
    existing.author_user_id !== communityMember.id
  ) {
    throw new HttpException(
      "You can edit or delete only items you authored.",
      403,
    );
  }

  // 3) Business validations
  if (body.title !== undefined) {
    const len = body.title.length;
    if (len < 5 || len > 120) {
      throw new HttpException("Title must be 5–120 characters.", 400);
    }
  }
  if (body.body !== undefined) {
    const len = body.body.length;
    if (len < 10 || len > 10000) {
      throw new HttpException("Body must be 10–10,000 characters.", 400);
    }
    // Plain text constraint: reject likely HTML/script content
    if (body.body.includes("<") || body.body.includes(">")) {
      throw new HttpException(
        "Body must be plain text (no HTML or scripts).",
        400,
      );
    }
  }
  if (
    body.author_display_name !== undefined &&
    body.author_display_name !== null
  ) {
    const len = body.author_display_name.length;
    if (len < 0 || len > 32) {
      throw new HttpException(
        "Author display name must be 0–32 characters.",
        400,
      );
    }
  }

  // 4) Create snapshot of the previous state (append-only)
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());
  await MyGlobal.prisma.community_platform_post_snapshots.create({
    data: {
      id: v4() as string & tags.Format<"uuid">,
      community_platform_post_id: existing.id as string & tags.Format<"uuid">,
      editor_user_id: communityMember.id,
      title: existing.title,
      body: existing.body,
      author_display_name: existing.author_display_name ?? null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
  });

  // 5) Update the post
  const updated = await MyGlobal.prisma.community_platform_posts.update({
    where: { id: postId },
    data: {
      title: body.title ?? undefined,
      body: body.body ?? undefined,
      author_display_name:
        body.author_display_name === null
          ? null
          : (body.author_display_name ?? undefined),
      updated_at: now,
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
      deleted_at: true,
    },
  });

  // 6) Build response with proper date conversions and null/undefined handling
  const result = {
    id: postId,
    community_platform_community_id:
      updated.community_platform_community_id as string & tags.Format<"uuid">,
    author_user_id:
      updated.author_user_id === null
        ? null
        : (updated.author_user_id as string & tags.Format<"uuid">),
    title: updated.title,
    body: updated.body,
    author_display_name: updated.author_display_name ?? null,
    created_at: toISOStringSafe(updated.created_at),
    updated_at: now,
    deleted_at: updated.deleted_at ? toISOStringSafe(updated.deleted_at) : null,
  } satisfies ICommunityPlatformPost;

  return result;
}
