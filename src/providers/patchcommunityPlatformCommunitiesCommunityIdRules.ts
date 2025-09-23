import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRule";
import { IPageICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCommunityRule";

/**
 * List community rules for a community with pagination and sorting.
 *
 * Retrieves active (non-deleted) rule rows from
 * community_platform_community_rules for the specified community. Supports
 * pagination, optional free-text search on rule text, and sorting. Default
 * ordering preserves owner-defined order via order_index ascending with
 * created_at as a stable tiebreaker.
 *
 * Visibility: Public endpoint; no authentication required. Only non-deleted
 * rules are returned.
 *
 * @param props - Request properties
 * @param props.communityId - UUID of the target community
 * @param props.body - List/search/sort parameters
 * @returns Paginated collection of community rule items
 * @throws {HttpException} 404 When the community does not exist or is deleted
 */
export async function patchcommunityPlatformCommunitiesCommunityIdRules(props: {
  communityId: string & tags.Format<"uuid">;
  body: ICommunityPlatformCommunityRule.IRequest;
}): Promise<IPageICommunityPlatformCommunityRule> {
  const { communityId, body } = props;

  // Ensure community exists and is not soft-deleted
  const community =
    await MyGlobal.prisma.community_platform_communities.findFirst({
      where: { id: communityId, deleted_at: null },
      select: { id: true },
    });
  if (!community) {
    throw new HttpException("Not Found", 404);
  }

  // Pagination defaults
  const pageRaw = body.page ?? 1;
  const limitRaw = body.limit ?? 20;
  const page = Number(pageRaw);
  const limit = Number(limitRaw);
  const currentPage = page < 1 ? 1 : page;
  const take = limit < 1 ? 20 : limit;
  const skip = (currentPage - 1) * take;

  // Sorting defaults
  const primary = body.orderBy ?? "order_index";
  const direction: "asc" | "desc" = (body.direction ??
    (primary === "order_index" ? "asc" : "desc")) as "asc" | "desc";

  // Build where condition (exclude soft-deleted)
  const whereCondition = {
    community_platform_community_id: communityId,
    deleted_at: null,
    ...(body.search !== undefined &&
      body.search !== null && {
        text: { contains: body.search },
      }),
  };

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.community_platform_community_rules.findMany({
      where: whereCondition,
      select: {
        id: true,
        community_platform_community_id: true,
        order_index: true,
        text: true,
        created_at: true,
        updated_at: true,
      },
      orderBy:
        primary === "created_at"
          ? [{ created_at: direction }, { order_index: "asc" }]
          : primary === "updated_at"
            ? [{ updated_at: direction }, { order_index: "asc" }]
            : [{ order_index: direction }, { created_at: "asc" }],
      skip: skip,
      take: take,
    }),
    MyGlobal.prisma.community_platform_community_rules.count({
      where: whereCondition,
    }),
  ]);

  return {
    pagination: {
      current: Number(currentPage),
      limit: Number(take),
      records: total,
      pages: Math.ceil(total / (take || 1)),
    },
    data: rows.map((r) => ({
      id: r.id as string & tags.Format<"uuid">,
      community_platform_community_id:
        r.community_platform_community_id as string & tags.Format<"uuid">,
      order_index: r.order_index as number &
        tags.Type<"int32"> &
        tags.Minimum<0>,
      text: r.text as string & tags.MinLength<1> & tags.MaxLength<200>,
      created_at: toISOStringSafe(r.created_at),
      updated_at: toISOStringSafe(r.updated_at),
    })),
  };
}
