# @mmailaender/convex-svelte

## 0.19.1

### Patch Changes

- @mmailaender/convex-svelte is now deprecated. All features have been merged into convex-svelte and all future development will happen there.

## 0.18.1

### Patch Changes

- Features:
  - **Skip support for `convexLoad` / `convexLoadPaginated`** — pass `'skip'` as args to avoid fetching. Useful for auth-gated queries that should not run when the user is unauthenticated (e.g. `convexLoad(api.users.get, locals.token ? {} : 'skip')`).

- Docs:
  - Added guidance on choosing between `+page.ts` (universal) and `+page.server.ts` (server-only) for `convexLoad`.

## 0.18.0

### Minor Changes

- Features:
  - **`withServerConvexToken(token, fn)`** — new server-only helper (exported from `@mmailaender/convex-svelte/sveltekit/server`) that stores the auth token in request-scoped `AsyncLocalStorage`. Wrap your SvelteKit `resolve()` call with it in `hooks.server.ts` and `convexLoad` / `createConvexHttpClient` will automatically use the token during SSR — no more `{ token: locals.token }` boilerplate in every load function.

  - **Automatic server-side token for `convexLoad` / `convexLoadPaginated`** — when no explicit `{ token }` option is provided, the server path now falls back to the token set by `withServerConvexToken`. This means `+page.ts` universal load functions can run authenticated queries during SSR without needing `+page.server.ts`.

  - **Automatic server-side token for `createConvexHttpClient`** — same fallback. `createConvexHttpClient()` (no args) now works in server load functions when the token context is set in the hook.

  - **New export path `@mmailaender/convex-svelte/sveltekit/server`** — server-only utilities that depend on `node:async_hooks`. Currently exports `withServerConvexToken`.

- Unchanged:
  - Explicit `{ token }` option still takes priority (fully backward compatible).
  - Client-side navigation still uses the authenticated singleton (0.17.1 behavior).

## 0.17.1

### Patch Changes

- Fix: Use authenticated singleton ConvexClient for client-side initial fetches in `convexLoad()` and `convexLoadPaginated()` instead of creating new HTTP clients

## 0.17.0

### Minor Changes

- Features:
  - **`useMutation()`** / **`useAction()`** — thin wrappers that return callable functions for mutations and actions. They work in `.svelte` components and plain `.ts` / `.js` files.

## 0.16.0

### Minor Changes

- Features:
  - **`convexLoadPaginated()`** — SSR-compatible paginated query loading. Fetches the first page on the server and automatically upgrades to a live paginated subscription on the client, with `loadMore()` support for incremental loading. Works with the SvelteKit transport hook, mirroring the `convexLoad()` pattern for paginated queries.

- Fixes:
  - Add deferred subscription queue to prevent auth gap between transport.decode and setupAuth

## 0.15.4

### Patch Changes

- fix: Add `isLoading`, `error`, and `isStale` properties to `ConvexLoadResult` for consistent query state interface

## 0.15.3

### Patch Changes

- fix: prevent flash of `null` query results during SSR hydration
  - Call `client.setAuth()` synchronously during `setupAuth()` initialization (before any `$effect` runs) when SSR confirms authentication. The Convex client's `AuthenticationManager` pauses the WebSocket during token fetch, preventing child `useQuery` subscriptions from hitting an unauthenticated WebSocket and overriding `initialData` with `null`.
  - Add a hydration guard in the reactive `$effect`: while the synchronous `setAuth` is active, skip all state transitions and avoid a redundant `client.setAuth()` call. Calling `setAuth` a second time triggers `setConfig` → `_pauseSocket()`, which closes and reopens the WebSocket — causing subscriptions to briefly receive `null` for auth-gated queries.

## 0.15.1

### Patch Changes

- Improvements
  - Expose `UsePaginatedQuery` types and consolidate API reference table with type exports

## 0.15.0

### Minor Changes

- Features:
  - **Authentication** — `setupAuth()` and `useAuth()` for reactive auth state management, mirroring React's `ConvexProviderWithAuth` pattern. Includes SSR hydration via `initialState` option.
  - **getConvexClient()** — retrieves the Convex client from a module-level singleton, working anywhere (`.ts`, `.svelte`, hooks) as long as `setupConvex()` has been called first.
  - **SvelteKit subpath** (`convex-svelte/sveltekit`) — new export with SvelteKit-specific features:
    - `convexLoad()` — SSR data fetching that auto-upgrades to live subscriptions on the client
    - `createConvexHttpClient()` — server-side HTTP client helper with auth token support
    - `getConvexUrl()` — retrieve the deployment URL set by `initConvex()` or `setupConvex()`
  - **Client singleton** — `getConvexClient()` for accessing the `ConvexClient` from anywhere (`.ts` files, utility modules, hooks), not just Svelte components

- Improvements:
  - Restructured README with expanded installation guide, client access patterns, SSR performance rationale, and API reference

## 0.14.0

### Minor Changes

- Features:
  - Add experimental async query support with Svelte boundary integration
