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

export async function patchCommunityPlatformPosts(props: {
  body: ICommunityPlatformPost.IRequest;
}): Promise<IPageICommunityPlatformPost.ISummary> {
  /**
   * List post summaries with deterministic sorting (newest/top).
   *
   * @param props - Request with q, sort, limit
   * @returns Page of post summaries
   */
  const input = props.body;

  // limit handling (default 20)
  const limit = Number(input.limit ?? 20);
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new HttpException(
      "Bad Request: limit must be a positive number",
      400,
    );
  }

  // sort handling (default newest)
  const sort: IEPostSort = input.sort ?? ("newest" as const);
  if (sort !== "newest" && sort !== "top") {
    throw new HttpException("Bad Request: unsupported sort mode", 400);
  }

  // validate q minimal length when provided
  if (
    input.q !== undefined &&
    input.q !== null &&
    input.q.length > 0 &&
    input.q.length < 2
  ) {
    throw new HttpException(
      "Bad Request: q must be at least 2 characters",
      400,
    );
  }

  // where condition (soft-deleted excluded, optional text search)
  const whereCondition = {
    deleted_at: null,
    ...(input.q !== undefined && input.q !== null && input.q !== ""
      ? {
          OR: [
            { title: { contains: input.q } },
            { body: { contains: input.q } },
          ],
        }
      : {}),
  };

  try {
    // total count for pagination
    const total = await MyGlobal.prisma.community_platform_posts.count({
      where: whereCondition,
    });

    // Base fields only (avoid relation access type issues)
    type PostRow = {
      id: string;
      title: string;
      created_at: Date | (string & tags.Format<"date-time">);
      community_platform_user_id: string;
      community_platform_community_id: string;
    };

    let baseRows: PostRow[] = [];

    if (sort === "newest") {
      // Direct DB ordering for newest
      baseRows = await MyGlobal.prisma.community_platform_posts.findMany({
        where: whereCondition,
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: limit,
        select: {
          id: true,
          title: true,
          created_at: true,
          community_platform_user_id: true,
          community_platform_community_id: true,
        },
      });
    } else {
      // Compute Top in application (score desc, then created_at desc, id desc)
      const allRows = await MyGlobal.prisma.community_platform_posts.findMany({
        where: whereCondition,
        select: {
          id: true,
          title: true,
          created_at: true,
          community_platform_user_id: true,
          community_platform_community_id: true,
        },
      });

      const allIds = allRows.map((r) => r.id);
      const voteGroups =
        allIds.length === 0
          ? []
          : await MyGlobal.prisma.community_platform_post_votes.groupBy({
              by: ["community_platform_post_id"],
              where: {
                community_platform_post_id: { in: allIds },
                deleted_at: null,
              },
              _sum: { value: true },
            });
      const scoreMapAll = new Map<string, number>();
      for (const g of voteGroups)
        scoreMapAll.set(g.community_platform_post_id, g._sum?.value ?? 0);

      const sorted = [...allRows].sort((a, b) => {
        const sa = scoreMapAll.get(a.id) ?? 0;
        const sb = scoreMapAll.get(b.id) ?? 0;
        if (sa !== sb) return sb - sa; // score desc
        const ta =
          a.created_at instanceof Date
            ? a.created_at.getTime()
            : new Date(a.created_at).getTime();
        const tb =
          b.created_at instanceof Date
            ? b.created_at.getTime()
            : new Date(b.created_at).getTime();
        if (ta !== tb) return tb - ta; // created_at desc
        return a.id < b.id ? 1 : a.id > b.id ? -1 : 0; // id desc
      });
      baseRows = sorted.slice(0, limit);
    }

    const postIds = baseRows.map((r) => r.id);
    const userIds = Array.from(
      new Set(baseRows.map((r) => r.community_platform_user_id)),
    );
    const communityIds = Array.from(
      new Set(baseRows.map((r) => r.community_platform_community_id)),
    );

    // Aggregates for selected posts
    const [commentGroups, voteGroupsSelected, users, communities] =
      await Promise.all([
        postIds.length === 0
          ? Promise.resolve([])
          : MyGlobal.prisma.community_platform_comments.groupBy({
              by: ["community_platform_post_id"],
              where: {
                community_platform_post_id: { in: postIds },
                deleted_at: null,
              },
              _count: { _all: true },
            }),
        postIds.length === 0
          ? Promise.resolve([])
          : MyGlobal.prisma.community_platform_post_votes.groupBy({
              by: ["community_platform_post_id"],
              where: {
                community_platform_post_id: { in: postIds },
                deleted_at: null,
              },
              _sum: { value: true },
            }),
        userIds.length === 0
          ? Promise.resolve([])
          : MyGlobal.prisma.community_platform_users.findMany({
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
        communityIds.length === 0
          ? Promise.resolve([])
          : MyGlobal.prisma.community_platform_communities.findMany({
              where: { id: { in: communityIds } },
              select: { name: true, logo_uri: true, category: true, id: true },
            }),
      ]);

    const commentCountMap = new Map<string, number>();
    for (const g of commentGroups)
      commentCountMap.set(g.community_platform_post_id, g._count._all);
    const scoreMap = new Map<string, number>();
    for (const g of voteGroupsSelected)
      scoreMap.set(g.community_platform_post_id, g._sum?.value ?? 0);

    const userMap = new Map<string, (typeof users)[number]>();
    for (const u of users) userMap.set(u.id, u);
    const communityMap = new Map<string, (typeof communities)[number]>();
    for (const c of communities) communityMap.set(c.id, c);

    const data: ICommunityPlatformPost.ISummary[] = baseRows.map((row) => {
      const user = userMap.get(row.community_platform_user_id);
      const community = communityMap.get(row.community_platform_community_id);
      if (!user || !community) {
        throw new HttpException(
          "Internal Server Error: Dangling references",
          500,
        );
      }

      return {
        id: row.id as string & tags.Format<"uuid">,
        community: {
          name: community.name,
          logoUrl: community.logo_uri ?? undefined,
          category: community.category as IECommunityCategory,
        },
        title: row.title,
        author: {
          id: user.id as string & tags.Format<"uuid">,
          username: user.username,
          email: user.email,
          display_name: user.display_name ?? undefined,
          last_login_at: user.last_login_at
            ? toISOStringSafe(user.last_login_at)
            : undefined,
          created_at: toISOStringSafe(user.created_at),
          updated_at: toISOStringSafe(user.updated_at),
        },
        createdAt: toISOStringSafe(
          row.created_at as Date | (string & tags.Format<"date-time">),
        ),
        commentCount: Number(commentCountMap.get(row.id) ?? 0) as number &
          tags.Type<"int32"> &
          tags.Minimum<0>,
        score: Number(scoreMap.get(row.id) ?? 0) as number & tags.Type<"int32">,
      };
    });

    const pagination: IPage.IPagination = {
      current: Number(0) as number & tags.Type<"int32"> & tags.Minimum<0>,
      limit: Number(limit) as number & tags.Type<"int32"> & tags.Minimum<0>,
      records: Number(total) as number & tags.Type<"int32"> & tags.Minimum<0>,
      pages: Number(Math.ceil(total / limit)) as number &
        tags.Type<"int32"> &
        tags.Minimum<0>,
    };

    return { pagination, data };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      throw new HttpException(`Database error: ${err.code}`, 500);
    }
    if (err instanceof HttpException) throw err;
    throw new HttpException("Internal Server Error", 500);
  }
}
