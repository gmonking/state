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
});

