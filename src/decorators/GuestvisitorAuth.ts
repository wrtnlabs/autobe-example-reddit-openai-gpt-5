// File path: src/decorators/GuestvisitorAuth.ts
import { SwaggerCustomizer } from "@nestia/core";
import { ExecutionContext, createParamDecorator } from "@nestjs/common";
import { Singleton } from "tstl";

import { guestvisitorAuthorize } from "../providers/authorize/guestvisitorAuthorize";

/**
 * Injects authenticated GuestvisitorPayload into controller handlers.
 * Usage: someMethod(@GuestvisitorAuth() guest: GuestvisitorPayload) { ... }
 */
export const GuestvisitorAuth =
  (): ParameterDecorator =>
  (
    target: object,
    propertyKey: string | symbol | undefined,
    parameterIndex: number,
  ): void => {
    // Add Bearer auth requirement to Swagger for this route
    SwaggerCustomizer((props) => {
      props.route.security ??= [];
      props.route.security.push({ bearer: [] });
    })(target, propertyKey as string, undefined!);

    // Bind the singleton param decorator instance
    singleton.get()(target, propertyKey, parameterIndex);
  };

const singleton = new Singleton(() =>
  createParamDecorator(async (_0: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return guestvisitorAuthorize(request);
  })(),
);
