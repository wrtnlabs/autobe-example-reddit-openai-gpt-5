// File path: src/decorators/payload/GuestvisitorPayload.ts
import { tags } from "typia";

/** JWT payload for guestvisitor role. */
export interface GuestvisitorPayload {
  /** Top-level user table ID (community_platform_users.id). */
  id: string & tags.Format<"uuid">;
  /** Discriminator for the discriminated union type. */
  type: "guestvisitor";
}
