import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import { IECommunityPlatformVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformVoteState";

/**
 * Get a single post (community_platform_posts) by UUID with score and comment
 * count.
 *
 * Fetches one post by its primary key, including minimal community info and
 * author label. Computes derived aggregates: score (upvotes - downvotes) and
 * commentCount (visible comments). Publicly readable; no authentication
 * required. Soft-deleted posts are treated as not found.
 *
 * @param props - Request properties
 * @param props.postId - Target post identifier (UUID) referencing
 *   community_platform_posts.id
 * @returns Detailed post information suitable for Post Detail rendering
 * @throws {HttpException} 404 Not Found when the post does not exist or is
 *   deleted
 */
export async function getCommunityPlatformPostsPostId(props: {
  postId: string & tags.Format<"uuid">;
}): Promise<ICommunityPlatformPost> {
  const post = await MyGlobal.prisma.community_platform_posts.findFirst({
    where: {
      id: props.postId,
      deleted_at: null,
    },
    include: {
      community: {
        select: { name: true, logo_uri: true },
      },
      author: {
        select: { id: true, display_name: true },
      },
    },
  });

  if (!post) {
    throw new HttpException("Not Found", 404);
  }

  const [upvotes, downvotes, visibleComments] = await Promise.all([
    MyGlobal.prisma.community_platform_post_votes.count({
      where: {
        community_platform_post_id: post.id,
        value: 1,
        deleted_at: null,
      },
    }),
    MyGlobal.prisma.community_platform_post_votes.count({
      where: {
        community_platform_post_id: post.id,
        value: -1,
        deleted_at: null,
      },
    }),
    MyGlobal.prisma.community_platform_comments.count({
      where: {
        community_platform_post_id: post.id,
        deleted_at: null,
      },
    }),
  ]);

  const score = upvotes - downvotes;
  const createdAt = toISOStringSafe(post.created_at);
  const updatedAt = toISOStringSafe(post.updated_at);

  const displayNameCandidate =
    post.author_display_name ?? post.author.display_name;

  return {
    id: post.id as string & tags.Format<"uuid">,
    community: {
      name: post.community.name as string &
        tags.MinLength<3> &
        tags.MaxLength<30> &
        tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$">,
      logoUrl:
        post.community.logo_uri === null
          ? null
          : (post.community.logo_uri as string & tags.MaxLength<80000>),
    },
    title: post.title as string & tags.MinLength<5> & tags.MaxLength<120>,
    body: post.body as string & tags.MinLength<10> & tags.MaxLength<10000>,
    author: {
      id: post.author.id as string & tags.Format<"uuid">,
      displayName: displayNameCandidate ?? null,
    },
    createdAt: createdAt,
    updatedAt: updatedAt,
    score: score as number & tags.Type<"int32">,
    commentCount: visibleComments as number &
      tags.Type<"int32"> &
      tags.Minimum<0>,
    myVote: null,
  };
}
