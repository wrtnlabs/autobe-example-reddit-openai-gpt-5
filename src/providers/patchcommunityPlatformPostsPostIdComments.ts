import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformComment";
import { IPageICommunityPlatformComment } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformComment";
import { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import { IECommunityPlatformVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformVoteState";
import { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

export async function patchCommunityPlatformPostsPostIdComments(props: {
  postId: string & tags.Format<"uuid">;
  body: ICommunityPlatformComment.IRequest;
}): Promise<IPageICommunityPlatformComment> {
  const { postId, body } = props;

  // 1) Validate post exists and is visible (not soft-deleted)
  const postExists = await MyGlobal.prisma.community_platform_posts.findFirst({
    where: { id: postId, deleted_at: null },
    select: { id: true },
  });
  if (!postExists) throw new HttpException("Not Found", 404);

  // 2) Pagination & optional search
  const take = body.limit ?? 20;

  // 3) Build base where (visible comments for the post, optional search)
  const baseWhere = {
    community_platform_post_id: postId,
    deleted_at: null,
    ...(body.q !== undefined &&
      body.q !== null &&
      body.q.length > 0 && {
        content: { contains: body.q },
      }),
  } as const;

  // 4) Cursor handling: opaque base64 of { createdAt, id }
  const whereCondition = {
    ...baseWhere,
    ...(() => {
      if (!body.cursor) return {};
      try {
        const decoded = Buffer.from(body.cursor, "base64").toString("utf8");
        const parsed = JSON.parse(decoded) as { createdAt: string; id: string };
        if (!parsed || !parsed.createdAt || !parsed.id) {
          throw new Error("Invalid cursor payload");
        }
        return {
          OR: [
            { created_at: { lt: parsed.createdAt } },
            {
              AND: [
                { created_at: parsed.createdAt },
                { id: { lt: parsed.id } },
              ],
            },
          ],
        };
      } catch {
        throw new HttpException("Bad Request: Invalid cursor", 400);
      }
    })(),
  };

  // 5) Fetch page of comments and total count concurrently
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.community_platform_comments.findMany({
      where: whereCondition,
      orderBy: [{ created_at: "desc" }, { id: "desc" }],
      take: Number(take),
      select: {
        id: true,
        community_platform_post_id: true,
        community_platform_user_id: true,
        parent_id: true,
        content: true,
        created_at: true,
        updated_at: true,
        deleted_at: true,
      },
    }),
    MyGlobal.prisma.community_platform_comments.count({
      where: baseWhere,
    }),
  ]);

  // 6) Batch-load scores and authors
  const commentIds = rows.map((r) => r.id);
  const authorIds = Array.from(
    new Set(rows.map((r) => r.community_platform_user_id)),
  );

  const [scoreGroups, authors] = await Promise.all([
    commentIds.length === 0
      ? Promise.resolve(
          [] as {
            community_platform_comment_id: string;
            _sum: { value: number | null };
          }[],
        )
      : MyGlobal.prisma.community_platform_comment_votes.groupBy({
          by: ["community_platform_comment_id"],
          where: {
            community_platform_comment_id: { in: commentIds },
            deleted_at: null,
          },
          _sum: { value: true },
        }),
    authorIds.length === 0
      ? Promise.resolve(
          [] as {
            id: string;
            username: string;
            email: string;
            display_name: string | null;
            last_login_at: Date | null;
            created_at: Date;
            updated_at: Date;
          }[],
        )
      : MyGlobal.prisma.community_platform_users.findMany({
          where: { id: { in: authorIds } },
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

  const scoreMap = new Map<string, number>();
  for (const g of scoreGroups) {
    const sum = g._sum.value ?? 0;
    scoreMap.set(g.community_platform_comment_id, Number(sum));
  }

  const authorMap = new Map<string, ICommunityPlatformUser.ISummary>();
  for (const u of authors) {
    authorMap.set(u.id, {
      id: u.id as string & tags.Format<"uuid">,
      username: u.username,
      email: u.email,
      display_name: u.display_name ?? null,
      last_login_at: u.last_login_at ? toISOStringSafe(u.last_login_at) : null,
      created_at: toISOStringSafe(u.created_at),
      updated_at: toISOStringSafe(u.updated_at),
    });
  }

  // 7) Map to DTO
  const data: ICommunityPlatformComment[] = rows.map((r) => {
    const score = scoreMap.get(r.id) ?? 0;
    const author = authorMap.get(r.community_platform_user_id);
    return {
      id: r.id as string & tags.Format<"uuid">,
      postId: r.community_platform_post_id as string & tags.Format<"uuid">,
      authorId: r.community_platform_user_id as string & tags.Format<"uuid">,
      parentId:
        r.parent_id === null
          ? null
          : (r.parent_id as string & tags.Format<"uuid">),
      content: r.content,
      createdAt: toISOStringSafe(r.created_at),
      updatedAt: toISOStringSafe(r.updated_at),
      deletedAt: null,
      score: Number(score),
      ...(author ? { author } : {}),
    };
  });

  // 8) Pagination response
  const pagination: IPage.IPagination = {
    current: Number(0),
    limit: Number(take),
    records: Number(total),
    pages: Number(Math.ceil((total || 0) / Number(take || 1))),
  };

  return { pagination, data };
}
