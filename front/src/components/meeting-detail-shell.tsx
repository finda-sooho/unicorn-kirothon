"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { generateSingleBriefing, getMeeting } from "@/lib/api";
import { resolveRoleTheme } from "@/lib/role-theme";
import type { Briefing, BriefingStatus, MeetingDetail } from "@/lib/types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: BriefingStatus | "queued") {
  switch (status) {
    case "ready":
      return "완료";
    case "generating":
      return "생성 중";
    case "failed":
      return "실패";
    case "queued":
      return "대기";
    default:
      return "미생성";
  }
}

function statusTone(status: BriefingStatus | "queued") {
  switch (status) {
    case "ready":
      return "var(--success)";
    case "failed":
      return "var(--error)";
    case "generating":
      return "var(--accent)";
    case "queued":
      return "var(--text-tertiary)";
    default:
      return "var(--text-secondary)";
  }
}

function findBriefing(meeting: MeetingDetail | null, role: string) {
  return meeting?.briefings.find((briefing) => briefing.role === role) ?? null;
}

export function MeetingDetailShell({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [activeRole, setActiveRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generationCursor, setGenerationCursor] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMeeting() {
      try {
        setLoading(true);
        const detail = await getMeeting(meetingId);
        if (cancelled) {
          return;
        }
        startTransition(() => {
          setMeeting(detail);
          setActiveRole((current) => current || detail.participant_roles[0] || "");
          setError(null);
        });
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : "미팅 정보를 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadMeeting();

    return () => {
      cancelled = true;
    };
  }, [meetingId]);

  async function handleGenerateBriefings() {
    if (!meeting) {
      return;
    }

    setGenerating(true);
    setGenerationCursor(0);

    try {
      for (let i = 0; i < meeting.participant_roles.length; i++) {
        const role = meeting.participant_roles[i];
        const briefing = await generateSingleBriefing(meetingId, role);
        startTransition(() => {
          setMeeting((prev) => {
            if (!prev) return prev;
            const nextBriefings = prev.briefings.map((b) =>
              b.role === role ? briefing : b,
            );
            return { ...prev, briefings: nextBriefings };
          });
          setGenerationCursor(i + 1);
        });
      }
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "브리핑 생성에 실패했습니다. 다시 시도해 주세요.",
      );
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <div className="panel h-64 animate-pulse" />
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="panel h-80 animate-pulse" />
          <div className="panel h-80 animate-pulse" />
        </div>
      </main>
    );
  }

  if (!meeting) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-4 py-12">
        <div className="empty-state max-w-xl text-center">
          {error ?? "미팅 정보를 찾을 수 없습니다."}
        </div>
      </main>
    );
  }

  const activeBriefing = findBriefing(meeting, activeRole);
  const readyCount = meeting.briefings.filter(
    (briefing) => briefing.status === "ready",
  ).length;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      {/* Header */}
      <section className="panel">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <span className="eyebrow">Meeting Detail</span>
              <h1 className="text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)] sm:text-3xl">
                {meeting.title}
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-[var(--text-secondary)]">
                {meeting.description || "설명이 아직 입력되지 않았습니다."}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                className="button-secondary"
                onClick={() => router.push("/")}
                type="button"
              >
                대시보드
              </button>
              <button
                className="button-primary"
                onClick={() => router.push(`/meetings/${meeting.id}/session`)}
                type="button"
              >
                미팅 세션 시작
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="metric-card">
              <span className="metric-value">{meeting.participant_roles.length}</span>
              <span className="metric-label">참석자 역할</span>
            </div>
            <div className="metric-card">
              <span className="metric-value">
                {readyCount}/{meeting.participant_roles.length}
              </span>
              <span className="metric-label">브리핑 생성 상태</span>
            </div>
            <div className="metric-card">
              <span className="metric-value">{meeting.profiles.length}</span>
              <span className="metric-label">저장된 프로필</span>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="sub-panel">
              <h2 className="section-title">안건</h2>
              <div className="mt-3 flex flex-col gap-2">
                {meeting.agenda_items.length > 0 ? (
                  meeting.agenda_items.map((item) => (
                    <div className="agenda-row" key={item}>
                      {item}
                    </div>
                  ))
                ) : (
                  <div className="empty-inline">등록된 안건이 없습니다.</div>
                )}
              </div>
            </div>

            <div className="sub-panel">
              <h2 className="section-title">배경자료</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--text-secondary)]">
                {meeting.background_material || "배경자료가 아직 없습니다."}
              </p>
              <p className="mt-4 text-xs text-[var(--text-tertiary)]">
                생성일시 {formatDate(meeting.created_at)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Briefings */}
      <section className="grid gap-6 lg:grid-cols-[0.76fr_1.24fr]">
        <div className="panel flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="section-title">역할별 브리핑</h2>
            <button
              className="button-primary"
              disabled={generating}
              onClick={() => void handleGenerateBriefings()}
              type="button"
            >
              {generating ? "생성 중..." : "브리핑 생성"}
            </button>
          </div>

          {generating ? (
            <div className="progress-wrap">
              <div className="progress-track">
                <div
                  className="progress-bar"
                  style={{
                    width: `${
                      (generationCursor / Math.max(meeting.participant_roles.length, 1)) * 100
                    }%`,
                  }}
                />
              </div>
              <p className="text-xs text-[var(--text-tertiary)]">
                역할별 브리핑을 순차적으로 생성하고 있습니다.
              </p>
            </div>
          ) : null}

          <div className="grid gap-3">
            {meeting.participant_roles.map((role, index) => {
              const theme = resolveRoleTheme(role);
              const briefing = findBriefing(meeting, role);
              const visualStatus: BriefingStatus | "queued" = generating
                ? index < generationCursor
                  ? briefing?.status ?? "ready"
                  : index === generationCursor
                    ? "generating"
                    : "queued"
                : briefing?.status ?? "idle";

              return (
                <button
                  className={`briefing-list-row ${
                    activeRole === role ? "briefing-list-row-active" : ""
                  }`}
                  key={role}
                  onClick={() => setActiveRole(role)}
                  type="button"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="role-chip"
                      style={{
                        background: theme.background,
                        borderColor: theme.border,
                        color: theme.text,
                      }}
                    >
                      {role}
                    </span>
                  </div>
                  <span
                    className="status-pill"
                    style={{ color: statusTone(visualStatus) }}
                  >
                    {statusLabel(visualStatus)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Briefing view */}
        <div className="panel flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <span className="eyebrow">Briefing View</span>
              <h2 className="section-title text-xl">
                {activeRole || "역할 선택"}
              </h2>
            </div>
            {activeRole ? (
              <span
                className="role-chip"
                style={{
                  background: resolveRoleTheme(activeRole).background,
                  borderColor: resolveRoleTheme(activeRole).border,
                  color: resolveRoleTheme(activeRole).text,
                }}
              >
                {activeRole}
              </span>
            ) : null}
          </div>

          {error ? <div className="error-banner">{error}</div> : null}

          {activeBriefing?.status === "ready" ? (
            <div className="grid gap-4">
              <div className="sub-panel">
                <h3 className="section-title">핵심 요약</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
                  {activeBriefing.summary}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <BriefingListCard
                  items={activeBriefing.background_knowledge}
                  title="알아야 할 배경지식"
                />
                <BriefingListCard
                  items={activeBriefing.discussion_points}
                  title="예상 논의 포인트"
                />
              </div>

              <div className="sub-panel">
                <h3 className="section-title">관련 용어 설명</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {activeBriefing.glossary.length > 0 ? (
                    activeBriefing.glossary.map((item) => (
                      <div className="glossary-card" key={item.term}>
                        <span className="glossary-term">{item.term}</span>
                        <p className="text-sm leading-6 text-[var(--text-secondary)]">
                          {item.explanation}
                        </p>
                      </div>
                    ))
                  ) : (
                    <div className="empty-inline">용어 설명이 아직 없습니다.</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">
              {generating
                ? "선택한 역할의 브리핑을 생성하고 있습니다."
                : "브리핑 생성 버튼을 눌러 역할별 준비 자료를 만들어 주세요."}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function BriefingListCard({
  title,
  items,
}: {
  title: string;
  items: Briefing["background_knowledge"] | Briefing["discussion_points"];
}) {
  return (
    <div className="sub-panel">
      <h3 className="section-title">{title}</h3>
      <div className="mt-3 flex flex-col gap-2">
        {items.map((item) => (
          <div className="info-row" key={item}>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}
