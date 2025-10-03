import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformSiteAdminLogin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdminLogin";
import { ICommunityPlatformSiteAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdmin";
import { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";

export async function postAuthSiteAdminLogin(props: {
  body: ICommunityPlatformSiteAdminLogin.ICreate;
}): Promise<ICommunityPlatformSiteAdmin.IAuthorized> {
  const { body } = props;

  // Normalize identifier for case-insensitive match against normalized columns
  const identifier = body.identifier.trim().toLowerCase();

  // 1) Find active user by email_normalized or username_normalized
  const user = await MyGlobal.prisma.community_platform_users.findFirst({
    where: {
      deleted_at: null,
      OR: [
        { email_normalized: identifier },
        { username_normalized: identifier },
      ],
    },
    include: {
      community_platform_siteadmins: true,
    },
  });

  if (!user) {
    throw new HttpException("Unauthorized: Invalid credentials", 401);
  }

  // 2) Verify password
  const valid = await PasswordUtil.verify(body.password, user.password_hash);
  if (!valid) {
    throw new HttpException("Unauthorized: Invalid credentials", 401);
  }

  // 3) Ensure user is active site admin (row exists and not revoked)
  const adminRow = user.community_platform_siteadmins;
  if (!adminRow || adminRow.revoked_at !== null) {
    throw new HttpException("Forbidden: Not an active site administrator", 403);
  }

  // 4) Generate tokens
  const accessToken = jwt.sign(
    {
      id: user.id,
      type: "siteadmin",
    },
    MyGlobal.env.JWT_SECRET_KEY,
    {
      expiresIn: "1h",
      issuer: "autobe",
    },
  );

  const refreshToken = jwt.sign(
    {
      id: user.id,
      type: "siteadmin",
      tokenType: "refresh",
    },
    MyGlobal.env.JWT_SECRET_KEY,
    {
      expiresIn: "7d",
      issuer: "autobe",
    },
  );

  // 5) Compute timestamps
  const now = toISOStringSafe(new Date());
  const accessExpiresAt = toISOStringSafe(
    new Date(Date.now() + 60 * 60 * 1000),
  ); // +1h
  const refreshExpiresAt = toISOStringSafe(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  ); // +7d

  // 6) Persist session (store hashed refresh token) and update last_login_at in a transaction
  const hashedRefresh = await PasswordUtil.hash(refreshToken);
  await MyGlobal.prisma.$transaction([
    MyGlobal.prisma.community_platform_users.update({
      where: { id: user.id },
      data: {
        last_login_at: now,
        updated_at: now,
      },
    }),
    MyGlobal.prisma.community_platform_sessions.create({
      data: {
        id: v4() as string & tags.Format<"uuid">,
        community_platform_user_id: user.id,
        hashed_token: hashedRefresh,
        user_agent: null,
        ip: null,
        client_platform: null,
        client_device: null,
        session_type: "standard",
        created_at: now,
        updated_at: now,
        last_seen_at: now,
        expires_at: refreshExpiresAt,
        revoked_at: null,
        deleted_at: null,
      },
    }),
  ]);

  // 7) Build response
  const response: ICommunityPlatformSiteAdmin.IAuthorized = {
    id: user.id as string & tags.Format<"uuid">,
    userId: adminRow.community_platform_user_id as string & tags.Format<"uuid">,
    grantedAt: toISOStringSafe(adminRow.granted_at),
    revokedAt: adminRow.revoked_at
      ? toISOStringSafe(adminRow.revoked_at)
      : null,
    createdAt: toISOStringSafe(adminRow.created_at),
    updatedAt: toISOStringSafe(adminRow.updated_at),
    deletedAt: adminRow.deleted_at
      ? toISOStringSafe(adminRow.deleted_at)
      : null,
    token: {
      access: accessToken,
      refresh: refreshToken,
      expired_at: accessExpiresAt,
      refreshable_until: refreshExpiresAt,
    },
    admin: {
      id: adminRow.id as string & tags.Format<"uuid">,
      userId: adminRow.community_platform_user_id as string &
        tags.Format<"uuid">,
      grantedAt: toISOStringSafe(adminRow.granted_at),
      revokedAt: adminRow.revoked_at
        ? toISOStringSafe(adminRow.revoked_at)
        : null,
      createdAt: toISOStringSafe(adminRow.created_at),
      updatedAt: toISOStringSafe(adminRow.updated_at),
      deletedAt: adminRow.deleted_at
        ? toISOStringSafe(adminRow.deleted_at)
        : null,
    },
  };

  return response;
}
