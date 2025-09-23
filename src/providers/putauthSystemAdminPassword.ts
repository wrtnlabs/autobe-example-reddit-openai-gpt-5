import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformSystemAdminPassword } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSystemAdminPassword";
import { ICommunityPlatformSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSystemAdmin";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Update password_hash/password_updated_at in
 * community_platform_user_credentials; optionally rotate
 * community_platform_sessions.
 *
 * Changes the authenticated system admin's password after verifying the current
 * password. It updates the credentials' password_hash and password_updated_at
 * (and last_login_at for the credentials record). When requested, it revokes
 * other sessions (sets revoked_at) and issues fresh tokens by creating a new
 * session with a hashed refresh token.
 *
 * Security: Only operates on the authenticated admin (props.systemAdmin). Never
 * stores plaintext; only secure hashes. Returns an updated authorization
 * context including renewed tokens.
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system admin performing the
 *   change
 * @param props.body - Current and new password with optional flags for session
 *   rotation
 * @returns ICommunityPlatformSystemAdmin.IAuthorized containing subject info
 *   and tokens
 * @throws {HttpException} 404 when credentials not found or user not active
 * @throws {HttpException} 403 when current password is invalid
 */
export async function putauthSystemAdminPassword(props: {
  systemAdmin: SystemadminPayload;
  body: ICommunityPlatformSystemAdminPassword.IUpdate;
}): Promise<ICommunityPlatformSystemAdmin.IAuthorized> {
  const { systemAdmin, body } = props;

  // 1) Load active credentials for this user
  const credentials =
    await MyGlobal.prisma.community_platform_user_credentials.findFirst({
      where: {
        community_platform_user_id: systemAdmin.id,
        deleted_at: null,
        user: {
          is: {
            deleted_at: null,
            status: "active",
          },
        },
      },
      select: {
        id: true,
        community_platform_user_id: true,
        password_hash: true,
      },
    });
  if (!credentials)
    throw new HttpException("Not Found: Credentials not found", 404);

  // 2) Verify current password
  const ok = await MyGlobal.password.verify(
    body.current_password,
    credentials.password_hash,
  );
  if (!ok) throw new HttpException("Forbidden: Invalid current password", 403);

  // 3) Hash new password
  const newHash = await MyGlobal.password.hash(body.new_password);

  // Prepare timestamps
  const now = toISOStringSafe(new Date());

  // 4) Update credentials (password_hash, password_updated_at, last_login_at, updated_at)
  await MyGlobal.prisma.community_platform_user_credentials.update({
    where: { id: credentials.id },
    data: {
      password_hash: newHash,
      password_updated_at: now,
      last_login_at: now,
      updated_at: now,
    },
  });

  // 5) Optionally revoke other sessions (best-effort: revoke all active sessions for this user)
  if (body.revoke_other_sessions === true) {
    await MyGlobal.prisma.community_platform_sessions.updateMany({
      where: {
        community_platform_user_id: systemAdmin.id,
        revoked_at: null,
      },
      data: {
        revoked_at: now,
        updated_at: now,
      },
    });
  }

  // 6) Issue fresh tokens and create a new session
  const accessExpiresAt = toISOStringSafe(
    new Date(Date.now() + 15 * 60 * 1000),
  ); // 15 minutes
  const refreshExpiresAt = toISOStringSafe(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  ); // 30 days

  const payload = { sub: systemAdmin.id, type: "systemadmin" } as {
    sub: string & tags.Format<"uuid">;
    type: "systemadmin";
  };
  const accessToken = jwt.sign(payload, MyGlobal.env.JWT_SECRET_KEY, {
    expiresIn: "15m",
  });
  const refreshToken = jwt.sign(payload, MyGlobal.env.JWT_SECRET_KEY, {
    expiresIn: "30d",
  });

  // Store hashed refresh token in a new session
  const sessionId = v4() as string & tags.Format<"uuid">;
  const refreshHash = await MyGlobal.password.hash(refreshToken);

  await MyGlobal.prisma.community_platform_sessions.create({
    data: {
      id: sessionId,
      community_platform_user_id: systemAdmin.id,
      refresh_token_hash: refreshHash,
      user_agent: null,
      ip: null,
      issued_at: now,
      expires_at: refreshExpiresAt,
      revoked_at: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
  });

  // 7) Audit log (optional)
  await MyGlobal.prisma.community_platform_audit_logs.create({
    data: {
      id: v4() as string & tags.Format<"uuid">,
      actor_user_id: systemAdmin.id,
      session_id: sessionId,
      guestvisitor_id: null,
      community_id: null,
      post_id: null,
      comment_id: null,
      membership_id: null,
      event_type: "password_changed",
      success: true,
      details: null,
      ip: null,
      user_agent: null,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    },
  });

  // 8) Load admin user snapshot
  const user = await MyGlobal.prisma.community_platform_users.findFirstOrThrow({
    where: { id: systemAdmin.id, deleted_at: null },
    select: {
      id: true,
      username: true,
      status: true,
      last_login_at: true,
    },
  });

  const authorized: ICommunityPlatformSystemAdmin.IAuthorized = {
    id: user.id as string & tags.Format<"uuid">,
    username: user.username as string & tags.MinLength<3> & tags.MaxLength<64>,
    status: user.status,
    last_login_at: user.last_login_at
      ? toISOStringSafe(user.last_login_at)
      : null,
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
      last_login_at: user.last_login_at
        ? toISOStringSafe(user.last_login_at)
        : null,
    },
  };

  return authorized;
}
