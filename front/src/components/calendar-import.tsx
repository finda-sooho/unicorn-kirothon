"use client";

import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  attendees: Array<{ email: string; name?: string }>;
}

export interface CalendarAttendee {
  name: string;
  email: string;
}

export interface CalendarImportResult {
  title: string;
  description: string;
  attendees: CalendarAttendee[];
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
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 로그인 되어 있으면 자동으로 캘린더 로드
  useEffect(() => {
    if (status !== "authenticated") return;
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
  }, [status]);

  const handleSelect = (event: CalendarEvent) => {
    const attendees: CalendarAttendee[] = event.attendees.map((a) => ({
      name: a.name || a.email.split("@")[0],
      email: a.email,
    }));
    onImport({
      title: event.title,
      description: event.description,
      attendees,
      scheduledAt: event.start,
    });
  };

  // 미인증 상태
  if (status !== "authenticated") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--border-subtle)] py-8">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <p className="text-sm text-[var(--text-secondary)]">
          Google 캘린더에서 회의를 불러오세요
        </p>
        <button
          type="button"
          className="button-primary flex items-center gap-2 text-sm"
          onClick={() => signIn("google", { callbackUrl: "/" })}
        >
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Google 로그인
        </button>
      </div>
    );
  }

  // 로딩
  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-[var(--text-tertiary)]">다가오는 일정</span>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton-card" />
        ))}
      </div>
    );
  }

  // 에러
  if (error === "auth" || error === "scope") {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--border-subtle)] py-6">
        <p className="text-sm text-[var(--text-secondary)]">캘린더 권한이 필요합니다</p>
        <button
          type="button"
          className="button-ghost text-xs"
          onClick={() => signIn("google", { callbackUrl: "/" })}
        >
          다시 로그인하기
        </button>
      </div>
    );
  }

  if (error === "fail") {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-subtle)] py-6 text-center">
        <p className="text-sm text-[var(--text-secondary)]">캘린더를 불러올 수 없습니다</p>
      </div>
    );
  }

  // 일정 없음
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-subtle)] py-6 text-center">
        <p className="text-sm text-[var(--text-secondary)]">7일 내 예정된 일정이 없습니다</p>
      </div>
    );
  }

  // 일정 리스트
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-[var(--text-tertiary)]">
        회의를 선택하세요
      </span>
      <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
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
    </div>
  );
}
