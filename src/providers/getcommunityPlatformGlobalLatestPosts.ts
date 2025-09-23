import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { IPageICommunityPlatformGlobalLatestPost } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformGlobalLatestPost";

/**
 * Get Global Latest posts from mv_community_platform_global_latest_posts
 *
 * Returns a public, read-only list of up to 10 most recent posts across all
 * communities, backed by the materialized view
 * mv_community_platform_global_latest_posts. It provides denormalized fields
 * (title, author_display_name, community_name, score, comment_count) for fast
 * sidebar rendering.
 *
 * Ordering: newest-first by created_at with a stable tie-breaker.
 * Authentication: Not required. Behavior: Returns empty list when no records
 * exist.
 *
 * @returns Container of pagination info and up to 10 latest post summaries
 * @throws {Error} On unexpected database errors
 */
export async function getcommunityPlatformGlobalLatestPosts(): Promise<IPageICommunityPlatformGlobalLatestPost.ISummary> {
  const limit = 10;

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.mv_community_platform_global_latest_posts.findMany({
      orderBy: [{ created_at: "desc" }, { community_platform_post_id: "desc" }],
      take: limit,
    }),
    MyGlobal.prisma.mv_community_platform_global_latest_posts.count({}),
  ]);

  return {
    pagination: {
      current: 1,
      limit: limit,
      records: total,
      pages: Math.ceil(total / limit),
    },
    data: rows.map((r) => ({
      id: r.id as string & tags.Format<"uuid">,
      community_platform_post_id: r.community_platform_post_id as string &
        tags.Format<"uuid">,
      community_platform_community_id:
        r.community_platform_community_id as string & tags.Format<"uuid">,
      community_platform_user_id: r.community_platform_user_id as string &
        tags.Format<"uuid">,
      created_at: toISOStringSafe(r.created_at),
      refreshed_at: toISOStringSafe(r.refreshed_at),
      title: r.title,
      author_display_name:
        r.author_display_name === null ? undefined : r.author_display_name,
      community_name: r.community_name,
      score: r.score,
      comment_count: r.comment_count,
    })),
  };
}
