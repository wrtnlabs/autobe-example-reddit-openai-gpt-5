import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import { ICommunityPlatformUser } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformUser";
import { IECommunityPlatformVoteState } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformVoteState";
import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

export async function postCommunityPlatformRegisteredMemberPosts(props: {
  registeredMember: RegisteredmemberPayload;
  body: ICommunityPlatformPost.ICreate;
}): Promise<ICommunityPlatformPost> {
  const { registeredMember, body } = props;

  // Authentication guard (extra safety; controller typically handles this)
  if (!registeredMember) {
    throw new HttpException("Please sign in to continue.", 401);
  }

  // Ensure user exists and is not soft-deleted
  const user = await MyGlobal.prisma.community_platform_users.findFirst({
    where: { id: registeredMember.id, deleted_at: null },
    select: { id: true, display_name: true },
  });
  if (!user) {
    throw new HttpException(
      "Unauthorized: You must be an active registered member",
      403,
    );
  }

  // Ensure an active registered-member role exists
  const member =
    await MyGlobal.prisma.community_platform_registeredmembers.findFirst({
      where: {
        community_platform_user_id: registeredMember.id,
        deleted_at: null,
      },
      select: { id: true },
    });
  if (!member) {
    throw new HttpException(
      "Unauthorized: You must be an active registered member",
      403,
    );
  }

  // Resolve target community by normalized name_key (lowercased) or exact name
  const normalizedNameKey = body.communityName.toLowerCase();
  const community =
    await MyGlobal.prisma.community_platform_communities.findFirst({
      where: {
        deleted_at: null,
        OR: [{ name_key: normalizedNameKey }, { name: body.communityName }],
      },
      select: { id: true, name: true, logo_uri: true },
    });
  if (!community) {
    throw new HttpException("Not Found: Community does not exist", 404);
  }

  // Timestamps
  const now = toISOStringSafe(new Date());

  // Create post and update community activity within a single transaction
  const created = await MyGlobal.prisma.$transaction(async (tx) => {
    const createdPost = await tx.community_platform_posts.create({
      data: {
        id: v4() as string & tags.Format<"uuid">,
        community_platform_community_id: community.id,
        community_platform_user_id: registeredMember.id,
        title: body.title,
        body: body.body,
        author_display_name: body.authorDisplayName ?? null,
        created_at: now,
        updated_at: now,
      },
    });

    await tx.community_platform_communities.update({
      where: { id: community.id },
      data: {
        last_active_at: now,
        updated_at: now,
      },
    });

    return createdPost;
  });

  // Compose response DTO
  return {
    id: created.id as string & tags.Format<"uuid">,
    community: {
      name: community.name,
      logoUrl: community.logo_uri ?? null,
    },
    title: created.title,
    body: created.body,
    author: {
      id: registeredMember.id as string & tags.Format<"uuid">,
      displayName: created.author_display_name ?? user.display_name ?? null,
    },
    createdAt: toISOStringSafe(created.created_at),
    updatedAt: toISOStringSafe(created.updated_at),
    score: 0,
    commentCount: 0,
    myVote: null,
  };
}
