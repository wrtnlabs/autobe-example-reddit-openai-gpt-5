import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import { IEPostSort } from "@ORGANIZATION/PROJECT-api/lib/structures/IEPostSort";
import { IPageICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformPost";
import { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import { ICommunityRef } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityRef";
import { IECommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityCategory";
import { IUserRef } from "@ORGANIZATION/PROJECT-api/lib/structures/IUserRef";
import { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import { IEVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IEVoteState";

export async function patchCommunityPlatformSearchPosts(props: {
  body: ICommunityPlatformPost.IRequest;
}): Promise<IPageICommunityPlatformPost.ISummary> {
  /**
   * Search posts (community_platform_posts) with sorting and cursor pagination.
   *
   * Public endpoint: searches text-only posts by title/body, excludes
   * soft-deleted records, supports sort=newest|top, and returns
   * cursor-paginatable summaries. Score derives from
   * community_platform_post_votes (ignoring soft-deleted votes).
   *
   * Validation: requires query length ≥ 2 after trim. Pagination defaults to 20
   * and caps at 100. Deterministic tie-breakers:
   *
   * - Newest: (created_at DESC, id DESC)
   * - Top: (score DESC, created_at DESC, id DESC)
   *
   * @param props - Request properties
   * @param props.body - ICommunityPlatformPost.IRequest containing q, sort,
   *   cursor, limit
   * @returns Paginated post summaries
   * @throws {HttpException} 400 when query is shorter than 2 characters
   * @throws {HttpException} 500 for unexpected errors
   */
  try {
    const qRaw = props.body.q ?? "";
    const q = qRaw.trim();
    if (q.length < 2) {
      throw new HttpException("Please enter at least 2 characters.", 400);
    }

    const sortMode: IEPostSort = props.body.sort ?? "newest";
    const requestedLimit = props.body.limit ?? 20;
    const limit = Math.max(1, Math.min(100, Number(requestedLimit)));

    // Tokenize query: split by whitespace, hyphen, underscore; AND semantics across tokens
    const tokens = q
      .split(/[\s\-_]+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    // Fetch all matching posts (bounded) – application-level sorting + cursor pagination
    const posts = await MyGlobal.prisma.community_platform_posts.findMany({
      where: {
        deleted_at: null,
        ...(tokens.length > 0 && {
          AND: tokens.map((token) => ({
            OR: [{ title: { contains: token } }, { body: { contains: token } }],
          })),
        }),
      },
      select: {
        id: true,
        community_platform_community_id: true,
        community_platform_user_id: true,
        title: true,
        created_at: true,
      },
    });

    if (posts.length === 0) {
      return {
        pagination: {
          current: 0 as number & tags.Type<"int32"> & tags.Minimum<0>,
          limit: Number(limit) as number & tags.Type<"int32"> & tags.Minimum<0>,
          records: 0 as number & tags.Type<"int32"> & tags.Minimum<0>,
          pages: 0 as number & tags.Type<"int32"> & tags.Minimum<0>,
        },
        data: [],
      };
    }

    const postIds = posts.map((p) => p.id);
    const communityIds = Array.from(
      new Set(posts.map((p) => p.community_platform_community_id)),
    );
    const userIds = Array.from(
      new Set(posts.map((p) => p.community_platform_user_id)),
    );

    // Aggregate vote scores per post (ignore soft-deleted votes)
    const voteSums =
      await MyGlobal.prisma.community_platform_post_votes.groupBy({
        by: ["community_platform_post_id"],
        where: {
          community_platform_post_id: { in: postIds },
          deleted_at: null,
        },
        _sum: { value: true },
      });
    const scoreMap: Record<string, number> = {};
    for (const v of voteSums) {
      const s = v._sum?.value ?? 0;
      scoreMap[v.community_platform_post_id] = typeof s === "number" ? s : 0;
    }

    // Aggregate visible comment counts per post
    const commentCounts =
      await MyGlobal.prisma.community_platform_comments.groupBy({
        by: ["community_platform_post_id"],
        where: {
          community_platform_post_id: { in: postIds },
          deleted_at: null,
        },
        _count: { _all: true },
      });
    const commentCountMap: Record<string, number> = {};
    for (const c of commentCounts) {
      const count = c._count?._all ?? 0;
      commentCountMap[c.community_platform_post_id] =
        typeof count === "number" ? count : 0;
    }

    // Fetch related communities and users
    const [communities, users] = await Promise.all([
      MyGlobal.prisma.community_platform_communities.findMany({
        where: { id: { in: communityIds } },
        select: { id: true, name: true, logo_uri: true, category: true },
      }),
      MyGlobal.prisma.community_platform_users.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          username: true,
          email: true,
          display_name: true,
          last_login_at: true,
          created_at: true,
          updated_at: true,
        },
      }),
    ]);

    const communityMap: Record<
      string,
      { id: string; name: string; logo_uri: string | null; category: string }
    > = Object.create(null);
    for (const c of communities) communityMap[c.id] = c;

    const userMap: Record<
      string,
      {
        id: string;
        username: string;
        email: string;
        display_name: string | null;
        last_login_at: unknown;
        created_at: unknown;
        updated_at: unknown;
      }
    > = Object.create(null);
    for (const u of users)
      userMap[u.id] = u as unknown as {
        id: string;
        username: string;
        email: string;
        display_name: string | null;
        last_login_at: unknown;
        created_at: unknown;
        updated_at: unknown;
      };

    // Shape interim items for sorting/pagination
    type Interim = {
      id: string & tags.Format<"uuid">;
      title: string & tags.MinLength<5> & tags.MaxLength<120>;
      createdAt: string & tags.Format<"date-time">;
      communityId: string;
      userId: string;
      score: number & tags.Type<"int32">;
      commentCount: number & tags.Type<"int32"> & tags.Minimum<0>;
    };

    const items: Interim[] = posts.map((p) => {
      const createdAt = toISOStringSafe(p.created_at);
      const score = scoreMap[p.id] ?? 0;
      const comments = commentCountMap[p.id] ?? 0;
      return {
        id: p.id as string & tags.Format<"uuid">,
        title: p.title as string & tags.MinLength<5> & tags.MaxLength<120>,
        createdAt,
        communityId: p.community_platform_community_id,
        userId: p.community_platform_user_id,
        score: Number(score) as number & tags.Type<"int32">,
        commentCount: Number(comments) as number &
          tags.Type<"int32"> &
          tags.Minimum<0>,
      };
    });

    // Sorting
    const compareNewest = (a: Interim, b: Interim): number => {
      if (a.createdAt !== b.createdAt)
        return a.createdAt < b.createdAt ? 1 : -1; // DESC
      return a.id < b.id ? 1 : a.id > b.id ? -1 : 0; // DESC
    };
    const compareTop = (a: Interim, b: Interim): number => {
      if (a.score !== b.score) return a.score < b.score ? 1 : -1; // DESC
      const byCreated = compareNewest(a, b);
      if (byCreated !== 0) return byCreated;
      return 0;
    };

    const sorted = [...items].sort(
      sortMode === "top" ? compareTop : compareNewest,
    );

    // Cursor helpers
    const encodeCursor = (x: Interim): string =>
      sortMode === "top"
        ? `${x.score}|${x.createdAt}|${x.id}`
        : `${x.createdAt}|${x.id}`;

    const parseCursor = (
      cur: string,
    ): { score?: number; createdAt: string; id: string } | null => {
      if (!cur) return null;
      const parts = cur.split("|");
      if (sortMode === "top") {
        if (parts.length !== 3) return null;
        const s = Number(parts[0]);
        if (!Number.isFinite(s)) return null;
        return { score: s, createdAt: parts[1], id: parts[2] };
      } else {
        if (parts.length !== 2) return null;
        return { createdAt: parts[0], id: parts[1] };
      }
    };

    const curObj = parseCursor(props.body.cursor ?? "");

    const findStartIndex = (): number => {
      if (!curObj) return 0;
      const idx = sorted.findIndex((x) => {
        if (sortMode === "top") {
          return (
            x.score === curObj.score &&
            x.createdAt === curObj.createdAt &&
            x.id === curObj.id
          );
        }
        return x.createdAt === curObj.createdAt && x.id === curObj.id;
      });
      return idx >= 0 ? idx + 1 : 0;
    };

    const start = findStartIndex();
    const pageItems = sorted.slice(start, start + limit);
    const hasNext = start + limit < sorted.length;
    const nextCursor =
      hasNext && pageItems.length > 0
        ? encodeCursor(pageItems[pageItems.length - 1])
        : undefined;

    // Build final DTOs (community & author maps)
    const data: ICommunityPlatformPost.ISummary[] = pageItems.map((it) => {
      const c = communityMap[it.communityId];
      const u = userMap[it.userId];

      const community: ICommunityRef.ISummary = {
        name: c.name as ICommunityRef.ISummary["name"],
        logoUrl:
          c.logo_uri === null
            ? null
            : (c.logo_uri as string & tags.Format<"uri">),
        category: c.category as IECommunityCategory,
      };

      const author: ICommunityPlatformUser.ISummary = {
        id: u.id as string & tags.Format<"uuid">,
        username: u.username,
        email: u.email,
        display_name: u.display_name ?? null,
        last_login_at: u.last_login_at
          ? toISOStringSafe(
              u.last_login_at as unknown as string & tags.Format<"date-time">,
            )
          : null,
        created_at: toISOStringSafe(
          u.created_at as unknown as string & tags.Format<"date-time">,
        ),
        updated_at: toISOStringSafe(
          u.updated_at as unknown as string & tags.Format<"date-time">,
        ),
      };

      return {
        id: it.id,
        community,
        title: it.title,
        author,
        createdAt: it.createdAt,
        commentCount: it.commentCount,
        score: it.score,
        // myVote omitted for public unauthenticated search
      };
    });

    const records = sorted.length;
    const pages = Math.ceil(records / limit);
    const currentPage = Math.floor(start / limit);

    return {
      pagination: {
        current: Number(currentPage) as number &
          tags.Type<"int32"> &
          tags.Minimum<0>,
        limit: Number(limit) as number & tags.Type<"int32"> & tags.Minimum<0>,
        records: Number(records) as number &
          tags.Type<"int32"> &
          tags.Minimum<0>,
        pages: Number(pages) as number & tags.Type<"int32"> & tags.Minimum<0>,
      },
      data,
      // Note: nextCursor is conveyed via header/out-of-band in some designs;
      // include in pagination if your API contract supports it. Current DTO does not include it.
    };
  } catch (err) {
    if (err instanceof HttpException) throw err;
    throw new HttpException(
      "A temporary error occurred. Please try again in a moment.",
      500,
    );
  }
}
