import { Module } from "@nestjs/common";

import { AuthGuestvisitorController } from "./controllers/auth/guestVisitor/AuthGuestvisitorController";
import { AuthRegisteredmemberController } from "./controllers/auth/registeredMember/AuthRegisteredmemberController";
import { AuthRegisteredmemberSessionsController } from "./controllers/auth/registeredMember/sessions/AuthRegisteredmemberSessionsController";
import { AuthRegisteredmemberPasswordController } from "./controllers/auth/registeredMember/password/AuthRegisteredmemberPasswordController";
import { AuthSiteadminController } from "./controllers/auth/siteAdmin/AuthSiteadminController";
import { AuthSiteadminPasswordController } from "./controllers/auth/siteAdmin/password/AuthSiteadminPasswordController";
import { CommunityplatformSiteadminUsersController } from "./controllers/communityPlatform/siteAdmin/users/CommunityplatformSiteadminUsersController";
import { CommunityplatformRegisteredmemberUsersController } from "./controllers/communityPlatform/registeredMember/users/CommunityplatformRegisteredmemberUsersController";
import { CommunityplatformRegisteredmemberMeController } from "./controllers/communityPlatform/registeredMember/me/CommunityplatformRegisteredmemberMeController";
import { CommunityplatformRegisteredmemberMeSessionsController } from "./controllers/communityPlatform/registeredMember/me/sessions/CommunityplatformRegisteredmemberMeSessionsController";
import { CommunityplatformSiteadminUserrestrictionsController } from "./controllers/communityPlatform/siteAdmin/userRestrictions/CommunityplatformSiteadminUserrestrictionsController";
import { CommunityplatformSiteadminRegisteredmembersController } from "./controllers/communityPlatform/siteAdmin/registeredMembers/CommunityplatformSiteadminRegisteredmembersController";
import { CommunityplatformSiteadminSiteadminsController } from "./controllers/communityPlatform/siteAdmin/siteAdmins/CommunityplatformSiteadminSiteadminsController";
import { CommunityplatformRegisteredmemberSessionsController } from "./controllers/communityPlatform/registeredMember/sessions/CommunityplatformRegisteredmemberSessionsController";
import { CommunityplatformCommunitiesController } from "./controllers/communityPlatform/communities/CommunityplatformCommunitiesController";
import { CommunityplatformRegisteredmemberCommunitiesController } from "./controllers/communityPlatform/registeredMember/communities/CommunityplatformRegisteredmemberCommunitiesController";
import { CommunityplatformCommunitiesRulesController } from "./controllers/communityPlatform/communities/rules/CommunityplatformCommunitiesRulesController";
import { CommunityplatformRegisteredmemberCommunitiesRulesController } from "./controllers/communityPlatform/registeredMember/communities/rules/CommunityplatformRegisteredmemberCommunitiesRulesController";
import { CommunityplatformRegisteredmemberMeRecentcommunitiesController } from "./controllers/communityPlatform/registeredMember/me/recentCommunities/CommunityplatformRegisteredmemberMeRecentcommunitiesController";
import { CommunityplatformCommunitiesPostsController } from "./controllers/communityPlatform/communities/posts/CommunityplatformCommunitiesPostsController";
import { CommunityplatformRegisteredmemberUsersMembershipsController } from "./controllers/communityPlatform/registeredMember/users/memberships/CommunityplatformRegisteredmemberUsersMembershipsController";
import { CommunityplatformRegisteredmemberCommunitiesMembershipController } from "./controllers/communityPlatform/registeredMember/communities/membership/CommunityplatformRegisteredmemberCommunitiesMembershipController";
import { CommunityplatformPostsController } from "./controllers/communityPlatform/posts/CommunityplatformPostsController";
import { CommunityplatformRegisteredmemberPostsController } from "./controllers/communityPlatform/registeredMember/posts/CommunityplatformRegisteredmemberPostsController";
import { CommunityplatformPostsGloballatestController } from "./controllers/communityPlatform/posts/globalLatest/CommunityplatformPostsGloballatestController";
import { CommunityplatformPostsCommentsController } from "./controllers/communityPlatform/posts/comments/CommunityplatformPostsCommentsController";
import { CommunityplatformRegisteredmemberPostsCommentsController } from "./controllers/communityPlatform/registeredMember/posts/comments/CommunityplatformRegisteredmemberPostsCommentsController";
import { CommunityplatformCommentsController } from "./controllers/communityPlatform/comments/CommunityplatformCommentsController";
import { CommunityplatformRegisteredmemberCommentsController } from "./controllers/communityPlatform/registeredMember/comments/CommunityplatformRegisteredmemberCommentsController";
import { CommunityplatformRegisteredmemberPostsVoteController } from "./controllers/communityPlatform/registeredMember/posts/vote/CommunityplatformRegisteredmemberPostsVoteController";
import { CommunityplatformRegisteredmemberCommentsVoteController } from "./controllers/communityPlatform/registeredMember/comments/vote/CommunityplatformRegisteredmemberCommentsVoteController";
import { CommunityplatformSearchPostsController } from "./controllers/communityPlatform/search/posts/CommunityplatformSearchPostsController";
import { CommunityplatformSearchCommunitiesController } from "./controllers/communityPlatform/search/communities/CommunityplatformSearchCommunitiesController";
import { CommunityplatformSearchCommentsController } from "./controllers/communityPlatform/search/comments/CommunityplatformSearchCommentsController";

@Module({
  controllers: [
    AuthGuestvisitorController,
    AuthRegisteredmemberController,
    AuthRegisteredmemberSessionsController,
    AuthRegisteredmemberPasswordController,
    AuthSiteadminController,
    AuthSiteadminPasswordController,
    CommunityplatformSiteadminUsersController,
    CommunityplatformRegisteredmemberUsersController,
    CommunityplatformRegisteredmemberMeController,
    CommunityplatformRegisteredmemberMeSessionsController,
    CommunityplatformSiteadminUserrestrictionsController,
    CommunityplatformSiteadminRegisteredmembersController,
    CommunityplatformSiteadminSiteadminsController,
    CommunityplatformRegisteredmemberSessionsController,
    CommunityplatformCommunitiesController,
    CommunityplatformRegisteredmemberCommunitiesController,
    CommunityplatformCommunitiesRulesController,
    CommunityplatformRegisteredmemberCommunitiesRulesController,
    CommunityplatformRegisteredmemberMeRecentcommunitiesController,
    CommunityplatformCommunitiesPostsController,
    CommunityplatformRegisteredmemberUsersMembershipsController,
    CommunityplatformRegisteredmemberCommunitiesMembershipController,
    CommunityplatformPostsController,
    CommunityplatformRegisteredmemberPostsController,
    CommunityplatformPostsGloballatestController,
    CommunityplatformPostsCommentsController,
    CommunityplatformRegisteredmemberPostsCommentsController,
    CommunityplatformCommentsController,
    CommunityplatformRegisteredmemberCommentsController,
    CommunityplatformRegisteredmemberPostsVoteController,
    CommunityplatformRegisteredmemberCommentsVoteController,
    CommunityplatformSearchPostsController,
    CommunityplatformSearchCommunitiesController,
    CommunityplatformSearchCommentsController,
  ],
})
export class MyModule {}
