import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";
import { IECommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityCategory";
import { ICommunityPlatformCommunityRule } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRule";
import { IECommunityPlatformCommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityPlatformCommunityCategory";
import { ICommunityPlatformCommunityRuleArray } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunityRuleArray";
import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

export async function postCommunityPlatformRegisteredMemberCommunities(props: {
  registeredMember: RegisteredmemberPayload;
  body: ICommunityPlatformCommunity.ICreate;
}): Promise<ICommunityPlatformCommunity> {
  const { registeredMember, body } = props;

  /**
   * Create a new community with optional initial rules, owned by the
   * authenticated registered member. Enforces name format and case-insensitive
   * uniqueness via name_key. Auto-joins the creator into the membership table.
   *
   * @param props - Request properties
   * @param props.registeredMember - Authenticated registered member payload
   * @param props.body - Community creation payload
   * @returns Newly created community representation including timestamps and
   *   any initial rules
   * @throws {HttpException} 400 When name format is invalid
   * @throws {HttpException} 403 When the requester is not an active registered
   *   member
   * @throws {HttpException} 409 When the community name already exists
   *   (case-insensitive)
   */

  // Authorization: ensure payload type and active registered member record
  if (!registeredMember || registeredMember.type !== "registeredmember") {
    throw new HttpException(
      "Unauthorized: Only registered members can create communities",
      403,
    );
  }
  const memberCheck =
    await MyGlobal.prisma.community_platform_registeredmembers.findFirst({
      where: {
        community_platform_user_id: registeredMember.id,
        deleted_at: null,
        user: { deleted_at: null },
      },
      select: { id: true },
    });
  if (!memberCheck) {
    throw new HttpException(
      "Unauthorized: You are not an active registered member",
      403,
    );
  }

  // Business validation: name format (matches DTO contract)
  const NAME_REGEX = /^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$/;
  if (!NAME_REGEX.test(body.name)) {
    throw new HttpException(
      "This name isn’t available. Please choose something simpler.",
      400,
    );
  }

  const now: string & tags.Format<"date-time"> = toISOStringSafe(new Date());
  const nameKey = body.name.trim().toLowerCase();

  try {
    const result = await MyGlobal.prisma.$transaction(async (tx) => {
      // 1) Create community
      const createdCommunity = await tx.community_platform_communities.create({
        data: {
          id: v4() as string & tags.Format<"uuid">,
          community_platform_user_id: registeredMember.id,
          name: body.name,
          name_key: nameKey,
          category: body.category,
          description: body.description ?? null,
          logo_uri: body.logoUri ?? null,
          banner_uri: body.bannerUri ?? null,
          last_active_at: null,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        },
        select: {
          id: true,
          name: true,
          category: true,
          description: true,
          logo_uri: true,
          banner_uri: true,
          created_at: true,
          updated_at: true,
          last_active_at: true,
          community_platform_user_id: true,
        },
      });

      // 2) Optional initial rules
      const createdRules: ICommunityPlatformCommunityRule[] = [];
      if (body.rules && body.rules.length > 0) {
        for (const r of body.rules) {
          const createdRule =
            await tx.community_platform_community_rules.create({
              data: {
                id: v4() as string & tags.Format<"uuid">,
                community_platform_community_id: createdCommunity.id,
                order_index: r.order,
                text: r.text,
                created_at: now,
                updated_at: now,
                deleted_at: null,
              },
              select: {
                id: true,
                order_index: true,
                text: true,
                created_at: true,
                updated_at: true,
              },
            });

          createdRules.push({
            id: createdRule.id as string & tags.Format<"uuid">,
            orderIndex: createdRule.order_index as number &
              tags.Type<"int32"> &
              tags.Minimum<1>,
            text: createdRule.text as string,
            createdAt: toISOStringSafe(createdRule.created_at),
            updatedAt: toISOStringSafe(createdRule.updated_at),
          });
        }
      }

      // 3) Auto-join creator into community members (ignore conflict if already exists)
      try {
        await tx.community_platform_community_members.create({
          data: {
            id: v4() as string & tags.Format<"uuid">,
            community_platform_user_id: registeredMember.id,
            community_platform_community_id: createdCommunity.id,
            created_at: now,
            updated_at: now,
            deleted_at: null,
          },
          select: { id: true },
        });
      } catch (err) {
        // Ignore unique constraint violations for membership
        if (
          !(
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === "P2002"
          )
        ) {
          throw err;
        }
      }

      // 4) Derived memberCount
      const memberCountNumber =
        await tx.community_platform_community_members.count({
          where: {
            community_platform_community_id: createdCommunity.id,
            deleted_at: null,
          },
        });

      // 5) Assemble response
      const response: ICommunityPlatformCommunity = {
        id: createdCommunity.id as string & tags.Format<"uuid">,
        name: createdCommunity.name,
        category:
          createdCommunity.category as IECommunityPlatformCommunityCategory,
        description:
          createdCommunity.description === null
            ? undefined
            : createdCommunity.description,
        logoUri:
          createdCommunity.logo_uri === null
            ? undefined
            : createdCommunity.logo_uri,
        bannerUri:
          createdCommunity.banner_uri === null
            ? undefined
            : createdCommunity.banner_uri,
        createdAt: toISOStringSafe(createdCommunity.created_at),
        updatedAt: toISOStringSafe(createdCommunity.updated_at),
        lastActiveAt: createdCommunity.last_active_at
          ? toISOStringSafe(createdCommunity.last_active_at)
          : undefined,
        memberCount: Number(memberCountNumber) as number &
          tags.Type<"int32"> &
          tags.Minimum<0>,
        isMember: true,
        isOwner:
          createdCommunity.community_platform_user_id === registeredMember.id,
        rules: createdRules.length > 0 ? createdRules : undefined,
      };

      return response;
    });

    return result;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      // Unique constraint violation (likely on name_key)
      throw new HttpException("This name is already in use.", 409);
    }
    // Generic fallback
    throw err;
  }
}
