# state

一个极小但语义非常严格的 external-store 核心（带 SSR snapshot 支持），并提供 React 绑定。

## 安装

当前仓库在 `package.json` 中标记了 `"private": true`。如果你要发布到 npm，需要先移除该标记。

## API

### `create(initial | () => initial)`

创建一个 store。

- `getSnapshot(): T`
- `subscribe(listener: (value: T) => void): () => void`
  - **订阅时立即**调用一次 `listener(getSnapshot())`
- `setValue(next: T | ((prev: T) => T)): void`
  - 服务端（`isServer === true`）是 no-op
- `setServerValue(value: T): void`
  - 用于 SSR / 水合（hydration）快照
- `_getServerSnapshot(): T`
  - React 绑定（`useSyncExternalStore`）使用的 server snapshot
- `effect(deps, listener, options?)`
  - `deps`: `{ [key: string]: StoreLike<any> }`
  - `listener(depValues, setSelf)`
  - `options`: `{ allowCycle?: boolean }`

### React

从 `./react` 导出：

- `useStore(store)` → 返回 `[value, setValue] as const`

## 快速开始

```ts
import { create } from "@gm/state";
import { useStore } from "@gm/state/react";

export const count = create(0);

// 可选：派生 effect
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

## 语义说明（重要）

### store 必须在模块顶层提前定义（eager）

本库假设 store 是**即时创建**的（模块初始化阶段执行）。

- `create()` **必须**在**模块顶层**调用
- 不要在函数、条件判断、循环或 React 组件中调用 `create()`

正确示例：

```ts
// stores.ts
import { create } from "@gm/state";

export const user = create({ name: "guest" });
export const count = create(0);
```

错误示例：

```ts
import { create } from "@gm/state";

export function makeStore() {
  return create(0);
}

export const maybe = Math.random() > 0.5 ? create(1) : create(2);
```

### SSR / 水合（hydration）

- 在服务端（`isServer === true`）：
  - `subscribe` / `setValue` / `effect` 都是 **no-op**
  - `setServerValue` 会更新 server snapshot，并且 `getSnapshot()` 会反映该值
- 在客户端：
  - 在 store 切换到 client state 之前，`getSnapshot()` 可能读取 **server snapshot**，以避免水合不一致
  - 仅当仍在使用 server snapshot 时，`setServerValue()` 才可能通知当前订阅者

### Idle 更新

当 store **没有订阅者** 时，`setValue()` 不会通知任何人。最新的一次 idle 更新会在下次 `subscribe()` 时（立即通知阶段）生效。

### 禁止 listener 重入（re-entrancy）

在 `subscribe(listener)` 的 **listener 执行过程中**，调用以下任意方法都会抛错：

- `setValue`
- `subscribe`
- `unsubscribe`

这样做是为了避免同步重入导致的复杂时序、以及通知过程中修改 listener 集合带来的不可预测行为。

### `effect()` 约束

本库的 effect 设计是“强约束”的：

- **store 不能依赖自己**：不能把自身放进 `effect(deps, ...)` 的依赖里
- **effect 内只允许调用自身 `setValue`**
  - effect 执行期间调用 `subscribe` / `unsubscribe` / `setServerValue` 会抛错
  - effect 执行期间调用其他 store 的 `setValue` 会抛错
- **默认禁止依赖成环**
  - 如确有需要，可用 `{ allowCycle: true }` 显式允许
  - 即使允许成环，也有“同步更新次数过多”的运行时保护，防止无限同步更新

## 开发

```bash
npm test
npm run build
```

