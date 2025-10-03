import { ICommunityPlatformUser } from "./ICommunityPlatformUser";

export namespace IUserRef {
  /**
   * Compatibility alias referencing the safe user summary DTO.
   *
   * This type directly reuses ICommunityPlatformUser.ISummary to embed a
   * minimal, non‑sensitive user reference (e.g., id and public profile
   * basics) in other entities without duplicating structure. It intentionally
   * excludes confidential fields like password_hash and internal normalized
   * keys (email_normalized, username_normalized) from
   * Actors.community_platform_users.
   *
   * Use this alias when legacy layers expect IUserRef.ISummary; new
   * integrations may reference ICommunityPlatformUser.ISummary directly.
   */
  export type ISummary = ICommunityPlatformUser.ISummary;
}
