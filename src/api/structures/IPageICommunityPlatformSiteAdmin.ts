import { IPage } from "./IPage";
import { ICommunityPlatformSiteAdmin } from "./ICommunityPlatformSiteAdmin";

export namespace IPageICommunityPlatformSiteAdmin {
  /**
   * A page.
   *
   * Collection of records with pagination information.
   */
  export type ISummary = {
    /** Page information. */
    pagination: IPage.IPagination;

    /** List of records. */
    data: ICommunityPlatformSiteAdmin.ISummary[];
  };
}
