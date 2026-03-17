"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listMeetings } from "@/lib/api";
import { resolveRoleTheme } from "@/lib/role-theme";
import type { MeetingSummary } from "@/lib/types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function DashboardShell() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadMeetings() {
      try {
        setLoading(true);
        const data = await listMeetings();
        if (cancelled) return;
        startTransition(() => {
          setMeetings(data);
          setError(null);
        });
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "미팅 목록을 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadMeetings();
    return () => { cancelled = true; };
  }, []);

  async function handleRefresh() {
    try {
      setLoading(true);
      const data = await listMeetings();
      startTransition(() => {
        setMeetings(data);
        setError(null);
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "미팅 목록을 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Meeting Alignment AI</span>
          <h1 className="max-w-2xl text-3xl font-bold tracking-[-0.03em] text-[var(--text-primary)] sm:text-4xl lg:text-5xl">
            모두가 같은 페이지에 있는 회의.
          </h1>
          <p className="max-w-xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
            미팅 주제와 역할만 입력하면 역할별 브리핑, 회의 중 실시간 Q&A, 개인
            맞춤 보조설명까지 한 흐름으로 연결됩니다.
          </p>
        </div>
        <button
          className="button-primary shrink-0"
          onClick={() => router.push("/meetings/new")}
          type="button"
        >
          새 미팅
        </button>
      </header>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="metric-card">
          <span className="metric-value">{meetings.length}</span>
          <span className="metric-label">등록된 미팅</span>
        </div>
        <div className="metric-card">
          <span className="metric-value">
            {meetings.reduce((s, m) => s + m.briefing_ready_count, 0)}
          </span>
          <span className="metric-label">생성된 브리핑</span>
        </div>
        <div className="metric-card">
          <span className="metric-value">
            {meetings.reduce((s, m) => s + m.participant_role_count, 0)}
          </span>
          <span className="metric-label">역할 슬롯</span>
        </div>
      </div>

      {/* Meeting list */}
      <section className="panel flex flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">최근 미팅</h2>
          <button
            className="button-ghost text-xs"
            onClick={() => void handleRefresh()}
            type="button"
          >
            새로고침
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="grid gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div className="skeleton-card" key={i} />
            ))}
          </div>
        ) : meetings.length === 0 ? (
          <div className="empty-state">
            아직 생성된 미팅이 없습니다.<br />
            상단의 &ldquo;새 미팅&rdquo; 버튼으로 첫 미팅을 만들어 보세요.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {meetings.map((meeting) => (
              <button
                className="meeting-row text-left"
                key={meeting.id}
                onClick={() => router.push(`/meetings/${meeting.id}`)}
                type="button"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
                        {meeting.title}
                      </h3>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        {formatDate(meeting.created_at)}
                      </p>
                    </div>
                    <div className="status-pill">
                      {meeting.briefing_ready_count}/{meeting.briefing_total_count} 브리핑
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {meeting.participant_roles.map((role) => {
                      const theme = resolveRoleTheme(role);
                      return (
                        <span
                          className="role-chip"
                          key={role}
                          style={{
                            background: theme.background,
                            borderColor: theme.border,
                            color: theme.text,
                          }}
                        >
                          {role}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
