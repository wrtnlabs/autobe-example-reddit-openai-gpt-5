import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformRegisteredMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRegisteredMember";
import { IAuthorizationToken } from "@ORGANIZATION/PROJECT-api/lib/structures/IAuthorizationToken";
import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

export async function putAuthRegisteredMemberPassword(props: {
  registeredMember: RegisteredmemberPayload;
  body: ICommunityPlatformRegisteredMember.IUpdatePassword;
}): Promise<ICommunityPlatformRegisteredMember.IUpdatePasswordResult> {
  const { registeredMember, body } = props;

  // Authorization enforcement using provided payload
  if (!registeredMember || registeredMember.type !== "registeredmember") {
    throw new HttpException("Forbidden: Invalid authentication context", 403);
  }

  // 1) Load account and ensure it is not soft-deleted
  const user = await MyGlobal.prisma.community_platform_users.findUnique({
    where: { id: registeredMember.id },
  });
  if (user === null) {
    throw new HttpException("Not Found: Account does not exist", 404);
  }
  if (user.deleted_at !== null) {
    throw new HttpException("Forbidden: Account is deactivated", 403);
  }

  // 2) Verify current password
  const currentMatches = await PasswordUtil.verify(
    body.current_password,
    user.password_hash,
  );
  if (!currentMatches) {
    throw new HttpException("Bad Request: current_password is invalid", 400);
  }

  // 3) Hash new password and update audit fields
  const newHash = await PasswordUtil.hash(body.new_password);
  const now = toISOStringSafe(new Date());

  await MyGlobal.prisma.community_platform_users.update({
    where: { id: registeredMember.id },
    data: {
      password_hash: newHash,
      updated_at: now,
    },
  });

  // 4) Optional session policy: preserve current session continuity
  // Note: Without a reliable current-session identifier, we avoid revoking
  // sessions to ensure the active session remains valid.
  const message = body.revoke_other_sessions
    ? "Password updated. Other sessions were not revoked to preserve the current session."
    : "Password updated.";

  // 5) Return outcome (token rotation optional - omitted here)
  const result: ICommunityPlatformRegisteredMember.IUpdatePasswordResult = {
    updated: true,
    message,
  };
  return result;
}
