import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

/**
 * Retrieve a user (community_platform_users) by ID
 *
 * Fetches a single user identity record by its UUID from
 * community_platform_users. Only non-deleted users are returned (deleted_at
 * must be null). This endpoint exposes public-safe identity fields: id,
 * username, status, and lifecycle timestamps. No sensitive credential/session
 * data is included.
 *
 * @param props - Request properties
 * @param props.userId - UUID of the user to retrieve
 * @returns The user identity entity conforming to ICommunityPlatformUser
 * @throws {HttpException} 404 Not Found when the user does not exist or is
 *   soft-deleted
 */
export async function getcommunityPlatformUsersUserId(props: {
  userId: string & tags.Format<"uuid">;
}): Promise<ICommunityPlatformUser> {
  const row = await MyGlobal.prisma.community_platform_users.findFirst({
    where: {
      id: props.userId,
      deleted_at: null,
    },
    select: {
      id: true,
      username: true,
      status: true,
      last_login_at: true,
      created_at: true,
      updated_at: true,
      deleted_at: true,
    },
  });

  if (!row) throw new HttpException("Not Found", 404);

  return {
    id: row.id as string & tags.Format<"uuid">,
    username: row.username as string & tags.MinLength<1>,
    status: row.status as string & tags.MinLength<1>,
    last_login_at: row.last_login_at
      ? toISOStringSafe(row.last_login_at)
      : null,
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
    deleted_at: row.deleted_at ? toISOStringSafe(row.deleted_at) : null,
  };
}
