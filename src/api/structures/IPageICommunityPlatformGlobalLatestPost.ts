import { IPage } from "./IPage";
import { ICommunityPlatformGlobalLatestPost } from "./ICommunityPlatformGlobalLatestPost";

export namespace IPageICommunityPlatformGlobalLatestPost {
  /**
   * A page.
   *
   * Collection of records with pagination information.
   */
  export type ISummary = {
    /** Page information. */
    pagination: IPage.IPagination;

    /** List of records. */
    data: ICommunityPlatformGlobalLatestPost.ISummary[];
  };
}
