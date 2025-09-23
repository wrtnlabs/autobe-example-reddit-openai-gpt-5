import { IPage } from "./IPage";
import { ICommunityPlatformRecentCommunity } from "./ICommunityPlatformRecentCommunity";

export namespace IPageICommunityPlatformRecentCommunity {
  /**
   * A page.
   *
   * Collection of records with pagination information.
   */
  export type ISummary = {
    /** Page information. */
    pagination: IPage.IPagination;

    /** List of records. */
    data: ICommunityPlatformRecentCommunity.ISummary[];
  };
}
