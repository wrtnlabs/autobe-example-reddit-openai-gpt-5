import { HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import typia, { tags } from "typia";
import { v4 } from "uuid";
import { MyGlobal } from "../MyGlobal";
import { PasswordUtil } from "../utils/passwordUtil";
import { toISOStringSafe } from "../utils/toISOStringSafe";

import { ICommunityPlatformPost } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformPost";
import { ICommunityPlatformCommunity } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCommunity";

export async function getCommunityPlatformPostsGlobalLatest(): Promise<ICommunityPlatformPost.IGlobalLatest> {
  /**
   * Fetch exactly 10 newest posts (Newest by created_at, id) from
   * community_platform_posts for Global Latest
   *
   * Retrieves a compact, fixed-size list of the 10 most recent posts sitewide,
   * excluding soft-deleted rows (deleted_at IS NULL). Results are strictly
   * ordered by Newest using (created_at DESC, id DESC) as tie-breakers.
   * Includes minimal community identity (community name) for display.
   *
   * Public read-only endpoint: no authentication required.
   *
   * @returns Container holding exactly up to 10 newest post mini-cards for the
   *   Global Latest module adhering to ICommunityPlatformPost.IGlobalLatest
   *   schema
   */
  const rows = await MyGlobal.prisma.community_platform_posts.findMany({
    where: { deleted_at: null },
    orderBy: [{ created_at: "desc" }, { id: "desc" }],
    take: 10,
    select: {
      id: true,
      title: true,
      created_at: true,
      community: { select: { name: true } },
    },
  });

  const data = rows.map((row) =>
    typia.assert<ICommunityPlatformPost.IPostMini>({
      id: row.id,
      community: typia.assert<ICommunityPlatformCommunity.IRef>({
        name: row.community.name,
      }),
      title: row.title,
      createdAt: toISOStringSafe(row.created_at),
    }),
  );

  return typia.assert<ICommunityPlatformPost.IGlobalLatest>({
    data: data as ICommunityPlatformPost.IPostMini[] &
      tags.MinItems<10> &
      tags.MaxItems<10>,
  });
}
