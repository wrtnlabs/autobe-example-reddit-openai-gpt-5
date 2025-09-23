import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformCommunityMembership } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMembership";
import { IPageICommunityPlatformCommunityMembership } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformCommunityMembership";
import { CommunitymemberPayload } from "../decorators/payload/CommunitymemberPayload";

/**
 * List memberships for a community with filtering, sorting, and pagination.
 *
 * Retrieves membership rows from community_platform_community_memberships
 * scoped by the provided communityId. By default, only active memberships
 * (deleted_at null) are returned. Owners (community creator) and system admins
 * can view the full roster; non-owners receive a restricted view containing
 * only their own membership rows.
 *
 * Filters include created_at range and inclusion of ended memberships. Sorting
 * supports created_at and updated_at with asc/desc. Pagination is page/limit
 * based and deterministic by adding a secondary id ordering.
 *
 * @param props - Request context and filters
 * @param props.communityMember - Authenticated community member payload
 * @param props.communityId - Target community UUID
 *   (community_platform_communities.id)
 * @param props.body - Filtering, sorting, and pagination parameters
 * @returns Paginated membership summaries
 * @throws {HttpException} 404 when the community does not exist (or
 *   soft-deleted)
 */
export async function patchcommunityPlatformCommunityMemberCommunitiesCommunityIdMemberships(props: {
  communityMember: CommunitymemberPayload;
  communityId: string & tags.Format<"uuid">;
  body: ICommunityPlatformCommunityMembership.IRequest;
}): Promise<IPageICommunityPlatformCommunityMembership.ISummary> {
  const { communityMember, communityId, body } = props;

  // 1) Verify community exists and is not soft-deleted
  const community =
    await MyGlobal.prisma.community_platform_communities.findFirst({
      where: { id: communityId, deleted_at: null },
      select: {
        id: true,
        community_platform_user_id: true,
        disabled_at: true,
      },
    });
  if (!community) throw new HttpException("Not Found", 404);

  // 2) Authorization: owner or system admin → full roster; otherwise restricted to self
  const isOwner = community.community_platform_user_id === communityMember.id;
  const systemAdmin =
    await MyGlobal.prisma.community_platform_systemadmins.findFirst({
      where: {
        community_platform_user_id: communityMember.id,
        revoked_at: null,
        deleted_at: null,
      },
      select: { id: true },
    });
  const isAdmin = systemAdmin !== null;
  const canViewAll = isOwner || isAdmin;

  // 3) Pagination and sorting (with sensible defaults)
  const currentPageRaw = body.page ?? 1;
  const limitRaw = body.limit ?? 20;
  const currentPage = Math.max(1, Number(currentPageRaw));
  const limit = Math.max(1, Number(limitRaw));
  const skip = (currentPage - 1) * limit;

  const sortBy = body.sort_by === "updated_at" ? "updated_at" : "created_at";
  const sortDir = body.sort_dir === "asc" ? "asc" : "desc";

  // 4) Build where condition
  const whereCondition = {
    community_platform_community_id: communityId,
    // default: only active memberships
    ...(body.include_ended === true ? {} : { deleted_at: null }),
    // self-only view for non-owners/admins
    ...(!canViewAll && { community_platform_user_id: communityMember.id }),
    // created_at range
    ...((body.created_from !== undefined && body.created_from !== null) ||
    (body.created_to !== undefined && body.created_to !== null)
      ? {
          created_at: {
            ...(body.created_from !== undefined &&
              body.created_from !== null && {
                gte: toISOStringSafe(body.created_from),
              }),
            ...(body.created_to !== undefined &&
              body.created_to !== null && {
                lte: toISOStringSafe(body.created_to),
              }),
          },
        }
      : {}),
  };

  // 5) Query and count in parallel
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.community_platform_community_memberships.findMany({
      where: whereCondition,
      select: {
        id: true,
        community_platform_community_id: true,
        community_platform_user_id: true,
        created_at: true,
        updated_at: true,
        deleted_at: true,
      },
      orderBy: [
        sortBy === "created_at"
          ? { created_at: sortDir }
          : { updated_at: sortDir },
        { id: "asc" },
      ],
      skip,
      take: limit,
    }),
    MyGlobal.prisma.community_platform_community_memberships.count({
      where: whereCondition,
    }),
  ]);

  // 6) Map to DTO with proper Date conversions
  const data = rows.map((r) => ({
    id: r.id,
    community_platform_community_id: r.community_platform_community_id,
    community_platform_user_id: r.community_platform_user_id,
    created_at: toISOStringSafe(r.created_at),
    updated_at: toISOStringSafe(r.updated_at),
    deleted_at: r.deleted_at ? toISOStringSafe(r.deleted_at) : undefined,
  }));

  // 7) Pagination DTO
  const records = Number(total);
  const pages = Math.ceil(records / limit);

  return {
    pagination: {
      current: Number(currentPage),
      limit: Number(limit),
      records,
      pages,
    },
    data,
  };
}
