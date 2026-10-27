import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePunchIn } from "../src/lib/attendance-rules.ts";

function evaluate(punchInTime, overrides = {}) {
  return evaluatePunchIn({
    punchInTime,
    workStart: "09:30",
    workEnd: "18:30",
    isWorkingDay: true,
    permissionBlockMinutes: 60,
    remainingMonthlyBlocks: 5,
    ...overrides,
  });
}

test("early arrival uses no permission", () => {
  const result = evaluate("09:15");
  assert.equal(result.status, "on_time");
  assert.equal(result.permissionBlocksToUse, 0);
  assert.equal(result.lateMinutes, 0);
});

test("09:30 uses no permission", () => {
  const result = evaluate("09:30");
  assert.equal(result.status, "on_time");
  assert.equal(result.permissionBlocksToUse, 0);
});

test("09:31 uses one full permission block", () => {
  const result = evaluate("09:31");
  assert.equal(result.status, "permission_required");
  assert.equal(result.permissionBlocksToUse, 1);
  assert.equal(result.lateMinutes, 1);
});

test("10:00 uses one full permission block", () => {
  const result = evaluate("10:00");
  assert.equal(result.permissionBlocksToUse, 1);
  assert.equal(result.lateMinutes, 30);
});

test("10:30 is within the daily allowance", () => {
  const result = evaluate("10:30");
  assert.equal(result.status, "permission_required");
  assert.equal(result.permissionBlocksToUse, 1);
  assert.equal(result.lateMinutes, 60);
});

test("10:31 requires review without consuming permission", () => {
  const result = evaluate("10:31");
  assert.equal(result.status, "needs_review");
  assert.equal(result.permissionBlocksToUse, 0);
});

test("exhausted monthly allowance requires review", () => {
  const result = evaluate("10:00", { remainingMonthlyBlocks: 0 });
  assert.equal(result.status, "needs_review");
  assert.equal(result.permissionBlocksToUse, 0);
});

test("on-time arrival works with no monthly permission left", () => {
  assert.equal(
    evaluate("09:30", { remainingMonthlyBlocks: 0 }).status,
    "on_time",
  );
});

test("non-working day requires review", () => {
  const result = evaluate("10:00", { isWorkingDay: false });
  assert.equal(result.status, "needs_review");
  assert.equal(result.permissionBlocksToUse, 0);
});

test("expected punch-out remains 18:30", () => {
  for (const time of ["09:15", "09:30", "10:00", "10:30", "11:00"]) {
    assert.equal(evaluate(time).expectedPunchOutTime, "18:30");
  }
});

test("invalid time is rejected", () => {
  for (const time of ["25:00", "10:60", "9:30", "abc"]) {
    assert.throws(() => evaluate(time), /HH:mm/);
  }
});

test("invalid permission balance is rejected", () => {
  assert.throws(
    () => evaluate("10:00", { remainingMonthlyBlocks: -1 }),
    /nonnegative integer/,
  );
});