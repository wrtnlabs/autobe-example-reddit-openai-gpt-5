import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";

/**
 * Refresh tokens for communityMember by validating community_platform_sessions.
 *
 * Validates the provided refresh token by:
 *
 * - Verifying JWT signature and issuer
 * - Ensuring the token belongs to a communityMember role
 * - Matching against a non-revoked, non-expired session via hashed comparison
 *
 * On success, updates the session timestamp and issues a new access token
 * preserving the same payload structure (CommunitymemberPayload). The refresh
 * token may be rotated by policy; here we preserve it (rotation optional).
 *
 * @param props - Request properties
 * @param props.body - Contains the raw refresh token
 * @returns IAuthorized bundle with new access token and timing metadata
 * @throws {HttpException} 400 when refresh token is missing
 * @throws {HttpException} 401 when token is invalid/expired or session not
 *   found
 * @throws {HttpException} 403 when token role is not communityMember
 */
export async function postauthCommunityMemberRefresh(props: {
  body: ICommunityPlatformCommunityMember.IRefresh;
}): Promise<ICommunityPlatformCommunityMember.IAuthorized> {
  const token = props.body?.refresh_token;
  if (!token || typeof token !== "string") {
    throw new HttpException("Bad Request: refresh_token required", 400);
  }

  // 1) Verify JWT and issuer
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, MyGlobal.env.JWT_SECRET_KEY, {
      issuer: "autobe",
    });
  } catch {
    throw new HttpException("Unauthorized: Invalid refresh token", 401);
  }

  // 2) Extract payload fields and enforce role discrimination
  if (typeof decoded !== "object" || decoded === null) {
    throw new HttpException("Unauthorized: Invalid token payload", 401);
  }

  const payloadObj = decoded as Record<string, unknown>;
  const subjectId =
    typeof payloadObj.id === "string"
      ? (payloadObj.id as string & tags.Format<"uuid">)
      : undefined;
  const roleType =
    typeof payloadObj.type === "string" ? payloadObj.type : undefined;

  if (roleType !== "communityMember") {
    throw new HttpException(
      "Forbidden: Token role not allowed for this endpoint",
      403,
    );
  }
  if (!subjectId) {
    throw new HttpException("Unauthorized: Missing subject in token", 401);
  }

  // 3) Find an active, non-revoked session for this user and verify hash match
  const candidateSessions =
    await MyGlobal.prisma.community_platform_sessions.findMany({
      where: {
        community_platform_user_id: subjectId,
        revoked_at: null,
        expires_at: { gt: new Date() },
      },
      orderBy: { created_at: "desc" },
    });

  let matchedSession: (typeof candidateSessions)[number] | null = null;
  for (const s of candidateSessions) {
    // Compare provided token to stored hash
    const ok = await MyGlobal.password.verify(token, s.refresh_token_hash);
    if (ok) {
      matchedSession = s;
      break;
    }
  }

  if (!matchedSession) {
    throw new HttpException(
      "Unauthorized: No active session for this refresh token",
      401,
    );
  }

  // 4) Load user identity and optional community member metadata
  const dbUser =
    await MyGlobal.prisma.community_platform_users.findUniqueOrThrow({
      where: { id: matchedSession.community_platform_user_id },
    });

  const member =
    await MyGlobal.prisma.community_platform_communitymembers.findUnique({
      where: { community_platform_user_id: dbUser.id },
    });

  // 5) Update session.updated_at (no rotation by default)
  const sessionUpdatedAt: string & tags.Format<"date-time"> = toISOStringSafe(
    new Date(),
  );
  await MyGlobal.prisma.community_platform_sessions.update({
    where: { id: matchedSession.id },
    data: {
      updated_at: sessionUpdatedAt,
    },
  });

  // 6) Issue new access token with SAME payload structure as login/join
  const accessPayload: Record<string, unknown> = {
    id: dbUser.id as string & tags.Format<"uuid">,
    type: "communityMember",
    ...(member && { community_member_status: member.status }),
    ...(member && {
      community_member_since_at: toISOStringSafe(member.since_at),
    }),
  };

  const accessToken = jwt.sign(accessPayload, MyGlobal.env.JWT_SECRET_KEY, {
    expiresIn: "1h",
    issuer: "autobe",
  });

  // Access token expiry timestamp
  const accessExpiredAt: string & tags.Format<"date-time"> = toISOStringSafe(
    new Date(Date.now() + 60 * 60 * 1000),
  );

  // Refresh token remains the same; refreshable_until comes from session.expires_at
  const refreshableUntil: string & tags.Format<"date-time"> = toISOStringSafe(
    matchedSession.expires_at,
  );

  // 7) Optional user hydration
  const user: import("@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser").ICommunityPlatformUser =
    {
      id: dbUser.id as string & tags.Format<"uuid">,
      username: dbUser.username,
      status: dbUser.status,
      last_login_at: dbUser.last_login_at
        ? toISOStringSafe(dbUser.last_login_at)
        : null,
      created_at: toISOStringSafe(dbUser.created_at),
      updated_at: toISOStringSafe(dbUser.updated_at),
      deleted_at: dbUser.deleted_at ? toISOStringSafe(dbUser.deleted_at) : null,
    };

  return {
    id: dbUser.id as string & tags.Format<"uuid">,
    token: {
      access: accessToken,
      refresh: token,
      expired_at: accessExpiredAt,
      refreshable_until: refreshableUntil,
    },
    user,
  };
}
