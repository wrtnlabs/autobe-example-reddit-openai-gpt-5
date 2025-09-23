import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";

/**
 * Authenticate a communityMember using email or username and issue a session.
 *
 * Verifies credentials against community_platform_user_credentials (by
 * email_normalized or by username cross-lookup via community_platform_users),
 * updates last_login_at on both users and credentials upon success, creates a
 * new session in community_platform_sessions, and returns JWT access/refresh
 * tokens with expirations.
 *
 * @param props - Request properties
 * @param props.body - Login payload using either email+password or
 *   username+password
 * @returns Authorized subject with token bundle and hydrated user snapshot
 * @throws {HttpException} 401 when account not found or password mismatch
 */
export async function postauthCommunityMemberLogin(props: {
  body: ICommunityPlatformCommunityMember.ILogin;
}): Promise<ICommunityPlatformCommunityMember.IAuthorized> {
  const { body } = props;

  // 1) Locate user and credentials
  let user: {
    id: string;
    username: string;
    status: string;
    last_login_at: Date | null;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  } | null = null;

  let credentials: {
    id: string;
    community_platform_user_id: string;
    email: string;
    email_normalized: string;
    password_hash: string;
    last_login_at: Date | null;
  } | null = null;

  try {
    if ("email" in body) {
      const found =
        await MyGlobal.prisma.community_platform_user_credentials.findUnique({
          where: { email_normalized: body.email.toLowerCase() },
          include: { user: true },
        });
      if (!found || !found.user)
        throw new HttpException("Unauthorized: Invalid credentials", 401);
      credentials = {
        id: found.id,
        community_platform_user_id: found.community_platform_user_id,
        email: found.email,
        email_normalized: found.email_normalized,
        password_hash: found.password_hash,
        last_login_at: found.last_login_at,
      };
      user = found.user;
    } else if ("username" in body) {
      const foundUser =
        await MyGlobal.prisma.community_platform_users.findUnique({
          where: { username: body.username },
        });
      if (!foundUser)
        throw new HttpException("Unauthorized: Invalid credentials", 401);
      const foundCred =
        await MyGlobal.prisma.community_platform_user_credentials.findUnique({
          where: { community_platform_user_id: foundUser.id },
        });
      if (!foundCred)
        throw new HttpException("Unauthorized: Invalid credentials", 401);
      user = foundUser;
      credentials = {
        id: foundCred.id,
        community_platform_user_id: foundCred.community_platform_user_id,
        email: foundCred.email,
        email_normalized: foundCred.email_normalized,
        password_hash: foundCred.password_hash,
        last_login_at: foundCred.last_login_at,
      };
    } else {
      throw new HttpException("Bad Request: Invalid login payload", 400);
    }
  } catch {
    throw new HttpException("Unauthorized: Invalid credentials", 401);
  }

  // 2) Verify password
  const ok = await MyGlobal.password.verify(
    "email" in body ? body.password : body.password,
    credentials!.password_hash,
  );
  if (!ok) throw new HttpException("Unauthorized: Invalid credentials", 401);

  // 3) Prepare timestamps
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());
  const accessExpiresAt: string & tags.Format<"date-time"> = toISOStringSafe(
    new Date(Date.now() + 60 * 60 * 1000),
  ); // 1h
  const refreshExpiresAt: string & tags.Format<"date-time"> = toISOStringSafe(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  ); // 7d

  // 4) Update last_login_at
  await Promise.all([
    MyGlobal.prisma.community_platform_user_credentials.update({
      where: { id: credentials!.id },
      data: { last_login_at: now },
    }),
    MyGlobal.prisma.community_platform_users.update({
      where: { id: user!.id },
      data: { last_login_at: now },
    }),
  ]);

  // 5) Optionally load member role for payload enrichment
  const member =
    await MyGlobal.prisma.community_platform_communitymembers.findUnique({
      where: { community_platform_user_id: user!.id },
    });

  // 6) Issue tokens
  const accessToken = jwt.sign(
    {
      id: user!.id as string & tags.Format<"uuid">,
      type: "communityMember",
      ...(member && {
        community_member_status: member.status,
        community_member_since_at: toISOStringSafe(member.since_at),
      }),
    },
    MyGlobal.env.JWT_SECRET_KEY,
    { expiresIn: "1h", issuer: "autobe" },
  );

  const refreshToken = jwt.sign(
    { userId: user!.id, tokenType: "refresh" },
    MyGlobal.env.JWT_SECRET_KEY,
    { expiresIn: "7d", issuer: "autobe" },
  );

  // 7) Create session (store hash of refresh token)
  const sessionId: string & tags.Format<"uuid"> = v4() as string &
    tags.Format<"uuid">;
  const refreshHash = await MyGlobal.password.hash(refreshToken);
  await MyGlobal.prisma.community_platform_sessions.create({
    data: {
      id: sessionId,
      community_platform_user_id: user!.id,
      refresh_token_hash: refreshHash,
      user_agent: undefined,
      ip: undefined,
      issued_at: now,
      expires_at: refreshExpiresAt,
      revoked_at: null,
      created_at: now,
      updated_at: now,
    },
  });

  // 8) Build response
  const result: ICommunityPlatformCommunityMember.IAuthorized = {
    id: user!.id as string & tags.Format<"uuid">,
    token: {
      access: accessToken,
      refresh: refreshToken,
      expired_at: accessExpiresAt,
      refreshable_until: refreshExpiresAt,
    },
    user: {
      id: user!.id as string & tags.Format<"uuid">,
      username: user!.username as string & tags.MinLength<1>,
      status: user!.status as string & tags.MinLength<1>,
      last_login_at: now,
      created_at: toISOStringSafe(user!.created_at),
      updated_at: toISOStringSafe(user!.updated_at),
      deleted_at: user!.deleted_at ? toISOStringSafe(user!.deleted_at) : null,
    },
  };
  return result;
}
