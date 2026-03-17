"use client";

import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees: Array<{ email: string; name?: string }>;
}

export interface CalendarImportResult {
  title: string;
  participants: string[];
  scheduledAt: string;
}

interface Props {
  onImport: (result: CalendarImportResult) => void;
}

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"] as const;

function formatEventTime(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const date = d.getDate();
  const day = DAY_NAMES[d.getDay()];
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  return `${month}/${date}(${day}) ${hours}:${minutes}`;
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export function CalendarImport({ onImport }: Props) {
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch("/api/calendar?days=7")
      .then(async (r) => {
        if (r.status === 401) throw new Error("auth");
        if (r.status === 403) throw new Error("scope");
        if (!r.ok) throw new Error("fail");
        return r.json();
      })
      .then((data) => {
        setEvents(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [open]);

  const handleSelect = (event: CalendarEvent) => {
    const participants = event.attendees.map(
      (a) => a.name || a.email.split("@")[0],
    );
    onImport({
      title: event.title,
      participants,
      scheduledAt: event.start,
    });
    setOpen(false);
  };

  if (status !== "authenticated") {
    return (
      <button
        type="button"
        className="button-ghost flex items-center gap-2 text-xs"
        onClick={() => signIn("google", { callbackUrl: "/" })}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        Google 로그인 후 캘린더 가져오기
      </button>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        className="button-ghost flex items-center gap-2 text-xs"
        onClick={() => setOpen(true)}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        Google 캘린더에서 가져오기
      </button>
    );
  }

  return (
    <div className="panel flex flex-col gap-3 border border-[var(--border-subtle)]">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          다가오는 일정 (7일)
        </span>
        <button
          type="button"
          className="button-ghost text-xs"
          onClick={() => setOpen(false)}
        >
          닫기
        </button>
      </div>

      {loading && (
        <p className="py-4 text-center text-xs text-[var(--text-tertiary)]">
          캘린더 불러오는 중...
        </p>
      )}

      {error === "auth" && (
        <div className="py-4 text-center text-xs text-[var(--text-tertiary)]">
          로그인이 필요합니다
          <br />
          <button
            type="button"
            className="mt-2 text-[var(--accent-primary)] underline"
            onClick={() => signIn("google", { callbackUrl: "/" })}
          >
            Google 로그인하기
          </button>
        </div>
      )}

      {error === "scope" && (
        <div className="py-4 text-center text-xs text-[var(--text-tertiary)]">
          캘린더 권한이 필요합니다
          <br />
          <button
            type="button"
            className="mt-2 text-[var(--accent-primary)] underline"
            onClick={() => signIn("google", { callbackUrl: "/" })}
          >
            다시 로그인하기
          </button>
        </div>
      )}

      {error === "fail" && (
        <p className="py-4 text-center text-xs text-[var(--text-tertiary)]">
          캘린더를 불러올 수 없습니다
        </p>
      )}

      {!loading && !error && events.length === 0 && (
        <p className="py-4 text-center text-xs text-[var(--text-tertiary)]">
          7일 내 예정된 일정이 없습니다
        </p>
      )}

      {!loading && !error && events.length > 0 && (
        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {events.map((event) => (
            <button
              key={event.id}
              type="button"
              className="meeting-row text-left"
              onClick={() => handleSelect(event)}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-medium text-[var(--text-primary)]">
                  {event.title}
                </span>
                <span
                  className={`shrink-0 text-xs ${isToday(event.start) ? "font-semibold text-[var(--accent-primary)]" : "text-[var(--text-tertiary)]"}`}
                >
                  {isToday(event.start) ? "오늘 " : ""}
                  {formatEventTime(event.start)}
                </span>
              </div>
              {event.attendees.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {event.attendees.slice(0, 4).map((a) => (
                    <span
                      key={a.email}
                      className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]"
                    >
                      {a.name || a.email.split("@")[0]}
                    </span>
                  ))}
                  {event.attendees.length > 4 && (
                    <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
                      +{event.attendees.length - 4}
                    </span>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
