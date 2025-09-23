import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformReservedTerm } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformReservedTerm";

/**
 * Get a single reserved term (community_platform_reserved_terms) by ID
 *
 * Fetches one reserved term by its UUID, excluding soft-deleted records
 * (deleted_at is null). Returns the full entity including term,
 * term_normalized, applies_to, optional reason, active flag, and lifecycle
 * timestamps.
 *
 * Public read-only endpoint; no authentication required. If no matching
 * non-deleted record is found, a 404 Not Found error is thrown.
 *
 * @param props - Request properties
 * @param props.reservedTermId - Unique identifier of the reserved term (UUID)
 * @returns Detailed reserved term entity
 * @throws {HttpException} 404 - When the reserved term does not exist or has
 *   been soft-deleted
 */
export async function getcommunityPlatformReservedTermsReservedTermId(props: {
  reservedTermId: string & tags.Format<"uuid">;
}): Promise<ICommunityPlatformReservedTerm> {
  const row = await MyGlobal.prisma.community_platform_reserved_terms.findFirst(
    {
      where: {
        id: props.reservedTermId,
        deleted_at: null,
      },
      select: {
        // id is not required for return since we reuse the validated path param
        term: true,
        term_normalized: true,
        applies_to: true,
        reason: true,
        active: true,
        created_at: true,
        updated_at: true,
        // deleted_at filtered as null; no need to select
      },
    },
  );

  if (!row) throw new HttpException("Not Found", 404);

  return {
    id: props.reservedTermId,
    term: row.term,
    term_normalized: row.term_normalized,
    applies_to: row.applies_to,
    reason: row.reason ?? undefined,
    active: row.active,
    created_at: toISOStringSafe(row.created_at),
    updated_at: toISOStringSafe(row.updated_at),
    deleted_at: null,
  };
}
