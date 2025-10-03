import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformCommunityMember } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityMember";
import { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

export async function putCommunityPlatformRegisteredMemberCommunitiesCommunityNameMembership(props: {
  registeredMember: RegisteredmemberPayload;
  communityName: string;
  body: ICommunityPlatformCommunityMember.IUpdate;
}): Promise<ICommunityPlatformCommunityMember> {
  const { registeredMember, communityName, body } = props;

  // Authorization check (defensive - decorator already authenticates)
  if (!registeredMember || registeredMember.type !== "registeredmember") {
    throw new HttpException(
      "Forbidden: Only registered members can update community membership",
      403,
    );
  }

  // Normalize community key (application-level normalization to name_key)
  const nameKey = communityName.trim().toLowerCase();

  // Resolve target community (must not be soft-deleted)
  const community =
    await MyGlobal.prisma.community_platform_communities.findFirst({
      where: {
        deleted_at: null,
        OR: [{ name_key: nameKey }, { name: communityName }],
      },
    });
  if (!community) {
    throw new HttpException("Not Found", 404);
  }

  const now = toISOStringSafe(new Date());

  // Execute membership toggle and recency update atomically
  const result = await MyGlobal.prisma.$transaction(async (tx) => {
    // Fetch existing membership (if any)
    const existing = await tx.community_platform_community_members.findFirst({
      where: {
        community_platform_user_id: registeredMember.id,
        community_platform_community_id: community.id,
      },
    });

    // Apply desired state idempotently
    if (body.join === true) {
      if (!existing) {
        await tx.community_platform_community_members.create({
          data: {
            id: v4(),
            community_platform_user_id: registeredMember.id,
            community_platform_community_id: community.id,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          },
        });
      } else if (existing.deleted_at !== null) {
        await tx.community_platform_community_members.update({
          where: { id: existing.id },
          data: {
            deleted_at: null,
            updated_at: now,
          },
        });
      }
      // else already joined → no-op
    } else {
      if (existing && existing.deleted_at === null) {
        await tx.community_platform_community_members.update({
          where: { id: existing.id },
          data: {
            deleted_at: now,
            updated_at: now,
          },
        });
      }
      // else already left or never existed → no-op
    }

    // Ensure recent communities reflects latest activity
    const existingRecent =
      await tx.community_platform_recent_communities.findFirst({
        where: {
          community_platform_user_id: registeredMember.id,
          community_platform_community_id: community.id,
        },
      });

    if (!existingRecent) {
      await tx.community_platform_recent_communities.create({
        data: {
          id: v4(),
          community_platform_user_id: registeredMember.id,
          community_platform_community_id: community.id,
          last_activity_at: now,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
      });
    } else {
      await tx.community_platform_recent_communities.update({
        where: { id: existingRecent.id },
        data: {
          last_activity_at: now,
          updated_at: now,
          deleted_at: null,
        },
      });
    }

    // Re-read membership to determine final state and joinedAt
    const finalMembership =
      await tx.community_platform_community_members.findFirst({
        where: {
          community_platform_user_id: registeredMember.id,
          community_platform_community_id: community.id,
        },
      });

    const joined = !!finalMembership && finalMembership.deleted_at === null;

    const memberCount = await tx.community_platform_community_members.count({
      where: {
        community_platform_community_id: community.id,
        deleted_at: null,
      },
    });

    return {
      joined,
      joinedAt: joined ? toISOStringSafe(finalMembership!.created_at) : null,
      memberCount,
    };
  });

  const response: ICommunityPlatformCommunityMember = {
    community: {
      name: community.name as ICommunityPlatformCommunity.IBasic["name"],
      logoUrl: community.logo_uri ?? null,
    },
    joined: result.joined,
    memberCount: result.memberCount as number &
      tags.Type<"int32"> &
      tags.Minimum<0>,
    joinedAt: result.joinedAt,
  };

  return response;
}
