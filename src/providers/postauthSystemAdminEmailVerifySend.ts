import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformSystemAdminEmailVerify } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformSystemAdminEmailVerify";
import { SystemadminPayload } from "../decorators/payload/SystemadminPayload";

/**
 * Send an email verification message for the authenticated system admin.
 *
 * Reads the admin's credentials (email/email_normalized). If the email is not
 * yet verified (email_verified_at is null), this triggers an out-of-band
 * dispatch through the platform's messaging pipeline (simulated here via audit
 * logging). This function does not directly modify credential verification
 * state; final confirmation occurs in the verification endpoint.
 *
 * Authorization: Caller must be an authenticated system admin, and the system
 * admin role must be active (not revoked and not soft-deleted).
 *
 * @param props - Request properties
 * @param props.systemAdmin - The authenticated system admin making the request
 * @returns Acknowledgment that the verification email has been sent/queued
 * @throws {HttpException} 403 when caller is not an active system admin
 * @throws {HttpException} 404 when the admin's credentials record is missing
 */
export async function postauthSystemAdminEmailVerifySend(props: {
  systemAdmin: SystemadminPayload;
}): Promise<ICommunityPlatformSystemAdminEmailVerify.ISent> {
  const { systemAdmin } = props;

  if (!systemAdmin || systemAdmin.type !== "systemadmin")
    throw new HttpException("Forbidden", 403);

  // Ensure the caller still holds an active system admin assignment
  const activeAdmin =
    await MyGlobal.prisma.community_platform_systemadmins.findFirst({
      where: {
        community_platform_user_id: systemAdmin.id,
        revoked_at: null,
        deleted_at: null,
      },
      select: { id: true },
    });
  if (!activeAdmin) throw new HttpException("Forbidden", 403);

  // Fetch credentials for the admin (must exist and not be soft-deleted)
  const credentials =
    await MyGlobal.prisma.community_platform_user_credentials.findFirst({
      where: {
        community_platform_user_id: systemAdmin.id,
        deleted_at: null,
      },
      select: {
        id: true,
        email: true,
        email_normalized: true,
        email_verified_at: true,
      },
    });
  if (!credentials)
    throw new HttpException("Not Found: Credentials not found", 404);

  // Out-of-band dispatch (simulated) — record an audit event
  const now = toISOStringSafe(new Date());
  const details =
    credentials.email_verified_at === null
      ? "verification_email_dispatched"
      : "no_op_already_verified";

  await MyGlobal.prisma.community_platform_audit_logs.create({
    data: {
      id: v4(),
      actor_user_id: systemAdmin.id,
      event_type: "email_verification_sent",
      success: true,
      details,
      created_at: now,
      updated_at: now,
    },
  });

  return {
    ok: true,
    sent_at: now,
    message: "If needed, a verification email has been dispatched.",
  };
}
