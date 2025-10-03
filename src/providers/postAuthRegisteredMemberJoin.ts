import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import { IClientContext } from "@ORGANIZATION/PROJECT-api/lib/structures/IClientContext";
import { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";

export async function postAuthRegisteredMemberJoin(props: {
  body: ICommunityPlatformRegisteredMember.IJoin;
}): Promise<ICommunityPlatformRegisteredMember.IAuthorized> {
  const { body } = props;

  // Normalize identifiers for case-insensitive uniqueness
  const emailNormalized = body.email.trim().toLowerCase();
  const usernameNormalized = body.username.trim().toLowerCase();

  // Duplicate check before attempting to create (helpful error message)
  const duplicate = await MyGlobal.prisma.community_platform_users.findFirst({
    where: {
      OR: [
        { email_normalized: emailNormalized },
        { username_normalized: usernameNormalized },
      ],
    },
    select: { id: true },
  });
  if (duplicate) {
    throw new HttpException("Conflict: Email or username already in use", 409);
  }

  // Prepare cryptographic and timestamp values
  const passwordHash = await PasswordUtil.hash(body.password);
  const now = toISOStringSafe(new Date());
  const accessExpiresAt = toISOStringSafe(
    new Date(Date.now() + 60 * 60 * 1000),
  ); // 1 hour
  const refreshExpiresAt = toISOStringSafe(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  ); // 7 days

  // Generate IDs
  const userId = v4() as string & tags.Format<"uuid">;
  const memberId = v4() as string & tags.Format<"uuid">;
  const sessionId = v4() as string & tags.Format<"uuid">;

  // Issue JWTs
  const accessToken = jwt.sign(
    {
      id: userId,
      type: "registeredmember",
      registered_at: now,
      username: body.username,
      email: body.email,
    },
    MyGlobal.env.JWT_SECRET_KEY,
    { expiresIn: "1h", issuer: "autobe" },
  );
  const refreshToken = jwt.sign(
    {
      id: userId,
      type: "registeredmember",
      tokenType: "refresh",
    },
    MyGlobal.env.JWT_SECRET_KEY,
    { expiresIn: "7d", issuer: "autobe" },
  );

  // Hash the refresh token for session storage (never store plaintext)
  const hashedSessionToken = await PasswordUtil.hash(refreshToken);

  try {
    // Atomic creation of user, member role, and session
    const createdUser = await MyGlobal.prisma.$transaction(async (tx) => {
      const user = await tx.community_platform_users.create({
        data: {
          id: userId,
          email: body.email,
          email_normalized: emailNormalized,
          username: body.username,
          username_normalized: usernameNormalized,
          password_hash: passwordHash,
          display_name: body.displayName ?? null,
          last_login_at: now,
          created_at: now,
          updated_at: now,
        },
      });

      await tx.community_platform_registeredmembers.create({
        data: {
          id: memberId,
          community_platform_user_id: user.id,
          registered_at: now,
          created_at: now,
          updated_at: now,
        },
      });

      await tx.community_platform_sessions.create({
        data: {
          id: sessionId,
          community_platform_user_id: user.id,
          hashed_token: hashedSessionToken,
          user_agent: body.client?.userAgent ?? null,
          ip: body.client?.ip ?? null,
          client_platform: body.client?.clientPlatform ?? null,
          client_device: body.client?.clientDevice ?? null,
          session_type: body.client?.sessionType ?? null,
          created_at: now,
          updated_at: now,
          last_seen_at: now,
          expires_at: refreshExpiresAt,
          revoked_at: null,
          deleted_at: null,
        },
      });

      return user;
    });

    // Build authorization response
    const response: ICommunityPlatformRegisteredMember.IAuthorized = {
      id: createdUser.id as string & tags.Format<"uuid">,
      token: {
        access: accessToken,
        refresh: refreshToken,
        expired_at: accessExpiresAt,
        refreshable_until: refreshExpiresAt,
      },
      user: {
        id: createdUser.id as string & tags.Format<"uuid">,
        username: createdUser.username,
        email: createdUser.email,
        display_name: createdUser.display_name ?? null,
        last_login_at: createdUser.last_login_at
          ? toISOStringSafe(createdUser.last_login_at)
          : null,
        created_at: toISOStringSafe(createdUser.created_at),
        updated_at: toISOStringSafe(createdUser.updated_at),
      },
    };

    return response;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Unique constraint failed on the fields: (`email_normalized`) or (`username_normalized`) or (`hashed_token`)
      throw new HttpException("Conflict: Duplicate key detected", 409);
    }
    throw err;
  }
}
