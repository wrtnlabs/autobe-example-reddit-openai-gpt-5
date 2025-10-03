import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

export async function postAuthRegisteredMemberLogin(props: {
  body: ICommunityPlatformRegisteredMember.ILogin;
}): Promise<ICommunityPlatformRegisteredMember.IAuthorized> {
  const { body } = props;

  // Normalize identifier to match normalized columns
  const identifierNormalized = body.identifier.trim().toLowerCase();

  // Find active user by normalized email or username
  const user = await MyGlobal.prisma.community_platform_users.findFirst({
    where: {
      deleted_at: null,
      OR: [
        { email_normalized: identifierNormalized },
        { username_normalized: identifierNormalized },
      ],
    },
  });
  if (!user) {
    throw new HttpException("Login failed. Please try again.", 401);
  }

  // Verify password using PasswordUtil
  const isValid = await PasswordUtil.verify(body.password, user.password_hash);
  if (!isValid) {
    throw new HttpException("Login failed. Please try again.", 401);
  }

  // Ensure user has an active registered member assignment
  const membership =
    await MyGlobal.prisma.community_platform_registeredmembers.findFirst({
      where: {
        community_platform_user_id: user.id,
        deleted_at: null,
      },
    });
  if (!membership) {
    throw new HttpException("Login failed. Please try again.", 401);
  }

  // Timestamps
  const now = toISOStringSafe(new Date());
  const accessExpiresAt = toISOStringSafe(
    new Date(Date.now() + 60 * 60 * 1000),
  ); // +1h
  const refreshableUntil = toISOStringSafe(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  ); // +7d

  // JWT payloads (RegisteredmemberPayload shape)
  const accessPayload = {
    id: user.id,
    type: "registeredmember",
    registered_at: membership.registered_at
      ? toISOStringSafe(membership.registered_at)
      : undefined,
    display_name: user.display_name ?? undefined,
    username: user.username,
    email: user.email,
  };

  const accessToken = jwt.sign(accessPayload, MyGlobal.env.JWT_SECRET_KEY, {
    expiresIn: "1h",
    issuer: "autobe",
  });

  const refreshPayload = {
    id: user.id,
    type: "registeredmember",
    tokenType: "refresh",
  };
  const refreshToken = jwt.sign(refreshPayload, MyGlobal.env.JWT_SECRET_KEY, {
    expiresIn: "7d",
    issuer: "autobe",
  });

  // Persist session with hashed refresh token
  const hashed = await PasswordUtil.hash(refreshToken);
  await MyGlobal.prisma.community_platform_sessions.create({
    data: {
      id: v4(),
      community_platform_user_id: user.id,
      hashed_token: hashed,
      created_at: now,
      updated_at: now,
      last_seen_at: now,
      expires_at: refreshableUntil,
      revoked_at: null,
      deleted_at: null,
    },
  });

  // Update user's last_login_at and updated_at, then build summary
  const updated = await MyGlobal.prisma.community_platform_users.update({
    where: { id: user.id },
    data: { last_login_at: now, updated_at: now },
    select: {
      id: true,
      username: true,
      email: true,
      display_name: true,
      last_login_at: true,
      created_at: true,
      updated_at: true,
    },
  });

  const summary: ICommunityPlatformUser.ISummary = {
    id: updated.id as string & tags.Format<"uuid">,
    username: updated.username,
    email: updated.email,
    display_name: updated.display_name ?? null,
    last_login_at: updated.last_login_at
      ? toISOStringSafe(updated.last_login_at)
      : null,
    created_at: toISOStringSafe(updated.created_at),
    updated_at: toISOStringSafe(updated.updated_at),
  };

  const token: IAuthorizationToken = {
    access: accessToken,
    refresh: refreshToken,
    expired_at: accessExpiresAt,
    refreshable_until: refreshableUntil,
  };

  return {
    id: updated.id as string & tags.Format<"uuid">,
    token,
    user: summary,
  };
}
