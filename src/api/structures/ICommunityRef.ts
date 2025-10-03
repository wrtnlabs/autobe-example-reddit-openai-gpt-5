import { tags } from "typia";

import { IECommunityCategory } from "./IECommunityCategory";

export namespace ICommunityRef {
  /**
   * Minimal community reference used inside post cards and other summaries.
   *
   * This object resolves from community_platform_communities and provides
   * only the essentials needed to render a compact reference (name, optional
   * logo, category).
   */
  export type ISummary = {
    /**
     * Immutable community name (user-facing). Case-insensitive uniqueness
     * is enforced via the normalized key stored as name_key.
     *
     * Prisma source: community_platform_communities.name.
     */
    name: string &
      tags.MinLength<3> &
      tags.MaxLength<30> &
      tags.Pattern<"^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,28}[A-Za-z0-9])?$">;

    /**
     * Optional logo URI to display alongside the community name.
     *
     * Prisma source: community_platform_communities.logo_uri.
     */
    logoUrl?: (string & tags.Format<"uri">) | null | undefined;

    /**
     * Community category text constrained by application-level enum.
     *
     * Prisma source: community_platform_communities.category.
     */
    category: IECommunityCategory;
  };
}
