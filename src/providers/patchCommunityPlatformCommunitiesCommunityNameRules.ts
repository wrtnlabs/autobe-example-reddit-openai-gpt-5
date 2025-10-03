import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRule";
import { IECommunityPlatformCommunityRuleSortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityRuleSortBy";
import { IESortOrder } from "@ORGANIZATION/PROJECT-api/lib/structures/IESortOrder";
import { IPageICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCommunityRule";
import { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";

export async function patchCommunityPlatformCommunitiesCommunityNameRules(props: {
  communityName: string;
  body: ICommunityPlatformCommunityRule.IRequest;
}): Promise<IPageICommunityPlatformCommunityRule> {
  /**
   * List community rules (public).
   *
   * Resolves community by normalized name_key, then returns a paginated list of
   * rule items (excluding soft-deleted). Supports optional text search and
   * sorting by order_index (default) or created_at. Pagination uses limit with
   * optional cursor (keyset on primary sort plus id) for deterministic
   * windows.
   *
   * @param props.communityName - Community name to normalize into name_key
   * @param props.body - Pagination, sorting, and optional text filter
   * @returns Paginated rules for the community
   * @throws {HttpException} 404 when community not found; 400 for malformed
   *   cursor
   */
  const { communityName, body } = props;

  // Normalize communityName → name_key
  const nameKey = communityName.trim().toLowerCase();

  // Resolve community (must be active)
  const community =
    await MyGlobal.prisma.community_platform_communities.findFirstOrThrow({
      where: { name_key: nameKey, deleted_at: null },
      select: { id: true },
    });

  // Extract and sanitize inputs
  const sortBy: IECommunityPlatformCommunityRuleSortBy = body.sortBy ?? "order";
  const sortDir: IESortOrder = body.order === "desc" ? "desc" : "asc";
  const q = body.q;

  // Limit with defaults and bounds [1,100]
  const rawLimit = body.limit ?? 20;
  const limit = rawLimit < 1 ? 1 : rawLimit > 100 ? 100 : rawLimit;

  // Base where condition (exclude soft-deleted)
  const baseWhere = {
    community_platform_community_id: community.id,
    deleted_at: null,
    ...(q !== undefined &&
      q !== null &&
      q !== "" && {
        text: { contains: q },
      }),
  };

  // Optional cursor-based continuation (keyset pagination)
  let cursorAnd: Record<string, unknown> | null = null;
  if (body.cursor !== undefined) {
    try {
      const parsed = JSON.parse(body.cursor);
      if (!parsed || typeof parsed !== "object")
        throw new Error("Invalid cursor structure");

      // Mandatory id in cursor
      const cursorId = typia.assert<string & tags.Format<"uuid">>(parsed.id);

      if (sortBy === "order") {
        const cOrder = typia.assert<number & tags.Type<"int32">>(
          parsed.orderIndex,
        );
        cursorAnd = {
          OR: [
            sortDir === "asc"
              ? { order_index: { gt: cOrder } }
              : { order_index: { lt: cOrder } },
            {
              AND: [
                { order_index: { equals: cOrder } },
                sortDir === "asc"
                  ? { id: { gt: cursorId } }
                  : { id: { lt: cursorId } },
              ],
            },
          ],
        };
      } else {
        const cCreatedAt = typia.assert<string & tags.Format<"date-time">>(
          parsed.createdAt,
        );
        cursorAnd = {
          OR: [
            sortDir === "asc"
              ? { created_at: { gt: cCreatedAt } }
              : { created_at: { lt: cCreatedAt } },
            {
              AND: [
                { created_at: { equals: cCreatedAt } },
                sortDir === "asc"
                  ? { id: { gt: cursorId } }
                  : { id: { lt: cursorId } },
              ],
            },
          ],
        };
      }
    } catch {
      throw new HttpException("Bad Request: Invalid cursor", 400);
    }
  }

  // Build paginated where (AND base with cursor if present)
  const wherePaginated = cursorAnd
    ? { AND: [baseWhere, cursorAnd] }
    : baseWhere;

  // Fetch rows and total count concurrently
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.community_platform_community_rules.findMany({
      where: wherePaginated,
      orderBy:
        sortBy === "createdAt"
          ? [{ created_at: sortDir }, { id: sortDir }]
          : [{ order_index: sortDir }, { id: sortDir }],
      take: limit,
      select: {
        id: true,
        order_index: true,
        text: true,
        created_at: true,
        updated_at: true,
      },
    }),
    MyGlobal.prisma.community_platform_community_rules.count({
      where: baseWhere,
    }),
  ]);

  // Map to API DTO with proper branding and date conversions
  const data: ICommunityPlatformCommunityRule[] = rows.map((r) => ({
    id: typia.assert<string & tags.Format<"uuid">>(r.id),
    orderIndex: typia.assert<number & tags.Type<"int32"> & tags.Minimum<1>>(
      r.order_index,
    ),
    text: typia.assert<string & tags.MaxLength<100>>(r.text),
    createdAt: toISOStringSafe(r.created_at),
    updatedAt: toISOStringSafe(r.updated_at),
  }));

  const records = total;
  const pages = records === 0 ? 0 : Math.ceil(records / Number(limit));

  return {
    pagination: {
      current: typia.assert<number & tags.Type<"int32"> & tags.Minimum<0>>(0),
      limit: typia.assert<number & tags.Type<"int32"> & tags.Minimum<0>>(
        Number(limit),
      ),
      records: typia.assert<number & tags.Type<"int32"> & tags.Minimum<0>>(
        Number(records),
      ),
      pages: typia.assert<number & tags.Type<"int32"> & tags.Minimum<0>>(
        Number(pages),
      ),
    },
    data,
  };
}
