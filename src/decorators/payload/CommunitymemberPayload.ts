// File path: src/decorators/payload/CommunitymemberPayload.ts
import { tags } from "typia";

/** JWT payload for the Community Member role. */
export interface CommunitymemberPayload {
  /** Top-level user table ID (community_platform_users.id). */
  id: string & tags.Format<"uuid">;
  /** Role discriminator. */
  type: "communityMember";
  /** Optional membership status. */
  community_member_status?: string;
  /** Optional membership activation time. */
  community_member_since_at?: string & tags.Format<"date-time">;
}
