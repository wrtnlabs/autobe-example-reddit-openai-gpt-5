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
import { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import { IEVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IEVoteState";
import { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";

export async function patchCommunityPlatformSearchComments(props: {
  body: ICommunityPlatformComment.IRequest;
}): Promise<IPageICommunityPlatformComment.ISummary> {
  /**
   * Search comments (community_platform_comments) ordered by Newest with cursor
   * pagination
   *
   * Executes global comments search across community_platform_comments,
   * filtering out soft-deleted records and ordering by (created_at DESC, id
   * DESC). Supports optional opaque cursor for keyset pagination and aggregates
   * per-comment score from votes. Returns summaries with author and lightweight
   * post/community references.
   *
   * Public endpoint: no authentication required.
   *
   * @param props - Request properties
   * @param props.body - Search parameters including normalized query (≥2
   *   chars), limit, and optional cursor
   * @returns Paginated list of comment summaries with Newest ordering
   * @throws {HttpException} 400 when query is shorter than 2 characters
   * @throws {HttpException} 500 on unexpected errors
   */
  const { body } = props;

  try {
    // Validate query (min length 2 after trim)
    const rawQ = body.q?.trim();
    if (!rawQ || rawQ.length < 2) {
      throw new HttpException("Please enter at least 2 characters.", 400);
    }

    // Page size (default 20)
    const limit = Number(body.limit ?? 20);

    // Optional cursor decoding: base64(JSON.stringify({ c: createdAtISO, i: uuid }))
    let cursorCreatedAt: (string & tags.Format<"date-time">) | undefined;
    let cursorId: (string & tags.Format<"uuid">) | undefined;
    if (body.cursor) {
      try {
        const decoded = Buffer.from(body.cursor, "base64").toString("utf8");
        const obj = JSON.parse(decoded) as { c?: string; i?: string };
        if (obj && typeof obj.c === "string" && typeof obj.i === "string") {
          cursorCreatedAt = toISOStringSafe(obj.c);
          cursorId = obj.i as string & tags.Format<"uuid">;
        }
      } catch {
        // Ignore malformed cursor; proceed without it
      }
    }

    // Build where condition (soft-delete excluded, text contains search query)
    const whereCondition = {
      deleted_at: null,
      content: { contains: rawQ },
      ...(cursorCreatedAt && cursorId
        ? {
            OR: [
              { created_at: { lt: cursorCreatedAt } },
              { created_at: cursorCreatedAt, id: { lt: cursorId } },
            ],
          }
        : {}),
    };

    // Execute queries in parallel: data + total count
    const [rows, total] = await Promise.all([
      MyGlobal.prisma.community_platform_comments.findMany({
        where: whereCondition,
        orderBy: [{ created_at: "desc" }, { id: "desc" }],
        take: limit,
        include: {
          post: {
            select: {
              id: true,
              title: true,
              community: { select: { name: true, logo_uri: true } },
            },
          },
          author: {
            select: {
              id: true,
              username: true,
              email: true,
              display_name: true,
              last_login_at: true,
              created_at: true,
              updated_at: true,
            },
          },
        },
      }),
      MyGlobal.prisma.community_platform_comments.count({
        where: whereCondition,
      }),
    ]);

    // Aggregate scores for fetched comments
    const commentIds = rows.map((r) => r.id);
    const scoreMap = new Map<string, number>();
    if (commentIds.length > 0) {
      const grouped =
        await MyGlobal.prisma.community_platform_comment_votes.groupBy({
          by: ["community_platform_comment_id"],
          where: {
            community_platform_comment_id: { in: commentIds },
            deleted_at: null,
          },
          _sum: { value: true },
        });
      for (const g of grouped) {
        const key = g.community_platform_comment_id as string;
        const sum = (g._sum?.value ?? 0) as number;
        scoreMap.set(key, sum);
      }
    }

    // Helper: build excerpt (≤ 200 chars, collapse whitespace)
    const toExcerpt = (
      text: string,
    ): (string & tags.MinLength<0> & tags.MaxLength<200>) | undefined => {
      const normalized = text.replace(/\s+/g, " ").trim();
      const sliced =
        normalized.length > 200 ? normalized.slice(0, 200) : normalized;
      return sliced as unknown as string &
        tags.MinLength<0> &
        tags.MaxLength<200>;
    };

    // Map to DTOs
    const data: ICommunityPlatformComment.ISummary[] = rows.map((r) => {
      const author = r.author;
      const post = r.post;
      const community = post?.community ?? null;

      return {
        id: r.id as string & tags.Format<"uuid">,
        postId: r.community_platform_post_id as string & tags.Format<"uuid">,
        parentId: r.parent_id
          ? (r.parent_id as string & tags.Format<"uuid">)
          : null,
        excerpt: toExcerpt(r.content),
        author: {
          id: author.id as string & tags.Format<"uuid">,
          username: author.username,
          email: author.email,
          display_name: author.display_name ?? null,
          last_login_at: author.last_login_at
            ? toISOStringSafe(author.last_login_at)
            : null,
          created_at: toISOStringSafe(author.created_at),
          updated_at: toISOStringSafe(author.updated_at),
        },
        createdAt: toISOStringSafe(r.created_at),
        updatedAt: toISOStringSafe(r.updated_at),
        score: (scoreMap.get(r.id) ?? 0) as number & tags.Type<"int32">,
        myVote: undefined,
        post: post
          ? {
              id: post.id as string & tags.Format<"uuid">,
              title: post.title as string &
                tags.MinLength<5> &
                tags.MaxLength<120>,
            }
          : undefined,
        community: community
          ? {
              name: community.name as string &
                tags.MinLength<3> &
                tags.MaxLength<30> &
                tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$">,
              logoUrl: community.logo_uri ?? null,
            }
          : undefined,
      };
    });

    // Pagination payload (cursor model → expose basic page info only)
    const pagination: IPage.IPagination = {
      current: Number(0),
      limit: Number(limit),
      records: Number(total),
      pages: Number(Math.ceil(total / (limit || 1))),
    };

    return { pagination, data };
  } catch (err) {
    if (err instanceof HttpException) throw err;
    throw new HttpException(
      "A temporary error occurred. Please try again in a moment.",
      500,
    );
  }
}
