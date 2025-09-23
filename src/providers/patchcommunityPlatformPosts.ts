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
 * List/search posts (community_platform_posts) with pagination and sorting.
 *
 * Returns a filtered, paginated list of post summaries. Supports free-text
 * search across title and body (min length 2), optional community filter, and
 * canonical sorting:
 *
 * - Newest: created_at desc, then id desc
 * - Top: score (up - down) desc; ties by created_at desc, then id desc
 *
 * Records with non-null deleted_at are excluded. Optionally excludes posts from
 * disabled communities when exclude_disabled_communities !== false. Public
 * endpoint: no authentication required.
 *
 * @param props - Request properties
 * @param props.body - Search, filter, sort, and pagination parameters
 * @returns Paginated page of post summaries
 * @throws {HttpException} 400 when search query is provided but shorter than 2
 *   characters
 */
export async function patchcommunityPlatformPosts(props: {
  body: ICommunityPlatformPost.IRequest;
}): Promise<IPageICommunityPlatformPost.ISummary> {
  const { body } = props;

  // Validate search length when provided
  const rawQuery = body.search ?? undefined;
  const trimmed =
    rawQuery !== undefined && rawQuery !== null ? rawQuery.trim() : undefined;
  if (trimmed !== undefined && trimmed.length > 0 && trimmed.length < 2) {
    throw new HttpException(
      "Bad Request: search query must be at least 2 characters",
      400,
    );
  }
  if (trimmed === "") {
    throw new HttpException(
      "Bad Request: search query must be at least 2 characters",
      400,
    );
  }

  // Pagination defaults/sanitization
  const requestedPage = Number(body.page ?? 1);
  const requestedLimit = Number(body.limit ?? 20);
  const page = Number(requestedPage > 0 ? requestedPage : 1);
  const limit = Number(requestedLimit > 0 ? requestedLimit : 20);
  const skip = (page - 1) * limit;

  const excludeDisabled = body.exclude_disabled_communities !== false;

  // Base where condition (soft-deleted excluded)
  const whereCondition = {
    deleted_at: null,
    ...(body.community_id !== undefined && {
      community_platform_community_id: body.community_id,
    }),
    ...(excludeDisabled && {
      community: { disabled_at: null },
    }),
    ...(trimmed && {
      OR: [{ title: { contains: trimmed } }, { body: { contains: trimmed } }],
    }),
  } as const;

  // Total count with same filters
  const total = await MyGlobal.prisma.community_platform_posts.count({
    where: whereCondition,
  });

  // Helper to compute comment counts for a set of post IDs
  const computeCommentCounts = async (
    ids: (string & tags.Format<"uuid">)[],
  ): Promise<Record<string, number>> => {
    if (ids.length === 0) return {};
    const grouped = await MyGlobal.prisma.community_platform_comments.groupBy({
      by: ["community_platform_comment_id"],
    });
    // Correct groupBy over comments
    const byPost = await MyGlobal.prisma.community_platform_comments.groupBy({
      by: ["community_platform_post_id"],
      where: {
        community_platform_post_id: { in: ids },
        deleted_at: null,
      },
      _count: { _all: true },
    });
    const map: Record<string, number> = {};
    for (const row of byPost)
      map[row.community_platform_post_id] = row._count._all;
    return map;
  };

  // Helper to compute vote score (up - down) for a set of post IDs
  const computeScores = async (
    ids: (string & tags.Format<"uuid">)[],
  ): Promise<Record<string, number>> => {
    if (ids.length === 0) return {};
    const byState = await MyGlobal.prisma.community_platform_post_votes.groupBy(
      {
        by: ["community_platform_post_id", "state"],
        where: {
          community_platform_post_id: { in: ids },
          deleted_at: null,
        },
        _count: { _all: true },
      },
    );
    const scores: Record<string, number> = {};
    for (const row of byState) {
      const pid = row.community_platform_post_id as string;
      const state = String(row.state).toLowerCase();
      const delta =
        state === "up" || state === "upvote"
          ? 1
          : state === "down" || state === "downvote"
            ? -1
            : 0;
      const prev = scores[pid] ?? 0;
      scores[pid] = prev + delta * row._count._all;
    }
    return scores;
  };

  // Sorting and data retrieval
  const sortMode = body.sort ?? "newest";

  if (sortMode === "top") {
    // Compute scores for all matching posts and sort in application layer
    const allPosts = await MyGlobal.prisma.community_platform_posts.findMany({
      where: whereCondition,
      select: {
        id: true,
        created_at: true,
      },
    });

    if (allPosts.length === 0) {
      return {
        pagination: {
          current: Number(page),
          limit: Number(limit),
          records: Number(total),
          pages: Number(limit > 0 ? Math.ceil(total / limit) : 0),
        },
        data: [],
      };
    }

    const allIds = allPosts.map((p) => p.id as string & tags.Format<"uuid">);
    const scoreMap = await computeScores(allIds);

    const enriched = allPosts.map((p) => ({
      id: p.id as string & tags.Format<"uuid">,
      created_at: p.created_at,
      score: scoreMap[p.id] ?? 0,
    }));

    enriched.sort((a, b) => {
      const s = b.score - a.score;
      if (s !== 0) return s;
      const t =
        (b.created_at as Date).getTime() - (a.created_at as Date).getTime();
      if (t !== 0) return t;
      return (b.id as string).localeCompare(a.id as string);
    });

    const slice = enriched.slice(skip, skip + limit);
    const pageIds = slice.map((e) => e.id);

    const [rows, commentCounts] = await Promise.all([
      MyGlobal.prisma.community_platform_posts.findMany({
        where: { id: { in: pageIds } },
        select: {
          id: true,
          community_platform_community_id: true,
          author_user_id: true,
          title: true,
          author_display_name: true,
          created_at: true,
          community: { select: { name: true } },
        },
      }),
      computeCommentCounts(pageIds),
    ]);

    const scoreForPage: Record<string, number> = {};
    for (const e of slice) scoreForPage[e.id] = e.score;

    const rowMap = new Map<string, (typeof rows)[number]>();
    for (const r of rows) rowMap.set(r.id, r);

    const ordered = pageIds
      .map((id) => rowMap.get(id))
      .filter((v): v is NonNullable<typeof v> => !!v);

    const data = ordered.map((p) => ({
      id: p.id as string & tags.Format<"uuid">,
      community_platform_community_id:
        p.community_platform_community_id as string & tags.Format<"uuid">,
      community_name: p.community?.name ?? undefined,
      author_user_id:
        p.author_user_id === null
          ? null
          : (p.author_user_id as string & tags.Format<"uuid">),
      title: p.title,
      author_display_name: p.author_display_name ?? null,
      created_at: toISOStringSafe(p.created_at),
      score: scoreForPage[p.id] ?? 0,
      comment_count: commentCounts[p.id] ?? 0,
    }));

    return {
      pagination: {
        current: Number(page),
        limit: Number(limit),
        records: Number(total),
        pages: Number(limit > 0 ? Math.ceil(total / limit) : 0),
      },
      data,
    };
  }

  // Default: newest
  const posts = await MyGlobal.prisma.community_platform_posts.findMany({
    where: whereCondition,
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    skip,
    take: limit,
    select: {
      id: true,
      community_platform_community_id: true,
      author_user_id: true,
      title: true,
      author_display_name: true,
      created_at: true,
      community: { select: { name: true } },
    },
  });

  const ids = posts.map((p) => p.id as string & tags.Format<"uuid">);
  const [commentCounts, scores] = await Promise.all([
    computeCommentCounts(ids),
    computeScores(ids),
  ]);

  const data = posts.map((p) => ({
    id: p.id as string & tags.Format<"uuid">,
    community_platform_community_id:
      p.community_platform_community_id as string & tags.Format<"uuid">,
    community_name: p.community?.name ?? undefined,
    author_user_id:
      p.author_user_id === null
        ? null
        : (p.author_user_id as string & tags.Format<"uuid">),
    title: p.title,
    author_display_name: p.author_display_name ?? null,
    created_at: toISOStringSafe(p.created_at),
    score: scores[p.id] ?? 0,
    comment_count: commentCounts[p.id] ?? 0,
  }));

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(total),
      pages: Number(limit > 0 ? Math.ceil(total / limit) : 0),
    },
    data,
  };
}
