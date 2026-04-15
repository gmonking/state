/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { create } from "./create";

describe("create().effect()", () => {
  it("runs exactly once on first subscription setup (no extra fire from dep subscribe immediate emissions)", () => {
    const a = create(1);
    const b = create(10);

    const c = create(0);

    let runs = 0;
    c.effect({ a, b }, ({ a, b }, set) => {
      runs += 1;
      set(a + b);
    });

    const unsubscribe = c.subscribe(() => {});
    unsubscribe();

    expect(runs).toBe(1);
  });

  it("throws when an effect tries to set another store (dev-only safety)", () => {
    const a = create(0);
    const other = create(0);
    const c = create(0);

    c.effect({ a }, ({ a }, set) => {
      set(a);
      other.setValue(a + 1);
    });

    // The first effect execution happens when c gets its first subscriber.
    // The illegal cross-store setValue should throw during this initial run.
    expect(() => c.subscribe(() => {})).toThrow(/禁止在 effect 执行过程中调用其他 store/);
  });

  it("does not run effect at all until the store has its first subscriber", () => {
    const a = create(1);
    const c = create(0);
    let runs = 0;

    c.effect({ a }, ({ a }, set) => {
      runs += 1;
      set(a);
    });

    a.setValue(2);
    expect(runs).toBe(0);

    const unsubscribe = c.subscribe(() => {});
    expect(runs).toBe(1);
    unsubscribe();
  });

  it("runs again when a dependency changes (after initial run)", () => {
    const a = create(1);
    const b = create(10);
    const c = create(0);
    let runs = 0;

    c.effect({ a, b }, ({ a, b }, set) => {
      runs += 1;
      set(a + b);
    });

    const unsubscribe = c.subscribe(() => {});
    expect(runs).toBe(1);
    expect(c.getSnapshot()).toBe(11);

    a.setValue(2);
    expect(runs).toBe(2);
    expect(c.getSnapshot()).toBe(12);

    b.setValue(20);
    expect(runs).toBe(3);
    expect(c.getSnapshot()).toBe(22);

    unsubscribe();
  });

  it("stops reacting to deps after the last subscriber unsubscribes", () => {
    const a = create(1);
    const c = create(0);
    let runs = 0;

    c.effect({ a }, ({ a }, set) => {
      runs += 1;
      set(a);
    });

    const unsubscribe = c.subscribe(() => {});
    expect(runs).toBe(1);
    unsubscribe();

    a.setValue(2);
    expect(runs).toBe(1);
  });

  it("allows effect to set its own store value (no error)", () => {
    const a = create(1);
    const c = create(0);

    c.effect({ a }, ({ a }, set) => {
      set(a + 1);
    });

    const unsubscribe = c.subscribe(() => {});
    expect(c.getSnapshot()).toBe(2);
    unsubscribe();
  });

  it("forbids using the store itself as an effect dependency", () => {
    const c = create(0);
    expect(() =>
      c.effect({ self: c }, () => {
        // noop
      }),
    ).toThrow(/禁止将 store 作为自身 effect 的依赖/);
  });

  it("in effect, only self setValue is allowed (subscribe/unsubscribe/setServerValue forbidden)", () => {
    const a = create(0);
    const c = create(0);

    c.effect({ a }, (_deps, set) => {
      // allowed
      set(1);

      // forbidden ops even on self
      expect(() => c.setServerValue(1)).toThrow(/只允许调用自身 setValue/);
      expect(() => c.subscribe(() => {})).toThrow(/只允许调用自身 setValue/);
    });

    expect(() => c.subscribe(() => {})).not.toThrow();
  });

  it("detects and forbids dependency cycles by default", () => {
    const a = create(0);
    const b = create(0);

    a.effect({ b }, ({ b }, set) => set(b));

    expect(() =>
      b.effect({ a }, ({ a }, set) => set(a)),
    ).toThrow(/依赖成环/);
  });

  it("allows cycles only with allowCycle=true, but guards against infinite synchronous update loops", () => {
    const a = create(0);
    const b = create(0);

    a.effect(
      { b },
      ({ b }, set) => {
        set(b + 1);
      },
      { allowCycle: true },
    );
    b.effect(
      { a },
      ({ a }, set) => {
        set(a + 1);
      },
      { allowCycle: true },
    );

    // The first subscribe triggers effects; without a guard this would loop forever.
    expect(() => a.subscribe(() => {})).toThrow(/同步更新次数过多/);
  });
});

