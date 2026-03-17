"use client";

import { startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createMeeting, listMeetings } from "@/lib/api";
import { resolveRoleTheme } from "@/lib/role-theme";
import type { CreateMeetingPayload, MeetingSummary } from "@/lib/types";

const defaultForm = {
  title: "",
  description: "",
  agenda: "",
  background: "",
  roles: "PO\nBE 개발자\n디자이너\n법무",
};

function splitMultiline(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function DashboardShell() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<MeetingSummary[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMeetings() {
      try {
        setLoading(true);
        const nextMeetings = await listMeetings();
        if (cancelled) {
          return;
        }
        startTransition(() => {
          setMeetings(nextMeetings);
          setError(null);
        });
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error ? cause.message : "미팅 목록을 불러오지 못했습니다.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadMeetings();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRefreshMeetings() {
    try {
      setLoading(true);
      const nextMeetings = await listMeetings();
      startTransition(() => {
        setMeetings(nextMeetings);
        setError(null);
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "미팅 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: CreateMeetingPayload = {
      title: form.title,
      description: form.description,
      agenda_items: splitMultiline(form.agenda),
      background_material: form.background,
      participant_roles: splitMultiline(form.roles),
    };

    try {
      setSubmitting(true);
      const created = await createMeeting(payload);
      router.push(`/meetings/${created.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "미팅을 생성하지 못했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <section className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="panel overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(108,123,242,0.18),transparent_42%),radial-gradient(circle_at_90%_20%,rgba(96,165,250,0.12),transparent_26%)]" />
          <div className="relative flex h-full flex-col gap-6">
            <div className="flex flex-col gap-4">
              <span className="eyebrow">Meeting Alignment AI</span>
              <div className="space-y-3">
                <h1 className="max-w-2xl text-4xl font-semibold tracking-[-0.03em] text-[var(--text-primary)] sm:text-5xl">
                  모두가 같은 페이지에 있는 회의.
                </h1>
                <p className="max-w-2xl text-sm leading-7 text-[var(--text-secondary)] sm:text-base">
                  미팅 주제와 역할만 입력하면 역할별 브리핑, 회의 중 실시간 Q&A,
                  개인 맞춤 보조설명까지 한 흐름으로 연결됩니다.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="metric-card">
                <span className="metric-value">{meetings.length}</span>
                <span className="metric-label">등록된 미팅</span>
              </div>
              <div className="metric-card">
                <span className="metric-value">
                  {meetings.reduce(
                    (sum, meeting) => sum + meeting.briefing_ready_count,
                    0,
                  )}
                </span>
                <span className="metric-label">생성된 브리핑</span>
              </div>
              <div className="metric-card">
                <span className="metric-value">
                  {meetings.reduce(
                    (sum, meeting) => sum + meeting.participant_role_count,
                    0,
                  )}
                </span>
                <span className="metric-label">역할 슬롯</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="section-title">최근 미팅</h2>
                <button
                  className="button-ghost text-xs"
                  onClick={() => void handleRefreshMeetings()}
                  type="button"
                >
                  새로고침
                </button>
              </div>

              {loading ? (
                <div className="grid gap-3">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div className="skeleton-card" key={index} />
                  ))}
                </div>
              ) : meetings.length === 0 ? (
                <div className="empty-state">
                  아직 생성된 미팅이 없습니다. 우측 폼에서 첫 미팅을 만들어 보세요.
                </div>
              ) : (
                <div className="scroll-area flex max-h-[32rem] flex-col gap-3 pr-1">
                  {meetings.map((meeting) => (
                    <button
                      className="meeting-row"
                      key={meeting.id}
                      onClick={() => router.push(`/meetings/${meeting.id}`)}
                      type="button"
                    >
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-1 text-left">
                            <h3 className="text-base font-semibold text-[var(--text-primary)]">
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
            </div>
          </div>
        </div>

        <form className="panel flex flex-col gap-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <span className="eyebrow">Create Meeting</span>
            <h2 className="section-title text-2xl">새 미팅 생성</h2>
            <p className="text-sm leading-6 text-[var(--text-secondary)]">
              주제, 안건, 배경자료와 역할 목록을 입력하면 이후 브리핑 생성과
              세션 보조의 기반 데이터가 됩니다.
            </p>
          </div>

          <label className="field-group">
            <span className="field-label">미팅 제목</span>
            <input
              className="input-shell"
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              placeholder="예: 개인정보 마스킹 정책 정렬"
              value={form.title}
            />
          </label>

          <label className="field-group">
            <span className="field-label">미팅 설명</span>
            <textarea
              className="textarea-shell"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="이번 미팅에서 어떤 문제를 정렬해야 하는지 적어 주세요."
              rows={3}
              value={form.description}
            />
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="field-group">
              <span className="field-label">안건 목록</span>
              <textarea
                className="textarea-shell"
                onChange={(event) =>
                  setForm((current) => ({ ...current, agenda: event.target.value }))
                }
                placeholder={"한 줄에 하나씩 입력\n예: PII 마스킹 정책\n예: API 응답 필드 정리"}
                rows={6}
                value={form.agenda}
              />
            </label>

            <label className="field-group">
              <span className="field-label">참석자 역할</span>
              <textarea
                className="textarea-shell"
                onChange={(event) =>
                  setForm((current) => ({ ...current, roles: event.target.value }))
                }
                placeholder={"한 줄에 하나씩 입력\n예: PO\n예: BE 개발자\n예: 법무"}
                rows={6}
                value={form.roles}
              />
            </label>
          </div>

          <label className="field-group">
            <span className="field-label">배경자료</span>
            <textarea
              className="textarea-shell"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  background: event.target.value,
                }))
              }
              placeholder="회의 전에 공유해야 할 배경 설명이나 현황을 입력해 주세요."
              rows={6}
              value={form.background}
            />
          </label>

          {error ? <div className="error-banner">{error}</div> : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-6 text-[var(--text-tertiary)]">
              저장 직후 상세 화면으로 이동합니다.
            </p>
            <button
              className="button-primary"
              disabled={submitting}
              type="submit"
            >
              {submitting ? "생성 중..." : "미팅 생성"}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
