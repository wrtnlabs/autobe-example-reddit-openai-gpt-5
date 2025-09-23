import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformGuestVisitorRefresh } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitorRefresh";
import { ICommunityPlatformGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitor";

/**
 * Refresh guest JWT tokens linked to community_platform_guestvisitors without
 * using user sessions.
 *
 * This endpoint validates a guest refresh token, updates the corresponding
 * guest visitor's last_seen_at, and returns a new access token (and the current
 * refresh token) bundled in IAuthorizationToken. It does not use
 * community_platform_sessions.
 *
 * Security:
 *
 * - Verifies the refresh token (issuer: "autobe").
 * - Ensures the token payload represents a guest visitor (type: "guestVisitor").
 * - Computes expirations from JWT claims or sensible fallbacks.
 *
 * @param props - Request properties
 * @param props.body - Refresh request containing the refresh token and optional
 *   client context
 * @returns Authorized guest payload with rotated access (and refresh token
 *   retained) and metadata
 * @throws {HttpException} 401 Unauthorized when token is invalid/expired or
 *   subject missing
 * @throws {HttpException} 404 Not Found when the guest visitor does not exist
 */
export async function postauthGuestVisitorRefresh(props: {
  body: ICommunityPlatformGuestVisitorRefresh.IRequest;
}): Promise<ICommunityPlatformGuestVisitor.IAuthorized> {
  const { body } = props;

  // 1) Verify and decode the refresh token
  let decodedUnknown: unknown;
  try {
    decodedUnknown = (jwt as any).verify(
      body.refresh_token,
      MyGlobal.env.JWT_SECRET_KEY,
      { issuer: "autobe" },
    );
  } catch {
    throw new HttpException(
      "Unauthorized: Invalid or expired refresh token",
      401,
    );
  }

  if (typeof decodedUnknown !== "object" || decodedUnknown === null) {
    throw new HttpException(
      "Unauthorized: Malformed refresh token payload",
      401,
    );
  }
  const decoded = decodedUnknown as Record<string, unknown>;
  if (typeof decoded.id !== "string" || decoded.type !== "guestVisitor") {
    throw new HttpException(
      "Unauthorized: Refresh token subject mismatch",
      401,
    );
  }
  const guestId = decoded.id as string & tags.Format<"uuid">;

  // 2) Ensure the guest exists and update last_seen_at (and optional ip/ua)
  const now = toISOStringSafe(new Date());

  // Fetch minimal to compute payload later (device_fingerprint may be used)
  const existing =
    await MyGlobal.prisma.community_platform_guestvisitors.findUnique({
      where: { id: guestId },
      select: {
        id: true,
        device_fingerprint: true,
        user_agent: true,
        ip: true,
        first_seen_at: true,
        last_seen_at: true,
      },
    });
  if (!existing)
    throw new HttpException("Not Found: Guest visitor not found", 404);

  const updated = await MyGlobal.prisma.community_platform_guestvisitors.update(
    {
      where: { id: guestId },
      data: {
        last_seen_at: now,
        updated_at: now,
        user_agent: body.user_agent === undefined ? undefined : body.user_agent,
        ip: body.ip === undefined ? undefined : body.ip,
      },
      select: {
        id: true,
        device_fingerprint: true,
        user_agent: true,
        ip: true,
        first_seen_at: true,
        last_seen_at: true,
      },
    },
  );

  // 3) Generate new access token with SAME payload structure (GuestvisitorPayload)
  const accessPayload = {
    id: updated.id as string & tags.Format<"uuid">,
    type: "guestVisitor" as const,
    ...(updated.device_fingerprint !== null && {
      device_fingerprint: updated.device_fingerprint,
    }),
    ...(updated.user_agent !== null && { user_agent: updated.user_agent }),
    ...(updated.ip !== null && { ip: updated.ip }),
    first_seen_at: toISOStringSafe(updated.first_seen_at),
    last_seen_at: toISOStringSafe(updated.last_seen_at),
  };

  const accessToken = (jwt as any).sign(
    accessPayload,
    MyGlobal.env.JWT_SECRET_KEY,
    {
      expiresIn: "1h",
      issuer: "autobe",
    },
  );

  // Compute access token expiry from its payload (exp seconds)
  const accessDecoded = (jwt as any).decode(accessToken) as Record<
    string,
    unknown
  > | null;
  const expired_at: string & tags.Format<"date-time"> =
    accessDecoded &&
    typeof accessDecoded === "object" &&
    typeof accessDecoded.exp === "number"
      ? toISOStringSafe(new Date((accessDecoded.exp as number) * 1000))
      : toISOStringSafe(new Date(Date.now() + 60 * 60 * 1000));

  // 4) Keep the same refresh token (no rotation); compute refreshable_until
  let refreshable_until: string & tags.Format<"date-time">;
  if (typeof decoded.exp === "number") {
    refreshable_until = toISOStringSafe(new Date(decoded.exp * 1000));
  } else {
    // Fallback to 7 days from now when exp is absent
    refreshable_until = toISOStringSafe(
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    );
  }

  // 5) (Optional) Audit log for observability
  try {
    await MyGlobal.prisma.community_platform_audit_logs.create({
      data: {
        id: v4() as string & tags.Format<"uuid">,
        guestvisitor_id: updated.id as string & tags.Format<"uuid">,
        event_type: "guest_refresh",
        success: true,
        ip: body.ip ?? updated.ip ?? undefined,
        user_agent: body.user_agent ?? updated.user_agent ?? undefined,
        created_at: now,
        updated_at: now,
      },
    });
  } catch {
    // Non-fatal: do not block refresh flow on audit logging failure
  }

  // 6) Build response
  return {
    id: updated.id as string & tags.Format<"uuid">,
    first_seen_at: toISOStringSafe(updated.first_seen_at),
    last_seen_at: toISOStringSafe(updated.last_seen_at),
    token: {
      access: accessToken,
      refresh: body.refresh_token,
      expired_at,
      refreshable_until,
    },
    guestVisitor: {
      id: updated.id as string & tags.Format<"uuid">,
      first_seen_at: toISOStringSafe(updated.first_seen_at),
      last_seen_at: toISOStringSafe(updated.last_seen_at),
    },
  };
}
