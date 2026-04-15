/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { create } from "./create";

describe("create().init()", () => {
  const tick = () => new Promise<void>((r) => setTimeout(r, 0));

  it("runs initializer when the first subscriber appears and applies resolved value as new state", async () => {
    const s = create(0);

    const init = vi.fn(async () => {
      await Promise.resolve();
      return 42;
    });

    s.init(init);

    const seen: number[] = [];
    const unsubscribe = s.subscribe((v) => seen.push(v));

    // immediate emit uses current state
    expect(seen).toEqual([0]);
    // initializer is scheduled on a microtask
    await tick();
    expect(init).toHaveBeenCalledTimes(1);

    // wait initializer to resolve and update state
    await tick();
    await tick();

    expect(s.getSnapshot()).toBe(42);
    expect(seen).toEqual([0, 42]);

    unsubscribe();
  });

  it("runs initializer again when all subscribers unsubscribed and a new first subscriber appears", async () => {
    const s = create(0);

    let calls = 0;
    s.init(async () => {
      calls += 1;
      return calls;
    });

    const unsub1 = s.subscribe(() => {});
    // init is async-scheduled
    await tick();
    await tick();
    expect(s.getSnapshot()).toBe(1);
    unsub1();

    const unsub2 = s.subscribe(() => {});
    await tick();
    await tick();
    expect(s.getSnapshot()).toBe(2);
    unsub2();
  });

  it("does not run initializer more than once per subscription cycle, even if multiple subscribers are added", async () => {
    const s = create(0);
    const init = vi.fn(async () => 1);
    s.init(init);

    const a = s.subscribe(() => {});
    const b = s.subscribe(() => {});

    await tick();
    expect(init).toHaveBeenCalledTimes(1);

    a();
    b();
  });
});

