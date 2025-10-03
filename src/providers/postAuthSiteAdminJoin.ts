import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformSiteAdminJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdminJoin";
import { ICommunityPlatformSiteAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdmin";
import { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";

export async function postAuthSiteAdminJoin(props: {
  body: ICommunityPlatformSiteAdminJoin.ICreate;
}): Promise<ICommunityPlatformSiteAdmin.IAuthorized> {
  const { body } = props;

  // Normalize identifiers for CI uniqueness
  const emailNormalized = body.email.trim().toLowerCase();
  const usernameNormalized = body.username.trim().toLowerCase();

  // Duplicate pre-check for clearer 409 before hitting unique index
  const existing = await MyGlobal.prisma.community_platform_users.findFirst({
    where: {
      OR: [
        { email_normalized: emailNormalized },
        { username_normalized: usernameNormalized },
      ],
    },
    select: { id: true },
  });
  if (existing) {
    throw new HttpException("Conflict: email or username already in use", 409);
  }

  // Prepare timestamps
  const now = toISOStringSafe(new Date());
  const accessExpiresAt = toISOStringSafe(
    new Date(Date.now() + 60 * 60 * 1000),
  ); // 1h
  const refreshableUntil = toISOStringSafe(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  ); // 7d

  // Hash password
  const passwordHash = await PasswordUtil.hash(body.password);

  try {
    const result = await MyGlobal.prisma.$transaction(async (tx) => {
      // Create user
      const createdUser = await tx.community_platform_users.create({
        data: {
          id: v4(),
          email: body.email,
          email_normalized: emailNormalized,
          username: body.username,
          username_normalized: usernameNormalized,
          password_hash: passwordHash,
          display_name: body.displayName ?? null,
          last_login_at: now,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      });

      // Grant Site Admin
      const createdAdmin = await tx.community_platform_siteadmins.create({
        data: {
          id: v4(),
          community_platform_user_id: createdUser.id,
          granted_at: now,
          revoked_at: null,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      });

      // Issue JWT tokens
      const accessToken = jwt.sign(
        {
          userId: createdUser.id,
          email: createdUser.email,
          role: "siteadmin",
        },
        MyGlobal.env.JWT_SECRET_KEY,
        {
          expiresIn: "1h",
          issuer: "autobe",
        },
      );
      const refreshToken = jwt.sign(
        {
          userId: createdUser.id,
          tokenType: "refresh",
        },
        MyGlobal.env.JWT_SECRET_KEY,
        {
          expiresIn: "7d",
          issuer: "autobe",
        },
      );

      // Persist long-lived session using hashed refresh token
      await tx.community_platform_sessions.create({
        data: {
          id: v4(),
          community_platform_user_id: createdUser.id,
          hashed_token: await PasswordUtil.hash(refreshToken),
          user_agent: null,
          ip: null,
          client_platform: null,
          client_device: null,
          session_type: "standard",
          created_at: now,
          updated_at: now,
          last_seen_at: now,
          expires_at: refreshableUntil,
          revoked_at: null,
          deleted_at: null,
        },
      });

      return { createdUser, createdAdmin, accessToken, refreshToken };
    });

    // Build response DTOs (reuse prepared timestamps)
    const adminProfile: ICommunityPlatformSiteAdmin = {
      id: result.createdAdmin.id as string & tags.Format<"uuid">,
      userId: result.createdAdmin.community_platform_user_id as string &
        tags.Format<"uuid">,
      grantedAt: now,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    const token: IAuthorizationToken = {
      access: result.accessToken,
      refresh: result.refreshToken,
      expired_at: accessExpiresAt,
      refreshable_until: refreshableUntil,
    };

    const response: ICommunityPlatformSiteAdmin.IAuthorized = {
      id: result.createdUser.id as string & tags.Format<"uuid">,
      userId: result.createdUser.id as string & tags.Format<"uuid">,
      grantedAt: now,
      revokedAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      token,
      admin: adminProfile,
    };

    return response;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Unique constraint violation (email_normalized or username_normalized)
      throw new HttpException(
        "Conflict: email or username already in use",
        409,
      );
    }
    throw err;
  }
}
