# AI / Agent Guide (AGENTS.md)

This file describes **non-negotiable semantics** and **editing constraints** for this repo. If you change behavior, you MUST update or add tests to match.

## Repository overview

- **Core**: `src/core/create.ts`
  - The store implementation: `create()`, `subscribe`, `setValue`, `setServerValue`, `effect`
- **React binding**: `src/react/useStore.ts`
  - Uses `useSyncExternalStore` with `getSnapshot` + `_getServerSnapshot`
- **Server detection**: `src/utils/constant.ts` (`isServer`)

## Public API (must remain stable)

- `create<T>(initial: T | (() => T))` returns a `StoreLike<T>` with:
  - `getSnapshot(): T`
  - `subscribe(listener): unsubscribe`
  - `setValue(next | producer)`
  - `setServerValue(value)`
  - `_getServerSnapshot()`
  - `effect(deps, listener, options?)`
- React:
  - `useStore(store)` returns `[value, store.setValue] as const`

## Core invariants (must not break)

### 0) `create()` must be top-level (eager store definitions)

Stores are designed to be created eagerly at module initialization time.

- `create()` MUST NOT be called inside functions, conditionals, loops, or React components.
- If you introduce patterns that require lazy store creation, you MUST redesign and update docs + tests accordingly.

### 1) `subscribe()` emits immediately

- On client, `subscribe(listener)` **must call** the listener once immediately with `getSnapshot()`.
- On server, `subscribe()` must be a no-op (returns an empty unsubscribe).

### 2) Idle updates

When a store has no listeners:

- `setValue()` must not notify
- The **latest** idle update must be reflected on the next `subscribe()` immediate emission

### 3) SSR / hydration snapshot semantics

- On server:
  - `setValue()` and `effect()` are no-ops
  - `setServerValue()` updates `_getServerSnapshot()` and `getSnapshot()`
- On client:
  - `setServerValue()` may notify **only while** using server snapshot
  - Once the store has switched to client state, `setServerValue()` must not affect `getSnapshot()` notifications

### 4) Listener re-entrancy is forbidden

During execution of a `subscribe(listener)` callback:

- Calling any of these MUST throw:
  - `setValue`
  - `subscribe`
  - `unsubscribe`

Exception:
- `effect()` listeners may run inside a dependency store’s notification chain; effect execution is handled via its own context.

### 5) Effect constraints

Effects are intentionally strict and must remain so:

- A store MUST NOT include itself in its own `effect(deps, ...)` deps.
- During effect execution:
  - Only **self `setValue`** is allowed.
  - `subscribe`, `unsubscribe`, `setServerValue` MUST throw.
  - Calling any other store’s `setValue` MUST throw.

### 6) Cycle policy

- By default, effect dependency cycles MUST be rejected at registration time.
- Cycles may be allowed only with `{ allowCycle: true }`.
- Even with cycles allowed, infinite synchronous update loops must be guarded (throw once a maximum threshold is exceeded).

## Tests (update alongside behavior)

Primary suites:

- Client semantics (`jsdom`):
  - `src/core/create.client.test.ts`
  - `src/core/create.effect.test.ts`
- Server semantics (`node` + mocked `isServer`):
  - `src/core/create.server.test.ts`

If you change any invariant:

- Add/adjust a test that would fail on the old behavior
- Keep tests minimal and behavior-focused (no implementation coupling)

## Verification commands (run before claiming done)

```bash
npm test
npm run build
```

