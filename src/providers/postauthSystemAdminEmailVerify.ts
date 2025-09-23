import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformSystemAdminEmailVerify } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSystemAdminEmailVerify";

export async function postauthSystemAdminEmailVerify(props: {
  body: ICommunityPlatformSystemAdminEmailVerify.IRequest;
}): Promise<ICommunityPlatformSystemAdminEmailVerify.IResponse> {
  /**
   * Set email_verified_at on community_platform_user_credentials after
   * verifying the provided token.
   *
   * Public endpoint: validates a single-use, time-limited verification token,
   * then marks the corresponding administrator email as verified. No session or
   * password changes occur here. An audit log entry is recorded for
   * observability.
   *
   * @param props - Request properties
   * @param props.body - Verification token payload
   * @returns Confirmation of successful email verification
   * @throws {HttpException} 500 when server configuration is invalid
   */
  const { body } = props;
  const token = body.token;

  if (!token || token.trim().length === 0) {
    // Invalid request shape; do not leak account existence
    // Optionally record an audit without actor linkage
    const now = toISOStringSafe(new Date());
    await MyGlobal.prisma.community_platform_audit_logs.create({
      data: {
        id: v4(),
        event_type: "email_verified",
        success: false,
        created_at: now,
        updated_at: now,
      },
    });
    return { verified: false, verified_at: null };
  }

  const secret =
    (MyGlobal.env &&
      (MyGlobal.env as Record<string, unknown>)["JWT_EMAIL_VERIFY_SECRET"]) ||
    (MyGlobal.env &&
      (MyGlobal.env as Record<string, unknown>)["JWT_SECRET_KEY"]);

  if (!secret || typeof secret !== "string") {
    throw new HttpException("Internal Server Error", 500);
  }

  // Default response and audit parameters
  let actorUserId: string | undefined = undefined;

  try {
    const decoded = jwt.verify(token, secret);
    if (!decoded || typeof decoded !== "object") {
      const now = toISOStringSafe(new Date());
      await MyGlobal.prisma.community_platform_audit_logs.create({
        data: {
          id: v4(),
          event_type: "email_verified",
          success: false,
          created_at: now,
          updated_at: now,
        },
      });
      return { verified: false, verified_at: null };
    }

    const emailValue = (decoded as Record<string, unknown>)["email"];
    if (!emailValue || typeof emailValue !== "string") {
      const now = toISOStringSafe(new Date());
      await MyGlobal.prisma.community_platform_audit_logs.create({
        data: {
          id: v4(),
          event_type: "email_verified",
          success: false,
          created_at: now,
          updated_at: now,
        },
      });
      return { verified: false, verified_at: null };
    }

    const normalized = emailValue.toLowerCase();

    const creds =
      await MyGlobal.prisma.community_platform_user_credentials.findUnique({
        where: { email_normalized: normalized },
      });

    if (!creds) {
      const now = toISOStringSafe(new Date());
      await MyGlobal.prisma.community_platform_audit_logs.create({
        data: {
          id: v4(),
          event_type: "email_verified",
          success: false,
          created_at: now,
          updated_at: now,
        },
      });
      return { verified: false, verified_at: null };
    }

    actorUserId = creds.community_platform_user_id;

    // If already verified, do not modify; return success with no new timestamp
    if (creds.email_verified_at) {
      const now = toISOStringSafe(new Date());
      await MyGlobal.prisma.community_platform_audit_logs.create({
        data: {
          id: v4(),
          actor_user_id: actorUserId,
          event_type: "email_verified",
          success: true,
          created_at: now,
          updated_at: now,
        },
      });
      return { verified: true, verified_at: null };
    }

    // Mark as verified now
    const now = toISOStringSafe(new Date());
    await MyGlobal.prisma.community_platform_user_credentials.update({
      where: { id: creds.id },
      data: {
        email_verified_at: now,
        updated_at: now,
      },
    });

    await MyGlobal.prisma.community_platform_audit_logs.create({
      data: {
        id: v4(),
        actor_user_id: actorUserId,
        event_type: "email_verified",
        success: true,
        created_at: now,
        updated_at: now,
      },
    });

    return { verified: true, verified_at: now };
  } catch {
    const now = toISOStringSafe(new Date());
    await MyGlobal.prisma.community_platform_audit_logs.create({
      data: {
        id: v4(),
        actor_user_id: actorUserId,
        event_type: "email_verified",
        success: false,
        created_at: now,
        updated_at: now,
      },
    });
    return { verified: false, verified_at: null };
  }
}
