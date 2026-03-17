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
  return meeting?.briefings.find((b) => b.role === role) ?? null;
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
    async function load() {
      try {
        setLoading(true);
        const detail = await getMeeting(meetingId);
        if (cancelled) return;
        startTransition(() => {
          setMeeting(detail);
          setActiveRole((c) => c || detail.participant_roles[0] || "");
          setError(null);
        });
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "미팅 정보를 불러오지 못했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [meetingId]);

  async function handleGenerateBriefings() {
    if (!meeting) return;
    setGenerating(true);
    setGenerationCursor(0);
    try {
      for (let i = 0; i < meeting.participant_roles.length; i++) {
        const role = meeting.participant_roles[i];
        const briefing = await generateSingleBriefing(meetingId, role);
        startTransition(() => {
          setMeeting((prev) => {
            if (!prev) return prev;
            const next = prev.briefings.map((b) => (b.role === role ? briefing : b));
            return { ...prev, briefings: next };
          });
          setGenerationCursor(i + 1);
        });
      }
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "브리핑 생성에 실패했습니다.");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
<<<<<<< Updated upstream
      <div className="flex flex-col gap-5">
        <div className="panel h-20 animate-pulse" />
        <div className="panel h-64 animate-pulse" />
=======
      <div className="flex flex-col gap-6">
        <div className="panel h-64 animate-pulse" />
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="panel h-80 animate-pulse" />
          <div className="panel h-80 animate-pulse" />
        </div>
>>>>>>> Stashed changes
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="flex items-center justify-center py-12">
<<<<<<< Updated upstream
        <div className="empty-state max-w-md text-center">
=======
        <div className="empty-state max-w-xl text-center">
>>>>>>> Stashed changes
          {error ?? "미팅 정보를 찾을 수 없습니다."}
        </div>
      </div>
    );
  }

  const activeBriefing = findBriefing(meeting, activeRole);
  const readyCount = meeting.briefings.filter((b) => b.status === "ready").length;

  return (
<<<<<<< Updated upstream
    <div className="flex flex-col gap-5">
=======
    <div className="flex flex-col gap-6">
>>>>>>> Stashed changes
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)]">
            {meeting.title}
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            {meeting.description || "설명 없음"}
            <span className="ml-2 text-xs text-[var(--text-tertiary)]">
              {formatDate(meeting.created_at)}
            </span>
          </p>
        </div>
        <button
          className="button-primary shrink-0"
          onClick={() => router.push(`/meetings/${meeting.id}/session`)}
          type="button"
        >
          세션 시작
        </button>
      </div>

      {/* Agenda + Background collapsible */}
      {(meeting.agenda_items.length > 0 || meeting.background_material) && (
        <div className="flex flex-col gap-3">
          {meeting.agenda_items.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {meeting.agenda_items.map((item) => (
                <span className="agenda-pill" key={item}>{item}</span>
              ))}
            </div>
          )}
          {meeting.background_material && (
            <details className="sub-panel">
              <summary className="cursor-pointer text-sm font-medium text-[var(--text-secondary)]">
                배경자료 보기
              </summary>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--text-secondary)]">
                {meeting.background_material}
              </p>
            </details>
          )}
        </div>
      )}

      {/* Briefing section */}
      <section className="panel flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="section-title">브리핑</h2>
            <span className="status-pill">
              {readyCount}/{meeting.participant_roles.length}
            </span>
          </div>
          <button
            className="button-primary"
            disabled={generating}
            onClick={() => void handleGenerateBriefings()}
            type="button"
          >
            {generating ? "생성 중..." : "브리핑 생성"}
          </button>
        </div>

        {/* Progress */}
        {generating && (
          <div className="progress-wrap">
            <div className="progress-track">
              <div
                className="progress-bar"
                style={{
                  width: `${(generationCursor / Math.max(meeting.participant_roles.length, 1)) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Role tabs */}
        <div className="flex flex-wrap gap-1.5">
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
            const isActive = activeRole === role;

            return (
              <button
                key={role}
                onClick={() => setActiveRole(role)}
                type="button"
                className="role-chip transition-all"
                style={{
                  background: isActive ? theme.background : "transparent",
                  borderColor: isActive ? theme.border : "var(--border-soft)",
                  color: isActive ? theme.text : "var(--text-tertiary)",
                  opacity: isActive ? 1 : 0.65,
                }}
              >
                {role}
                <span
                  className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: statusTone(visualStatus) }}
                />
              </button>
            );
          })}
        </div>

        {error && <div className="error-banner">{error}</div>}

        {/* Briefing content */}
        {activeBriefing?.status === "ready" ? (
          <div className="flex flex-col gap-4">
            <div className="sub-panel">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">핵심 요약</h3>
              <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
                {activeBriefing.summary}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <BriefingListCard items={activeBriefing.background_knowledge} title="배경지식" />
              <BriefingListCard items={activeBriefing.discussion_points} title="논의 포인트" />
            </div>

            {activeBriefing.glossary.length > 0 && (
              <div className="sub-panel">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">용어</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {activeBriefing.glossary.map((item) => (
                    <div key={item.term} className="flex flex-col gap-1 rounded-lg border border-[var(--border-soft)] p-3">
                      <span className="glossary-term">{item.term}</span>
                      <span className="text-xs leading-5 text-[var(--text-secondary)]">
                        {item.explanation}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state">
            {generating
              ? "브리핑을 생성하고 있습니다..."
              : "브리핑 생성 버튼을 눌러 역할별 준비 자료를 만드세요."}
          </div>
        )}
      </section>
    </div>
  );
}

function BriefingListCard({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  return (
    <div className="sub-panel">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      <div className="mt-2 flex flex-col gap-1.5">
        {items.map((item) => (
          <div className="info-row" key={item}>{item}</div>
        ))}
      </div>
    </div>
  );
}
