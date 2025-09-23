import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformCategory } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformCategory";

/**
 * Get a single category (community_platform_categories) by ID
 *
 * Retrieves one category by its UUID from community_platform_categories,
 * excluding soft-deleted records (deleted_at is null). Returns the full
 * category entity for detail views or administrative forms.
 *
 * Public read-only endpoint: no authentication required.
 *
 * @param props - Request properties
 * @param props.categoryId - Unique identifier of the category (UUID)
 * @returns The detailed category entity
 * @throws {HttpException} 404 when the category does not exist or is
 *   soft-deleted
 */
export async function getcommunityPlatformCategoriesCategoryId(props: {
  categoryId: string & tags.Format<"uuid">;
}): Promise<ICommunityPlatformCategory> {
  const record = await MyGlobal.prisma.community_platform_categories.findFirst({
    where: {
      id: props.categoryId,
      deleted_at: null,
    },
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      display_order: true,
      active: true,
      created_at: true,
      updated_at: true,
      deleted_at: true,
    },
  });

  if (!record) {
    throw new HttpException("Not Found", 404);
  }

  return {
    id: record.id as string & tags.Format<"uuid">,
    code: record.code,
    name: record.name,
    description: record.description ?? null,
    display_order: record.display_order as number & tags.Type<"int32">,
    active: record.active,
    created_at: toISOStringSafe(record.created_at),
    updated_at: toISOStringSafe(record.updated_at),
    // Business rule: detail endpoint must not return soft-deleted records
    // We filtered deleted_at = null; return null explicitly
    deleted_at: null,
  };
}
