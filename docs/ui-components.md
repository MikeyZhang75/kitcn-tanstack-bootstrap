### UI components (Ant Design)

The UI layer is **[Ant Design](https://ant.design) v6**, consumed directly from `antd` by both apps. There is no shared UI workspace: `packages/ui` (the old shadcn/base-ui package) was deleted, along with Tailwind, `lucide-react`, `sonner`, `@tanstack/react-table`, `class-variance-authority`, `clsx`, and `tailwind-merge`. Each app depends on exactly two UI packages:

```jsonc
"antd": "^6.6.0",
"@ant-design/icons": "^6.3.2"
```

Icons come from `@ant-design/icons` only — `lucide-react` is gone. `@ant-design/icons` must stay on `>= 6` (v5 icons are incompatible with `antd@6`); move the two together.

#### Styling model — no Tailwind, no utility classes

There is **no CSS framework and no `className` styling** in this repo. Layout and spacing are expressed with antd's own primitives; anything left over is an inline `style` object driven by theme tokens.

- `apps/*/src/styles.css` is just `@import "antd/dist/reset.css";` plus a `scrollbar-width: thin` rule. It's still injected as a `<link>` from `__root.tsx` via `import appCss from "../styles.css?url"`.
- Component CSS is injected at runtime by antd's CSS-in-JS (`@ant-design/cssinjs`). Never hand-write component styles; there is nothing to override in `styles.css`.
- Reach for `<Flex>` (`vertical`, `gap`, `align`, `justify`) and `<Layout>` instead of flex utility classes, and `<Typography.Title>` / `<Typography.Text type="secondary">` instead of text-size/color classes.
- Colors, radii, and spacing come from `const { token } = theme.useToken()` — e.g. `token.colorSplit` for hairline borders, `token.colorBgContainer` for surfaces, `token.colorPrimary` for the brand mark. Don't hardcode hex values.
- Theme changes belong in the single `ConfigProvider` in `components/providers.tsx`, not in per-component styles.

Because antd v6 has CSS variables on by default, token reads are cheap and the runtime style hashing is much lighter than antd v5.

#### Providers: `ConfigProvider` + `App`

`apps/*/src/components/providers.tsx` is byte-identical across both apps:

```tsx
<ConfigProvider locale={zhCN}>
	<AntdApp>
		<AppConvexProvider>{children}</AppConvexProvider>
	</AntdApp>
</ConfigProvider>
```

- `locale={zhCN}` (`antd/locale/zh_CN`) is what makes Table pagination, Modal buttons, `Empty`, and `Select` speak Simplified Chinese without per-call-site strings.
- `<App>` supplies the **context-aware** `message` / `notification` / `modal` instances. **Always** get them with `const { message } = App.useApp()` inside a component — never `import { message } from "antd"`. The static exports render outside the React tree, so they miss `ConfigProvider`'s theme and locale. This replaced sonner's `toast.*`; toasts are still the standard channel for surfacing mutation errors (don't render inline error text).

#### Replacements for the deleted `@repo/ui` wrappers

The three first-party wrappers that used to live in `@repo/ui/components/custom-ui/` are gone; antd covers all three natively:

| Deleted wrapper                | Now                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `LoadingButton`                | `<Button loading={...}>` — built in                                                                            |
| `DataTable` + `DataTablePager` | `<Table>` with the `pagination` prop (`showSizeChanger`, `showTotal`, `pageSizeOptions`)                       |
| `NavUser`                      | `apps/*/src/components/nav-user.tsx` — per-app now, composed from `Dropdown` + `Avatar` + `Button type="text"` |

`nav-user.tsx` is duplicated byte-for-byte across both apps (like `providers.tsx` and `_public.tsx` — see [frontend architecture](frontend-architecture.md)); **mirror any edit into both apps in the same commit.**

#### Server-driven tables

`<Table>` owns its pager, so route code no longer hand-rolls a page range. The wiring pattern (canonical example: `apps/dashboard/src/routes/_authenticated/invitations/-components/invitations-data-table.tsx`):

- The route keeps a `useReducer` for `{ pageIndex, pageSize }` (the "changing page size resets page index" invariant still lives in `-model/invitations-pagination.ts`).
- The table component converts between antd's 1-based `current` and the reducer's 0-based `pageIndex`.
- antd fires `onChange(page, size)` for **both** page and page-size changes, so the handler must branch on whether `size` changed before dispatching — otherwise a size change is misread as a page jump:

  ```tsx
  onChange: (page, size) => {
  	if (size !== pagination.pageSize) {
  		pagination.onPageSizeChange(size);
  		return;
  	}
  	pagination.onPageChange(page - 1);
  };
  ```

- `total` comes from the separate `invitations.count` query; while it's `undefined`, pass `pagination={false}`.
- `loading={query.isFetching}` plus `placeholderData: keepPreviousData` gives "previous rows under a spinner" instead of a flash of empty state.
- Empty state text goes through `locale={{ emptyText: "暂无邀请码" }}`.

#### Forms

Forms use antd `Form` + `Form.Item` (the hand-rolled `useReducer` form state is gone). Validation rules are **derived from the backend zod schemas**, never re-declared:

```tsx
import { signInInputSchema } from "@repo/backend/shared/tables/user";

import { zodStringRule } from "./-lib/zod-rule";

<Form.Item
	label="用户名"
	name="username"
	rules={[zodStringRule(signInInputSchema.shape.username)]}
>
	<Input autoComplete="username" placeholder="请输入用户名" />
</Form.Item>;
```

`zodStringRule` (`apps/*/src/routes/_public/-lib/zod-rule.ts`, mirrored in both apps) wraps a `ZodType` in an antd `FormRule` validator and coerces `undefined → ""`, so the "field is empty" case also surfaces the schema's own Chinese message (e.g. 用户名至少 3 个字符) rather than antd's generic `required` template. This is the [one-source-of-truth rule](conventions.md) applied to forms: length/charset constraints and their messages are declared once, in `packages/backend/convex/shared/tables/*.ts`.

Optional fields need a local variant that short-circuits on empty input before parsing — see `optionalCodeRule` in `invitations/-components/create-invitation-dialog.tsx`.

#### The app shell

`_authenticated.tsx` builds the shell from `Layout`:

```tsx
<Layout hasSider style={{ height: "100dvh" }}>
	<AppSidebar collapsed={collapsed} collapsedWidth={isMobile ? 0 : 64} />
	<Layout style={{ minWidth: 0 }}>
		<Header>…collapse trigger…</Header>
		<Content style={{ minHeight: 0, overflow: "auto", padding: 16 }}>
			<Outlet />
		</Content>
	</Layout>
</Layout>
```

Three things here are load-bearing — don't "clean them up":

- **`hasSider` must be passed explicitly.** antd detects `Layout.Sider` by inspecting its direct children, and `AppSidebar` is a wrapper component, so auto-detection fails and the horizontal flex layout never gets applied.
- **`height: "100dvh"` on the outer `Layout` + `minHeight: 0` / `overflow: auto` on `Content`** is what keeps long pages scrolling inside the content region. Drop either and you get the page-level scrollbar back alongside the content one.
- **`collapsedWidth={isMobile ? 0 : 64}`**, driven by `Grid.useBreakpoint()` (`screens.lg === false`), is the responsive behavior: an icon rail on desktop, fully hidden on mobile. `useBreakpoint()` returns `{}` on the first frame, hence the explicit `=== false` comparison rather than `!screens.lg`.

`app-sidebar.tsx` stays per-app (nav items + header title). Nav entries are a `navItems` array mapped into `Menu` `items` with `label: <Link to={item.to}>`; `selectedKeys={[pathname]}` drives the active state. When the `Sider` collapses, antd pushes `siderCollapsed` down through `SiderContext` and the `Menu` switches to icon mode with per-item tooltips automatically — don't set `inlineCollapsed` by hand.

#### antd v6 API notes

The repo targets v6, where a number of v5 props are deprecated (they still work but warn, and are slated for removal in v7):

- `destroyOnClose` → `destroyOnHidden` (used by the create-invitation `Modal`)
- `dropdownXxx` → `popupXxx` (`popupMatchSelectWidth`, `classNames.popup.root`, …)
- `bordered` → `variant`; `bodyStyle` / `headStyle` → `styles.body` / `styles.header`
- Size enums unified to `'large' | 'medium' | 'small'` — `middle` and `default` are deprecated
- Children-based APIs replaced by `items` (`Menu`, `Tabs`, `Breadcrumb`, `Descriptions`, `Timeline`, `Anchor`)

`@ant-design/v5-patch-for-react-19` is **not** needed — v6 supports React 19 natively.
