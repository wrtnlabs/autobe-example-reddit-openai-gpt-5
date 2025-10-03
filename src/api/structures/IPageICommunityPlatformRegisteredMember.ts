import { IPage } from "./IPage";
import { ICommunityPlatformRegisteredMember } from "./ICommunityPlatformRegisteredMember";

export namespace IPageICommunityPlatformRegisteredMember {
  /**
   * A page.
   *
   * Collection of records with pagination information.
   */
  export type ISummary = {
    /** Page information. */
    pagination: IPage.IPagination;

    /** List of records. */
    data: ICommunityPlatformRegisteredMember.ISummary[];
  };
}
