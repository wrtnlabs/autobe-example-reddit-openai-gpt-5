import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

export async function deleteCommunityPlatformRegisteredMemberCommunitiesCommunityName(props: {
  registeredMember: RegisteredmemberPayload;
  communityName: string;
}): Promise<void> {
  /**
   * Delete a community (hard delete) from community_platform_communities and
   * cascade dependent data.
   *
   * Permanently removes the community identified by its immutable name
   * (normalized to name_key). This hard delete cascades to related entities via
   * onDelete: Cascade relations: posts, rules, memberships, and recent
   * communities are removed.
   *
   * Authorization: only the community creator or a site administrator may
   * perform this action.
   *
   * @param props - Request properties
   * @param props.registeredMember - Authenticated registered member payload
   *   (top-level user id)
   * @param props.communityName - Immutable community name, normalized to
   *   name_key for lookup
   * @returns Void (no content)
   * @throws {HttpException} 404 when the community does not exist
   * @throws {HttpException} 403 when the caller is neither the creator nor a
   *   site administrator
   */
  const { registeredMember, communityName } = props;

  // Normalize to name_key (application maintains name_key on create/update)
  const nameKey = communityName.trim().toLowerCase();

  // Locate target community by its unique name_key
  const community =
    await MyGlobal.prisma.community_platform_communities.findUnique({
      where: { name_key: nameKey },
    });
  if (community === null) {
    throw new HttpException("Not Found", 404);
  }

  // Authorization: creator or active site administrator
  const isOwner = community.community_platform_user_id === registeredMember.id;
  let isAdmin = false;
  if (!isOwner) {
    const admin = await MyGlobal.prisma.community_platform_siteadmins.findFirst(
      {
        where: {
          community_platform_user_id: registeredMember.id,
          revoked_at: null,
          deleted_at: null,
        },
        select: { id: true },
      },
    );
    isAdmin = admin !== null;
  }
  if (!isOwner && !isAdmin) {
    throw new HttpException(
      "Unauthorized: Only the community's creator or a site administrator can delete this community",
      403,
    );
  }

  // HARD DELETE: cascades to dependent rows via onDelete: Cascade
  await MyGlobal.prisma.community_platform_communities.delete({
    where: { id: community.id },
  });
}
