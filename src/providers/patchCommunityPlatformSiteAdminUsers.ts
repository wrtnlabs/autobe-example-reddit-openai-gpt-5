import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import { IECommunityPlatformUserSortBy } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformUserSortBy";
import { IEOrderDirection } from "@ORGANIZATION/PROJECT-api/lib/structures/IEOrderDirection";
import { IPageICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformUser";
import { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import { SiteadminPayload } from "../decorators/payload/SiteadminPayload";

export async function patchCommunityPlatformSiteAdminUsers(props: {
  siteAdmin: SiteadminPayload;
  body: ICommunityPlatformUser.IRequest;
}): Promise<IPageICommunityPlatformUser.ISummary> {
  const { siteAdmin, body } = props;

  // Authorization: ensure the caller is an active site admin
  const admin = await MyGlobal.prisma.community_platform_siteadmins.findFirst({
    where: {
      community_platform_user_id: siteAdmin.id,
      revoked_at: null,
      deleted_at: null,
      user: { deleted_at: null },
    },
    select: { id: true },
  });
  if (!admin) throw new HttpException("Forbidden", 403);

  // Pagination limit handling (default 20, cap 100)
  const limit = Math.max(1, Math.min(100, body.limit ?? 20));

  // Build WHERE conditions
  const andConditions: Record<string, unknown>[] = [];

  // Exclude soft-deleted by default
  if (!body.includeDeleted) andConditions.push({ deleted_at: null });

  // Exact/CI filters using normalized columns
  if (body.username !== undefined && body.username !== null) {
    andConditions.push({ username_normalized: body.username.toLowerCase() });
  }
  if (body.email !== undefined && body.email !== null) {
    andConditions.push({ email_normalized: body.email.toLowerCase() });
  }

  // Free-text search over username/display_name
  if (body.q !== undefined && body.q !== null && body.q.length > 0) {
    andConditions.push({
      OR: [
        { username: { contains: body.q } },
        { display_name: { contains: body.q } },
      ],
    });
  }

  // created_at range
  if (
    (body.createdFrom !== undefined && body.createdFrom !== null) ||
    (body.createdTo !== undefined && body.createdTo !== null)
  ) {
    andConditions.push({
      created_at: {
        ...(body.createdFrom !== undefined &&
          body.createdFrom !== null && {
            gte: toISOStringSafe(body.createdFrom),
          }),
        ...(body.createdTo !== undefined &&
          body.createdTo !== null && { lte: toISOStringSafe(body.createdTo) }),
      },
    });
  }

  // last_login_at range (nullable column)
  if (
    (body.lastLoginFrom !== undefined && body.lastLoginFrom !== null) ||
    (body.lastLoginTo !== undefined && body.lastLoginTo !== null)
  ) {
    andConditions.push({
      last_login_at: {
        ...(body.lastLoginFrom !== undefined &&
          body.lastLoginFrom !== null && {
            gte: toISOStringSafe(body.lastLoginFrom),
          }),
        ...(body.lastLoginTo !== undefined &&
          body.lastLoginTo !== null && {
            lte: toISOStringSafe(body.lastLoginTo),
          }),
      },
    });
  }

  // Role filters
  if (body.isMember === true) {
    andConditions.push({
      community_platform_registeredmembers: { is: { deleted_at: null } },
    });
  } else if (body.isMember === false) {
    andConditions.push({
      OR: [
        { community_platform_registeredmembers: { is: null } },
        {
          community_platform_registeredmembers: {
            is: { deleted_at: { not: null } },
          },
        },
      ],
    });
  }

  if (body.isSiteAdmin === true) {
    andConditions.push({
      community_platform_siteadmins: {
        is: { revoked_at: null, deleted_at: null },
      },
    });
  } else if (body.isSiteAdmin === false) {
    andConditions.push({
      OR: [
        { community_platform_siteadmins: { is: null } },
        {
          community_platform_siteadmins: { is: { revoked_at: { not: null } } },
        },
        {
          community_platform_siteadmins: { is: { deleted_at: { not: null } } },
        },
      ],
    });
  }

  const whereCondition = andConditions.length > 0 ? { AND: andConditions } : {};

  // Sorting
  const sortBy: IECommunityPlatformUserSortBy = body.sortBy ?? "createdAt";
  const order: IEOrderDirection = body.order ?? "desc";

  // Query data and total in parallel
  const [rows, total] = await Promise.all([
    MyGlobal.prisma.community_platform_users.findMany({
      where: whereCondition,
      select: {
        id: true,
        username: true,
        email: true,
        display_name: true,
        last_login_at: true,
        created_at: true,
        updated_at: true,
      },
      orderBy:
        sortBy === "username"
          ? [{ username_normalized: order }, { id: order }]
          : sortBy === "lastLoginAt"
            ? [{ last_login_at: order }, { id: order }]
            : [{ created_at: order }, { id: order }],
      take: limit,
    }),
    MyGlobal.prisma.community_platform_users.count({ where: whereCondition }),
  ]);

  // Map to summaries with proper date conversions
  const data = rows.map((u) => ({
    id: u.id as string & tags.Format<"uuid">,
    username: u.username,
    email: u.email,
    display_name: u.display_name ?? null,
    last_login_at: u.last_login_at ? toISOStringSafe(u.last_login_at) : null,
    created_at: toISOStringSafe(u.created_at),
    updated_at: toISOStringSafe(u.updated_at),
  }));

  return {
    pagination: {
      current: Number(0),
      limit: Number(limit),
      records: Number(total),
      pages: Number(Math.ceil(total / limit)),
    },
    data,
  };
}
