import { tags } from "typia";

import { IECommunityPlatformRecentCommunityOrderBy } from "./IECommunityPlatformRecentCommunityOrderBy";
import { IESortDirection } from "./IESortDirection";
import { ICommunityPlatformCommunity } from "./ICommunityPlatformCommunity";

export namespace ICommunityPlatformRecentCommunity {
  /**
   * Request parameters for listing a user’s recent communities from Prisma
   * table community_platform_recent_communities.
   *
   * Includes pagination, sorting (by last_activity_at/created_at/updated_at),
   * and optional date range filters. Actor identity is derived from
   * authentication context; user IDs are not accepted in this request body.
   */
  export type IRequest = {
    /** Page number for pagination (>= 1). */
    page?: (number & tags.Type<"int32"> & tags.Minimum<1>) | null | undefined;

    /** Maximum number of records per page (>= 1). */
    limit?: (number & tags.Type<"int32"> & tags.Minimum<1>) | null | undefined;

    /** Primary sort field; defaults to last_activity_at when unspecified. */
    orderBy?: IECommunityPlatformRecentCommunityOrderBy | null | undefined;

    /** Sort direction for the selected orderBy; defaults to desc. */
    direction?: IESortDirection | null | undefined;

    /**
     * Filter: include records with last_activity_at on/after this timestamp
     * (UTC, ISO 8601).
     */
    from?: (string & tags.Format<"date-time">) | null | undefined;

    /**
     * Filter: include records with last_activity_at on/before this
     * timestamp (UTC, ISO 8601).
     */
    to?: (string & tags.Format<"date-time">) | null | undefined;
  };

  /**
   * Summary of a user's recent community record.
   *
   * Based on Prisma model community_platform_recent_communities. Enriched
   * with the referenced community summary for presentation while keeping the
   * mapping identity for deduplication and reconciliation.
   *
   * Security: Contains no sensitive credentials or session data.
   */
  export type ISummary = {
    /**
     * Primary key of the recent-community mapping.
     *
     * Maps to Prisma column community_platform_recent_communities.id
     * (UUID).
     */
    id: string & tags.Format<"uuid">;

    /**
     * Timestamp of the most recent eligible activity between the user and
     * the community (UTC).
     *
     * Maps to Prisma column
     * community_platform_recent_communities.last_activity_at (timestamptz).
     * Drives list ordering.
     */
    last_activity_at: string & tags.Format<"date-time">;

    /**
     * Nested summary of the related community for quick rendering in
     * sidebars and menus.
     *
     * Resolved from
     * community_platform_recent_communities.community_platform_community_id
     * → community_platform_communities.
     */
    community: ICommunityPlatformCommunity.ISummary;
  };
}
