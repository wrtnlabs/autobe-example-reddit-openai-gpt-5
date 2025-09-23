import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformRecentCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRecentCommunity";
import { IPageICommunityPlatformRecentCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformRecentCommunity";
import { CommunitymemberPayload } from "../decorators/payload/CommunitymemberPayload";

/**
 * List a user’s recent communities from community_platform_recent_communities
 *
 * Retrieves a per-user ordered list of communities recently interacted with or
 * visited by the authenticated community member. Supports pagination, optional
 * date-range filtering on last_activity_at, and sorting by one of
 * last_activity_at | created_at | updated_at (default: last_activity_at desc).
 *
 * Security: Only the authenticated community member can access their own list.
 * The path userId must match the authenticated subject. Communities and mapping
 * rows with deleted_at set are excluded.
 *
 * @param props - Request properties
 * @param props.communityMember - Authenticated community member payload
 * @param props.userId - Target user’s UUID (must match authenticated user)
 * @param props.body - Pagination, sorting, and optional date-range filters
 * @returns Paginated list of recent community summaries for the user
 * @throws {HttpException} 400 when page/limit invalid
 * @throws {HttpException} 403 when accessing another user’s data
 * @throws {HttpException} 404 when the user does not exist or is deleted
 */
export async function patchcommunityPlatformCommunityMemberUsersUserIdRecentCommunities(props: {
  communityMember: CommunitymemberPayload;
  userId: string & tags.Format<"uuid">;
  body: ICommunityPlatformRecentCommunity.IRequest;
}): Promise<IPageICommunityPlatformRecentCommunity.ISummary> {
  const { communityMember, userId, body } = props;

  // Authorization: user can only access their own recent list
  if (communityMember.id !== userId) {
    throw new HttpException(
      "Forbidden: You can only access your own recent communities",
      403,
    );
  }

  // Validate page/limit (Minimum<1> per IRequest) – guard here for safety
  const rawPage = body.page ?? 1;
  const rawLimit = body.limit ?? 20;
  if (rawPage === null || rawPage === undefined || Number(rawPage) < 1) {
    throw new HttpException("Bad Request: page must be >= 1", 400);
  }
  if (rawLimit === null || rawLimit === undefined || Number(rawLimit) < 1) {
    throw new HttpException("Bad Request: limit must be >= 1", 400);
  }

  const pageNum = Number(rawPage);
  const limitNum = Number(rawLimit);
  const skip = (pageNum - 1) * limitNum;

  // Ensure the user exists and is not soft-deleted
  const user = await MyGlobal.prisma.community_platform_users.findFirst({
    where: { id: userId, deleted_at: null },
    select: { id: true },
  });
  if (!user) throw new HttpException("Not Found: user", 404);

  // Determine sorting configuration
  const orderField = body.orderBy ?? "last_activity_at";
  const direction = body.direction ?? "desc";

  // Build where condition with soft-delete exclusions and optional range
  const whereCondition = {
    community_platform_user_id: userId,
    deleted_at: null,
    // Range on last_activity_at
    ...((body.from !== undefined && body.from !== null) ||
    (body.to !== undefined && body.to !== null)
      ? {
          last_activity_at: {
            ...(body.from !== undefined &&
              body.from !== null && { gte: body.from }),
            ...(body.to !== undefined && body.to !== null && { lte: body.to }),
          },
        }
      : {}),
    // Only communities that are not soft-deleted
    community: { is: { deleted_at: null } },
  } as const;

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.community_platform_recent_communities.findMany({
      where: whereCondition,
      select: {
        id: true,
        last_activity_at: true,
        community: {
          select: {
            id: true,
            name: true,
            community_platform_category_id: true,
            logo: true,
            created_at: true,
            last_active_at: true,
          },
        },
      },
      orderBy:
        orderField === "created_at"
          ? { created_at: direction }
          : orderField === "updated_at"
            ? { updated_at: direction }
            : { last_activity_at: direction },
      skip: skip,
      take: limitNum,
    }),
    MyGlobal.prisma.community_platform_recent_communities.count({
      where: whereCondition,
    }),
  ]);

  // Map DB rows to API summaries with proper ISO string conversions
  const data = rows.map((row) => {
    const community = row.community!;

    // Brand UUIDs and URIs without 'as' using typia.assert
    const id = typia.assert<string & tags.Format<"uuid">>(row.id);
    const communityId = typia.assert<string & tags.Format<"uuid">>(
      community.id,
    );
    const categoryId = typia.assert<string & tags.Format<"uuid">>(
      community.community_platform_category_id,
    );

    return {
      id,
      last_activity_at: toISOStringSafe(row.last_activity_at),
      community: {
        id: communityId,
        name: community.name,
        community_platform_category_id: categoryId,
        logo:
          community.logo === null
            ? null
            : typia.assert<string & tags.Format<"uri">>(community.logo),
        created_at: toISOStringSafe(community.created_at),
        last_active_at: toISOStringSafe(community.last_active_at),
      },
    } satisfies ICommunityPlatformRecentCommunity.ISummary;
  });

  // Pagination branding via typia.assert to avoid 'as'
  const pagination = {
    current: typia.assert<number & tags.Type<"int32"> & tags.Minimum<0>>(
      pageNum,
    ),
    limit: typia.assert<number & tags.Type<"int32"> & tags.Minimum<0>>(
      limitNum,
    ),
    records: typia.assert<number & tags.Type<"int32"> & tags.Minimum<0>>(total),
    pages: typia.assert<number & tags.Type<"int32"> & tags.Minimum<0>>(
      Math.ceil(total / limitNum),
    ),
  };

  return {
    pagination,
    data,
  };
}
