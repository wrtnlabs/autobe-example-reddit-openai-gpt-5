// File path: src/decorators/payload/SystemadminPayload.ts
import { tags } from "typia";

/**
 * JWT payload for System Admin.
 *
 * - `id` is the top-level user identifier (community_platform_users.id).
 * - `type` is the role discriminator and must be exactly "systemadmin".
 */
export interface SystemadminPayload {
  /** Top-level user table ID (community_platform_users.id). */
  id: string & tags.Format<"uuid">;
  /** Discriminator for the role. */
  type: "systemadmin";
}
