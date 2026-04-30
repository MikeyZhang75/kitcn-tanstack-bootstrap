# TanStack Start + shadcn/ui

This is a Turborepo + Bun workspaces monorepo: two TanStack Start apps (`apps/web`, `apps/dashboard`) share a Convex backend (`packages/backend`) and a shadcn-based UI package (`packages/ui`) following shadcn's [official monorepo layout](https://ui.shadcn.com/docs/monorepo).

## Adding components

Run the shadcn CLI from inside either app — the CLI reads the app's `components.json` and writes new primitives into `packages/ui/src/components/` automatically:

```bash
cd apps/web
bunx shadcn@latest add button
```

## Using components

Import primitives from the shared `@repo/ui` workspace:

```tsx
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";
```
