/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { create } from "./create";

describe("create() - client semantics", () => {
  it("subscribe immediately emits current snapshot and returns an unsubscribe", () => {
    const s = create(1);
    const fn = vi.fn();

    const unsubscribe = s.subscribe(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith(1);

    unsubscribe();

    s.setValue(2);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("forbids calling setValue inside a listener (no re-entrancy)", () => {
    const s = create(0);
    expect(() =>
      s.subscribe(() => {
        s.setValue(1);
      }),
    ).toThrow(/禁止在 listener 执行过程中调用 subscribe \/ unsubscribe \/ setValue/);
  });

  it("forbids calling unsubscribe inside a listener", () => {
    const s = create(0);
    let unsubscribe: (() => void) | null = null;

    unsubscribe = s.subscribe(() => {
      unsubscribe?.();
    });

    expect(() => s.setValue(1)).toThrow(/禁止在 listener 执行过程中调用 subscribe \/ unsubscribe \/ setValue/);
    unsubscribe();
  });

  it("forbids calling subscribe inside a listener", () => {
    const s = create(0);
    expect(() =>
      s.subscribe(() => {
        s.subscribe(() => {});
      }),
    ).toThrow(/禁止在 listener 执行过程中调用 subscribe \/ unsubscribe \/ setValue/);
  });

  it("setValue updates snapshot and notifies all listeners", () => {
    const s = create(1);
    const a = vi.fn();
    const b = vi.fn();

    const ua = s.subscribe(a);
    const ub = s.subscribe(b);

    a.mockClear();
    b.mockClear();

    s.setValue(2);

    expect(s.getSnapshot()).toBe(2);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    ua();
    ub();
  });

  it("setValue supports producer function", () => {
    const s = create(1);
    const unsubscribe = s.subscribe(() => {});
    s.setValue((prev) => prev + 1);
    expect(s.getSnapshot()).toBe(2);
    unsubscribe();
  });

  it("when idle (no listeners), setValue does not notify; latest idle update is applied on next subscribe", () => {
    const s = create(0);

    // idle update
    s.setValue(1);
    s.setValue(2);

    const fn = vi.fn();
    const unsubscribe = s.subscribe(fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith(2);

    unsubscribe();
  });

  it("unsubscribing the last listener resets; re-subscribing recomputes initial state from producer", () => {
    let created = 0;
    const s = create(() => {
      created += 1;
      return created;
    });

    const u1 = s.subscribe(() => {});
    expect(s.getSnapshot()).toBe(1);
    u1();

    const fn = vi.fn();
    const u2 = s.subscribe(fn);
    expect(fn).toHaveBeenCalledWith(2);
    u2();
  });

  it("with idleMs grace period: quick unsubscribe/subscribe does not reset or rerun init", async () => {
    vi.useFakeTimers();
    const s = create(0, { idleMs: 1000 });

    let initCalls = 0;
    s.init(async () => {
      initCalls += 1;
      return initCalls;
    });

    const unsub1 = s.subscribe(() => {});
    await vi.runAllTimersAsync();
    expect(s.getSnapshot()).toBe(1);
    expect(initCalls).toBe(1);
    unsub1();

    // re-subscribe before idleMs expires: should not reset or rerun init
    vi.advanceTimersByTime(500);
    const unsub2 = s.subscribe(() => {});
    await vi.runAllTimersAsync();
    expect(s.getSnapshot()).toBe(1);
    expect(initCalls).toBe(1);
    unsub2();

    vi.useRealTimers();
  });

  it("with idleMs grace period: after idleMs expires, next first subscriber triggers init again", async () => {
    vi.useFakeTimers();
    const s = create(0, { idleMs: 1000 });

    let initCalls = 0;
    s.init(async () => {
      initCalls += 1;
      return initCalls;
    });

    const unsub1 = s.subscribe(() => {});
    await vi.runAllTimersAsync();
    expect(s.getSnapshot()).toBe(1);
    unsub1();

    // let cleanup happen
    vi.advanceTimersByTime(1000);
    await vi.runAllTimersAsync();

    const unsub2 = s.subscribe(() => {});
    await vi.runAllTimersAsync();
    expect(s.getSnapshot()).toBe(2);
    unsub2();

    vi.useRealTimers();
  });

  it("multiple listeners: removing one keeps store alive; removing last stops notifications", () => {
    const s = create(0);
    const a = vi.fn();
    const b = vi.fn();

    const ua = s.subscribe(a);
    const ub = s.subscribe(b);

    a.mockClear();
    b.mockClear();
    s.setValue(1);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    // remove one, still alive
    ua();
    a.mockClear();
    b.mockClear();
    s.setValue(2);
    expect(a).toHaveBeenCalledTimes(0);
    expect(b).toHaveBeenCalledTimes(1);

    // remove last, should stop notifications
    ub();
    b.mockClear();
    s.setValue(3);
    expect(b).toHaveBeenCalledTimes(0);
  });

  it("reset sentinel never leaks: after all listeners unsubscribe, getSnapshot returns initial value again", () => {
    const s = create(123);
    const u = s.subscribe(() => {});
    u();

    expect(s.getSnapshot()).toBe(123);
  });

  it("reset logic does not treat null as 'reset' (null is a valid state)", () => {
    const s = create<null>(null);
    const u1 = s.subscribe(() => {});
    u1();

    // still a valid value; should not be confused with "reset"
    const fn = vi.fn();
    const u2 = s.subscribe(fn);
    expect(fn).toHaveBeenCalledWith(null);

    u2();
  });

  it("setServerValue notifies listeners while still using server snapshot", () => {
    const s = create(0);
    const fn = vi.fn();
    const unsubscribe = s.subscribe(fn);

    fn.mockClear();

    // still using server value until setValue is called
    s.setServerValue(42);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith(42);

    unsubscribe();
  });

  it("after switching to client state via setValue, setServerValue no longer affects getSnapshot notifications", () => {
    const s = create(0);
    const fn = vi.fn();
    const unsubscribe = s.subscribe(fn);

    // Switch to client state (subscribe already exists so setValue will notify)
    fn.mockClear();
    s.setValue(1);
    expect(fn).toHaveBeenLastCalledWith(1);

    fn.mockClear();
    s.setServerValue(999);
    expect(fn).not.toHaveBeenCalled();
    expect(s.getSnapshot()).toBe(1);

    unsubscribe();
  });
});

