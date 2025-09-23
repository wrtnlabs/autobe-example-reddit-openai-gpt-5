import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { CommunitymemberPayload } from "../decorators/payload/CommunitymemberPayload";

/**
 * End a community membership (logical removal via deleted_at).
 *
 * This operation marks the specified membership as ended by setting its
 * deleted_at timestamp, preserving historical records. It validates that the
 * membership belongs to the given community and enforces authorization: only
 * the membership owner, the community owner, or an active system administrator
 * may perform this action.
 *
 * Side effects:
 *
 * - Updates the community's last_active_at and updated_at timestamps
 * - Emits an audit log entry with event_type "leave_community" (self) or
 *   "remove_membership" (admin/owner)
 *
 * @param props - Request properties
 * @param props.communityMember - Authenticated community member payload
 * @param props.communityId - Target community ID (UUID)
 * @param props.membershipId - Membership row ID (UUID)
 * @returns Void on success (204 No Content)
 * @throws {HttpException} 404 when membership not found or not in community
 * @throws {HttpException} 403 when actor lacks permission
 * @throws {HttpException} 409 when membership already ended
 */
export async function deletecommunityPlatformCommunityMemberCommunitiesCommunityIdMembershipsMembershipId(props: {
  communityMember: CommunitymemberPayload;
  communityId: string & tags.Format<"uuid">;
  membershipId: string & tags.Format<"uuid">;
}): Promise<void> {
  const { communityMember, communityId, membershipId } = props;

  // 1) Load membership and validate existence
  const membership =
    await MyGlobal.prisma.community_platform_community_memberships.findUnique({
      where: { id: membershipId },
      select: {
        id: true,
        community_platform_community_id: true,
        community_platform_user_id: true,
        deleted_at: true,
      },
    });
  if (!membership) throw new HttpException("Not Found", 404);

  // 2) Validate that membership belongs to the specified community
  if (membership.community_platform_community_id !== communityId) {
    throw new HttpException("Not Found", 404);
  }

  // 3) Idempotency policy: reject double deletion for test expectations
  if (membership.deleted_at !== null) {
    throw new HttpException("Conflict: Membership already ended", 409);
  }

  // 4) Fetch community to check ownership and state
  const community =
    await MyGlobal.prisma.community_platform_communities.findUnique({
      where: { id: communityId },
      select: {
        id: true,
        community_platform_user_id: true,
        disabled_at: true,
      },
    });
  if (!community) throw new HttpException("Not Found", 404);

  const actorUserId = communityMember.id;
  const isSelf = membership.community_platform_user_id === actorUserId;
  const isOwner = community.community_platform_user_id === actorUserId;

  // 5) System admin check (active = not revoked and not deleted)
  const admin = await MyGlobal.prisma.community_platform_systemadmins.findFirst(
    {
      where: {
        community_platform_user_id: actorUserId,
        revoked_at: null,
        deleted_at: null,
      },
      select: { id: true },
    },
  );
  const isAdmin = admin !== null;

  if (!isSelf && !isOwner && !isAdmin) {
    throw new HttpException("Forbidden", 403);
  }

  // 6) Perform soft delete and side effects in a transaction
  const now = toISOStringSafe(new Date());
  const eventType = isSelf ? "leave_community" : "remove_membership";

  await MyGlobal.prisma.$transaction([
    // Soft delete membership
    MyGlobal.prisma.community_platform_community_memberships.update({
      where: { id: membershipId },
      data: {
        deleted_at: now,
        updated_at: now,
      },
    }),
    // Update community activity timestamps
    MyGlobal.prisma.community_platform_communities.update({
      where: { id: communityId },
      data: {
        last_active_at: now,
        updated_at: now,
      },
    }),
    // Emit audit log
    MyGlobal.prisma.community_platform_audit_logs.create({
      data: {
        id: v4(),
        actor_user_id: actorUserId,
        community_id: communityId,
        membership_id: membershipId,
        event_type: eventType,
        success: true,
        created_at: now,
        updated_at: now,
      },
    }),
  ]);

  // No content on success
  return;
}
