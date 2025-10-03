// File path: src/decorators/SiteadminAuth.ts
import { SwaggerCustomizer } from "@nestia/core";
import { ExecutionContext, createParamDecorator } from "@nestjs/common";
import { Singleton } from "tstl";

import { siteadminAuthorize } from "../providers/authorize/siteadminAuthorize";
import type { SiteadminPayload } from "./payload/SiteadminPayload";

/**
 * Parameter decorator that injects authenticated SiteadminPayload.
 *
 * Usage:
 *   someMethod(@SiteadminAuth() admin: SiteadminPayload) {}
 */
export const SiteadminAuth = (): ParameterDecorator => (
  target: object,
  propertyKey: string | symbol | undefined,
  parameterIndex: number,
): void => {
  // Add bearer security to Swagger route
  SwaggerCustomizer((props) => {
    props.route.security ??= [];
    props.route.security.push({ bearer: [] });
  })(target, propertyKey as string, undefined!);

  // Register singleton param decorator instance
  singleton.get()(target, propertyKey, parameterIndex);
};

const singleton = new Singleton(() =>
  createParamDecorator(async (_0: unknown, ctx: ExecutionContext): Promise<SiteadminPayload> => {
    const request = ctx.switchToHttp().getRequest();
    return siteadminAuthorize(request);
  })(),
);
