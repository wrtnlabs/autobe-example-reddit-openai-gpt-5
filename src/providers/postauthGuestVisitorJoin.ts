import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitor";
import { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

export async function postAuthGuestVisitorJoin(props: {
  body: ICommunityPlatformGuestVisitor.IJoin;
}): Promise<ICommunityPlatformGuestVisitor.IAuthorized> {
  /**
   * Registers a temporary guest identity and creates an initial session.
   *
   * - Creates a row in Actors.community_platform_users with normalized unique
   *   keys
   * - Hashes the provided (or generated) password using PasswordUtil
   * - Establishes a session in Sessions.community_platform_sessions with a hashed
   *   token
   * - Issues JWT access and refresh tokens for client use
   *
   * Public endpoint: no authentication required.
   *
   * @param props - Request properties
   * @param props.body - Guest join payload (optional identity inputs and client
   *   hints)
   * @returns Authorization payload containing user id, tokens, and optional
   *   user summary
   * @throws {HttpException} 409 on normalized email/username uniqueness
   *   conflict
   * @throws {HttpException} 500 on unexpected errors during creation
   */
  const { body } = props;

  // Helper to generate safe ephemeral values when omitted
  const randomSuffix = v4().replace(/-/g, "").slice(0, 12);
  const generatedEmail = `guest-${randomSuffix}@example.com`;
  const providedEmail =
    body.email && body.email.trim().length > 0
      ? body.email.trim()
      : generatedEmail;
  const emailNormalized = providedEmail.toLowerCase();

  const generatedUsername = `guest_${randomSuffix}`;
  const providedUsername =
    body.username && body.username.trim().length > 0
      ? body.username.trim()
      : generatedUsername;
  const usernameNormalized = providedUsername.toLowerCase();

  const generatedPassword = `GUEST_${v4()}_${randomSuffix}`;
  const plainPassword =
    body.password && body.password.length > 0
      ? body.password
      : generatedPassword;

  // Timepoints
  const now = toISOStringSafe(new Date());
  const accessExpiredAt = toISOStringSafe(
    new Date(Date.now() + 60 * 60 * 1000),
  ); // 1h
  const refreshableUntil = toISOStringSafe(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  ); // 7d

  // Pre-generate IDs (must provide; schema has no defaults)
  const userId = typia.assert<string & tags.Format<"uuid">>(v4());
  const sessionId = typia.assert<string & tags.Format<"uuid">>(v4());

  // Generate a session token string and hash it for storage (plaintext never stored)
  const sessionPlainToken = `${v4()}.${v4()}.${randomSuffix}`;

  try {
    await MyGlobal.prisma.$transaction(async (tx) => {
      const passwordHash = await PasswordUtil.hash(plainPassword);

      // Create user
      await tx.community_platform_users.create({
        data: {
          id: userId,
          email: providedEmail,
          email_normalized: emailNormalized,
          username: providedUsername,
          username_normalized: usernameNormalized,
          password_hash: passwordHash,
          display_name: body.displayName ?? null,
          last_login_at: now,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      });

      // Prepare client context (nullable fields)
      const client = body.client;

      // Create session
      const hashedToken = await PasswordUtil.hash(sessionPlainToken);
      await tx.community_platform_sessions.create({
        data: {
          id: sessionId,
          community_platform_user_id: userId,
          hashed_token: hashedToken,
          user_agent: client?.userAgent ?? null,
          ip: client?.ip ?? null,
          client_platform: client?.clientPlatform ?? null,
          client_device: client?.clientDevice ?? null,
          session_type: client?.sessionType ?? null,
          created_at: now,
          updated_at: now,
          last_seen_at: now,
          expires_at: refreshableUntil,
          revoked_at: null,
          deleted_at: null,
        },
      });
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Unique constraint violation on email_normalized or username_normalized
      throw new HttpException(
        "Conflict: Email or username already exists (case-insensitive)",
        409,
      );
    }
    throw new HttpException(
      "Internal Server Error: Failed to register guest user",
      500,
    );
  }

  // Issue JWT tokens (payload minimal and role-specific)
  const access = jwt.sign(
    {
      id: userId,
      type: "guestvisitor",
    },
    MyGlobal.env.JWT_SECRET_KEY,
    { expiresIn: "1h", issuer: "autobe" },
  );

  const refresh = jwt.sign(
    {
      id: userId,
      type: "guestvisitor",
      tokenType: "refresh",
    },
    MyGlobal.env.JWT_SECRET_KEY,
    { expiresIn: "7d", issuer: "autobe" },
  );

  // Build optional user summary for convenience
  const userSummary: ICommunityPlatformUser.ISummary = {
    id: userId,
    username: providedUsername,
    email: providedEmail,
    display_name: body.displayName ?? null,
    last_login_at: now,
    created_at: now,
    updated_at: now,
  };

  const token: IAuthorizationToken = {
    access,
    refresh,
    expired_at: accessExpiredAt,
    refreshable_until: refreshableUntil,
  };

  return {
    id: userId,
    token,
    user: userSummary,
  };
}
