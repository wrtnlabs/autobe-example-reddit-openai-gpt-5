import { IPage } from "./IPage";
import { ICommunityPlatformAdminAction } from "./ICommunityPlatformAdminAction";

export namespace IPageICommunityPlatformAdminAction {
  /**
   * A page.
   *
   * Collection of records with pagination information.
   */
  export type ISummary = {
    /** Page information. */
    pagination: IPage.IPagination;

    /** List of records. */
    data: ICommunityPlatformAdminAction.ISummary[];
  };
}
