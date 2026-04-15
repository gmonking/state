# state

A tiny, strict external-store core with SSR snapshot support, plus a React binding.

- English: `README.md` (this file)  
- 中文：`README.zh-CN.md`

## Install

This repo is currently marked `"private": true` in `package.json`. If you plan to publish it, remove that flag first.

## API

### `create(initial | () => initial)`

Creates a store.

- `getSnapshot(): T`
- `subscribe(listener: (value: T) => void): () => void`
  - **Immediately** calls `listener(getSnapshot())` once on subscribe.
- `setValue(next: T | ((prev: T) => T)): void`
  - No-op on server (`isServer === true`)
- `setServerValue(value: T): void`
  - Used for SSR / hydration snapshots
- `_getServerSnapshot(): T`
  - Used by React binding (`useSyncExternalStore`) as the server snapshot
- `effect(deps, listener, options?)`
  - `deps`: `{ [key: string]: StoreLike<any> }`
  - `listener(depValues, setSelf)`
  - `options`: `{ allowCycle?: boolean }`

### React

From `./react` export:

- `useStore(store)` → returns `[value, setValue] as const`

## Quick start

```ts
import { create } from "@gmonking/state";
import { useStore } from "@gmonking/state/react";

export const count = create(0);

// optional derived effect
export const doubled = create(0);
doubled.effect({ count }, ({ count }, set) => set(count * 2));

function Counter() {
  const [value, setValue] = useStore(count);
  return (
    <button onClick={() => setValue((v) => v + 1)}>
      {value}
    </button>
  );
}
```

## Semantics (important)

### Stores must be defined at module top-level

This library assumes stores are **created eagerly** (module initialization time).

- `create()` **must** be called at the **module top-level**
- Do **not** call `create()` inside functions, conditionals, loops, or React components

Good:

```ts
// stores.ts
import { create } from "@gmonking/state";

export const user = create({ name: "guest" });
export const count = create(0);
```

Bad:

```ts
import { create } from "@gmonking/state";

export function makeStore() {
  return create(0);
}

export const maybe = Math.random() > 0.5 ? create(1) : create(2);
```

### SSR / hydration

- On server (`isServer === true`):
  - `subscribe`, `setValue`, `effect` are **no-ops**
  - `setServerValue` updates the server snapshot and `getSnapshot()` reflects it
- On client:
  - Before the store switches to client state, `getSnapshot()` may read from the **server snapshot** to avoid hydration mismatch.
  - `setServerValue()` can notify current subscribers **only while** the store is still using server snapshot.

### Idle updates

When a store has **no subscribers**, `setValue()` does not notify anyone. The latest idle update is applied when the store gets its next subscriber.

### Listener re-entrancy is forbidden

During a `subscribe(listener)` callback, calling any of these will throw:

- `setValue`
- `subscribe`
- `unsubscribe`

This prevents hard-to-reason synchronous re-entrancy and mutation of the listener set during notification.

### `effect()` constraints

Effects are intentionally strict:

- **A store cannot depend on itself** in its own `effect(deps, ...)`.
- **An effect may only call its own `setValue`**.
  - Calling `subscribe` / `unsubscribe` / `setServerValue` during effect execution throws.
  - Calling other stores’ `setValue` during effect execution throws.
- By default, **dependency cycles are forbidden**.
  - You can explicitly allow cycles with `{ allowCycle: true }`
  - Even then, there is a runtime guard against infinite synchronous update loops.

## Development

```bash
npm test
npm run build
```

