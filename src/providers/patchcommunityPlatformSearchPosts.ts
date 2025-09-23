import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import { IPageICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformPost";

export async function patchcommunityPlatformSearchPosts(props: {
  body: ICommunityPlatformPost.IRequest;
}): Promise<IPageICommunityPlatformPost.ISummary> {
  /**
   * Search posts by title/body with pagination and sorting
   * (community_platform_posts).
   *
   * Provides search over posts with optional community scope and date range.
   * Excludes soft-deleted posts and, by default, posts in disabled communities.
   * Supports sorting by Newest (default) and Top (by score = upvotes −
   * downvotes) with deterministic tie-breakers (created_at desc, then id
   * desc).
   *
   * @param props - Request properties
   * @param props.body - Search query, sorting (Newest/Top), and pagination
   *   settings
   * @returns Paginated list of post summaries that match the criteria
   * @throws {HttpException} 400 when search is provided but shorter than 2
   *   characters
   */
  const { body } = props;

  // Validation: minimum query length when provided
  if (body.search !== undefined && body.search !== null) {
    const q = String(body.search).trim();
    if (q.length > 0 && q.length < 2) {
      throw new HttpException(
        "Bad Request: search must be at least 2 characters",
        400,
      );
    }
  }

  // Pagination defaults
  const pageNum = (body.page ?? 1) as number; // value usage only, no brand assertions
  const limitNum = (body.limit ?? 20) as number;
  const page = pageNum > 0 ? pageNum : 1;
  const limit = limitNum > 0 ? limitNum : 20;
  const skip = (page - 1) * limit;

  const excludeDisabled = body.exclude_disabled_communities !== false;
  const searchOk = !!(body.search && body.search.trim().length >= 2);

  // Build where condition (shared)
  const whereCondition = {
    deleted_at: null,
    ...(body.community_id !== undefined && {
      community_platform_community_id: body.community_id,
    }),
    ...(excludeDisabled && {
      community: { disabled_at: null },
    }),
    ...(body.created_from !== undefined || body.created_to !== undefined
      ? {
          created_at: {
            ...(body.created_from !== undefined && { gte: body.created_from }),
            ...(body.created_to !== undefined && { lte: body.created_to }),
          },
        }
      : {}),
    ...(searchOk
      ? {
          OR: [
            { title: { contains: body.search! } },
            { body: { contains: body.search! } },
          ],
        }
      : {}),
  };

  // Helper to create summary rows from records with provided maps
  const buildSummaries = (
    rows: Array<{
      id: string;
      community_platform_community_id: string;
      author_user_id: string | null;
      title: string;
      author_display_name: string | null;
      created_at: any;
      community: { name: string } | null;
    }>,
    scoreMap: Map<string, number>,
    commentCountMap: Map<string, number>,
  ): ICommunityPlatformPost.ISummary[] => {
    return rows.map((r) => {
      const idBranded = typia.assert<string & tags.Format<"uuid">>(r.id);
      const communityIdBranded = typia.assert<string & tags.Format<"uuid">>(
        r.community_platform_community_id,
      );
      const authorId =
        r.author_user_id === null
          ? null
          : typia.assert<string & tags.Format<"uuid">>(r.author_user_id);
      const createdIso = toISOStringSafe(r.created_at);
      const score = scoreMap.get(r.id) ?? 0;
      const commentCount = commentCountMap.get(r.id) ?? 0;

      const summary: ICommunityPlatformPost.ISummary = {
        id: idBranded,
        community_platform_community_id: communityIdBranded,
        community_name: r.community ? r.community.name : undefined,
        author_user_id: authorId,
        title: r.title,
        author_display_name: r.author_display_name ?? null,
        created_at: createdIso,
        score,
        comment_count: commentCount,
      };
      return summary;
    });
  };

  // COUNT total first (shared)
  const total = await MyGlobal.prisma.community_platform_posts.count({
    where: whereCondition,
  });

  const sortMode = body.sort === "top" ? "top" : "newest";

  if (sortMode === "newest") {
    // Fetch page rows ordered by created_at desc, then id desc
    const rows = await MyGlobal.prisma.community_platform_posts.findMany({
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

    const ids = rows.map((r) => r.id);

    const [voteGroups, commentGroups] = await Promise.all([
      ids.length === 0
        ? Promise.resolve([])
        : MyGlobal.prisma.community_platform_post_votes.groupBy({
            by: ["community_platform_post_id", "state"],
            where: {
              deleted_at: null,
              community_platform_post_id: { in: ids },
            },
            _count: { _all: true },
          }),
      ids.length === 0
        ? Promise.resolve([])
        : MyGlobal.prisma.community_platform_comments.groupBy({
            by: ["community_platform_post_id"],
            where: {
              deleted_at: null,
              community_platform_post_id: { in: ids },
            },
            _count: { _all: true },
          }),
    ]);

    const scoreMap = new Map<string, number>();
    for (const g of voteGroups as Array<{
      community_platform_post_id: string;
      state: string;
      _count: { _all: number };
    }>) {
      const pid = g.community_platform_post_id;
      const cur = scoreMap.get(pid) ?? 0;
      if (g.state === "up") scoreMap.set(pid, cur + g._count._all);
      else if (g.state === "down") scoreMap.set(pid, cur - g._count._all);
    }

    const commentCountMap = new Map<string, number>();
    for (const g of commentGroups as Array<{
      community_platform_post_id: string;
      _count: { _all: number };
    }>) {
      commentCountMap.set(g.community_platform_post_id, g._count._all);
    }

    const data = buildSummaries(rows, scoreMap, commentCountMap);

    return {
      pagination: {
        current: Number(page),
        limit: Number(limit),
        records: total,
        pages: Math.ceil(total / limit),
      },
      data,
    };
  }

  // TOP sort: fetch all candidate rows, compute scores, sort in app, then paginate
  const candidates = await MyGlobal.prisma.community_platform_posts.findMany({
    where: whereCondition,
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

  const candidateIds = candidates.map((r) => r.id);

  const [allVoteGroups, allCommentGroups] = await Promise.all([
    candidateIds.length === 0
      ? Promise.resolve([])
      : MyGlobal.prisma.community_platform_post_votes.groupBy({
          by: ["community_platform_post_id", "state"],
          where: {
            deleted_at: null,
            community_platform_post_id: { in: candidateIds },
          },
          _count: { _all: true },
        }),
    candidateIds.length === 0
      ? Promise.resolve([])
      : MyGlobal.prisma.community_platform_comments.groupBy({
          by: ["community_platform_post_id"],
          where: {
            deleted_at: null,
            community_platform_post_id: { in: candidateIds },
          },
          _count: { _all: true },
        }),
  ]);

  const scoreMapTop = new Map<string, number>();
  for (const g of allVoteGroups as Array<{
    community_platform_post_id: string;
    state: string;
    _count: { _all: number };
  }>) {
    const pid = g.community_platform_post_id;
    const cur = scoreMapTop.get(pid) ?? 0;
    if (g.state === "up") scoreMapTop.set(pid, cur + g._count._all);
    else if (g.state === "down") scoreMapTop.set(pid, cur - g._count._all);
  }

  const commentCountMapTop = new Map<string, number>();
  for (const g of allCommentGroups as Array<{
    community_platform_post_id: string;
    _count: { _all: number };
  }>) {
    commentCountMapTop.set(g.community_platform_post_id, g._count._all);
  }

  const sorted = candidates
    .map((r) => ({
      row: r,
      score: scoreMapTop.get(r.id) ?? 0,
      createdIso: toISOStringSafe(r.created_at),
    }))
    .sort((a, b) => {
      const dScore = b.score - a.score;
      if (dScore !== 0) return dScore;
      const dCreated = b.createdIso.localeCompare(a.createdIso);
      if (dCreated !== 0) return dCreated;
      return b.row.id.localeCompare(a.row.id);
    })
    .map((x) => x.row);

  const pageSlice = sorted.slice(skip, skip + limit);
  const dataTop = buildSummaries(pageSlice, scoreMapTop, commentCountMapTop);

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: total,
      pages: Math.ceil(total / limit),
    },
    data: dataTop,
  };
}
