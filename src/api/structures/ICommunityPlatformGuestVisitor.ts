import { tags } from "typia";

import { IClientContext } from "./IClientContext";
import { IAuthorizationToken } from "./IAuthorizationToken";
import { ICommunityPlatformUser } from "./ICommunityPlatformUser";

export namespace ICommunityPlatformGuestVisitor {
  /**
   * Guest-join request payload for creating a minimal account and first
   * session.
   *
   * Prisma mappings:
   *
   * - Community_platform_users.email, email_normalized (derived), username,
   *   username_normalized (derived), password_hash (derived from password),
   *   display_name, last_login_at (set by server), created_at, updated_at.
   * - Community_platform_sessions fields set using the authenticated result and
   *   optional client hints.
   *
   * Security and validation:
   *
   * - Do not include identity fields like id or timestamps; the server manages
   *   them.
   * - All properties are optional—server may auto-generate ephemeral values for
   *   guest identities.
   * - Never transmit password hashes in requests or responses.
   */
  export type IJoin = {
    /**
     * Human-readable email for the guest account, mapped to Prisma column
     * community_platform_users.email.
     *
     * Business notes: The backend derives email_normalized for CI
     * uniqueness. When omitted, the server may auto-generate a compliant
     * placeholder to satisfy database constraints for a temporary guest
     * identity.
     */
    email?: (string & tags.Format<"email">) | undefined;

    /**
     * Preferred handle for the guest account, mapped to
     * community_platform_users.username.
     *
     * Business notes: The backend maintains username_normalized for CI
     * uniqueness. When omitted, the server may auto-generate a unique
     * ephemeral value suitable for guest identities.
     */
    username?: string | undefined;

    /**
     * Plaintext credential input. Server hashes into
     * community_platform_users.password_hash and never stores plaintext.
     *
     * Security: This field is optional for guest flows. If omitted, the
     * server can generate a random secret to fulfill storage constraints.
     * Never echo back in responses.
     */
    password?: string | undefined;

    /**
     * Optional display label mapped to
     * community_platform_users.display_name.
     *
     * Presentation: Clients may render this when available; otherwise UI
     * can fall back to "Anonymous" per product rules.
     */
    displayName?: string | null | undefined;

    /**
     * Optional client/session hints used to populate columns in
     * Sessions.community_platform_sessions such as user_agent, ip,
     * client_platform, client_device, and session_type.
     *
     * Security: These are metadata only and do not contain tokens.
     */
    client?: IClientContext | undefined;
  };

  /**
   * Guest session refresh request.
   *
   * Behavior:
   *
   * - Locates an existing session in community_platform_sessions using token
   *   context (from header/cookie or this field), validates not revoked and
   *   within renewal policy, and updates last_seen_at/extends expires_at.
   *   Rotation may occur when rotate=true.
   *
   * Security:
   *
   * - No role-assignment tables are affected. The associated user must remain
   *   active (users.deleted_at null).
   */
  export type IRefresh = {
    /**
     * Opaque session token presented by client if not conveyed via
     * cookie/header. Server validates by comparing its hash to
     * Sessions.community_platform_sessions.hashed_token.
     *
     * Security: Plaintext token is accepted inbound only for validation. It
     * is never persisted in plaintext.
     */
    token?: string | undefined;

    /**
     * If true, server may rotate token while extending expiry according to
     * long-session policy.
     */
    rotate?: boolean | undefined;

    /**
     * Optional client/session hints (user agent, IP, device) to update
     * session metadata during refresh.
     */
    client?: IClientContext | undefined;
  };

  /**
   * Authorization response for guestVisitor flows.
   *
   * Contents:
   *
   * - Id: UUID of community_platform_users row.
   * - Token: Standard authorization token container.
   * - User: Optional profile summary for rendering guards.
   *
   * Security considerations:
   *
   * - Never include password_hash, email_normalized, or username_normalized.
   * - Suitable for long-lived session UX and resume-after-login behaviors.
   */
  export type IAuthorized = {
    /** Identifier of the authenticated user (community_platform_users.id). */
    id: string & tags.Format<"uuid">;

    /** JWT token information for authentication */
    token: IAuthorizationToken;

    /**
     * Non-sensitive summary of the authenticated guest user for UI
     * convenience. Excludes password_hash and normalized keys.
     */
    user?: ICommunityPlatformUser.ISummary | undefined;
  };
}
