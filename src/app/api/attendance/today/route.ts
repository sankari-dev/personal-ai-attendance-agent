import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return new Response(null, { status: 404 });
  }

  if (request.headers.get("host") !== "127.0.0.1:3001") {
    return new Response(null, { status: 403 });
  }

  try {
    const result = await getDb().query(`
      WITH today AS (
        SELECT
          (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date AS day
      )
      SELECT
        to_char(t.day, 'YYYY-MM-DD') AS working_date,
        a.id AS attendance_id,
        to_char(
          a.actual_punch_in_at AT TIME ZONE 'Asia/Kolkata',
          'HH12:MI AM'
        ) AS punch_in,
        to_char(
          a.expected_end_at AT TIME ZONE 'Asia/Kolkata',
          'HH12:MI AM'
        ) AS expected_punch_out,
        to_char(
          a.actual_punch_out_at AT TIME ZONE 'Asia/Kolkata',
          'HH12:MI AM'
        ) AS actual_punch_out,
        COALESCE(p.minutes, 0)::integer AS permission_minutes,
        GREATEST(
          0,
          s.monthly_permission_blocks - (
            SELECT count(*)::integer
            FROM permission_usage monthly
            WHERE monthly.user_settings_id = s.id
              AND monthly.working_date >=
                  date_trunc('month', t.day::timestamp)::date
              AND monthly.working_date <
                  (date_trunc('month', t.day::timestamp)
                    + interval '1 month')::date
          )
        ) AS remaining_monthly_blocks
      FROM today t
      JOIN user_settings s ON s.id = 1
      LEFT JOIN attendance_records a
        ON a.user_settings_id = s.id
       AND a.working_date = t.day
      LEFT JOIN permission_usage p
        ON p.user_settings_id = s.id
       AND p.working_date = t.day
    `);

    if (result.rowCount !== 1) {
      throw new Error("Attendance settings missing.");
    }

    return NextResponse.json(result.rows[0], {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    console.error("Could not load today's attendance.");

    return NextResponse.json(
      { error: "Could not load today's attendance." },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}