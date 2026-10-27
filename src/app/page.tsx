"use client";

import { useEffect, useState, type FormEvent } from "react";

type Attendance = {
  working_date: string;
  attendance_id: string | null;
  punch_in: string | null;
  expected_punch_out: string | null;
  actual_punch_out: string | null;
  permission_minutes: number;
  remaining_monthly_blocks: number;
};

function Robot({ busy }: { busy: boolean }) {
  return (
    <div className="relative mx-auto h-40 w-40 shrink-0">
      <div className="absolute inset-2 rounded-full bg-teal-300/15 blur-xl" />

      <svg
        viewBox="0 0 160 160"
        role="img"
        aria-label="Your attendance assistant robot"
        className="relative h-full w-full motion-safe:animate-[float_5s_ease-in-out_infinite]"
      >
        <ellipse cx="80" cy="145" rx="36" ry="5" fill="#0f766e" opacity=".15" />
        <path d="M80 29V18" stroke="#5eead4" strokeWidth="5" />
        <circle cx="80" cy="14" r="6" fill="#5eead4" />
        <rect x="31" y="33" width="98" height="78" rx="28" fill="#e2e8f0" />
        <rect x="20" y="58" width="14" height="30" rx="7" fill="#94a3b8" />
        <rect x="126" y="58" width="14" height="30" rx="7" fill="#94a3b8" />
        <rect x="39" y="42" width="82" height="58" rx="21" fill="#102b3b" />
        <g className="robot-eyes">
          <rect x="54" y="60" width="12" height="17" rx="6" fill="#5eead4" />
          <rect x="94" y="60" width="12" height="17" rx="6" fill="#5eead4" />
        </g>
        <path
          d="M72 85Q80 92 88 85"
          stroke="#5eead4"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        <rect x="52" y="114" width="56" height="25" rx="12" fill="#cbd5e1" />
        <circle cx="80" cy="126" r="5" fill={busy ? "#fbbf24" : "#14b8a6"} />
      </svg>
    </div>
  );
}

export default function Home() {
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [punchInTime, setPunchInTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAttendance() {
      setLoading(true);
      setLoadError("");

      try {
        const response = await fetch("/api/attendance/today", {
          cache: "no-store",
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Attendance could not be loaded.");
        }

        const data: Attendance = await response.json();

        if (!controller.signal.aborted) {
          setAttendance(data);
        }
      } catch {
        if (!controller.signal.aborted) {
          setLoadError("I couldn’t load your attendance. Please refresh.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadAttendance();

    return () => controller.abort();
  }, [refreshVersion]);

  // Reload after returning to the dashboard or leaving it open.
  useEffect(() => {
    const refresh = () => setRefreshVersion((value) => value + 1);
    const timer = setInterval(refresh, 60000);

    window.addEventListener("focus", refresh);

    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  async function handlePunchIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveError("");
    setNotice("");

    try {
      const response = await fetch("/api/attendance/punch-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ punchInTime }),
      });

      const data = await response.json();

      if (!response.ok) {
        setSaveError(data.error ?? "Your punch-in could not be saved.");

        if (response.status === 409) {
          setRefreshVersion((value) => value + 1);
        }

        return;
      }

      setNotice(
        data.status === "needs_review"
          ? "Your punch-in was saved. This entry needs review under your attendance rules."
          : "Your punch-in was saved successfully.",
      );

      setRefreshVersion((value) => value + 1);
    } catch {
      setSaveError(
        "I couldn’t confirm the save. Refresh attendance before trying again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const hasPunchIn = Boolean(attendance?.punch_in);
  const hasRecord = Boolean(attendance?.attendance_id);
  const remaining = attendance?.remaining_monthly_blocks;

  const assistantMessage = loading
    ? "Let me check your saved attendance."
    : loadError
      ? "I can’t confirm your attendance right now. Please refresh."
      : attendance?.actual_punch_out
        ? `Your punch-out is recorded at ${attendance.actual_punch_out}. You can review today’s times below.`
        : hasPunchIn
          ? `You recorded your punch-in at ${attendance?.punch_in}. Your expected punch-out is ${attendance?.expected_punch_out}.`
          : hasRecord
            ? "Today already has an attendance record. Its punch-in needs review."
            : "Did you punch in today? Enter your actual time and I’ll record it for you.";

  const dateLabel = attendance
    ? new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(`${attendance.working_date}T12:00:00+05:30`))
    : "India time · Asia/Kolkata";

  return (
    <main className="min-h-screen bg-[#f3f6fa] text-slate-900">
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-7px); }
        }
        @keyframes blink {
          0%, 43%, 47%, 100% { transform: scaleY(1); }
          45% { transform: scaleY(.12); }
        }
        @media (prefers-reduced-motion: no-preference) {
          .robot-eyes {
            transform-box: fill-box;
            transform-origin: center;
            animation: blink 6s infinite;
          }
        }
      `}</style>

      <div className="mx-auto grid min-h-screen max-w-[1600px] lg:grid-cols-[280px_1fr]">
        <aside className="bg-[#101e30] px-7 py-8 text-white">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-300 text-lg font-black text-slate-900">
              A
            </span>
            <div>
              <p className="font-semibold">Attendance Companion</p>
              <p className="text-xs text-slate-400">Your personal workday assistant</p>
            </div>
          </div>

          <div className="mt-9 border-t border-white/10 pt-7">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-200 to-blue-200 text-xl font-bold text-slate-900">
              SS
            </div>
            <h1 className="mt-5 text-xl font-semibold">Sri Sankari S C</h1>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Full Stack Web Developer
            </p>
          </div>

          <dl className="mt-7 grid grid-cols-2 gap-6 lg:grid-cols-1">
            {[
              ["Company", "Croyez Immigration"],
              ["Branch", "Chennai"],
              ["Date of joining", "26 June 2025"],
              ["Working days", "Monday–Saturday"],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-slate-400">{label}</dt>
                <dd className="mt-1.5 text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-9 rounded-2xl border border-teal-300/15 bg-teal-300/5 p-4">
            <p className="text-sm font-medium text-teal-200">Your workday</p>
            <p className="mt-2 text-xl font-semibold">9:30 AM–6:30 PM</p>
            <p className="mt-2 text-xs text-slate-400">Sunday is your weekly off.</p>
          </div>

          <p className="mt-7 text-xs leading-6 text-slate-400">
            Personal tracking only. This assistant does not submit attendance
            to your employer.
          </p>
        </aside>

        <div className="min-w-0 px-5 py-8 sm:px-9 lg:px-10">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.18em] text-teal-700">
                My workspace
              </p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight">
                A little help for your workday.
              </h2>
              <p className="mt-3 text-sm text-slate-500">{dateLabel}</p>
            </div>
            <button
              type="button"
              disabled={loading || saving}
              onClick={() => setRefreshVersion((value) => value + 1)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? "Checking…" : "Refresh attendance"}
            </button>
          </header>

          <section className="mt-7 overflow-hidden rounded-3xl bg-[#112d3e] p-6 text-white sm:p-8">
            <div className="flex flex-col items-center gap-5 sm:flex-row">
              <Robot busy={loading || saving} />
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-teal-300">
                  Your attendance assistant
                </p>
                <h3 className="mt-3 text-2xl font-semibold">Hi Sankari!</h3>
                <p className="mt-3 max-w-xl text-base leading-7 text-slate-200">
                  {assistantMessage}
                </p>

                {!loading && !loadError && attendance &&
                  attendance.permission_minutes > 0 && (
                    <p className="mt-3 text-sm text-teal-200">
                      Today’s record uses one full hour of permission.
                    </p>
                  )}

                <p className="mt-4 text-xs text-slate-400">
                  Guidance based on your saved records and attendance rules.
                </p>
              </div>
            </div>
          </section>

          {loadError && (
            <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">
              {loadError}
            </p>
          )}

          {notice && (
            <p role="status" className="mt-5 rounded-xl bg-teal-50 p-4 text-sm text-teal-900">
              {notice}
            </p>
          )}

          <div className="mt-6 grid gap-5 xl:grid-cols-[1.3fr_1fr]">
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold">Today’s attendance</h3>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                  Manual records
                </span>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  ["Punch-in", attendance?.punch_in],
                  ["Expected finish", attendance?.expected_punch_out],
                  ["Actual punch-out", attendance?.actual_punch_out],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="mt-3 text-lg font-bold">
                      {loading ? "…" : loadError ? "Unavailable" : value ?? "Not recorded"}
                    </p>
                  </div>
                ))}
              </div>

              <p className="mt-5 text-xs leading-6 text-slate-500">
                Expected finish is a target. Actual punch-out remains empty
                until you record it.
              </p>

              {!loading && !loadError && !hasRecord && (
                <form onSubmit={handlePunchIn} className="mt-6 border-t border-slate-100 pt-5">
                  <label htmlFor="punch-in-time" className="text-sm font-semibold">
                    What time did you punch in?
                  </label>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                    <input
                      id="punch-in-time"
                      type="time"
                      required
                      disabled={saving}
                      value={punchInTime}
                      onChange={(event) => setPunchInTime(event.target.value)}
                      aria-describedby="punch-in-help"
                      className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                    />
                    <button
                      type="submit"
                      disabled={saving || !punchInTime}
                      className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50"
                    >
                      {saving ? "Saving…" : "Save punch-in"}
                    </button>
                  </div>
                  <p id="punch-in-help" className="mt-3 text-xs leading-6 text-slate-500">
                    Use your actual time. After 9:30 through 10:30 AM uses
                    one permission block if available.
                  </p>
                </form>
              )}

              {!loading && !loadError && hasRecord && (
                <div className="mt-5 rounded-xl border border-teal-100 bg-teal-50 p-4 text-sm text-teal-900">
                  {hasPunchIn
                    ? "Your saved punch-in is shown above. It stays available after refreshing."
                    : "An attendance record exists. Its missing punch-in requires correction."}
                </div>
              )}

              {saveError && (
                <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">
                  {saveError}
                </p>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                Monthly permission
              </p>
              <div className="mt-4 flex items-end gap-2">
                <span className="text-5xl font-bold tracking-tight">
                  {loading || loadError ? "—" : remaining}
                </span>
                <span className="pb-1 text-sm text-slate-500">hours remaining</span>
              </div>

              <div
                role="img"
                aria-label={
                  loading || loadError
                    ? "Permission balance unavailable"
                    : `${remaining} of 5 permission hours remaining`
                }
                className="mt-6 grid grid-cols-5 gap-2"
              >
                {Array.from({ length: 5 }, (_, index) => (
                  <div
                    key={index}
                    className={`h-3 rounded-full ${
                      !loading && !loadError && index < (remaining ?? 0)
                        ? "bg-teal-500"
                        : "bg-slate-100"
                    }`}
                  />
                ))}
              </div>

              <p className="mt-4 text-xs text-slate-500">
                Teal blocks show your remaining allowance.
              </p>

              <dl className="mt-6 space-y-3 border-t border-slate-100 pt-5 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Monthly allowance</dt>
                  <dd className="font-semibold">5 hours</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Maximum per day</dt>
                  <dd className="font-semibold">1 full hour</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-slate-500">Used today</dt>
                  <dd className="font-semibold">
                    {loading || loadError ? "—" : `${attendance?.permission_minutes ?? 0} minutes`}
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          <section className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-5">
            <h3 className="text-sm font-semibold">Windows companion · Coming next</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              A robot beside your Windows clock, with punch-in reminders at
              10:00 AM, 10:30 AM, and 11:00 AM until attendance is recorded.
              Desktop reminders are not active yet.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}