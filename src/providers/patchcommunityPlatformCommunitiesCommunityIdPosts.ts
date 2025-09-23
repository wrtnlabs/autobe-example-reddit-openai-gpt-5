import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import { IPageICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformPost";

/**
 * Search and list posts for a community from community_platform_posts with
 * sorting and pagination.
 *
 * Retrieves a filtered, sorted, and paginated list of post summaries within the
 * specified community. Applies default exclusion of logically deleted posts and
 * optionally suppresses disabled communities from listings. Supports free-text
 * search on title/body, created_at range filters, and two sort modes (newest,
 * top).
 *
 * Sorting rules:
 *
 * - Newest: created_at DESC, tie-breaker by larger id (DESC)
 * - Top: score DESC (up - down from active votes), then created_at DESC, then id
 *   DESC
 *
 * @param props - Request properties
 * @param props.communityId - UUID of the community to list posts from
 * @param props.body - Filter, search, sort, and pagination parameters
 * @returns Paginated post summaries optimized for feed/list UIs
 * @throws {HttpException} 400 When input parameters are invalid (e.g., short
 *   search)
 * @throws {HttpException} 404 When the community does not exist
 */
export async function patchcommunityPlatformCommunitiesCommunityIdPosts(props: {
  communityId: string & tags.Format<"uuid">;
  body: ICommunityPlatformPost.IRequest;
}): Promise<IPageICommunityPlatformPost.ISummary> {
  const { communityId, body } = props;

  // Validate community existence (exclude logically deleted)
  const community =
    await MyGlobal.prisma.community_platform_communities.findFirst({
      where: {
        id: communityId,
        deleted_at: null,
      },
      select: {
        id: true,
        name: true,
        disabled_at: true,
      },
    });
  if (!community) throw new HttpException("Community not found", 404);

  // Suppress disabled communities when requested (default: true)
  if (
    body.exclude_disabled_communities !== false &&
    community.disabled_at !== null
  ) {
    const current = Math.max(0, Number(body.page ?? 0));
    const limit = Math.max(1, Math.min(100, Number(body.limit ?? 20)));
    return {
      pagination: {
        current: Number(current),
        limit: Number(limit),
        records: Number(0),
        pages: Number(0),
      },
      data: [],
    };
  }

  // Validate search (if provided)
  if (body.search !== undefined && body.search !== null) {
    if (body.search.trim().length < 2) {
      throw new HttpException(
        "Bad Request: search must be at least 2 characters when provided",
        400,
      );
    }
  }

  // Pagination defaults and clamping
  const page = Math.max(0, Number(body.page ?? 0));
  const limit = Math.max(1, Math.min(100, Number(body.limit ?? 20)));
  const skip = page * limit;

  // Build and execute base post query (community scoped, not deleted)
  const posts = await MyGlobal.prisma.community_platform_posts.findMany({
    where: {
      community_platform_community_id: communityId,
      deleted_at: null,
      ...(body.created_from !== undefined &&
        body.created_from !== null && {
          created_at: {
            gte: body.created_from,
            ...(body.created_to !== undefined &&
              body.created_to !== null && { lte: body.created_to }),
          },
        }),
      // If only created_to is provided
      ...((body.created_from === undefined || body.created_from === null) &&
        body.created_to !== undefined &&
        body.created_to !== null && {
          created_at: { lte: body.created_to },
        }),
      ...(body.search !== undefined &&
        body.search !== null &&
        body.search.trim().length >= 2 && {
          OR: [
            { title: { contains: body.search } },
            { body: { contains: body.search } },
          ],
        }),
    },
    select: {
      id: true,
      community_platform_community_id: true,
      author_user_id: true,
      title: true,
      author_display_name: true,
      created_at: true,
    },
  });

  // Prepare ID list for aggregations
  const postIds = posts.map((p) => p.id);

  // Aggregate votes for score (active votes only)
  const votes = postIds.length
    ? await MyGlobal.prisma.community_platform_post_votes.findMany({
        where: {
          community_platform_post_id: { in: postIds },
          deleted_at: null,
        },
        select: {
          community_platform_post_id: true,
          state: true,
        },
      })
    : [];

  const scoreByPost = new Map<string, number>();
  for (const v of votes) {
    const key = v.community_platform_post_id;
    const prev = scoreByPost.get(key) ?? 0;
    const s = typeof v.state === "string" ? v.state.toLowerCase() : "";
    const delta =
      s === "up" || s === "upvote"
        ? 1
        : s === "down" || s === "downvote"
          ? -1
          : 0;
    scoreByPost.set(key, prev + delta);
  }

  // Aggregate comment counts (active comments only)
  const comments = postIds.length
    ? await MyGlobal.prisma.community_platform_comments.findMany({
        where: {
          community_platform_post_id: { in: postIds },
          deleted_at: null,
        },
        select: { community_platform_post_id: true },
      })
    : [];
  const commentCountByPost = new Map<string, number>();
  for (const c of comments) {
    const key = c.community_platform_post_id;
    commentCountByPost.set(key, (commentCountByPost.get(key) ?? 0) + 1);
  }

  // In-memory sort according to requested mode
  const sortMode = body.sort === "top" ? "top" : "newest";
  const sorted = [...posts].sort((a, b) => {
    if (sortMode === "top") {
      const sa = scoreByPost.get(a.id) ?? 0;
      const sb = scoreByPost.get(b.id) ?? 0;
      if (sb !== sa) return sb - sa; // score DESC
      const t = b.created_at.getTime() - a.created_at.getTime();
      if (t !== 0) return t; // created_at DESC
      return b.id.localeCompare(a.id); // id DESC
    }
    // newest
    const t = b.created_at.getTime() - a.created_at.getTime();
    if (t !== 0) return t; // created_at DESC
    return b.id.localeCompare(a.id); // id DESC
  });

  // Pagination slice
  const total = sorted.length;
  const pageItems = sorted.slice(skip, skip + limit);

  // Build summaries
  const data = pageItems.map((p) => ({
    id: p.id as string & tags.Format<"uuid">,
    community_platform_community_id:
      p.community_platform_community_id as string & tags.Format<"uuid">,
    community_name: community.name ?? undefined,
    author_user_id: p.author_user_id
      ? (p.author_user_id as string & tags.Format<"uuid">)
      : null,
    title: p.title,
    author_display_name: p.author_display_name ?? null,
    created_at: toISOStringSafe(p.created_at),
    score: (scoreByPost.get(p.id) ?? 0) as number & tags.Type<"int32">,
    comment_count: (commentCountByPost.get(p.id) ?? 0) as number &
      tags.Type<"int32">,
  }));

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(total),
      pages: Number(Math.ceil(total / limit)),
    },
    data,
  };
}
