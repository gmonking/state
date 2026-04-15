/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from "vitest";

describe("create() - server semantics (isServer=true)", () => {
  it("subscribe is a no-op and does not call listener; setValue/effect do nothing", async () => {
    vi.resetModules();
    vi.doMock("../utils/constant", () => ({ isServer: true }));

    const { create } = await import("./create");

    const s = create(1);
    const fn = vi.fn();

    const unsubscribe = s.subscribe(fn);
    expect(typeof unsubscribe).toBe("function");
    expect(fn).not.toHaveBeenCalled();

    s.setValue(2);
    expect(s.getSnapshot()).toBe(1);

    s.effect({ s }, () => {
      throw new Error("should not run on server");
    });

    unsubscribe();
  });

  it("setServerValue updates server snapshot but does not notify without listeners", async () => {
    vi.resetModules();
    vi.doMock("../utils/constant", () => ({ isServer: true }));

    const { create } = await import("./create");

    const s = create(1);
    s.setServerValue(2);
    expect(s._getServerSnapshot()).toBe(2);
    expect(s.getSnapshot()).toBe(2);
  });
});

