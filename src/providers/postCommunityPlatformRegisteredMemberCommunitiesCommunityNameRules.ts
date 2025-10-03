import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRule";
import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

/**
 * Create a community rule (community_platform_community_rules) under a named
 * community.
 *
 * Writes a new rule item associated to the parent community resolved by
 * {communityName}. Only the community owner or an active site admin may create
 * rules. Enforces unique order_index per community and returns the created rule
 * entity.
 *
 * @param props - Request properties
 * @param props.registeredMember - Authenticated registered member payload
 *   (top-level user id)
 * @param props.communityName - Community name path parameter used to resolve
 *   the parent community
 * @param props.body - Rule creation payload including order and text
 * @returns The created community rule
 * @throws {HttpException} 404 When the community does not exist or is removed
 * @throws {HttpException} 403 When the requester is not the owner nor an active
 *   site admin
 * @throws {HttpException} 409 When a rule with the same order already exists in
 *   the community
 */
export async function postCommunityPlatformRegisteredMemberCommunitiesCommunityNameRules(props: {
  registeredMember: RegisteredmemberPayload;
  communityName: string;
  body: ICommunityPlatformCommunityRule.ICreate;
}): Promise<ICommunityPlatformCommunityRule> {
  const { registeredMember, communityName, body } = props;

  // 1) Resolve parent community by name/name_key (active only)
  const nameKeyCandidate = communityName.trim().toLowerCase();
  const community =
    await MyGlobal.prisma.community_platform_communities.findFirst({
      where: {
        deleted_at: null,
        OR: [
          { name: communityName },
          { name_key: communityName },
          { name_key: nameKeyCandidate },
        ],
      },
    });
  if (!community) {
    throw new HttpException("Community not found or removed", 404);
  }

  // 2) Authorization: owner or active site admin
  if (community.community_platform_user_id !== registeredMember.id) {
    const admin = await MyGlobal.prisma.community_platform_siteadmins.findFirst(
      {
        where: {
          community_platform_user_id: registeredMember.id,
          revoked_at: null,
          deleted_at: null,
          user: { deleted_at: null },
        },
      },
    );
    if (!admin) {
      throw new HttpException(
        "Unauthorized: Only the community owner or a site admin can create rules",
        403,
      );
    }
  }

  // 3) Uniqueness pre-check for order_index within the community
  const existing =
    await MyGlobal.prisma.community_platform_community_rules.findFirst({
      where: {
        community_platform_community_id: community.id,
        order_index: body.order,
      },
    });
  if (existing) {
    throw new HttpException(
      "Conflict: A rule with the same order already exists in this community",
      409,
    );
  }

  // 4) Create the rule
  const created =
    await MyGlobal.prisma.community_platform_community_rules.create({
      data: {
        id: v4() as string & tags.Format<"uuid">,
        community_platform_community_id: community.id,
        order_index: body.order,
        text: body.text,
        created_at: toISOStringSafe(new Date()),
        updated_at: toISOStringSafe(new Date()),
      },
    });

  // 5) Map to DTO with proper date conversions and branding
  return {
    id: created.id as string & tags.Format<"uuid">,
    orderIndex: created.order_index as number &
      tags.Type<"int32"> &
      tags.Minimum<1>,
    text: created.text as string & tags.MaxLength<100>,
    createdAt: toISOStringSafe(created.created_at),
    updatedAt: toISOStringSafe(created.updated_at),
  };
}
