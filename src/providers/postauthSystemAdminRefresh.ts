import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSystemAdmin";

/**
 * Refresh admin tokens by validating community_platform_sessions and confirming
 * community_platform_systemadmins role.
 *
 * Exchanges a valid refresh token for new JWTs for an existing system
 * administrator. Steps:
 *
 * 1. Verify provided refresh JWT (issuer: autobe)
 * 2. Locate an active session (revoked_at = null, expires_at > now) for the
 *    decoded user, matching refresh_token_hash
 * 3. Confirm the user still has systemadmin role (revoked_at is null)
 * 4. Rotate refresh token, extend session expiry, and issue new access token
 * 5. Create audit log entry (event_type: "refresh")
 *
 * @param props - Request with refresh token
 * @param props.body - ICommunityPlatformSystemAdmin.IRefresh containing
 *   refresh_token and optional ip/user_agent
 * @returns ICommunityPlatformSystemAdmin.IAuthorized with renewed tokens
 * @throws {HttpException} 400 Bad Request when input invalid
 * @throws {HttpException} 401 Unauthorized when token/session invalid or
 *   expired
 * @throws {HttpException} 403 Forbidden when admin role revoked
 * @throws {HttpException} 500 Internal error on unexpected failures
 */
export async function postauthSystemAdminRefresh(props: {
  body: ICommunityPlatformSystemAdmin.IRefresh;
}): Promise<ICommunityPlatformSystemAdmin.IAuthorized> {
  const { body } = props;
  if (!body || !body.refresh_token) {
    throw new HttpException("Bad Request: refresh_token is required", 400);
  }

  // Step 1: Verify and decode the refresh JWT
  type DecodedRefresh = {
    userId?: string;
    tokenType?: string;
    sessionId?: string;
  };

  let decodedUnknown: unknown;
  try {
    decodedUnknown = jwt.verify(
      body.refresh_token,
      MyGlobal.env.JWT_SECRET_KEY,
      {
        issuer: "autobe",
      },
    );
  } catch {
    throw new HttpException("Unauthorized: Invalid refresh token", 401);
  }

  const decodedValidation = typia.validate<DecodedRefresh>(decodedUnknown);
  if (!decodedValidation.success || !decodedValidation.data.userId) {
    throw new HttpException("Unauthorized: Malformed refresh token", 401);
  }
  const decoded = decodedValidation.data;

  // Generate timestamps
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());

  // Step 2: Find active session for the user and match hash
  const activeSessions =
    await MyGlobal.prisma.community_platform_sessions.findMany({
      where: {
        community_platform_user_id: decoded.userId,
        revoked_at: null,
        expires_at: { gt: now },
      },
      select: {
        id: true,
        community_platform_user_id: true,
        refresh_token_hash: true,
        user_agent: true,
        ip: true,
        issued_at: true,
        expires_at: true,
        revoked_at: true,
        created_at: true,
        updated_at: true,
      },
    });

  let session: (typeof activeSessions)[number] | null = null;
  for (const s of activeSessions) {
    const ok = await MyGlobal.password.verify(
      body.refresh_token,
      s.refresh_token_hash,
    );
    if (ok) {
      session = s;
      break;
    }
  }
  if (!session) {
    throw new HttpException("Unauthorized: Session not found or expired", 401);
  }

  // Step 3: Confirm admin role (not revoked)
  const role = await MyGlobal.prisma.community_platform_systemadmins.findFirst({
    where: {
      community_platform_user_id: session.community_platform_user_id,
      revoked_at: null,
    },
    select: { id: true },
  });
  if (!role) {
    throw new HttpException("Forbidden: Admin role revoked", 403);
  }

  // Fetch user identity surface
  const user = await MyGlobal.prisma.community_platform_users.findUniqueOrThrow(
    {
      where: { id: session.community_platform_user_id },
      select: {
        id: true,
        username: true,
        status: true,
        last_login_at: true,
      },
    },
  );

  // Step 4: Issue tokens and rotate refresh token
  const accessToken = jwt.sign(
    {
      id: user.id,
      type: "systemadmin",
    },
    MyGlobal.env.JWT_SECRET_KEY,
    {
      expiresIn: "1h",
      issuer: "autobe",
    },
  );

  const accessExpiredAt: string & tags.Format<"date-time"> = toISOStringSafe(
    new Date(Date.now() + 60 * 60 * 1000),
  );

  const newRefreshToken = jwt.sign(
    {
      userId: user.id,
      tokenType: "refresh",
      sessionId: session.id,
    },
    MyGlobal.env.JWT_SECRET_KEY,
    {
      expiresIn: "7d",
      issuer: "autobe",
    },
  );

  const newRefreshExpiresAt: string & tags.Format<"date-time"> =
    toISOStringSafe(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

  const newRefreshHash = await MyGlobal.password.hash(newRefreshToken);

  await MyGlobal.prisma.community_platform_sessions.update({
    where: { id: session.id },
    data: {
      refresh_token_hash: newRefreshHash,
      expires_at: newRefreshExpiresAt,
      updated_at: now,
      user_agent: body.user_agent ?? undefined,
      ip: body.ip ?? undefined,
    },
    select: { id: true },
  });

  // Step 5: Audit log (best-effort)
  try {
    await MyGlobal.prisma.community_platform_audit_logs.create({
      data: {
        id: typia.assert<string & tags.Format<"uuid">>(v4()),
        actor_user_id: user.id,
        session_id: session.id,
        event_type: "refresh",
        success: true,
        details: null,
        ip: body.ip ?? null,
        user_agent: body.user_agent ?? null,
        created_at: now,
        updated_at: now,
        deleted_at: null,
      },
      select: { id: true },
    });
  } catch {
    // do not block on audit failures
  }

  // Build response strictly with correct null/undefined handling
  const authorized = typia.assert<ICommunityPlatformSystemAdmin.IAuthorized>({
    id: user.id,
    username: user.username,
    status: user.status,
    last_login_at: user.last_login_at
      ? toISOStringSafe(user.last_login_at)
      : null,
    token: typia.assert({
      access: accessToken,
      refresh: newRefreshToken,
      expired_at: accessExpiredAt,
      refreshable_until: newRefreshExpiresAt,
    }),
    admin: typia.assert<ICommunityPlatformSystemAdmin>({
      id: user.id,
      username: user.username,
      status: user.status,
      last_login_at: user.last_login_at
        ? toISOStringSafe(user.last_login_at)
        : null,
    }),
  });

  return authorized;
}
