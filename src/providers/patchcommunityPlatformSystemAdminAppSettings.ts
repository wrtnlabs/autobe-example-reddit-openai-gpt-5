import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformAppSetting } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformAppSetting";
import { IPageICommunityPlatformAppSetting } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformAppSetting";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * List/search application settings with pagination (admin-only).
 *
 * Retrieves a filtered, paginated list of records from
 * community_platform_app_settings for platform administrators. Supports
 * substring search on key, equality filters on value_type and active, sorting
 * by created_at/updated_at/key, and pagination. Soft-deleted records
 * (deleted_at != null) are excluded.
 *
 * Authorization: Requires a valid System Admin (systemadmin) assignment that is
 * not revoked/deleted and whose underlying user is active and not deleted.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system admin payload
 * @param props.body - Filters, sort, and pagination options
 * @returns Paginated list of application setting summaries
 * @throws {HttpException} 401/403 when authorization fails
 */
export async function patchcommunityPlatformSystemAdminAppSettings(props: {
  systemAdmin: SystemadminPayload;
  body: ICommunityPlatformAppSetting.IRequest;
}): Promise<IPageICommunityPlatformAppSetting.ISummary> {
  const { systemAdmin, body } = props;

  // Authorization check: verify active system admin assignment
  const admin = await MyGlobal.prisma.community_platform_systemadmins.findFirst(
    {
      where: {
        community_platform_user_id: systemAdmin.id,
        revoked_at: null,
        deleted_at: null,
        user: {
          is: {
            deleted_at: null,
            status: "active",
          },
        },
      },
    },
  );
  if (admin === null) {
    throw new HttpException("Forbidden", 403);
  }

  // Pagination defaults and normalization
  const rawPage = body.page ?? 1;
  const rawLimit = body.limit ?? 20;
  const page = Math.max(Number(rawPage), 1);
  const limit = Math.max(Number(rawLimit), 1);
  const skip = (page - 1) * limit;

  // Sorting defaults
  const sortBy = body.sort_by ?? "updated_at";
  const sortDir = body.sort_dir ?? "desc";

  const [rows, total] = await Promise.all([
    MyGlobal.prisma.community_platform_app_settings.findMany({
      where: {
        deleted_at: null,
        ...(body.key !== undefined &&
          body.key !== null && {
            key: { contains: body.key },
          }),
        ...(body.value_type !== undefined &&
          body.value_type !== null && {
            value_type: body.value_type,
          }),
        ...(body.active !== undefined &&
          body.active !== null && {
            active: body.active,
          }),
      },
      select: {
        id: true,
        key: true,
        value_type: true,
        active: true,
        updated_at: true,
      },
      orderBy:
        sortBy === "key"
          ? { key: sortDir }
          : sortBy === "created_at"
            ? { created_at: sortDir }
            : { updated_at: sortDir },
      skip,
      take: limit,
    }),
    MyGlobal.prisma.community_platform_app_settings.count({
      where: {
        deleted_at: null,
        ...(body.key !== undefined &&
          body.key !== null && {
            key: { contains: body.key },
          }),
        ...(body.value_type !== undefined &&
          body.value_type !== null && {
            value_type: body.value_type,
          }),
        ...(body.active !== undefined &&
          body.active !== null && {
            active: body.active,
          }),
      },
    }),
  ]);

  const data = rows.map((r) => ({
    id: r.id as string & tags.Format<"uuid">,
    key: r.key,
    value_type: r.value_type,
    active: r.active,
    updated_at: toISOStringSafe(r.updated_at),
  }));

  return {
    pagination: {
      current: Number(page),
      limit: Number(limit),
      records: Number(total),
      pages: Math.max(
        Number(limit) === 0 ? 0 : Math.ceil(Number(total) / Number(limit)),
        0,
      ),
    },
    data,
  };
}
