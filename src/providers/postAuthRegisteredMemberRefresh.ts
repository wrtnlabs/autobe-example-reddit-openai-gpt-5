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
import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

export async function postAuthRegisteredMemberRefresh(props: {
  registeredMember: RegisteredmemberPayload;
  body: ICommunityPlatformRegisteredMember.IRefresh;
}): Promise<ICommunityPlatformRegisteredMember.IAuthorized> {
  /**
   * Refresh a member session using community_platform_sessions as source of
   * truth.
   *
   * Validates an existing session for the authenticated registered member (not
   * revoked, not expired), updates last_seen_at/updated_at, rotates the refresh
   * token, and issues a fresh access token while preserving payload structure
   * used at login/join.
   *
   * @param props - Request properties
   * @param props.registeredMember - Authenticated member payload (Bearer JWT)
   * @param props.body - Optional refresh context (sessionId, refreshToken)
   * @returns Authorized payload containing new access/refresh tokens and user
   *   summary
   * @throws {HttpException} 401 when unauthenticated or session
   *   invalid/expired/revoked
   */
  const { registeredMember, body } = props;

  // Guard: must be authenticated
  if (
    !registeredMember ||
    !registeredMember.id ||
    registeredMember.type !== "registeredmember"
  ) {
    throw new HttpException("Please sign in to continue.", 401);
  }

  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());

  // Locate an active, non-revoked, non-expired session for this user
  const session = body.sessionId
    ? await MyGlobal.prisma.community_platform_sessions.findFirst({
        where: {
          id: body.sessionId,
          community_platform_user_id: registeredMember.id,
          revoked_at: null,
          deleted_at: null,
          expires_at: { gt: now },
        },
      })
    : await MyGlobal.prisma.community_platform_sessions.findFirst({
        where: {
          community_platform_user_id: registeredMember.id,
          revoked_at: null,
          deleted_at: null,
          expires_at: { gt: now },
        },
        orderBy: { updated_at: "desc" },
      });

  if (!session) {
    throw new HttpException("Please sign in to continue.", 401);
  }

  // If a plaintext refresh token is provided, verify it against stored hash
  if (body.refreshToken !== undefined && body.refreshToken !== null) {
    const ok = await PasswordUtil.verify(
      body.refreshToken,
      session.hashed_token,
    );
    if (!ok) {
      throw new HttpException("Please sign in to continue.", 401);
    }
  }

  // Load user and ensure not soft-deleted
  const user = await MyGlobal.prisma.community_platform_users.findFirst({
    where: { id: registeredMember.id, deleted_at: null },
  });
  if (!user) {
    throw new HttpException("Please sign in to continue.", 401);
  }

  // Optional membership info for registered_at enrichment
  const membership =
    await MyGlobal.prisma.community_platform_registeredmembers.findFirst({
      where: {
        community_platform_user_id: registeredMember.id,
        deleted_at: null,
      },
    });

  // Token expirations
  const accessExpiresAt: string & tags.Format<"date-time"> = toISOStringSafe(
    new Date(Date.now() + 60 * 60 * 1000), // +1 hour
  );
  const refreshExpiresAt: string & tags.Format<"date-time"> = toISOStringSafe(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // +7 days
  );

  // Access token payload must match RegisteredmemberPayload structure used at login/join
  const accessPayload: RegisteredmemberPayload = {
    id: registeredMember.id,
    type: "registeredmember",
    registered_at: membership
      ? toISOStringSafe(membership.registered_at)
      : undefined,
    display_name: user.display_name ?? null,
    username: user.username,
    email: user.email,
  };

  const accessToken = jwt.sign(accessPayload, MyGlobal.env.JWT_SECRET_KEY, {
    expiresIn: "1h",
    issuer: "autobe",
  });

  // Rotate refresh token and persist new hash into the session
  const refreshToken = jwt.sign(
    {
      id: registeredMember.id,
      type: "registeredmember",
      tokenType: "refresh",
      sessionId: session.id,
    },
    MyGlobal.env.JWT_SECRET_KEY,
    { expiresIn: "7d", issuer: "autobe" },
  );

  const hashedRefresh = await PasswordUtil.hash(refreshToken);

  // Extend/refresh session lifecycle metadata
  await MyGlobal.prisma.community_platform_sessions.update({
    where: { id: session.id },
    data: {
      hashed_token: hashedRefresh,
      last_seen_at: now,
      updated_at: now,
      expires_at: refreshExpiresAt,
    },
  });

  // Compose optional user summary for convenience
  const userSummary: ICommunityPlatformUser.ISummary = {
    id: registeredMember.id,
    username: user.username,
    email: user.email,
    display_name: user.display_name ?? null,
    last_login_at: user.last_login_at
      ? toISOStringSafe(user.last_login_at)
      : null,
    created_at: toISOStringSafe(user.created_at),
    updated_at: toISOStringSafe(user.updated_at),
  };

  return {
    id: registeredMember.id,
    token: {
      access: accessToken,
      refresh: refreshToken,
      expired_at: accessExpiresAt,
      refreshable_until: refreshExpiresAt,
    },
    user: userSummary,
  };
}
