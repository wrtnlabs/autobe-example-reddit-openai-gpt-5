import { tags } from "typia";

export namespace ICommunityPlatformGlobalLatestPost {
  /**
   * Compact summary of a Global Latest entry.
   *
   * Derived from MV mv_community_platform_global_latest_posts to support fast
   * public sidebar rendering. Includes only essential, denormalized fields
   * and timestamps.
   *
   * Security: Public-safe; excludes sensitive credential or token data.
   */
  export type ISummary = {
    /**
     * Primary key of the materialized view row.
     *
     * Maps to MV column mv_community_platform_global_latest_posts.id
     * (UUID).
     */
    id: string & tags.Format<"uuid">;

    /**
     * Identifier of the referenced post.
     *
     * Maps to MV column community_platform_post_id (UUID).
     */
    community_platform_post_id: string & tags.Format<"uuid">;

    /**
     * Identifier of the owning community.
     *
     * Maps to MV column community_platform_community_id (UUID).
     */
    community_platform_community_id: string & tags.Format<"uuid">;

    /**
     * Identifier of the author user.
     *
     * Maps to MV column community_platform_user_id (UUID).
     */
    community_platform_user_id: string & tags.Format<"uuid">;

    /**
     * Original post creation timestamp used for Newest ordering (UTC).
     *
     * Maps to MV column created_at (timestamptz).
     */
    created_at: string & tags.Format<"date-time">;

    /**
     * Timestamp when this MV row was last refreshed/materialized (UTC).
     *
     * Maps to MV column refreshed_at (timestamptz).
     */
    refreshed_at: string & tags.Format<"date-time">;

    /**
     * Denormalized post title for sidebar display.
     *
     * Maps to MV column title.
     */
    title: string;

    /**
     * Optional author display name as captured in the MV.
     *
     * Maps to MV column author_display_name (nullable). Presentation-only;
     * does not affect authorship.
     */
    author_display_name?: string | null | undefined;

    /**
     * Denormalized immutable community name used for display like
     * /c/{name}.
     *
     * Maps to MV column community_name.
     */
    community_name: string;

    /**
     * Denormalized score (upvotes − downvotes) at refresh time.
     *
     * Maps to MV column score (integer).
     */
    score: number & tags.Type<"int32">;

    /**
     * Denormalized total number of comments at refresh time.
     *
     * Maps to MV column comment_count (integer).
     */
    comment_count: number & tags.Type<"int32">;
  };
}
