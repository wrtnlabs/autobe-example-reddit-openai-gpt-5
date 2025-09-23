import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import { CommunitymemberPayload } from "../decorators/payload/CommunitymemberPayload";

/**
 * Update community metadata (community_platform_communities) except immutable
 * name.
 *
 * Updates description, logo URI, banner URI, and optionally reassigns the
 * category for an existing community identified by communityId. The unique name
 * remains immutable.
 *
 * Authorization: Only the community owner or a system admin may update
 * metadata. Category reassignment requires the target category to exist and be
 * active.
 *
 * @param props - Request properties
 * @param props.communityMember - The authenticated community member payload
 *   (top-level user id)
 * @param props.communityId - UUID of the community to update
 * @param props.body - Update payload (description, logo, banner, and/or
 *   category id)
 * @returns The updated community entity with all fields normalized
 * @throws {HttpException} 404 when the community does not exist (or is deleted)
 * @throws {HttpException} 403 when the actor lacks permission (not owner/admin)
 * @throws {HttpException} 404 when provided category does not exist or is
 *   inactive
 */
export async function putcommunityPlatformCommunityMemberCommunitiesCommunityId(props: {
  communityMember: CommunitymemberPayload;
  communityId: string & tags.Format<"uuid">;
  body: ICommunityPlatformCommunity.IUpdate;
}): Promise<ICommunityPlatformCommunity> {
  const { communityMember, communityId, body } = props;

  // 1) Ensure community exists and is not soft-deleted
  const existing =
    await MyGlobal.prisma.community_platform_communities.findFirst({
      where: {
        id: communityId,
        deleted_at: null,
      },
    });
  if (!existing) throw new HttpException("Community not found", 404);

  // 2) Authorization: owner or active system admin
  const isOwner = existing.community_platform_user_id === communityMember.id;
  let isAdmin = false;
  if (!isOwner) {
    const admin =
      await MyGlobal.prisma.community_platform_systemadmins.findFirst({
        where: {
          community_platform_user_id: communityMember.id,
          deleted_at: null,
          revoked_at: null,
        },
      });
    isAdmin = !!admin;
  }
  if (!isOwner && !isAdmin) {
    throw new HttpException(
      "Unauthorized: Only owner or admin can update community",
      403,
    );
  }

  // 3) Validate category if provided (null means skip due to non-nullable FK in schema)
  const wantsCategoryChange =
    body.community_platform_category_id !== undefined &&
    body.community_platform_category_id !== null;
  if (wantsCategoryChange) {
    const category =
      await MyGlobal.prisma.community_platform_categories.findFirst({
        where: {
          id: body.community_platform_category_id!,
          active: true,
          deleted_at: null,
        },
      });
    if (!category) {
      throw new HttpException("Category not found or inactive", 404);
    }
  }

  // 4) Perform update
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());
  const updated = await MyGlobal.prisma.community_platform_communities.update({
    where: { id: communityId },
    data: {
      // Optional metadata updates
      description: body.description ?? undefined,
      logo: body.logo ?? undefined,
      banner: body.banner ?? undefined,
      // Category reassignment only when provided and not null
      community_platform_category_id:
        body.community_platform_category_id === null
          ? undefined
          : (body.community_platform_category_id ?? undefined),
      // Server-maintained timestamp
      updated_at: now,
    },
    select: {
      id: true,
      community_platform_user_id: true,
      community_platform_category_id: true,
      name: true,
      description: true,
      logo: true,
      banner: true,
      last_active_at: true,
      disabled_at: true,
      created_at: true,
      updated_at: true,
      deleted_at: true,
    },
  });

  // 5) Map to API structure with proper branding and date conversions
  return {
    id: typia.assert<string & tags.Format<"uuid">>(updated.id),
    community_platform_user_id: typia.assert<string & tags.Format<"uuid">>(
      updated.community_platform_user_id,
    ),
    community_platform_category_id: typia.assert<string & tags.Format<"uuid">>(
      updated.community_platform_category_id,
    ),
    name: typia.assert<
      string &
        tags.MinLength<3> &
        tags.MaxLength<32> &
        tags.Pattern<"^[A-Za-z][A-Za-z0-9_-]{1,30}[A-Za-z0-9]$">
    >(updated.name),
    description: updated.description ?? null,
    logo:
      updated.logo === null
        ? null
        : typia.assert<string & tags.MaxLength<80000> & tags.Format<"uri">>(
            updated.logo,
          ),
    banner:
      updated.banner === null
        ? null
        : typia.assert<string & tags.MaxLength<80000> & tags.Format<"uri">>(
            updated.banner,
          ),
    last_active_at: toISOStringSafe(updated.last_active_at),
    disabled_at: updated.disabled_at
      ? toISOStringSafe(updated.disabled_at)
      : null,
    created_at: toISOStringSafe(updated.created_at),
    updated_at: now,
    deleted_at: updated.deleted_at ? toISOStringSafe(updated.deleted_at) : null,
  };
}
