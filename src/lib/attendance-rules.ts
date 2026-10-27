export type PunchInDecision = {
  status: "on_time" | "permission_required" | "needs_review";
  lateMinutes: number;
  permissionBlocksToUse: 0 | 1;
  expectedPunchOutTime: string;
  reason: string;
};

type PunchInInput = {
  punchInTime: string;
  workStart: string;
  workEnd: string;
  isWorkingDay: boolean;
  permissionBlockMinutes: number;
  remainingMonthlyBlocks: number;
};

// All times must be local Asia/Kolkata times in HH:mm format.
function toMinutes(time: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error("Time must use HH:mm format, for example 09:30.");
  }

  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function evaluatePunchIn(input: PunchInInput): PunchInDecision {
  const punchIn = toMinutes(input.punchInTime);
  const start = toMinutes(input.workStart);
  const end = toMinutes(input.workEnd);

  if (end <= start) {
    throw new Error("Work end must be later than work start.");
  }

  if (input.permissionBlockMinutes !== 60) {
    throw new Error("The current policy requires 60-minute blocks.");
  }

  if (
    !Number.isInteger(input.remainingMonthlyBlocks) ||
    input.remainingMonthlyBlocks < 0
  ) {
    throw new Error("Remaining permission blocks must be a nonnegative integer.");
  }

  const lateMinutes = Math.max(0, punchIn - start);

  const base = {
    lateMinutes,
    expectedPunchOutTime: input.workEnd,
  };

  if (!input.isWorkingDay) {
    return {
      ...base,
      status: "needs_review",
      permissionBlocksToUse: 0,
      reason: "Attendance entered for a non-working day.",
    };
  }

  if (lateMinutes === 0) {
    return {
      ...base,
      status: "on_time",
      permissionBlocksToUse: 0,
      reason: "No late-arrival permission required.",
    };
  }

  if (lateMinutes > input.permissionBlockMinutes) {
    return {
      ...base,
      status: "needs_review",
      permissionBlocksToUse: 0,
      reason: "Late arrival exceeds the one-hour daily allowance.",
    };
  }

  if (input.remainingMonthlyBlocks === 0) {
    return {
      ...base,
      status: "needs_review",
      permissionBlocksToUse: 0,
      reason: "Monthly permission allowance is exhausted.",
    };
  }

  return {
    ...base,
    status: "permission_required",
    permissionBlocksToUse: 1,
    reason: "One full hour of permission must be recorded.",
  };
}