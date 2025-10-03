import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

/**
 * Leave a community by deleting the caller’s membership row.
 *
 * Removes the authenticated registered member’s membership link to the target
 * community identified by its immutable name. Resolution uses an exact match on
 * name or a lowercased comparison via name_key. The membership is soft-deleted
 * (deleted_at set) in community_platform_community_members. Operation is
 * idempotent: if no active membership exists, it simply succeeds.
 *
 * Authorization: only the authenticated registered member can remove their own
 * membership. If unauthenticated, a 401 is thrown.
 *
 * @param props - Request properties
 * @param props.registeredMember - Authenticated registered member payload
 * @param props.communityName - Immutable community name used for target
 *   resolution
 * @returns Void
 * @throws {HttpException} 401 When not authenticated
 * @throws {HttpException} 404 When the community cannot be resolved by name
 */
export async function deleteCommunityPlatformRegisteredMemberCommunitiesCommunityNameMembership(props: {
  registeredMember: RegisteredmemberPayload;
  communityName: string;
}): Promise<void> {
  const { registeredMember, communityName } = props;

  // Authentication guard (defensive; controller should enforce this too)
  if (!registeredMember || !registeredMember.id) {
    throw new HttpException("Please sign in to continue.", 401);
  }

  // Resolve target community by immutable name or normalized name_key
  const community =
    await MyGlobal.prisma.community_platform_communities.findFirst({
      where: {
        deleted_at: null,
        OR: [
          { name: communityName },
          { name_key: communityName.toLowerCase() },
        ],
      },
      select: { id: true },
    });

  if (!community) {
    throw new HttpException("Community not found", 404);
  }

  // Soft-delete the membership (idempotent)
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());

  await MyGlobal.prisma.community_platform_community_members.updateMany({
    where: {
      community_platform_user_id: registeredMember.id,
      community_platform_community_id: community.id,
      deleted_at: null,
    },
    data: {
      deleted_at: now,
      updated_at: now,
    },
  });

  // No response body (204 No Content at controller level)
  return;
}
