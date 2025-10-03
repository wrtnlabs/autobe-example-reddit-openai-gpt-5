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

export async function putCommunityPlatformRegisteredMemberPostsPostId(props: {
  registeredMember: RegisteredmemberPayload;
  postId: string & tags.Format<"uuid">;
  body: ICommunityPlatformPost.IUpdate;
}): Promise<ICommunityPlatformPost> {
  const { registeredMember, postId, body } = props;

  // Authentication guard
  if (!registeredMember || registeredMember.type !== "registeredmember") {
    throw new HttpException("Please sign in to continue.", 401);
  }

  // Business validations
  if (body.title !== undefined) {
    const len = body.title.length;
    if (len < 5 || len > 120) {
      throw new HttpException(
        "Bad Request: Title must be 5–120 characters.",
        400,
      );
    }
  }
  if (body.body !== undefined) {
    const len = body.body.length;
    if (len < 10 || len > 10000) {
      throw new HttpException(
        "Bad Request: Body must be 10–10,000 characters.",
        400,
      );
    }
  }
  if (body.authorDisplayName !== undefined && body.authorDisplayName !== null) {
    const len = body.authorDisplayName.length;
    if (len < 0 || len > 32) {
      throw new HttpException(
        "Bad Request: Author display name must be 0–32 characters.",
        400,
      );
    }
  }

  // Load target post (must exist and not be soft-deleted)
  const existing = await MyGlobal.prisma.community_platform_posts.findFirst({
    where: {
      id: postId,
      deleted_at: null,
    },
    select: {
      id: true,
      community_platform_user_id: true,
      community_platform_community_id: true,
      created_at: true,
    },
  });
  if (!existing) throw new HttpException("Not Found", 404);

  // Ownership guard
  if (existing.community_platform_user_id !== registeredMember.id) {
    throw new HttpException(
      "You can edit or delete only items you authored.",
      403,
    );
  }

  // Prepare timestamps
  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());

  // Perform update
  const updated = await MyGlobal.prisma.community_platform_posts.update({
    where: { id: postId },
    data: {
      title: body.title ?? undefined,
      body: body.body ?? undefined,
      author_display_name:
        body.authorDisplayName === null
          ? null
          : (body.authorDisplayName ?? undefined),
      updated_at: now,
    },
    select: {
      id: true,
      title: true,
      body: true,
      author_display_name: true,
      community_platform_community_id: true,
      community_platform_user_id: true,
      created_at: true,
    },
  });

  // Fetch related and derived data concurrently
  const [community, voteSum, commentCount, myVoteRow] = await Promise.all([
    MyGlobal.prisma.community_platform_communities.findUnique({
      where: { id: updated.community_platform_community_id },
      select: { name: true, logo_uri: true },
    }),
    MyGlobal.prisma.community_platform_post_votes.aggregate({
      where: {
        community_platform_post_id: updated.id,
        deleted_at: null,
      },
      _sum: { value: true },
    }),
    MyGlobal.prisma.community_platform_comments.count({
      where: {
        community_platform_post_id: updated.id,
        deleted_at: null,
      },
    }),
    MyGlobal.prisma.community_platform_post_votes.findFirst({
      where: {
        community_platform_post_id: updated.id,
        community_platform_user_id: registeredMember.id,
        deleted_at: null,
      },
      select: { value: true },
    }),
  ]);

  if (!community) throw new HttpException("Not Found", 404);

  const scoreNumber = Number(voteSum._sum.value ?? 0);
  const myVote: IECommunityPlatformVoteState | null =
    myVoteRow == null ? null : myVoteRow.value > 0 ? "UPVOTE" : "DOWNVOTE";

  // Compose response DTO
  return {
    id: updated.id as string & tags.Format<"uuid">,
    community: {
      name: community.name,
      logoUrl: community.logo_uri ?? null,
    },
    title: updated.title as string & tags.MinLength<5> & tags.MaxLength<120>,
    body: updated.body as string & tags.MinLength<10> & tags.MaxLength<10000>,
    author: {
      id: registeredMember.id,
      displayName: updated.author_display_name ?? null,
    },
    createdAt: toISOStringSafe(updated.created_at),
    updatedAt: now,
    score: scoreNumber as number & tags.Type<"int32">,
    commentCount: Number(commentCount) as number &
      tags.Type<"int32"> &
      tags.Minimum<0>,
    myVote,
  };
}
