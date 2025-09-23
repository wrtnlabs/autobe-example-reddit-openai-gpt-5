import { tags } from "typia";

export namespace ICommunityPlatformSystemAdminEmailVerify {
  /**
   * Acknowledgment that an email verification message was dispatched for the
   * authenticated administrator account.\n\nThis DTO corresponds to the
   * lifecycle of `community_platform_user_credentials.email_verified_at` in
   * Prisma: this value remains null until the verification confirmation
   * endpoint validates the token and sets the timestamp.\n\nSecurity notes:
   * No secrets or verification tokens are returned here. Only a success
   * indicator and timing metadata are provided.
   */
  export type ISent = {
    /**
     * True if the platform successfully queued or dispatched the
     * verification email to the admin’s address from
     * `community_platform_user_credentials.email`.
     */
    ok: boolean;

    /**
     * ISO 8601 timestamp in UTC when the verification email was sent or
     * queued.
     */
    sent_at: string & tags.Format<"date-time">;

    /** Optional human-readable message confirming email dispatch. */
    message?: string | undefined;
  };

  /**
   * Admin email verification request payload.
   *
   * This DTO represents the public confirmation input used to verify an
   * administrator’s email address. It corresponds to the flow that sets
   * email_verified_at in Prisma table community_platform_user_credentials
   * after token validation.
   *
   * Security note: This request accepts only the verification token and never
   * accepts actor IDs or system-generated fields.
   */
  export type IRequest = {
    /**
     * Verification token issued by the platform’s messaging pipeline.
     *
     * This token authorizes setting email_verified_at on the corresponding
     * credentials row after validation. It is single-use and time-limited
     * by policy.
     */
    token: string;
  };

  /**
   * Confirmation response for admin email verification.
   *
   * This DTO communicates the outcome of the verification process that sets
   * email_verified_at on community_platform_user_credentials. It does not
   * expose sensitive secrets and contains only confirmation metadata.
   */
  export type IResponse = {
    /**
     * Whether the verification request succeeded in marking the admin’s
     * email as verified.
     *
     * True indicates the verification token was valid and the credentials
     * record was updated accordingly.
     */
    verified: boolean;

    /**
     * Timestamp when the email was (or had been) verified, in ISO 8601
     * format.
     *
     * Null indicates that the verification did not complete in this call
     * (e.g., invalid/expired token), or that the address was already
     * verified without a new change at this time.
     */
    verified_at?: (string & tags.Format<"date-time">) | null | undefined;
  };
}
