import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSystemAdmin";

/**
 * Authenticate an admin and establish a session.
 *
 * Looks up credentials by email (normalized) or username, verifies password,
 * ensures the user is active and has an unrevoke admin assignment, creates a
 * session persisting only the refresh token hash, updates last_login_at on both
 * user and credentials, writes an audit "login" entry, and returns
 * IAuthorizationToken with access/refresh tokens and subject info.
 *
 * Security:
 *
 * - Public endpoint (no decorator auth). Password verified via MyGlobal.password.
 * - Refresh token is hashed before persisting in community_platform_sessions.
 * - JWT tokens use issuer 'autobe'.
 *
 * @param props - Request properties
 * @param props.body - Login payload containing exactly one of email or
 *   username, and password. Optional ip/user_agent can be included.
 * @returns Authorized admin response with tokens and identity snapshot
 * @throws {HttpException} 400 When neither or both of email/username are
 *   provided
 * @throws {HttpException} 401 When credentials are invalid
 * @throws {HttpException} 403 When user is not active or not an admin
 */
export async function postauthSystemAdminLogin(props: {
  body: ICommunityPlatformSystemAdmin.ILogin;
}): Promise<ICommunityPlatformSystemAdmin.IAuthorized> {
  const { body } = props;

  const hasEmail = body && body.email !== undefined && body.email !== null;
  const hasUsername =
    body && body.username !== undefined && body.username !== null;

  if ((hasEmail ? 1 : 0) + (hasUsername ? 1 : 0) !== 1) {
    throw new HttpException(
      "Bad Request: Provide exactly one of email or username",
      400,
    );
  }
  if (!body || body.password === undefined || body.password === null) {
    throw new HttpException("Bad Request: Missing password", 400);
  }

  // Identify credentials and user
  let credentials: {
    id: string;
    community_platform_user_id: string;
    password_hash: string;
  } | null = null;
  let user: {
    id: string;
    username: string;
    status: string;
  } | null = null;

  if (hasEmail) {
    const emailNormalized = String(body.email).toLowerCase();
    const cred =
      await MyGlobal.prisma.community_platform_user_credentials.findFirst({
        where: {
          email_normalized: emailNormalized,
          deleted_at: null,
        },
      });
    if (!cred) {
      throw new HttpException("Unauthorized: Invalid credentials", 401);
    }
    credentials = {
      id: cred.id,
      community_platform_user_id: cred.community_platform_user_id,
      password_hash: cred.password_hash,
    };
    const u = await MyGlobal.prisma.community_platform_users.findUnique({
      where: { id: cred.community_platform_user_id },
    });
    if (!u) throw new HttpException("Unauthorized: Invalid credentials", 401);
    user = { id: u.id, username: u.username, status: u.status };
  } else {
    const u = await MyGlobal.prisma.community_platform_users.findUnique({
      where: { username: body.username },
    });
    if (!u) throw new HttpException("Unauthorized: Invalid credentials", 401);
    user = { id: u.id, username: u.username, status: u.status };
    const cred =
      await MyGlobal.prisma.community_platform_user_credentials.findFirst({
        where: {
          community_platform_user_id: u.id,
          deleted_at: null,
        },
      });
    if (!cred)
      throw new HttpException("Unauthorized: Invalid credentials", 401);
    credentials = {
      id: cred.id,
      community_platform_user_id: cred.community_platform_user_id,
      password_hash: cred.password_hash,
    };
  }

  // Verify password
  const ok = await MyGlobal.password.verify(
    String(body.password),
    credentials.password_hash,
  );
  if (!ok) {
    throw new HttpException("Unauthorized: Invalid credentials", 401);
  }

  // Status and admin role checks
  if (user.status !== "active") {
    throw new HttpException("Forbidden: Account is not active", 403);
  }
  const adminRole =
    await MyGlobal.prisma.community_platform_systemadmins.findFirst({
      where: {
        community_platform_user_id: user.id,
        revoked_at: null,
        deleted_at: null,
      },
    });
  if (!adminRole) {
    throw new HttpException("Forbidden: Admin role required", 403);
  }

  // Timestamps
  const now = toISOStringSafe(new Date());
  const accessExpiresAt = toISOStringSafe(
    new Date(Date.now() + 60 * 60 * 1000),
  ); // 1h
  const refreshExpiresAt = toISOStringSafe(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  ); // 7d

  // Tokens
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
  const refreshToken = jwt.sign(
    {
      id: user.id,
      type: "systemadmin",
      tokenType: "refresh",
    },
    MyGlobal.env.JWT_SECRET_KEY,
    {
      expiresIn: "7d",
      issuer: "autobe",
    },
  );

  // Session: store only refresh token hash
  const refreshTokenHash = await MyGlobal.password.hash(refreshToken);
  const sessionId = v4() as string & tags.Format<"uuid">;

  await MyGlobal.prisma.community_platform_sessions.create({
    data: {
      id: sessionId,
      community_platform_user_id: user.id,
      refresh_token_hash: refreshTokenHash,
      user_agent: body.user_agent ?? null,
      ip: body.ip ?? null,
      issued_at: now,
      expires_at: refreshExpiresAt,
      revoked_at: null,
      created_at: now,
      updated_at: now,
    },
  });

  // Update last_login_at in both user and credentials
  await Promise.all([
    MyGlobal.prisma.community_platform_users.update({
      where: { id: user.id },
      data: { last_login_at: now, updated_at: now },
    }),
    MyGlobal.prisma.community_platform_user_credentials.update({
      where: { id: credentials.id },
      data: { last_login_at: now, updated_at: now },
    }),
  ]);

  // Audit log (login)
  const auditId = v4() as string & tags.Format<"uuid">;
  await MyGlobal.prisma.community_platform_audit_logs.create({
    data: {
      id: auditId,
      actor_user_id: user.id,
      session_id: sessionId,
      guestvisitor_id: null,
      community_id: null,
      post_id: null,
      comment_id: null,
      membership_id: null,
      event_type: "login",
      success: true,
      details: null,
      ip: body.ip ?? null,
      user_agent: body.user_agent ?? null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
  });

  return {
    id: user.id as string & tags.Format<"uuid">,
    username: user.username as string & tags.MinLength<3> & tags.MaxLength<64>,
    status: user.status,
    last_login_at: now,
    token: {
      access: accessToken,
      refresh: refreshToken,
      expired_at: accessExpiresAt,
      refreshable_until: refreshExpiresAt,
    },
    admin: {
      id: user.id as string & tags.Format<"uuid">,
      username: user.username as string &
        tags.MinLength<3> &
        tags.MaxLength<64>,
      status: user.status,
      last_login_at: now,
    },
  };
}
