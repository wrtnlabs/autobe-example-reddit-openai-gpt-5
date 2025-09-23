import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { CommunitymemberPayload } from "../decorators/payload/CommunitymemberPayload";

/**
 * Mark a community (community_platform_communities) as deleted to remove it
 * from public access.
 *
 * This operation performs a soft delete by setting the community's deleted_at
 * timestamp. Only the owner of the community or an active system admin may
 * perform this action. After deletion, memberships and recent-communities
 * entries are marked deleted to ensure exclusion from public surfaces. The
 * operation is idempotent: if the community does not exist or is already
 * deleted, it returns without error.
 *
 * @param props - Request properties
 * @param props.communityMember - The authenticated community member performing
 *   the request
 * @param props.communityId - UUID of the community to delete
 * @returns Void
 * @throws {HttpException} 403 when the requester is neither the owner nor an
 *   active admin
 */
export async function deletecommunityPlatformCommunityMemberCommunitiesCommunityId(props: {
  communityMember: CommunitymemberPayload;
  communityId: string & tags.Format<"uuid">;
}): Promise<void> {
  const { communityMember, communityId } = props;

  // Fetch target community
  const community =
    await MyGlobal.prisma.community_platform_communities.findUnique({
      where: { id: communityId },
      select: {
        id: true,
        community_platform_user_id: true,
        deleted_at: true,
      },
    });

  // Idempotent behavior: if not found → no-op
  if (!community) return;

  // If already deleted → no-op
  if (community.deleted_at !== null) return;

  // Authorization: owner or active admin
  let authorized = community.community_platform_user_id === communityMember.id;
  if (!authorized) {
    const admin =
      await MyGlobal.prisma.community_platform_systemadmins.findFirst({
        where: {
          community_platform_user_id: communityMember.id,
          revoked_at: null,
          deleted_at: null,
        },
        select: { id: true },
      });
    authorized = admin !== null;
  }
  if (!authorized) {
    throw new HttpException(
      "Unauthorized: Only the owner or an active admin can delete this community",
      403,
    );
  }

  // Perform soft delete and propagate membership/recent exclusions
  const now = toISOStringSafe(new Date());

  await MyGlobal.prisma.$transaction([
    // Soft delete the community
    MyGlobal.prisma.community_platform_communities.update({
      where: { id: communityId },
      data: {
        deleted_at: now,
        updated_at: now,
      },
    }),
    // End active memberships for this community
    MyGlobal.prisma.community_platform_community_memberships.updateMany({
      where: {
        community_platform_community_id: communityId,
        deleted_at: null,
      },
      data: {
        deleted_at: now,
        updated_at: now,
      },
    }),
    // Exclude from recent communities lists
    MyGlobal.prisma.community_platform_recent_communities.updateMany({
      where: {
        community_platform_community_id: communityId,
        deleted_at: null,
      },
      data: {
        deleted_at: now,
        updated_at: now,
      },
    }),
  ]);
}
