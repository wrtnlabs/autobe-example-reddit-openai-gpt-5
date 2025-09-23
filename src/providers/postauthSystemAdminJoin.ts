import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformSystemAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSystemAdmin";

/**
 * Register a new system administrator and issue initial session tokens.
 *
 * This endpoint provisions a base user (community_platform_users), secure
 * credentials (community_platform_user_credentials), assigns admin role
 * (community_platform_systemadmins), and creates an initial session
 * (community_platform_sessions) storing only a refresh token hash. It returns
 * access/refresh JWTs and the subject identity in
 * ICommunityPlatformSystemAdmin.IAuthorized.
 *
 * Public endpoint: no prior authentication. Validations include uniqueness
 * checks on username and email. Passwords are hashed via MyGlobal.password
 * utilities (never stored in plaintext).
 *
 * @param props - Request properties
 * @param props.body - Registration payload including username, email, password,
 *   optional user_agent and ip
 * @returns Authorized admin session with tokens and identity snapshot
 * @throws {HttpException} 409 when username/email already exist
 * @throws {HttpException} 400 on invalid input
 * @throws {HttpException} 500 on unexpected errors
 */
export async function postauthSystemAdminJoin(props: {
  body: ICommunityPlatformSystemAdmin.ICreate;
}): Promise<ICommunityPlatformSystemAdmin.IAuthorized> {
  const { body } = props;

  // Normalize and timestamps
  const emailNormalized = body.email.toLowerCase();
  const now = toISOStringSafe(new Date());
  const accessExpiredAt = toISOStringSafe(
    new Date(Date.now() + 60 * 60 * 1000),
  ); // 1 hour
  const refreshableUntil = toISOStringSafe(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  ); // 7 days

  // Pre-validate duplicates to provide clear 409s
  const [existingUser, existingCred] = await Promise.all([
    MyGlobal.prisma.community_platform_users.findUnique({
      where: { username: body.username },
      select: { id: true },
    }),
    MyGlobal.prisma.community_platform_user_credentials.findFirst({
      where: {
        OR: [{ email: body.email }, { email_normalized: emailNormalized }],
      },
      select: { id: true },
    }),
  ]);

  if (existingUser) {
    throw new HttpException("Conflict: Username already exists", 409);
  }
  if (existingCred) {
    throw new HttpException("Conflict: Email already exists", 409);
  }

  // Generate identifiers
  const userId = v4();
  const credentialId = v4();
  const adminId = v4();
  const sessionId = v4();

  // Hash secrets
  const passwordHash = await MyGlobal.password.hash(body.password);

  // JWT generation
  const accessToken = jwt.sign(
    { id: userId, type: "systemadmin" },
    MyGlobal.env.JWT_SECRET_KEY,
    { expiresIn: "1h", issuer: "autobe" },
  );
  const refreshToken = jwt.sign(
    { id: userId, type: "systemadmin", tokenType: "refresh" },
    MyGlobal.env.JWT_SECRET_KEY,
    { expiresIn: "7d", issuer: "autobe" },
  );
  const refreshTokenHash = await MyGlobal.password.hash(refreshToken);

  try {
    await MyGlobal.prisma.$transaction(async (tx) => {
      // Create base user
      await tx.community_platform_users.create({
        data: {
          id: userId,
          username: body.username,
          status: "active",
          last_login_at: null,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      });

      // Bind credentials
      await tx.community_platform_user_credentials.create({
        data: {
          id: credentialId,
          community_platform_user_id: userId,
          email: body.email,
          email_normalized: emailNormalized,
          email_verified_at: null,
          password_hash: passwordHash,
          password_updated_at: now,
          last_login_at: null,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      });

      // Grant admin role
      await tx.community_platform_systemadmins.create({
        data: {
          id: adminId,
          community_platform_user_id: userId,
          granted_by_user_id: null,
          granted_at: now,
          revoked_at: null,
          reason: null,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      });

      // Issue session (store only refresh token hash)
      await tx.community_platform_sessions.create({
        data: {
          id: sessionId,
          community_platform_user_id: userId,
          refresh_token_hash: refreshTokenHash,
          user_agent: body.user_agent ?? null,
          ip: body.ip ?? null,
          issued_at: now,
          expires_at: refreshableUntil,
          revoked_at: null,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      });

      // Update last_login_at after successful issuance
      await tx.community_platform_users.update({
        where: { id: userId },
        data: { last_login_at: now, updated_at: now },
      });
      await tx.community_platform_user_credentials.update({
        where: { community_platform_user_id: userId },
        data: { last_login_at: now, updated_at: now },
      });

      // Audit log (optional but recommended)
      await tx.community_platform_audit_logs.create({
        data: {
          id: v4(),
          actor_user_id: userId,
          session_id: sessionId,
          guestvisitor_id: null,
          community_id: null,
          post_id: null,
          comment_id: null,
          membership_id: null,
          event_type: "admin_join",
          success: true,
          details: null,
          ip: body.ip ?? null,
          user_agent: body.user_agent ?? null,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        throw new HttpException("Conflict: Unique constraint violated", 409);
      }
      throw new HttpException("Bad Request: Database constraint error", 400);
    }
    throw new HttpException("Internal Server Error", 500);
  }

  // Construct response
  return {
    id: userId as string & tags.Format<"uuid">,
    username: body.username,
    status: "active",
    last_login_at: now,
    token: {
      access: accessToken,
      refresh: refreshToken,
      expired_at: accessExpiredAt,
      refreshable_until: refreshableUntil,
    },
    admin: {
      id: userId as string & tags.Format<"uuid">,
      username: body.username,
      status: "active",
      last_login_at: now,
    },
  };
}
