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

export async function patchCommunityPlatformCommunitiesCommunityNamePosts(props: {
  communityName: string;
  body: ICommunityPlatformPost.IRequest;
}): Promise<IPageICommunityPlatformPost.ISummary> {
  const { communityName, body } = props;
  const sort: IEPostSort = body.sort ?? "newest";
  const limit: number = Number(body.limit ?? 20);

  // 1) Resolve community and ensure it's active
  const community =
    await MyGlobal.prisma.community_platform_communities.findFirst({
      where: {
        name: communityName,
        deleted_at: null,
      },
      select: {
        id: true,
        name: true,
        category: true,
        logo_uri: true,
      },
    });
  if (!community) throw new HttpException("Community not found", 404);

  // 2) Build base where condition for posts
  const wherePosts = {
    community_platform_community_id: community.id,
    deleted_at: null as Date | null, // type hint for Prisma input only
    ...(body.q && body.q.length >= 2
      ? {
          OR: [{ title: { contains: body.q } }, { body: { contains: body.q } }],
        }
      : {}),
  };

  // 3) Total records count for pagination
  const totalRecords = await MyGlobal.prisma.community_platform_posts.count({
    where: wherePosts,
  });

  // 4) Fetch posts according to sorting
  let selectedPosts: Array<{
    id: string;
    community_platform_user_id: string;
    title: string;
    created_at: Date | (string & tags.Format<"date-time">);
  }> = [];

  if (sort === "newest") {
    const posts = await MyGlobal.prisma.community_platform_posts.findMany({
      where: wherePosts,
      select: {
        id: true,
        community_platform_user_id: true,
        title: true,
        created_at: true,
      },
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: limit,
    });
    selectedPosts = posts;
  } else {
    // "top" sorting requires score aggregation; fetch all then sort in app
    const postsAll = await MyGlobal.prisma.community_platform_posts.findMany({
      where: wherePosts,
      select: {
        id: true,
        community_platform_user_id: true,
        title: true,
        created_at: true,
      },
    });

    const postIds = postsAll.map((p) => p.id);
    const votes = postIds.length
      ? await MyGlobal.prisma.community_platform_post_votes.findMany({
          where: {
            community_platform_post_id: { in: postIds },
            deleted_at: null,
          },
          select: {
            community_platform_post_id: true,
            value: true,
          },
        })
      : [];

    const scoreMap = new Map<string, number>();
    for (const v of votes) {
      scoreMap.set(
        v.community_platform_post_id,
        (scoreMap.get(v.community_platform_post_id) ?? 0) + v.value,
      );
    }

    const sorted = [...postsAll].sort((a, b) => {
      const sa = scoreMap.get(a.id) ?? 0;
      const sb = scoreMap.get(b.id) ?? 0;
      if (sb !== sa) return sb - sa; // score DESC
      const ta = Date.parse(
        a.created_at instanceof Date
          ? a.created_at.toISOString()
          : a.created_at,
      );
      const tb = Date.parse(
        b.created_at instanceof Date
          ? b.created_at.toISOString()
          : b.created_at,
      );
      if (tb !== ta) return tb - ta; // created_at DESC
      return b.id.localeCompare(a.id); // id DESC
    });

    selectedPosts = sorted.slice(0, limit);
  }

  const selectedIds = selectedPosts.map((p) => p.id);

  // 5) Batch load authors
  const authorIds = Array.from(
    new Set(selectedPosts.map((p) => p.community_platform_user_id)),
  );
  const authors = authorIds.length
    ? await MyGlobal.prisma.community_platform_users.findMany({
        where: { id: { in: authorIds } },
        select: {
          id: true,
          email: true,
          username: true,
          display_name: true,
          last_login_at: true,
          created_at: true,
          updated_at: true,
        },
      })
    : [];
  const authorMap = new Map<string, (typeof authors)[number]>();
  for (const u of authors) authorMap.set(u.id, u);

  // 6) Batch load comment counts
  const comments = selectedIds.length
    ? await MyGlobal.prisma.community_platform_comments.findMany({
        where: {
          community_platform_post_id: { in: selectedIds },
          deleted_at: null,
        },
        select: { community_platform_post_id: true },
      })
    : [];
  const commentCountMap = new Map<string, number>();
  for (const c of comments) {
    commentCountMap.set(
      c.community_platform_post_id,
      (commentCountMap.get(c.community_platform_post_id) ?? 0) + 1,
    );
  }

  // 7) Build score map for selected posts (for newest we still need scores)
  const votesForSelected = selectedIds.length
    ? await MyGlobal.prisma.community_platform_post_votes.findMany({
        where: {
          community_platform_post_id: { in: selectedIds },
          deleted_at: null,
        },
        select: { community_platform_post_id: true, value: true },
      })
    : [];
  const scoreMapSelected = new Map<string, number>();
  for (const v of votesForSelected) {
    scoreMapSelected.set(
      v.community_platform_post_id,
      (scoreMapSelected.get(v.community_platform_post_id) ?? 0) + v.value,
    );
  }

  // 8) Compose results
  const communitySummary: ICommunityRef.ISummary = {
    name: community.name as string &
      tags.MinLength<3> &
      tags.MaxLength<30> &
      tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$">,
    logoUrl: community.logo_uri ?? undefined,
    category: community.category as IECommunityCategory,
  };

  const data: ICommunityPlatformPost.ISummary[] = selectedPosts.map((p) => {
    const au = authorMap.get(p.community_platform_user_id);
    const authorSummary: IUserRef.ISummary = {
      id: (au?.id ?? "") as string & tags.Format<"uuid">,
      username: au?.username ?? "",
      email: au?.email ?? "",
      display_name: au?.display_name ?? undefined,
      last_login_at: au?.last_login_at
        ? toISOStringSafe(au.last_login_at)
        : undefined,
      created_at: au?.created_at
        ? toISOStringSafe(au.created_at)
        : toISOStringSafe(new Date()),
      updated_at: au?.updated_at
        ? toISOStringSafe(au.updated_at)
        : toISOStringSafe(new Date()),
    };

    return {
      id: p.id as string & tags.Format<"uuid">,
      community: communitySummary,
      title: p.title as string & tags.MinLength<5> & tags.MaxLength<120>,
      author: authorSummary,
      createdAt: toISOStringSafe(p.created_at),
      commentCount: (commentCountMap.get(p.id) ?? 0) as number &
        tags.Type<"int32"> &
        tags.Minimum<0>,
      score: (scoreMapSelected.get(p.id) ?? 0) as number & tags.Type<"int32">,
      // myVote omitted for public context
    };
  });

  // 9) Pagination info
  const pages = limit > 0 ? Math.ceil(totalRecords / limit) : 0;
  const pagination: IPage.IPagination = {
    current: Number(0) as number & tags.Type<"int32"> & tags.Minimum<0>,
    limit: Number(limit) as number & tags.Type<"int32"> & tags.Minimum<0>,
    records: Number(totalRecords) as number &
      tags.Type<"int32"> &
      tags.Minimum<0>,
    pages: Number(pages) as number & tags.Type<"int32"> & tags.Minimum<0>,
  };

  return { pagination, data };
}
