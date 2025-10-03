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

export async function postAuthGuestVisitorRefresh(props: {
  body: ICommunityPlatformGuestVisitor.IRefresh;
}): Promise<ICommunityPlatformGuestVisitor.IAuthorized> {
  const { body } = props;

  // Acquire plaintext token from body; if missing, reject (header/cookie handling is out of scope here)
  const presentedToken: string | undefined = body.token;
  if (!presentedToken) {
    throw new HttpException("Unauthorized: Missing token context", 401);
  }

  // Current timestamps
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());
  const oneHourLater: string & tags.Format<"date-time"> = toISOStringSafe(
    new Date(Date.now() + 60 * 60 * 1000),
  );
  const sevenDaysLater: string & tags.Format<"date-time"> = toISOStringSafe(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  );

  // Try to decode JWT to extract user id (guestvisitor payload). If fails, fallback to opaque token verification.
  let candidateUserId: (string & tags.Format<"uuid">) | undefined;
  try {
    const decoded: unknown = jwt.verify(
      presentedToken,
      MyGlobal.env.JWT_SECRET_KEY,
      {
        issuer: "autobe",
      },
    );
    if (
      typeof decoded === "object" &&
      decoded !== null &&
      (decoded as Record<string, unknown>).type === "guestvisitor" &&
      typeof (decoded as Record<string, unknown>).id === "string"
    ) {
      candidateUserId = (decoded as { id: string }).id as string &
        tags.Format<"uuid">;
    }
  } catch {
    // Ignore JWT verification failure; will try opaque session token path below
  }

  // Locate session: prefer by user if available; otherwise verify against recent active sessions
  const findActiveSessionByUser = async (
    userId: string & tags.Format<"uuid">,
  ) => {
    const sessions = await MyGlobal.prisma.community_platform_sessions.findMany(
      {
        where: {
          community_platform_user_id: userId,
          revoked_at: null,
          deleted_at: null,
          expires_at: { gte: now },
        },
        orderBy: { updated_at: "desc" },
        take: 50,
        include: { user: true },
      },
    );
    for (const s of sessions) {
      const ok = await PasswordUtil.verify(presentedToken, s.hashed_token);
      if (ok) return s;
    }
    return null;
  };

  const findActiveSessionGlobally = async () => {
    const sessions = await MyGlobal.prisma.community_platform_sessions.findMany(
      {
        where: {
          revoked_at: null,
          deleted_at: null,
          expires_at: { gte: now },
        },
        orderBy: { updated_at: "desc" },
        take: 100,
        include: { user: true },
      },
    );
    for (const s of sessions) {
      const ok = await PasswordUtil.verify(presentedToken, s.hashed_token);
      if (ok) return s;
    }
    return null;
  };

  let session = candidateUserId
    ? await findActiveSessionByUser(candidateUserId)
    : await findActiveSessionGlobally();

  if (!session) {
    throw new HttpException(
      "Unauthorized: Invalid or expired session token",
      401,
    );
  }

  // Ensure owning user is valid and not deactivated
  if (session.user.deleted_at !== null) {
    throw new HttpException("Unauthorized: User is deactivated", 401);
  }

  // Prepare rotation if requested
  const shouldRotate: boolean = body.rotate === true;
  const payload = {
    id: session.community_platform_user_id as string & tags.Format<"uuid">,
    type: "guestvisitor" as const,
  };

  const accessToken: string = jwt.sign(payload, MyGlobal.env.JWT_SECRET_KEY, {
    expiresIn: "1h",
    issuer: "autobe",
  });

  const refreshToken: string = shouldRotate
    ? jwt.sign(
        { ...payload, tokenType: "refresh" },
        MyGlobal.env.JWT_SECRET_KEY,
        {
          expiresIn: "7d",
          issuer: "autobe",
        },
      )
    : presentedToken;

  // Update session with new timestamps and optionally rotate hashed_token
  await MyGlobal.prisma.community_platform_sessions.update({
    where: { id: session.id },
    data: {
      last_seen_at: now,
      expires_at: oneHourLater,
      updated_at: now,
      user_agent: body.client?.userAgent ?? undefined,
      ip: body.client?.ip ?? undefined,
      client_platform: body.client?.clientPlatform ?? undefined,
      client_device: body.client?.clientDevice ?? undefined,
      session_type: body.client?.sessionType ?? undefined,
      hashed_token: shouldRotate
        ? await PasswordUtil.hash(refreshToken)
        : undefined,
    },
  });

  // Optionally touch user's last_login_at
  await MyGlobal.prisma.community_platform_users.update({
    where: { id: session.community_platform_user_id },
    data: { last_login_at: now, updated_at: now },
  });

  // Build response user summary (non-sensitive)
  const userSummary: ICommunityPlatformUser.ISummary = {
    id: session.user.id as string & tags.Format<"uuid">,
    username: session.user.username,
    email: session.user.email,
    display_name: session.user.display_name ?? null,
    last_login_at: session.user.last_login_at
      ? toISOStringSafe(session.user.last_login_at)
      : null,
    created_at: toISOStringSafe(session.user.created_at),
    updated_at: now,
  };

  const token: IAuthorizationToken = {
    access: accessToken,
    refresh: refreshToken,
    expired_at: oneHourLater,
    refreshable_until: sevenDaysLater,
  };

  return {
    id: session.community_platform_user_id as string & tags.Format<"uuid">,
    token,
    user: userSummary,
  };
}
