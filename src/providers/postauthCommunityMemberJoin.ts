import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";

/**
 * Register a community member and issue authorization tokens.
 *
 * This operation creates a backbone identity (community_platform_users), binds
 * credentials (community_platform_user_credentials) with hashed password and
 * normalized email, assigns the communityMember role
 * (community_platform_communitymembers), and establishes an initial session
 * (community_platform_sessions) storing only a hash of the refresh token.
 *
 * Security:
 *
 * - Passwords are hashed using MyGlobal.password.hash and never stored in plain.
 * - Email normalization enforces case-insensitive uniqueness via
 *   email_normalized.
 * - Tokens are signed with issuer "autobe" and lifetimes access=1h, refresh=7d.
 *
 * @param props - Request containing the registration payload
 * @param props.body - ICommunityPlatformCommunityMember.ICreate input with
 *   username, email, password
 * @returns IAuthorized bundle including access/refresh tokens and subject id,
 *   with optional hydrated user
 * @throws {HttpException} 409 when username or email already exists
 * @throws {HttpException} 500 on unexpected errors
 */
export async function postauthCommunityMemberJoin(props: {
  body: ICommunityPlatformCommunityMember.ICreate;
}): Promise<ICommunityPlatformCommunityMember.IAuthorized> {
  const { body } = props;

  // Normalize & prepare core values
  const now = toISOStringSafe(new Date());
  const accessExpiredAt = toISOStringSafe(
    new Date(Date.now() + 60 * 60 * 1000),
  );
  const refreshableUntil = toISOStringSafe(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  );
  const emailNormalized = body.email.toLowerCase();

  // Enforce uniqueness proactively (in addition to DB-level constraints)
  const [dupUsername, dupEmail] = await Promise.all([
    MyGlobal.prisma.community_platform_users.findFirst({
      where: { username: body.username },
      select: { id: true },
    }),
    MyGlobal.prisma.community_platform_user_credentials.findFirst({
      where: { email_normalized: emailNormalized },
      select: { id: true },
    }),
  ]);
  if (dupUsername)
    throw new HttpException("Conflict: Username already exists", 409);
  if (dupEmail) throw new HttpException("Conflict: Email already exists", 409);

  // Generate identifiers
  const userId = v4() as string & tags.Format<"uuid">;
  const credId = v4() as string & tags.Format<"uuid">;
  const memberId = v4() as string & tags.Format<"uuid">;
  const sessionId = v4() as string & tags.Format<"uuid">;

  // Hash password
  const passwordHash = await MyGlobal.password.hash(body.password);

  // Prepare JWTs (refresh token needed before session creation to store its hash)
  const accessToken = jwt.sign(
    {
      id: userId,
      type: "communityMember",
      community_member_status: "active",
      community_member_since_at: now,
    },
    MyGlobal.env.JWT_SECRET_KEY,
    { expiresIn: "1h", issuer: "autobe" },
  );
  const refreshToken = jwt.sign(
    { userId: userId, tokenType: "refresh" },
    MyGlobal.env.JWT_SECRET_KEY,
    { expiresIn: "7d", issuer: "autobe" },
  );
  const refreshTokenHash = await MyGlobal.password.hash(refreshToken);

  try {
    await MyGlobal.prisma.$transaction(async (tx) => {
      // 1) Create user backbone
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

      // 2) Create credentials
      await tx.community_platform_user_credentials.create({
        data: {
          id: credId,
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

      // 3) Assign community member role
      await tx.community_platform_communitymembers.create({
        data: {
          id: memberId,
          community_platform_user_id: userId,
          status: "active",
          since_at: now,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      });

      // 4) Create session for refresh management
      await tx.community_platform_sessions.create({
        data: {
          id: sessionId,
          community_platform_user_id: userId,
          refresh_token_hash: refreshTokenHash,
          user_agent: null,
          ip: null,
          issued_at: now,
          expires_at: refreshableUntil,
          revoked_at: null,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      });
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Unique constraint failed (username/email/email_normalized/refresh_token_hash)
      throw new HttpException("Conflict: Duplicate value", 409);
    }
    throw new HttpException("Internal Server Error", 500);
  }

  // Build hydrated user response using prepared timestamp strings
  const user = {
    id: userId,
    username: body.username as string & tags.MinLength<1>,
    status: "active" as string & tags.MinLength<1>,
    last_login_at: null,
    created_at: now,
    updated_at: now,
  };

  return {
    id: userId,
    token: {
      access: accessToken,
      refresh: refreshToken,
      expired_at: accessExpiredAt,
      refreshable_until: refreshableUntil,
    },
    user,
  };
}
