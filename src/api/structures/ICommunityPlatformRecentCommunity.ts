import { tags } from "typia";

import { IECommunityCategory } from "./IECommunityCategory";

export namespace ICommunityPlatformRecentCommunity {
  /**
   * Container for the Left Sidebar "Recent Communities" module.
   *
   * Represents the caller’s five most recently active communities. The
   * dataset is capped at five items by business rule and reinforced here by
   * maxItems validation. Uses
   * Memberships.community_platform_recent_communities as the source with
   * ordering by last_activity_at (desc).
   */
  export type IList = {
    /**
     * Up to five most recent communities for the authenticated user,
     * ordered by lastActivityAt descending.
     *
     * Backed by Memberships.community_platform_recent_communities
     * (last_activity_at) with joins to
     * Communities.community_platform_communities for display fields. Rows
     * where deleted_at is set on either table are excluded.
     */
    data: ICommunityPlatformRecentCommunity.ISummary[] & tags.MaxItems<5>;
  };

  /**
   * Summary card for a recent community list item.
   *
   * Composed primarily from Communities.community_platform_communities (name,
   * logo_uri, category) and Memberships.community_platform_recent_communities
   * (last_activity_at). Excludes soft-deleted records.
   */
  export type ISummary = {
    /**
     * Immutable community name used in URLs and display (Prisma:
     * community_platform_communities.name).
     *
     * Naming policy (business rules): alphanumeric with optional
     * hyphen/underscore separators, 3–30 chars, begins/ends alphanumeric,
     * and avoid consecutive separators. Uniqueness is enforced
     * case-insensitively via name_key at the database layer.
     */
    name: string &
      tags.MinLength<3> &
      tags.MaxLength<30> &
      tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$">;

    /**
     * Optional logo image URI for the community (Prisma:
     * community_platform_communities.logo_uri). When null or absent,
     * clients show a default icon.
     */
    logoUrl?: (string & tags.Format<"uri">) | null | undefined;

    /**
     * Most recent activity time for this user in this community (Prisma:
     * community_platform_recent_communities.last_activity_at). Used to
     * order the recent list descending.
     */
    lastActivityAt: string & tags.Format<"date-time">;

    /**
     * Community category value (Prisma:
     * community_platform_communities.category). Optional in this summary
     * but typically present. Enum values are defined in
     * IECommunityCategory.
     */
    category?: IECommunityCategory | null | undefined;
  };
}
