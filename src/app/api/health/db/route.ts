import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  // This diagnostic endpoint is available only during development.
  if (process.env.NODE_ENV !== "development") {
    return new Response(null, { status: 404 });
  }

  try {
    await getDb().query("SELECT 1");

    return NextResponse.json(
      { status: "ok", database: "connected" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    console.error("Database health check failed.");

    return NextResponse.json(
      { status: "error", database: "unavailable" },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}