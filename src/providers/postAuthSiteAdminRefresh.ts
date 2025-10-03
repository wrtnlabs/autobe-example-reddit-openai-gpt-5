import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformSiteAdminRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdminRefresh";
import { ICommunityPlatformSiteAdmin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSiteAdmin";
import { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";

export async function postAuthSiteAdminRefresh(props: {
  body: ICommunityPlatformSiteAdminRefresh.IRequest;
}): Promise<ICommunityPlatformSiteAdmin.IAuthorized> {
  const { body } = props;

  // Narrow JWT payload safely
  const isJwtPayload = (v: unknown): v is jwt.JwtPayload =>
    typeof v === "object" && v !== null;

  // Keep base Prisma return type (no relation access)
  let targetSession: Awaited<
    ReturnType<typeof MyGlobal.prisma.community_platform_sessions.findFirst>
  > | null = null;

  const nowISO = toISOStringSafe(new Date());
  const nowMs = Date.parse(nowISO);

  // 1) Verify by provided refresh token
  if (body.refreshToken !== undefined && body.refreshToken !== null) {
    let decoded: unknown;
    try {
      decoded = jwt.verify(body.refreshToken, MyGlobal.env.JWT_SECRET_KEY, {
        issuer: "autobe",
      });
    } catch {
      throw new HttpException("Unauthorized: Invalid refresh token", 401);
    }
    if (!isJwtPayload(decoded))
      throw new HttpException("Unauthorized: Malformed token payload", 401);

    const tokenUserId =
      typeof decoded["userId"] === "string"
        ? (decoded["userId"] as string)
        : undefined;
    const tokenSessionId =
      typeof decoded["sessionId"] === "string"
        ? (decoded["sessionId"] as string)
        : undefined;
    const tokenType =
      typeof decoded["tokenType"] === "string"
        ? (decoded["tokenType"] as string)
        : undefined;

    if (!tokenSessionId || !tokenUserId || tokenType !== "refresh")
      throw new HttpException("Unauthorized: Token context missing", 401);

    targetSession = await MyGlobal.prisma.community_platform_sessions.findFirst(
      {
        where: {
          id: tokenSessionId,
          community_platform_user_id: tokenUserId,
          revoked_at: null,
          deleted_at: null,
        },
      },
    );
    if (!targetSession)
      throw new HttpException("Unauthorized: Session not found", 401);

    const sessionExpISO = toISOStringSafe(targetSession.expires_at);
    if (!(Date.parse(sessionExpISO) > nowMs))
      throw new HttpException("Unauthorized: Session expired", 401);

    const ok = await PasswordUtil.verify(
      body.refreshToken,
      targetSession.hashed_token,
    );
    if (!ok)
      throw new HttpException("Unauthorized: Refresh token mismatch", 401);
  }

  // 2) Direct sessionId path
  if (
    !targetSession &&
    body.sessionId !== undefined &&
    body.sessionId !== null
  ) {
    targetSession = await MyGlobal.prisma.community_platform_sessions.findFirst(
      {
        where: { id: body.sessionId, revoked_at: null, deleted_at: null },
      },
    );
    if (!targetSession)
      throw new HttpException("Unauthorized: Session not found", 401);
    const sessionExpISO = toISOStringSafe(targetSession.expires_at);
    if (!(Date.parse(sessionExpISO) > nowMs))
      throw new HttpException("Unauthorized: Session expired", 401);
  }

  // 3) Fallback: recent valid session
  if (!targetSession) {
    const candidate =
      await MyGlobal.prisma.community_platform_sessions.findFirst({
        where: { revoked_at: null, deleted_at: null },
        orderBy: { created_at: "desc" },
      });
    if (!candidate)
      throw new HttpException("Unauthorized: No active session", 401);
    const expISO = toISOStringSafe(candidate.expires_at);
    if (!(Date.parse(expISO) > nowMs))
      throw new HttpException("Unauthorized: Session expired", 401);
    targetSession = candidate;
  }

  // Load user from session FK and validate
  const sessionUser = await MyGlobal.prisma.community_platform_users.findUnique(
    {
      where: { id: targetSession.community_platform_user_id },
    },
  );
  if (!sessionUser)
    throw new HttpException("Unauthorized: Orphan session", 401);
  if (sessionUser.deleted_at !== null)
    throw new HttpException("Forbidden: User deactivated", 403);

  // Ensure active admin grant
  const adminRow =
    await MyGlobal.prisma.community_platform_siteadmins.findFirst({
      where: { community_platform_user_id: sessionUser.id },
    });
  if (!adminRow)
    throw new HttpException("Forbidden: Admin grant not found", 403);
  if (adminRow.deleted_at !== null)
    throw new HttpException("Forbidden: Admin grant deleted", 403);
  if (adminRow.revoked_at !== null)
    throw new HttpException("Forbidden: Admin grant revoked", 403);

  // Rotate tokens and extend expirations
  const accessExpMs = nowMs + 60 * 60 * 1000; // 1h
  const refreshExpMs = nowMs + 7 * 24 * 60 * 60 * 1000; // 7d
  const accessExpiredAt = toISOStringSafe(new Date(accessExpMs));
  const refreshableUntil = toISOStringSafe(new Date(refreshExpMs));

  const accessToken = jwt.sign(
    { id: sessionUser.id, type: "siteadmin" },
    MyGlobal.env.JWT_SECRET_KEY,
    { issuer: "autobe", expiresIn: "1h" },
  );

  const plainRefreshToken = jwt.sign(
    {
      userId: sessionUser.id,
      sessionId: targetSession.id,
      tokenType: "refresh",
    },
    MyGlobal.env.JWT_SECRET_KEY,
    { issuer: "autobe", expiresIn: "7d" },
  );

  const hashed = await PasswordUtil.hash(plainRefreshToken);

  await MyGlobal.prisma.community_platform_sessions.update({
    where: { id: targetSession.id },
    data: {
      hashed_token: hashed,
      last_seen_at: nowISO,
      updated_at: nowISO,
      expires_at: refreshableUntil,
      user_agent: body.userAgent ?? undefined,
      ip: body.ip ?? undefined,
      client_platform: body.clientPlatform ?? undefined,
      client_device: body.clientDevice ?? undefined,
    },
  });

  const token: IAuthorizationToken = {
    access: accessToken,
    refresh: plainRefreshToken,
    expired_at: accessExpiredAt,
    refreshable_until: refreshableUntil,
  };

  const admin: ICommunityPlatformSiteAdmin = {
    id: adminRow.id as string & tags.Format<"uuid">,
    userId: sessionUser.id as string & tags.Format<"uuid">,
    grantedAt: toISOStringSafe(adminRow.granted_at),
    revokedAt: adminRow.revoked_at
      ? toISOStringSafe(adminRow.revoked_at)
      : null,
    createdAt: toISOStringSafe(adminRow.created_at),
    updatedAt: toISOStringSafe(adminRow.updated_at),
    deletedAt: adminRow.deleted_at
      ? toISOStringSafe(adminRow.deleted_at)
      : null,
  };

  return {
    id: sessionUser.id as string & tags.Format<"uuid">,
    userId: sessionUser.id as string & tags.Format<"uuid">,
    grantedAt: toISOStringSafe(adminRow.granted_at),
    revokedAt: adminRow.revoked_at
      ? toISOStringSafe(adminRow.revoked_at)
      : null,
    createdAt: toISOStringSafe(adminRow.created_at),
    updatedAt: toISOStringSafe(adminRow.updated_at),
    deletedAt: adminRow.deleted_at
      ? toISOStringSafe(adminRow.deleted_at)
      : null,
    token,
    admin,
  };
}
