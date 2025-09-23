import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformAppSetting } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformAppSetting";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Get a specific app setting (community_platform_app_settings) by ID for admin
 * inspection
 *
 * Retrieves a single application configuration entry by its UUID from
 * community_platform_app_settings. Only active (non-soft-deleted) records are
 * returned. Access is restricted to system administrators.
 *
 * Authorization: The caller must be a verified system admin. We validate the
 * JWT payload discriminator and ensure an active admin assignment exists with
 * no revocation or soft deletion, and the underlying user is active.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system admin payload
 * @param props.appSettingId - UUID of the application setting to retrieve
 * @returns The detailed application setting record
 * @throws {HttpException} 403 when the caller is not a system admin or lacks an
 *   active admin assignment
 * @throws {HttpException} 404 when the setting does not exist or is
 *   soft-deleted
 */
export async function getcommunityPlatformSystemAdminAppSettingsAppSettingId(props: {
  systemAdmin: SystemadminPayload;
  appSettingId: string & tags.Format<"uuid">;
}): Promise<ICommunityPlatformAppSetting> {
  const { systemAdmin, appSettingId } = props;

  // Role discriminator check
  if (systemAdmin.type !== "systemadmin") {
    throw new HttpException("Forbidden: Requires systemadmin role", 403);
  }

  // Verify active system admin assignment (not revoked, not soft-deleted) and active user
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
    throw new HttpException(
      "Forbidden: Admin assignment not found or inactive",
      403,
    );
  }

  // Fetch the app setting by ID, excluding soft-deleted
  const setting =
    await MyGlobal.prisma.community_platform_app_settings.findFirst({
      where: {
        id: appSettingId,
        deleted_at: null,
      },
    });
  if (setting === null) {
    throw new HttpException("Not Found", 404);
  }

  // Map to API structure with proper date conversions
  return {
    id: setting.id as string & tags.Format<"uuid">,
    key: setting.key,
    value: setting.value,
    value_type: setting.value_type,
    description: setting.description ?? null,
    active: setting.active,
    created_at: toISOStringSafe(setting.created_at),
    updated_at: toISOStringSafe(setting.updated_at),
    deleted_at: setting.deleted_at ? toISOStringSafe(setting.deleted_at) : null,
  };
}
