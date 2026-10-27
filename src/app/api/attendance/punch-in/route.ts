import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { evaluatePunchIn } from "@/lib/attendance-rules";

function reply(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return reply({ error: "Endpoint unavailable." }, 404);
  }

  // Allow only requests from our local dashboard.
   const allowedOrigin = "http://127.0.0.1:3001";
  const allowedHost = "127.0.0.1:3001";

  if (
    request.headers.get("origin") !== allowedOrigin ||
    request.headers.get("host") !== allowedHost
  ) {
    return reply({ error: "Request origin rejected." }, 403);
  }
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  ) {
    return reply({ error: "Use application/json." }, 415);
  }

  let body: unknown;

  try {
    const text = await request.text();

    if (text.length > 1000) {
      return reply({ error: "Request is too large." }, 413);
    }

    body = JSON.parse(text);
  } catch {
    return reply({ error: "Invalid JSON." }, 400);
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("punchInTime" in body) ||
    typeof body.punchInTime !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.punchInTime)
  ) {
    return reply({ error: "Enter punchInTime in HH:mm format." }, 400);
  }

  const punchInTime = body.punchInTime;

  // Derive today's date using India time, not the computer's timezone.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const part = (type: string) =>
    parts.find((item) => item.type === type)!.value;

  const workingDate = `${part("year")}-${part("month")}-${part("day")}`;
  const actualPunchIn = new Date(
    `${workingDate}T${punchInTime}:00+05:30`,
  );

  if (actualPunchIn.getTime() > Date.now()) {
    return reply({ error: "Punch-in time cannot be in the future." }, 400);
  }

  const weekday = new Date(`${workingDate}T12:00:00Z`).getUTCDay();
  const isoWeekday = weekday === 0 ? 7 : weekday;

  try {
    const client = await getDb().connect();

    try {
      await client.query("BEGIN");

      // The permission trigger uses this same lock.
      await client.query(
        "SELECT id FROM user_settings WHERE id = 1 FOR UPDATE",
      );

      const settingsResult = await client.query(`
        SELECT
          to_char(work_start, 'HH24:MI') AS work_start,
          to_char(work_end, 'HH24:MI') AS work_end,
          working_days,
          permission_block_minutes,
          monthly_permission_blocks
        FROM user_settings
        WHERE id = 1
      `);

      if (settingsResult.rowCount !== 1) {
        throw new Error("Attendance settings are missing.");
      }

      const settings = settingsResult.rows[0];

      const existing = await client.query(
        `SELECT id FROM attendance_records
         WHERE user_settings_id = 1 AND working_date = $1::date`,
        [workingDate],
      );

      if (existing.rowCount) {
        await client.query("ROLLBACK");
        return reply(
          { error: "Attendance already exists for today. Use correction later." },
          409,
        );
      }

      const usage = await client.query(
        `SELECT count(*)::integer AS used
         FROM permission_usage
         WHERE user_settings_id = 1
           AND working_date >=
               date_trunc('month', $1::date::timestamp)::date
           AND working_date <
               (date_trunc('month', $1::date::timestamp)
                 + interval '1 month')::date`,
        [workingDate],
      );

      const remainingBlocks = Math.max(
        0,
        settings.monthly_permission_blocks - usage.rows[0].used,
      );

      const decision = evaluatePunchIn({
        punchInTime,
        workStart: settings.work_start,
        workEnd: settings.work_end,
        isWorkingDay: settings.working_days.includes(isoWeekday),
        permissionBlockMinutes: settings.permission_block_minutes,
        remainingMonthlyBlocks: remainingBlocks,
      });

      const saved = await client.query(
        `INSERT INTO attendance_records (
           working_date,
           expected_start_at,
           expected_end_at,
           actual_punch_in_at
         )
         VALUES (
           $1::date,
           ($1::date + $2::time) AT TIME ZONE 'Asia/Kolkata',
           ($1::date + $3::time) AT TIME ZONE 'Asia/Kolkata',
           $4::timestamptz
         )
         RETURNING id`,
        [
          workingDate,
          settings.work_start,
          settings.work_end,
          actualPunchIn.toISOString(),
        ],
      );

      if (decision.permissionBlocksToUse === 1) {
        await client.query(
          "INSERT INTO permission_usage (working_date) VALUES ($1::date)",
          [workingDate],
        );
      }

      await client.query("COMMIT");

      return reply(
        {
          message: "Manual punch-in recorded.",
          attendanceId: saved.rows[0].id,
          workingDate,
          punchInTime,
          expectedPunchOutTime: decision.expectedPunchOutTime,
          status:
            decision.status === "permission_required"
              ? "permission_recorded"
              : decision.status,
          reason: decision.reason,
          permissionBlocksUsed: decision.permissionBlocksToUse,
          remainingMonthlyBlocks:
            remainingBlocks - decision.permissionBlocksToUse,
          source: "manual",
        },
        201,
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch {
    console.error("Punch-in transaction failed.");
    return reply({ error: "Could not save punch-in. Please try again." }, 500);
  }
}