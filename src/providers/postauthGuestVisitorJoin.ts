import jwt from "jsonwebtoken";
import { MyGlobal } from "../MyGlobal";
import typia, { tags } from "typia";
import { Prisma } from "@prisma/client";
import { v4 } from "uuid";
import { toISOStringSafe } from "../util/toISOStringSafe";
import { HttpException } from "@nestjs/common";
import { ICommunityPlatformGuestVisitorJoin } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitorJoin";
import { ICommunityPlatformGuestVisitor } from "@ORGANIZATION/PROJECT-api/lib/structures/ICommunityPlatformGuestVisitor";

export async function postauthGuestVisitorJoin(props: {
  body: ICommunityPlatformGuestVisitorJoin.ICreate;
}): Promise<ICommunityPlatformGuestVisitor.IAuthorized> {
  /**
   * Register or correlate an anonymous visitor and issue initial guest JWT.
   *
   * Public endpoint: Creates a new community_platform_guestvisitors row or
   * correlates an existing one by device_fingerprint, updating last_seen_at.
   * Issues guest-scoped JWT tokens and returns a lightweight authorization
   * payload including an optional embedded summary.
   *
   * No user credentials or session rows are created for guest visitors.
   *
   * @param props - Request properties
   * @param props.body - Client hints for correlating/creating a guest visitor
   * @returns Authorized guest payload with tokens and visitor context
   * @throws {HttpException} 500 on unexpected server/database errors
   */
  const { body } = props;

  // Time calculations (ISO strings only)
  const now = toISOStringSafe(new Date());
  const accessExpiresAt = toISOStringSafe(
    new Date(new Date(now).getTime() + 60 * 60 * 1000),
  ); // +1h
  const refreshableUntil = toISOStringSafe(
    new Date(new Date(now).getTime() + 7 * 24 * 60 * 60 * 1000),
  ); // +7d

  try {
    // Attempt correlation by device_fingerprint when provided
    if (body.device_fingerprint !== undefined) {
      const existing =
        await MyGlobal.prisma.community_platform_guestvisitors.findFirst({
          where: {
            device_fingerprint: body.device_fingerprint,
          },
          orderBy: { created_at: "desc" },
        });

      if (existing) {
        const updated =
          await MyGlobal.prisma.community_platform_guestvisitors.update({
            where: { id: existing.id },
            data: {
              // keep fingerprint as-is (or overwrite if provided again)
              device_fingerprint: body.device_fingerprint ?? undefined,
              user_agent: body.user_agent ?? undefined,
              ip: body.ip ?? undefined,
              last_seen_at: now,
              updated_at: now,
            },
            select: { id: true, first_seen_at: true },
          });

        const access = jwt.sign(
          {
            id: updated.id as string & tags.Format<"uuid">,
            type: "guestVisitor",
          },
          MyGlobal.env.JWT_SECRET_KEY,
          { expiresIn: "1h", issuer: "autobe" },
        );
        const refresh = jwt.sign(
          {
            id: updated.id as string & tags.Format<"uuid">,
            type: "guestVisitor",
            tokenType: "refresh",
          },
          MyGlobal.env.JWT_SECRET_KEY,
          { expiresIn: "7d", issuer: "autobe" },
        );

        return {
          id: updated.id as string & tags.Format<"uuid">,
          first_seen_at: updated.first_seen_at
            ? toISOStringSafe(updated.first_seen_at)
            : undefined,
          last_seen_at: now,
          token: {
            access,
            refresh,
            expired_at: accessExpiresAt,
            refreshable_until: refreshableUntil,
          },
          guestVisitor: {
            id: updated.id as string & tags.Format<"uuid">,
            first_seen_at: updated.first_seen_at
              ? toISOStringSafe(updated.first_seen_at)
              : now,
            last_seen_at: now,
          },
        };
      }
    }

    // Create new guest visitor when no correlation match
    const newId = v4() as string & tags.Format<"uuid">;

    await MyGlobal.prisma.community_platform_guestvisitors.create({
      data: {
        id: newId,
        device_fingerprint: body.device_fingerprint ?? null,
        user_agent: body.user_agent ?? null,
        ip: body.ip ?? null,
        first_seen_at: now,
        last_seen_at: now,
        created_at: now,
        updated_at: now,
      },
    });

    const access = jwt.sign(
      {
        id: newId,
        type: "guestVisitor",
      },
      MyGlobal.env.JWT_SECRET_KEY,
      { expiresIn: "1h", issuer: "autobe" },
    );
    const refresh = jwt.sign(
      {
        id: newId,
        type: "guestVisitor",
        tokenType: "refresh",
      },
      MyGlobal.env.JWT_SECRET_KEY,
      { expiresIn: "7d", issuer: "autobe" },
    );

    return {
      id: newId,
      first_seen_at: now,
      last_seen_at: now,
      token: {
        access,
        refresh,
        expired_at: accessExpiresAt,
        refreshable_until: refreshableUntil,
      },
      guestVisitor: {
        id: newId,
        first_seen_at: now,
        last_seen_at: now,
      },
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      throw new HttpException("Database error", 500);
    }
    throw new HttpException("Internal Server Error", 500);
  }
}
