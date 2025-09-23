import { Module } from "@nestjs/common";

import { AuthGuestvisitorController } from "./controllers/auth/guestVisitor/AuthGuestvisitorController";
import { AuthCommunitymemberController } from "./controllers/auth/communityMember/AuthCommunitymemberController";
import { AuthCommunitymemberPasswordController } from "./controllers/auth/communityMember/password/AuthCommunitymemberPasswordController";
import { AuthSystemadminController } from "./controllers/auth/systemAdmin/AuthSystemadminController";
import { AuthSystemadminLogoutController } from "./controllers/auth/systemAdmin/logout/AuthSystemadminLogoutController";
import { AuthSystemadminLogoutallController } from "./controllers/auth/systemAdmin/logoutAll/AuthSystemadminLogoutallController";
import { AuthSystemadminPasswordController } from "./controllers/auth/systemAdmin/password/AuthSystemadminPasswordController";
import { AuthSystemadminEmailVerifySendController } from "./controllers/auth/systemAdmin/email/verify/send/AuthSystemadminEmailVerifySendController";
import { AuthSystemadminEmailVerifyController } from "./controllers/auth/systemAdmin/email/verify/AuthSystemadminEmailVerifyController";
import { CommunityplatformCategoriesController } from "./controllers/communityPlatform/categories/CommunityplatformCategoriesController";
import { CommunityplatformReservedtermsController } from "./controllers/communityPlatform/reservedTerms/CommunityplatformReservedtermsController";
import { CommunityplatformSystemadminAppsettingsController } from "./controllers/communityPlatform/systemAdmin/appSettings/CommunityplatformSystemadminAppsettingsController";
import { CommunityplatformCommunitiesController } from "./controllers/communityPlatform/communities/CommunityplatformCommunitiesController";
import { CommunityplatformCommunitymemberCommunitiesController } from "./controllers/communityPlatform/communityMember/communities/CommunityplatformCommunitymemberCommunitiesController";
import { CommunityplatformCommunitiesRulesController } from "./controllers/communityPlatform/communities/rules/CommunityplatformCommunitiesRulesController";
import { CommunityplatformCommunitymemberCommunitiesRulesController } from "./controllers/communityPlatform/communityMember/communities/rules/CommunityplatformCommunitymemberCommunitiesRulesController";
import { CommunityplatformCommunitymemberCommunitiesMembershipsController } from "./controllers/communityPlatform/communityMember/communities/memberships/CommunityplatformCommunitymemberCommunitiesMembershipsController";
import { CommunityplatformCommunitiesPostsController } from "./controllers/communityPlatform/communities/posts/CommunityplatformCommunitiesPostsController";
import { CommunityplatformCommunitymemberCommunitiesPostsController } from "./controllers/communityPlatform/communityMember/communities/posts/CommunityplatformCommunitymemberCommunitiesPostsController";
import { CommunityplatformPostsController } from "./controllers/communityPlatform/posts/CommunityplatformPostsController";
import { CommunityplatformCommunitymemberPostsController } from "./controllers/communityPlatform/communityMember/posts/CommunityplatformCommunitymemberPostsController";
import { CommunityplatformCommunitymemberPostsVotesController } from "./controllers/communityPlatform/communityMember/posts/votes/CommunityplatformCommunitymemberPostsVotesController";
import { CommunityplatformPostsCommentsController } from "./controllers/communityPlatform/posts/comments/CommunityplatformPostsCommentsController";
import { CommunityplatformCommunitymemberPostsCommentsController } from "./controllers/communityPlatform/communityMember/posts/comments/CommunityplatformCommunitymemberPostsCommentsController";
import { CommunityplatformCommentsController } from "./controllers/communityPlatform/comments/CommunityplatformCommentsController";
import { CommunityplatformCommunitymemberCommentsController } from "./controllers/communityPlatform/communityMember/comments/CommunityplatformCommunitymemberCommentsController";
import { CommunityplatformCommentsRepliesController } from "./controllers/communityPlatform/comments/replies/CommunityplatformCommentsRepliesController";
import { CommunityplatformCommunitymemberCommentsRepliesController } from "./controllers/communityPlatform/communityMember/comments/replies/CommunityplatformCommunitymemberCommentsRepliesController";
import { CommunityplatformCommunitymemberCommentsVotesController } from "./controllers/communityPlatform/communityMember/comments/votes/CommunityplatformCommunitymemberCommentsVotesController";
import { CommunityplatformPostsHistoryController } from "./controllers/communityPlatform/posts/history/CommunityplatformPostsHistoryController";
import { CommunityplatformCommentsHistoryController } from "./controllers/communityPlatform/comments/history/CommunityplatformCommentsHistoryController";
import { CommunityplatformUsersController } from "./controllers/communityPlatform/users/CommunityplatformUsersController";
import { CommunityplatformUsersProfileController } from "./controllers/communityPlatform/users/profile/CommunityplatformUsersProfileController";
import { CommunityplatformCommunitymemberUsersRecentcommunitiesController } from "./controllers/communityPlatform/communityMember/users/recentCommunities/CommunityplatformCommunitymemberUsersRecentcommunitiesController";
import { CommunityplatformGloballatestpostsController } from "./controllers/communityPlatform/globalLatestPosts/CommunityplatformGloballatestpostsController";
import { CommunityplatformSystemadminAdminactionsController } from "./controllers/communityPlatform/systemAdmin/adminActions/CommunityplatformSystemadminAdminactionsController";
import { CommunityplatformSystemadminAuditlogsController } from "./controllers/communityPlatform/systemAdmin/auditLogs/CommunityplatformSystemadminAuditlogsController";
import { CommunityplatformSearchPostsController } from "./controllers/communityPlatform/search/posts/CommunityplatformSearchPostsController";
import { CommunityplatformSearchCommunitiesController } from "./controllers/communityPlatform/search/communities/CommunityplatformSearchCommunitiesController";
import { CommunityplatformSearchCommentsController } from "./controllers/communityPlatform/search/comments/CommunityplatformSearchCommentsController";

@Module({
  controllers: [
    AuthGuestvisitorController,
    AuthCommunitymemberController,
    AuthCommunitymemberPasswordController,
    AuthSystemadminController,
    AuthSystemadminLogoutController,
    AuthSystemadminLogoutallController,
    AuthSystemadminPasswordController,
    AuthSystemadminEmailVerifySendController,
    AuthSystemadminEmailVerifyController,
    CommunityplatformCategoriesController,
    CommunityplatformReservedtermsController,
    CommunityplatformSystemadminAppsettingsController,
    CommunityplatformCommunitiesController,
    CommunityplatformCommunitymemberCommunitiesController,
    CommunityplatformCommunitiesRulesController,
    CommunityplatformCommunitymemberCommunitiesRulesController,
    CommunityplatformCommunitymemberCommunitiesMembershipsController,
    CommunityplatformCommunitiesPostsController,
    CommunityplatformCommunitymemberCommunitiesPostsController,
    CommunityplatformPostsController,
    CommunityplatformCommunitymemberPostsController,
    CommunityplatformCommunitymemberPostsVotesController,
    CommunityplatformPostsCommentsController,
    CommunityplatformCommunitymemberPostsCommentsController,
    CommunityplatformCommentsController,
    CommunityplatformCommunitymemberCommentsController,
    CommunityplatformCommentsRepliesController,
    CommunityplatformCommunitymemberCommentsRepliesController,
    CommunityplatformCommunitymemberCommentsVotesController,
    CommunityplatformPostsHistoryController,
    CommunityplatformCommentsHistoryController,
    CommunityplatformUsersController,
    CommunityplatformUsersProfileController,
    CommunityplatformCommunitymemberUsersRecentcommunitiesController,
    CommunityplatformGloballatestpostsController,
    CommunityplatformSystemadminAdminactionsController,
    CommunityplatformSystemadminAuditlogsController,
    CommunityplatformSearchPostsController,
    CommunityplatformSearchCommunitiesController,
    CommunityplatformSearchCommentsController,
  ],
})
export class MyModule {}
