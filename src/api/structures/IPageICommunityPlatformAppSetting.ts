import { IPage } from "./IPage";
import { ICommunityPlatformAppSetting } from "./ICommunityPlatformAppSetting";

export namespace IPageICommunityPlatformAppSetting {
  /**
   * A page.
   *
   * Collection of records with pagination information.
   */
  export type ISummary = {
    /** Page information. */
    pagination: IPage.IPagination;

    /** List of records. */
    data: ICommunityPlatformAppSetting.ISummary[];
  };
}
