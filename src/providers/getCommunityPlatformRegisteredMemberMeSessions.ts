import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { IPageICommunityPlatformSession } from "@ORGANIZATION/PROJECT-api/lib/structures/IPageICommunityPlatformSession";
import { IPage } from "@ORGANIZATION/PROJECT-api/lib/structures/IPage";
import { ICommunityPlatformSession } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSession";
import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

/**
 * List authenticated user's sessions (community_platform_sessions).
 *
 * Returns a paginated collection of the caller's authentication sessions with
 * device hints and lifecycle timestamps. Sensitive fields like hashed_token are
 * never exposed. Ordering follows non-increasing (lastSeenAt ?? createdAt).
 *
 * Security: requires an authenticated registered member; otherwise 401.
 *
 * @param props - Provider input
 * @param props.registeredMember - Authenticated registered member payload
 * @returns Paginated list of the caller’s sessions
 * @throws {HttpException} 401 when unauthenticated
 */
export async function getCommunityPlatformRegisteredMemberMeSessions(props: {
  registeredMember: RegisteredmemberPayload;
}): Promise<IPageICommunityPlatformSession> {
  const me = props?.registeredMember;
  if (!me || !me.id) {
    throw new HttpException("Please sign in to continue.", 401);
  }

  // Defaults (no query params provided by contract)
  const current = 1 as number & tags.Type<"int32"> & tags.Minimum<0>;
  const limit = 20 as number & tags.Type<"int32"> & tags.Minimum<0>;

  // Fetch all user sessions (excluding soft-deleted) to ensure correct sorting
  const rows = await MyGlobal.prisma.community_platform_sessions.findMany({
    where: {
      community_platform_user_id: me.id,
      deleted_at: null,
    },
    select: {
      id: true,
      user_agent: true,
      ip: true,
      client_platform: true,
      client_device: true,
      session_type: true,
      created_at: true,
      updated_at: true,
      last_seen_at: true,
      expires_at: true,
      revoked_at: true,
      // hashed_token intentionally NOT selected
    },
  });

  // Order by (last_seen_at ?? created_at) desc, then id desc for stability
  const sorted = [...rows].sort((a, b) => {
    const aKey = toISOStringSafe(
      a.last_seen_at ? a.last_seen_at : a.created_at,
    );
    const bKey = toISOStringSafe(
      b.last_seen_at ? b.last_seen_at : b.created_at,
    );
    const primary = bKey.localeCompare(aKey);
    if (primary !== 0) return primary;
    return (b.id as string).localeCompare(a.id as string);
  });

  const records = sorted.length as number &
    tags.Type<"int32"> &
    tags.Minimum<0>;
  const pages = (
    records === (0 as number & tags.Type<"int32"> & tags.Minimum<0>)
      ? 0
      : Math.ceil((sorted.length as number) / (limit as number))
  ) as number & tags.Type<"int32"> & tags.Minimum<0>;

  const start = 0;
  const end = Math.min(sorted.length, limit as number);
  const slice = sorted.slice(start, end);

  const data: ICommunityPlatformSession[] = slice.map((s) => ({
    id: s.id as string & tags.Format<"uuid">,
    createdAt: toISOStringSafe(s.created_at),
    updatedAt: toISOStringSafe(s.updated_at),
    lastSeenAt: s.last_seen_at ? toISOStringSafe(s.last_seen_at) : undefined,
    expiresAt: toISOStringSafe(s.expires_at),
    revokedAt: s.revoked_at ? toISOStringSafe(s.revoked_at) : undefined,
    userAgent: s.user_agent ?? undefined,
    ip: s.ip ?? undefined,
    clientPlatform: s.client_platform ?? undefined,
    clientDevice: s.client_device ?? undefined,
    sessionType: s.session_type ?? undefined,
  }));

  return {
    pagination: {
      current,
      limit,
      records,
      pages,
    },
    data,
  };
}
