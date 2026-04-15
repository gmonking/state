# Fix effect first-subscribe semantics & reset sentinel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix `create().effect()` so it does not accidentally fire during dependency subscription setup, and replace unsafe `null as T` reset sentinel with an internal sentinel that can’t collide with valid user values.

**Architecture:** Keep the public API unchanged. Adjust internal effect subscription bookkeeping to skip each dependency store’s immediate “subscribe emits current value” callback independently. Replace `null`-based reset detection with a private sentinel value + helpers.

**Tech Stack:** TypeScript, Vite build, `use-sync-external-store` (React integration).

---

### Task 1: Add a minimal regression test for `effect()` first-subscribe behavior

**Files:**
- Create: `src/core/create.effect.test.ts`
- Modify (optional, if you prefer a test runner config): `package.json`

- [ ] **Step 1: Write a failing test**

Create `src/core/create.effect.test.ts` with a minimal harness that:
- Creates three stores: `a`, `b`, `c`
- Registers `c.effect({ a, b }, listener)` where `listener` increments a counter
- Subscribes to `c` once to trigger `executeFirstCallbacks()` and subscription startup
- Asserts the listener ran **exactly once** during setup (the explicit first run), not twice due to per-dep subscribe immediate emissions

- [ ] **Step 2: Run the test to confirm it fails**

Run one of:
- `npm test` (if a runner exists)
- or `node --test` (if using Node’s test runner)

Expected: FAIL, with the effect listener count being **2** (or otherwise > 1).

---

### Task 2: Fix `effect()` dependency subscription bookkeeping

**Files:**
- Modify: `src/core/create.ts`

- [ ] **Step 1: Implement per-dependency first-callback skipping**

In `subscribeToDeps()`:
- Remove the single shared `isFirstExecution` boolean.
- Track “first callback seen” per dependency (by dep key or by store instance) and skip only that dependency’s initial synchronous callback.
- Ensure only real updates after subscription setup call `listener(depValues, setValue)`.

- [ ] **Step 2: Re-run tests**

Expected: PASS; listener runs exactly once on initial subscribe.

---

### Task 3: Replace `null as T` reset sentinel with an internal sentinel

**Files:**
- Modify: `src/core/create.ts`

- [ ] **Step 1: Introduce a private sentinel**

Add a `const RESET = Symbol("reset")` (or similar) and internally store `state` / `serverValue` as `T | typeof RESET`.

- [ ] **Step 2: Update reset / re-init checks**

Update:
- `resetState()` to set both fields to `RESET`
- The “needs re-init” check in `subscribe()` to compare to `RESET`
- Ensure `getSnapshot()` never returns `RESET` (re-init should happen before any read/notify on first subscribe)

- [ ] **Step 3: Re-run build/typecheck**

Run: `npm run build`  
Expected: success; `dist/` outputs unchanged shape.

---

### Execution choice

Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh worker per task, review between tasks  
2. **Inline Execution** - execute tasks in this session in small checkpoints

Pick **1** or **2**.

