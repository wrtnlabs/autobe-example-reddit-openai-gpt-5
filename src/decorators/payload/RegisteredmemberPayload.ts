// File path: src/decorators/payload/RegisteredmemberPayload.ts
import { tags } from "typia";

/**
 * JWT payload for a Registered Member.
 *
 * - Id is ALWAYS the top-level user table ID (community_platform_users.id)
 * - Type discriminates this payload shape
 */
export interface RegisteredmemberPayload {
  /** Top-level user table ID (community_platform_users.id). */
  id: string & tags.Format<"uuid">;

  /** Discriminator for role identification. */
  type: "registeredmember";

  /** Optional timestamp when the user became a registered member. */
  registered_at?: string & tags.Format<"date-time">;

  /** Optional profile display name of the user. */
  display_name?: string | null;

  /** Optional canonical username. */
  username?: string;

  /** Optional email address of the user. */
  email?: string & tags.Format<"email">;
}
