// File path: src/decorators/RegisteredmemberAuth.ts
import { SwaggerCustomizer } from "@nestia/core";
import { ExecutionContext, createParamDecorator } from "@nestjs/common";
import { Singleton } from "tstl";

import { registeredmemberAuthorize } from "../providers/authorize/registeredmemberAuthorize";

/**
 * Parameter decorator that authorizes a Registered Member via Bearer JWT.
 *
 * Usage:
 *   @Get()
 *   public list(@RegisteredmemberAuth() me: RegisteredmemberPayload) { ... }
 */
export const RegisteredmemberAuth =
  (): ParameterDecorator =>
  (
    target: object,
    propertyKey: string | symbol | undefined,
    parameterIndex: number,
  ): void => {
    // Enable Bearer auth in Swagger for the route
    SwaggerCustomizer((props) => {
      props.route.security ??= [];
      props.route.security.push({ bearer: [] });
    })(target, propertyKey as string, undefined!);

    // Bind the singleton parameter decorator instance
    singleton.get()(target, propertyKey, parameterIndex);
  };

// Singleton holder to avoid redundant decorator factories
const singleton = new Singleton(() =>
  createParamDecorator(async (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return registeredmemberAuthorize(request);
  })(),
);
