// File path: src/decorators/payload/GuestvisitorPayload.ts
import { tags } from "typia";

/**
 * JWT payload for guest visitors.
 *
 * - Id is the top-level identity: community_platform_guestvisitors.id
 * - Type discriminates the role and must be exactly "guestVisitor"
 */
export interface GuestvisitorPayload {
  /** Top-level guest visitor table ID (community_platform_guestvisitors.id). */
  id: string & tags.Format<"uuid">;

  /** Discriminator for role identification. */
  type: "guestVisitor";

  /** Optional opaque device/browser fingerprint. */
  device_fingerprint?: string;

  /** Observed user-agent string, if recorded. */
  user_agent?: string;

  /** Observed IP address, if recorded. */
  ip?: string;

  /** First observed timestamp for this guest visitor. */
  first_seen_at?: string & tags.Format<"date-time">;

  /** Most recent observed timestamp for this guest visitor. */
  last_seen_at?: string & tags.Format<"date-time">;
}
