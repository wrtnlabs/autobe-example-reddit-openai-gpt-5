import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformRecentCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformRecentCommunity";
import { IECommunityCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/IECommunityCategory";
import { RegisteredmemberPayload } from "../decorators/payload/RegisteredmemberPayload";

export async function getCommunityPlatformRegisteredMemberMeRecentCommunities(props: {
  registeredMember: RegisteredmemberPayload;
}): Promise<ICommunityPlatformRecentCommunity.IList> {
  /**
   * Get the current user’s recent communities (up to five), ordered by last
   * activity.
   *
   * Reads Memberships.community_platform_recent_communities joined with
   * Communities.community_platform_communities to build the Left Sidebar
   * "Recent Communities" module. Only active (non-deleted) rows are
   * considered.
   *
   * Authorization: requires an authenticated Registered Member. Results are
   * scoped to the caller (their user id only).
   *
   * @param props - Request properties
   * @param props.registeredMember - Authenticated registered member payload
   * @returns A list container holding up to five recent community summaries
   * @throws {HttpException} 401 when unauthenticated
   */
  const { registeredMember } = props;
  if (!registeredMember || !registeredMember.id) {
    throw new HttpException("Please sign in to continue.", 401);
  }

  // Runtime guard: validate URI string to safely brand as tags.Format<"uri">
  const isValidUri = (
    value: string | null | undefined,
  ): value is string & tags.Format<"uri"> => {
    if (!value) return false;
    try {
      // URL constructor throws for invalid URIs
      // Accepted when it parses without exception
      // Ensures we only include properly formatted URIs
      new URL(value);
      return true;
    } catch {
      return false;
    }
  };

  // Runtime guard: narrow arbitrary string to IECommunityCategory
  const CATEGORY_VALUES: readonly IECommunityCategory[] = [
    "Tech & Programming",
    "Science",
    "Movies & TV",
    "Games",
    "Sports",
    "Lifestyle & Wellness",
    "Study & Education",
    "Art & Design",
    "Business & Finance",
    "News & Current Affairs",
  ] as const;
  const isIECommunityCategory = (
    value: string | null | undefined,
  ): value is IECommunityCategory =>
    value !== null &&
    value !== undefined &&
    CATEGORY_VALUES.includes(value as IECommunityCategory);

  // Fetch up to 5 recent items for this user, newest first, excluding soft-deleted rows
  const rows =
    await MyGlobal.prisma.community_platform_recent_communities.findMany({
      where: {
        community_platform_user_id: registeredMember.id,
        deleted_at: null,
        community: { deleted_at: null },
      },
      orderBy: { last_activity_at: "desc" },
      take: 5,
      select: {
        last_activity_at: true,
        community: {
          select: {
            name: true,
            logo_uri: true,
            category: true,
          },
        },
      },
    });

  // Transform to DTO with strict date string formatting and safe optional fields
  const data: ICommunityPlatformRecentCommunity.ISummary[] = rows
    .filter((row) => row.community !== null)
    .map((row) => {
      const name = row.community!.name;
      const lastActivityAt = toISOStringSafe(row.last_activity_at);

      const base = {
        name,
        lastActivityAt,
      };

      const logoPart = isValidUri(row.community!.logo_uri)
        ? { logoUrl: row.community!.logo_uri }
        : {};

      const categoryPart = isIECommunityCategory(row.community!.category)
        ? { category: row.community!.category }
        : {};

      const summary: ICommunityPlatformRecentCommunity.ISummary = {
        ...base,
        ...logoPart,
        ...categoryPart,
      };
      return summary;
    });

  return { data };
}
