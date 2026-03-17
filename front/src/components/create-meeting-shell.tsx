"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { createMeeting } from "@/lib/api";
import type { CreateMeetingPayload } from "@/lib/types";
import { CalendarImport } from "@/components/calendar-import";
import type { CalendarImportResult } from "@/components/calendar-import";

interface ParticipantRow {
  id: string;
  name: string;
  role: string;
  isMe?: boolean;
}

let rowId = 0;
function nextRowId() {
  return `row-${++rowId}`;
}

function createEmptyRow(): ParticipantRow {
  return { id: nextRowId(), name: "", role: "" };
}

const STEPS = [
  { label: "회의 선택", number: 1 },
  { label: "상세 입력", number: 2 },
] as const;

export function CreateMeetingShell() {
  const router = useRouter();
  const { data: session } = useSession();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [participants, setParticipants] = useState<ParticipantRow[]>([
    createEmptyRow(),
  ]);
  const [calendarSelected, setCalendarSelected] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentStep = calendarSelected ? 2 : 1;

  // 로그인 유저를 참석자 첫 번째에 디폴트로 넣기
  useEffect(() => {
    if (!session?.user?.name) return;
    setParticipants((prev) => {
      const alreadyHasMe = prev.some((p) => p.isMe);
      if (alreadyHasMe) return prev;
      const meRow: ParticipantRow = {
        id: nextRowId(),
        name: session.user?.name || "",
        role: "",
        isMe: true,
      };
      if (prev.length === 1 && !prev[0].name && !prev[0].role) {
        return [meRow];
      }
      return [meRow, ...prev];
    });
  }, [session?.user?.name]);

  function handleCalendarImport(result: CalendarImportResult) {
    setTitle(result.title);
    const plainDesc = result.description
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();
    setDescription(plainDesc);
    const myEmail = session?.user?.email?.toLowerCase();
    const myName = session?.user?.name || "";
    const rows: ParticipantRow[] = result.attendees
      .filter((a) => a.email.toLowerCase() !== myEmail)
      .map((a) => ({
        id: nextRowId(),
        name: a.name,
        role: "",
      }));
    const meRow: ParticipantRow = {
      id: nextRowId(),
      name: myName,
      role: "",
      isMe: true,
    };
    const allRows = [meRow, ...rows];
    if (allRows.length === 0) allRows.push(createEmptyRow());
    setParticipants(allRows);
    setCalendarSelected(true);
  }

  function handleResetSelection() {
    setCalendarSelected(false);
    setTitle("");
    setDescription("");
    setParticipants([createEmptyRow()]);
  }

  function updateParticipant(id: string, field: "name" | "role", value: string) {
    setParticipants((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    );
  }

  function removeParticipant(id: string) {
    setParticipants((prev) => {
      const next = prev.filter((p) => p.id !== id);
      return next.length === 0 ? [createEmptyRow()] : next;
    });
  }

  function addParticipant() {
    setParticipants((prev) => [...prev, createEmptyRow()]);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validParticipants = participants.filter(
      (p) => p.name.trim() || p.role.trim(),
    );
    const participantRoles = validParticipants.map((p) => {
      const n = p.name.trim();
      const r = p.role.trim();
      if (n && r) return `${n} (${r})`;
      return n || r;
    });

    const payload: CreateMeetingPayload = {
      title,
      description,
      agenda_items: [],
      background_material: description,
      participant_roles: participantRoles,
    };

    try {
      setSubmitting(true);
      const created = await createMeeting(payload);
      router.push(`/meetings/${created.id}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "미팅을 생성하지 못했습니다.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-2xl flex-col gap-6">
      {/* Header */}
      <header>
        <button
          type="button"
          className="button-ghost mb-3 w-fit text-xs"
          onClick={() => router.push("/")}
        >
          &larr; 미팅 목록
        </button>
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-[var(--text-primary)] sm:text-3xl">
          새 미팅 생성
        </h1>
      </header>

      {/* Step indicator */}
      <div className="flex items-center gap-3">
        {STEPS.map((step, i) => (
          <div key={step.number} className="flex items-center gap-3">
            {i > 0 && (
              <div
                className={`h-px w-8 transition-colors ${
                  currentStep >= step.number
                    ? "bg-[var(--accent-primary)]"
                    : "bg-[var(--border-subtle)]"
                }`}
              />
            )}
            <div className="flex items-center gap-2">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  currentStep === step.number
                    ? "bg-[var(--accent-primary)] text-white"
                    : currentStep > step.number
                      ? "bg-[var(--accent-primary)]/20 text-[var(--accent-primary)]"
                      : "bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]"
                }`}
              >
                {currentStep > step.number ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
                  step.number
                )}
              </div>
              <span
                className={`text-sm font-medium transition-colors ${
                  currentStep >= step.number
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-tertiary)]"
                }`}
              >
                {step.label}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="flex flex-1 flex-col">
        {!calendarSelected ? (
          <section className="panel flex flex-1 flex-col gap-5">
            <div className="space-y-1">
              <h2 className="section-title text-lg">Google 캘린더에서 회의를 선택하세요</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                제목, 참석자, 메모가 자동으로 채워집니다.
              </p>
            </div>
            <div className="flex-1">
              <CalendarImport onImport={handleCalendarImport} />
            </div>
          </section>
        ) : (
          <form className="panel flex flex-col gap-5" onSubmit={handleSubmit}>
            <div className="flex items-center justify-between">
              <h2 className="section-title text-lg">참석자 역할을 지정하고 생성하세요</h2>
              <button
                type="button"
                className="button-ghost text-xs"
                onClick={handleResetSelection}
              >
                다른 회의 선택
              </button>
            </div>

            <label className="field-group">
              <span className="field-label">미팅 제목</span>
              <input
                className="input-shell"
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 개인정보 마스킹 정책 정렬"
                value={title}
              />
            </label>

            <label className="field-group">
              <span className="field-label">미팅 설명</span>
              <textarea
                className="textarea-shell"
                onChange={(e) => setDescription(e.target.value)}
                placeholder="이번 미팅에서 어떤 문제를 정렬해야 하는지 적어 주세요."
                rows={3}
                value={description}
              />
            </label>

            {/* Participants list */}
            <div className="field-group">
              <div className="flex items-center justify-between">
                <span className="field-label">참석자</span>
                <button type="button" className="button-ghost text-xs" onClick={addParticipant}>
                  + 추가
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-[1fr_1fr_28px] gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">이름</span>
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">역할</span>
                  <span />
                </div>
                {participants.map((p) => (
                  <div key={p.id} className="grid grid-cols-[1fr_1fr_28px] items-center gap-2">
                    <div className="relative">
                      <input
                        className="input-shell"
                        placeholder="홍길동"
                        value={p.name}
                        onChange={(e) => updateParticipant(p.id, "name", e.target.value)}
                      />
                      {p.isMe && (
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded bg-[var(--accent-primary)] px-1.5 py-0.5 text-[9px] font-semibold text-white">
                          나
                        </span>
                      )}
                    </div>
                    <input
                      className="input-shell"
                      placeholder={p.isMe ? "내 역할을 입력하세요" : "PO, BE, 디자이너..."}
                      value={p.role}
                      onChange={(e) => updateParticipant(p.id, "role", e.target.value)}
                      autoFocus={p.isMe}
                    />
                    <button
                      type="button"
                      className="flex h-7 w-7 items-center justify-center rounded text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-secondary)]"
                      onClick={() => removeParticipant(p.id)}
                      title="삭제"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {error ? <div className="error-banner">{error}</div> : null}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button className="button-primary" disabled={submitting} type="submit">
                {submitting ? "생성 중..." : "미팅 생성"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
