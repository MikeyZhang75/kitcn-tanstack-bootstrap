/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";
import type { GenericId as Id } from "convex/values";

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: {
  invitations: {
    count: FunctionReference<"query", "public", { sessionToken: string }, any>;
    create: FunctionReference<
      "mutation",
      "public",
      { count: number; sessionToken: string },
      any
    >;
    list: FunctionReference<
      "query",
      "public",
      { page: number; pageSize: number; sessionToken: string },
      any
    >;
    revoke: FunctionReference<
      "mutation",
      "public",
      { id: string; sessionToken: string },
      any
    >;
  };
  session: {
    me: FunctionReference<"query", "public", { sessionToken: string }, any>;
    signIn: FunctionReference<
      "mutation",
      "public",
      { password: string; username: string },
      any
    >;
    signOut: FunctionReference<
      "mutation",
      "public",
      { sessionToken: string },
      any
    >;
  };
  settings: {
    getRegistrationSettings: FunctionReference<"query", "public", {}, any>;
    setRequireInvitationCode: FunctionReference<
      "mutation",
      "public",
      { requireInvitationCode: boolean; sessionToken: string },
      any
    >;
  };
  signup: {
    signUpWithInvitation: FunctionReference<
      "mutation",
      "public",
      { invitationCode?: string; password: string; username: string },
      any
    >;
  };
};

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: {
  generated: {
    server: {
      aggregateBackfill: FunctionReference<"mutation", "internal", any, any>;
      aggregateBackfillChunk: FunctionReference<
        "mutation",
        "internal",
        any,
        any
      >;
      aggregateBackfillStatus: FunctionReference<
        "mutation",
        "internal",
        any,
        any
      >;
      migrationCancel: FunctionReference<"mutation", "internal", any, any>;
      migrationRun: FunctionReference<"mutation", "internal", any, any>;
      migrationRunChunk: FunctionReference<"mutation", "internal", any, any>;
      migrationStatus: FunctionReference<"mutation", "internal", any, any>;
      reset: FunctionReference<"action", "internal", any, any>;
      resetChunk: FunctionReference<
        "mutation",
        "internal",
        { cursor: string | null; tableName: string },
        any
      >;
      scheduledDelete: FunctionReference<"mutation", "internal", any, any>;
      scheduledMutationBatch: FunctionReference<
        "mutation",
        "internal",
        any,
        any
      >;
    };
  };
  users: {
    bootstrapAdmin: FunctionReference<
      "mutation",
      "internal",
      { password: string; username: string },
      any
    >;
  };
};

export declare const components: {};
