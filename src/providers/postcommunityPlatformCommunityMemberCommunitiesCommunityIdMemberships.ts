import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformCommunityMembership } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMembership";
import { CommunitymemberPayload } from "../decorators/payload/CommunitymemberPayload";

/**
 * Join a community by creating (or reactivating) a membership.
 *
 * Creates a membership row in community_platform_community_memberships for the
 * authenticated community member and the specified community. If a prior
 * membership exists and is soft-deleted, it will be reactivated by clearing
 * deleted_at. If an active membership already exists, the operation is
 * idempotent and updates updated_at, returning the existing membership.
 *
 * Additional behavior:
 *
 * - Validates the authenticated user is active (not deleted, status "active").
 * - Validates the community exists, is not deleted, and is not disabled.
 * - Updates community.last_active_at (and updated_at) to the current timestamp.
 * - Writes an audit log entry (event_type: "join_community").
 *
 * @param props - Request properties
 * @param props.communityMember - The authenticated Community Member payload
 * @param props.communityId - Target community ID (UUID)
 * @param props.body - Empty creation payload per contract
 * @returns The created or reactivated membership entity
 * @throws {HttpException} 403 when user is inactive or community is disabled
 * @throws {HttpException} 404 when community does not exist or was deleted
 */
export async function postcommunityPlatformCommunityMemberCommunitiesCommunityIdMemberships(props: {
  communityMember: CommunitymemberPayload;
  communityId: string & tags.Format<"uuid">;
  body: ICommunityPlatformCommunityMembership.ICreate;
}): Promise<ICommunityPlatformCommunityMembership> {
  const { communityMember, communityId } = props;

  // Authorization: ensure actor is active and not deleted
  const actor = await MyGlobal.prisma.community_platform_users.findFirst({
    where: {
      id: communityMember.id,
      deleted_at: null,
      status: "active",
    },
  });
  if (!actor) {
    throw new HttpException("Forbidden: Inactive or nonexistent user", 403);
  }

  // Validate community existence and joinability
  const community =
    await MyGlobal.prisma.community_platform_communities.findUnique({
      where: { id: communityId },
    });
  if (!community || community.deleted_at !== null) {
    throw new HttpException("Not Found: Community does not exist", 404);
  }
  if (community.disabled_at !== null) {
    throw new HttpException("Forbidden: Community is disabled", 403);
  }

  const now = toISOStringSafe(new Date());

  const membership = await MyGlobal.prisma.$transaction(async (tx) => {
    // Check existing membership by composite (community_id, user_id)
    const existing =
      await tx.community_platform_community_memberships.findFirst({
        where: {
          community_platform_community_id: communityId,
          community_platform_user_id: communityMember.id,
        },
      });

    let row = existing;
    if (existing) {
      if (existing.deleted_at === null) {
        // Idempotent: already active → touch updated_at
        row = await tx.community_platform_community_memberships.update({
          where: { id: existing.id },
          data: { updated_at: now },
        });
      } else {
        // Reactivate: clear deleted_at and refresh updated_at
        row = await tx.community_platform_community_memberships.update({
          where: { id: existing.id },
          data: { deleted_at: null, updated_at: now },
        });
      }
    } else {
      // Create new membership
      row = await tx.community_platform_community_memberships.create({
        data: {
          id: v4(),
          community_platform_community_id: communityId,
          community_platform_user_id: communityMember.id,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      });
    }

    // Update community recency
    await tx.community_platform_communities.update({
      where: { id: communityId },
      data: { last_active_at: now, updated_at: now },
    });

    // Audit log
    await tx.community_platform_audit_logs.create({
      data: {
        id: v4(),
        actor_user_id: communityMember.id,
        community_id: communityId,
        event_type: "join_community",
        success: true,
        created_at: now,
        updated_at: now,
      },
    });

    return row;
  });

  return {
    id: membership.id as string & tags.Format<"uuid">,
    community_platform_community_id:
      membership.community_platform_community_id as string &
        tags.Format<"uuid">,
    community_platform_user_id:
      membership.community_platform_user_id as string & tags.Format<"uuid">,
    created_at: toISOStringSafe(membership.created_at),
    updated_at: toISOStringSafe(membership.updated_at),
    deleted_at: membership.deleted_at
      ? toISOStringSafe(membership.deleted_at)
      : null,
  };
}
