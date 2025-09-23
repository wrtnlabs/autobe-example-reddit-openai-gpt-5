import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformUserProfile } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUserProfile";

/**
 * Retrieve a user profile (community_platform_user_profiles) by userId.
 *
 * Returns presentation-layer profile fields (display_name, bio, avatar_uri,
 * locale, timezone) associated with the given userId. Profiles with non-null
 * deleted_at are excluded. This is a read-only, public endpoint and does not
 * expose credential/session data.
 *
 * @param props - Request properties
 * @param props.userId - UUID of the user whose profile is requested
 * @returns The public-facing user profile information
 * @throws {HttpException} 404 when no active profile exists for the specified
 *   userId
 * @throws {HttpException} 500 for unexpected internal errors
 */
export async function getcommunityPlatformUsersUserIdProfile(props: {
  userId: string & tags.Format<"uuid">;
}): Promise<ICommunityPlatformUserProfile> {
  const { userId } = props;
  try {
    const row =
      await MyGlobal.prisma.community_platform_user_profiles.findFirst({
        where: {
          community_platform_user_id: userId,
          deleted_at: null,
        },
        select: {
          id: true,
          community_platform_user_id: true,
          display_name: true,
          bio: true,
          avatar_uri: true,
          locale: true,
          timezone: true,
          created_at: true,
          updated_at: true,
          deleted_at: true,
        },
      });

    if (!row) {
      throw new HttpException(
        "Not Found: Active user profile does not exist",
        404,
      );
    }

    return {
      id: row.id as string & tags.Format<"uuid">,
      community_platform_user_id: row.community_platform_user_id as string &
        tags.Format<"uuid">,
      display_name: row.display_name ?? null,
      bio: row.bio ?? null,
      avatar_uri:
        row.avatar_uri === null
          ? null
          : (row.avatar_uri as string & tags.Format<"uri">),
      locale: row.locale ?? null,
      timezone: row.timezone ?? null,
      created_at: toISOStringSafe(row.created_at),
      updated_at: toISOStringSafe(row.updated_at),
      deleted_at: row.deleted_at ? toISOStringSafe(row.deleted_at) : null,
    };
  } catch (err) {
    if (err instanceof HttpException) throw err;
    throw new HttpException("Internal Server Error", 500);
  }
}
