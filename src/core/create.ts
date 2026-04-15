import { isServer } from "../utils/constant";

// ============================================================================
// 类型定义
// ============================================================================

type VoidFunc = () => void;

type StoreCreateProducer<T> = () => T;

type StoreUnscbscribe = () => void;

type StoreListener<T> = (value: T) => void;

type StoreSubscribe<T> = (listener: StoreListener<T>) => StoreUnscbscribe;

type StoreSetProducer<T> = (value: T) => T;

type StoreSetFunc<T> = (producer: T | StoreSetProducer<T>) => void;

export type StoreLike<T> = {
  _getServerSnapshot: () => T;
  setServerValue: (value: T) => void;
  getSnapshot: () => T;
  setValue: StoreSetFunc<T>;
  subscribe: StoreSubscribe<T>;
};

type EffectDeps = Record<string, StoreLike<any>>;

type EffectDepValueOf<R> = R extends { getSnapshot: () => infer S } ? S : never;

type EffectDepValue<D extends EffectDeps> = {
  [K in keyof D]: EffectDepValueOf<D[K]>;
};

type EffectListener<D extends EffectDeps, T> = (value: EffectDepValue<D>, set: StoreSetFunc<T>) => void;

type EffectUnsubscribe = () => void;

// ============================================================================
// 类型守卫
// ============================================================================

function isProducer<T>(value: unknown): value is StoreCreateProducer<T> {
  return typeof value === "function";
}

function isSetProducer<T>(value: unknown): value is StoreSetProducer<T> {
  return typeof value === "function";
}

// ============================================================================
// 全局状态管理
// ============================================================================

/** 追踪当前正在执行 effect 的 store ID */
let currentExecutingEffectStoreId: symbol | null = null;

/** store ID 计数器 */
let storeIdCounter = 0;

/**
 * 生成唯一的 store ID
 */
function generateStoreId(): symbol {
  return Symbol(`store_${storeIdCounter++}`);
}

/** 用于标记已 reset 的内部哨兵，避免与合法业务值（如 null）冲突 */
const RESET = Symbol("state_reset");
type ResetSentinel = typeof RESET;

/**
 * 在开发环境下检查是否允许在当前 store 中执行操作
 */
function checkEffectExecutionContext(storeId: symbol): void {
  // @ts-expect-error - process.env 在构建时处理
  if (process.env.NODE_ENV !== 'production') {
    if (currentExecutingEffectStoreId !== null && currentExecutingEffectStoreId !== storeId) {
      throw new Error(
        "禁止在 effect 执行过程中调用其他 store 的 setValue 方法"
      );
    }
  }
}

/**
 * 在 effect 执行过程中设置执行上下文
 */
function withEffectContext<T>(storeId: symbol, fn: () => T): T {
  // @ts-expect-error - process.env 在构建时处理
  if (process.env.NODE_ENV !== 'production') {
    currentExecutingEffectStoreId = storeId;
    try {
      return fn();
    } finally {
      currentExecutingEffectStoreId = null;
    }
  }
  return fn();
}

// ============================================================================
// 状态管理
// ============================================================================

/**
 * 初始化状态
 */
function initializeState<T>(
  producer: StoreCreateProducer<T> | T
): T {
  return isProducer(producer) ? producer() : producer;
}

/**
 * 创建状态管理器
 */
function createStateManager<T>(initialValue: T) {
  let shouldUseServerValue = true;
  let state: T | ResetSentinel = initialValue;
  let serverValue: T | ResetSentinel = initialValue;

  return {
    getSnapshot(): T {
      return (shouldUseServerValue ? serverValue : state) as T;
    },

    setState(value: T): void {
      state = value;
    },

    setServerValue(value: T): void {
      serverValue = value;
    },

    getState(): T | ResetSentinel {
      return state;
    },

    getServerValue(): T | ResetSentinel {
      return serverValue;
    },

    isUsingServerValue(): boolean {
      return shouldUseServerValue;
    },

    switchToClientState(): void {
      shouldUseServerValue = false;
    },

    resetState(): void {
      state = RESET;
      serverValue = RESET;
    },
  };
}

// ============================================================================
// 监听者管理
// ============================================================================

/**
 * 创建监听者管理器
 */
function createListenerManager<T>() {
  const listeners = new Set<StoreListener<T>>();

  return {
    add(listener: StoreListener<T>): void {
      listeners.add(listener);
    },

    remove(listener: StoreListener<T>): void {
      listeners.delete(listener);
    },

    notify(value: T): void {
      listeners.forEach((listener) => listener(value));
    },

    hasListeners(): boolean {
      return listeners.size > 0;
    },

    isEmpty(): boolean {
      return listeners.size === 0;
    },

    get size(): number {
      return listeners.size;
    },
  };
}

// ============================================================================
// Effect 管理
// ============================================================================

/**
 * 创建 Effect 管理器
 */
function createEffectManager() {
  const unsubscribes = new Set<EffectUnsubscribe>();
  const subscribeStarters = new Set<VoidFunc>();
  const firstCallbacks = new Set<VoidFunc>();

  return {
    addUnsubscribe(unsubscribe: EffectUnsubscribe): void {
      unsubscribes.add(unsubscribe);
    },

    addSubscribeStarter(starter: VoidFunc): void {
      subscribeStarters.add(starter);
    },

    addFirstCallback(callback: VoidFunc): void {
      firstCallbacks.add(callback);
    },

    startSubscriptions(): void {
      subscribeStarters.forEach((starter) => starter());
    },

    executeFirstCallbacks(): void {
      firstCallbacks.forEach((callback) => callback());
    },

    clearAllSubscriptions(): void {
      unsubscribes.forEach((unsubscribe) => unsubscribe());
      unsubscribes.clear();
    },

    clear(): void {
      unsubscribes.clear();
      subscribeStarters.clear();
      firstCallbacks.clear();
    },
  };
}

// ============================================================================
// 主函数
// ============================================================================

export function create<T>(producer: StoreCreateProducer<T> | T) {
  const storeId = generateStoreId();

  // 初始化状态
  const initialState = initializeState(producer);
  const stateManager = createStateManager(initialState);
  const listenerManager = createListenerManager<T>();
  const effectManager = createEffectManager();

  /**
   * 当 store 没有订阅者时，记录最后一次 setValue 的值
   * 当 store 有订阅者时，调用此方法还原状态
   */
  let lastSetValueOnIdle: (() => T) | null = null;

  // ============================================================================
  // 公开方法实现
  // ============================================================================

  const getSnapshot = (): T => {
    const snap = stateManager.getSnapshot();
    if (snap === (RESET as any)) {
      // 允许在无订阅者清理后，首次读取时自恢复到初始值，避免向外泄露 RESET
      const newInitialState = initializeState(producer);
      stateManager.setState(newInitialState);
      stateManager.setServerValue(newInitialState);
      return newInitialState;
    }
    return snap;
  };

  const _getServerSnapshot = (): T => {
    const serverSnap = stateManager.getServerValue();
    if (serverSnap === RESET) {
      const newInitialState = initializeState(producer);
      stateManager.setState(newInitialState);
      stateManager.setServerValue(newInitialState);
      return newInitialState;
    }
    return serverSnap as T;
  };

  /**
   * setServerValue 的作用有如下两点：
   * 1. 在服务端设置 ssr 所需数据
   * 2. 在客户端首次渲染时使用服务端状态
   * 因此在服务端使用 store 之前，必须先调用 setServerValue 方法设置服务端状态
   * 同时为了防止水合问题，需要确保客户端渲染前，使用了 setServerValue 方法设置服务端状态
   * 例如在 next.js 中，就需要通过 rsc payload 将服务端使用的状态传递给客户端，并在水合前通过 setServerValue 方法设置服务端状态
   * 一般是通过服务端组件向客户端组件传递 props，在客户端组件中通过 ref 控制执行次数，接收到 props 后通过 setServerValue 方法设置服务端状态
   * 然后将需要用到状态的组件使用接收数据的客户端组件包裹, 这样就能保证在客户端渲染前，使用了 setServerValue 方法设置服务端状态
   * 
   * @param value - 服务端状态
   */
  const setServerValue = (value: T): void => {
    checkEffectExecutionContext(storeId);
    stateManager.setServerValue(value);

    // 如果当前使用服务端值且已有监听者，需要通知他们
    // 因为 getSnapshot() 会返回新的 serverValue
    if (stateManager.isUsingServerValue() && listenerManager.hasListeners()) {
      listenerManager.notify(value);
    }
  };

  /**
   * setValue 方法在服务端是不会执行的
   * 因为服务端不需要更新状态，只需要在客户端首次渲染时使用服务端状态
   * 
   * @param producer - 状态值或状态更新函数
   */
  const setValue: StoreSetFunc<T> = (producer) => {
    // 服务端不执行 set 方法
    if (isServer) return;

    checkEffectExecutionContext(storeId);

    // 计算新状态值
    const computeNewValue = (): T => {
      if (isSetProducer(producer)) {
        return producer(stateManager.getSnapshot()) as T;
      }
      return producer as T;
    };

    // 当 store 没有订阅者时，记录状态供后续恢复
    if (listenerManager.isEmpty()) {
      const idleState = computeNewValue();
      lastSetValueOnIdle = () => idleState;
      return;
    }

    // 切换到客户端状态（首次有订阅者时）
    stateManager.switchToClientState();

    // 更新状态并通知监听者
    const newValue = computeNewValue();
    stateManager.setState(newValue);
    listenerManager.notify(newValue);
  };

  const subscribe: StoreSubscribe<T> = (listener) => {
    // 服务端不会执行 subscribe
    if (isServer) return () => {};

    // 添加监听者
    listenerManager.add(listener);

    // 当第一个监听者出现时，初始化订阅
    if (listenerManager.size === 1) {
      // 如果状态已被重置（没有监听者时会被重置），重新初始化
      if (stateManager.getState() === RESET && stateManager.getServerValue() === RESET) {
        const newInitialState = initializeState(producer);
        stateManager.setState(newInitialState);
        stateManager.setServerValue(newInitialState);
      }

      // 如果存在 lastSetValueOnIdle，则还原状态
      if (lastSetValueOnIdle) {
        const restoredValue = lastSetValueOnIdle();
        stateManager.setState(restoredValue);
        lastSetValueOnIdle = null;
      }

      // 执行首次回调和开始订阅依赖
      effectManager.executeFirstCallbacks();
      effectManager.startSubscriptions();
    }

    // 立即通知监听者当前状态
    listener(getSnapshot());

    // 返回取消订阅函数
    return () => {
      listenerManager.remove(listener);

      // 如果没有监听者了，清理资源
      if (listenerManager.isEmpty()) {
        effectManager.clearAllSubscriptions();
        stateManager.resetState();
      }
    };
  };

  /**
   * effect 的 listener 执行时无法执行其他 store 的 setValue 方法
   * 之所以这样设计是因为要让 store 保持单一，仅关注与自身状态相关的逻辑
   * 如果在 effect 中能调用其他 store 的 setValue 方法，会导致无法安全的在当前 store 没有订阅者时清理数据，也会让 store 变得不纯粹
   * 在这种情况下正确的做法是在其他 store 的 effect 中调用它们自身的 setValue 方法
   * 这样能保持 store 的单一职责，也能保持 store 的纯粹性, 使代码更易于维护和理解
   * 
   * 注意：effect 只能在顶层运行，不能在其他函数或组件中运行，因为每次运行都会将 effect 的 listener 添加到 effectManager 中
   * 
   * @param deps - 依赖的 store
   * @param listener - 监听器
   */
  function effect<D extends EffectDeps>(deps: D, listener: EffectListener<D, T>): void {
    // 服务端不会执行 effect
    if (isServer) return;

    /**
     * 首次执行 effect：聚合所有依赖的值并执行 listener
     */
    const executeFirstEffect = (): void => {
      const depValues = collectDepValues(deps);
      withEffectContext(storeId, () => {
        listener(depValues, setValue);
      });
    };

    /**
     * 订阅依赖变化：当依赖变化时执行 listener
     */
    const subscribeToDeps = (): void => {
      const entries = Object.entries(deps);
      const depValues = collectDepValues(deps);
      const seenFirstCallbackForKey = new Set<string>();

      entries.forEach(([key, store]) => {
        const unsubscribe = store.subscribe((value) => {
          // 跳过每个依赖 store 在 subscribe 时的首次同步回调
          // （首次 effect 已在 executeFirstEffect 中统一处理）
          if (!seenFirstCallbackForKey.has(key)) {
            seenFirstCallbackForKey.add(key);
            return;
          }

          // 更新依赖值并执行 listener
          (depValues as any)[key] = value;
          withEffectContext(storeId, () => {
            listener(depValues, setValue);
          });
        });

        effectManager.addUnsubscribe(unsubscribe);
      });
    };

    /**
     * 收集所有依赖的值
     */
    const collectDepValues = (deps: D): EffectDepValue<D> => {
      return Object.fromEntries(
        Object.entries(deps).map(([key, store]) => [key, store.getSnapshot()])
      ) as EffectDepValue<D>;
    };

    // 注册 effect 回调
    effectManager.addFirstCallback(executeFirstEffect);
    effectManager.addSubscribeStarter(subscribeToDeps);
  }

  return {
    getSnapshot,
    effect,
    subscribe,
    setValue,
    setServerValue,
    _getServerSnapshot,
  } as const;
}