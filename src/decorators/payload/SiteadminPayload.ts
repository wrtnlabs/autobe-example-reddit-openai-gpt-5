// File path: src/decorators/payload/SiteadminPayload.ts
import { tags } from "typia";

/**
 * JWT payload for Site Admin role.
 *
 * - Id: Top-level user table ID (community_platform_users.id)
 * - Type: Discriminator literal for siteadmin role
 */
export interface SiteadminPayload {
  /** Top-level user table ID (the fundamental user identifier). */
  id: string & tags.Format<"uuid">;
  /** Discriminator for the discriminated union type. */
  type: "siteadmin";
}
