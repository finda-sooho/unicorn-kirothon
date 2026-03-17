"use client";

import { useEffect, useRef, useState } from "react";
import { loadGlobalProfile, saveGlobalProfile, type GlobalProfile } from "@/lib/profile-store";
import { resolveRoleTheme } from "@/lib/role-theme";
import type { CustomField } from "@/lib/types";

const availableRoles = ["PO", "BE 개발자", "FE 개발자", "디자이너", "법무", "QA"];

type ProfileDraft = {
  role: string;
  expertise: string;
  gaps: string;
  customFields: CustomField[];
};

function splitLines(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function streamSuggest(
  role: string,
  abortSignal: AbortSignal,
  onChunk: (accumulated: string) => void,
) {
  const res = await fetch("/api/profile/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
    signal: abortSignal,
  });

  if (!res.ok || !res.body) {
    throw new Error("추천 생성에 실패했습니다.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    accumulated += decoder.decode(value, { stream: true });
    onChunk(accumulated);
  }

  return accumulated;
}

function parseSuggestion(raw: string): { expertise: string[]; gaps: string[] } | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return {
      expertise: Array.isArray(parsed.expertise) ? parsed.expertise : [],
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
    };
  } catch {
    return null;
  }
}

export default function ProfilePage() {
  const [draft, setDraft] = useState<ProfileDraft>({
    role: "",
    expertise: "",
    gaps: "",
    customFields: [{ label: "", value: "" }],
  });
  const [saved, setSaved] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [streamText, setStreamText] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const profile = loadGlobalProfile();
    setDraft({
      role: profile.role,
      expertise: profile.expertise_areas.join("\n"),
      gaps: profile.knowledge_gaps.join("\n"),
      customFields:
        profile.custom_fields.length > 0
          ? profile.custom_fields
          : [{ label: "", value: "" }],
    });
    setLastSaved(profile.updated_at);
  }, []);

  async function handleRoleSelect(role: string) {
    // Cancel previous request
    abortRef.current?.abort();

    setDraft((c) => ({ ...c, role }));
    setSuggesting(true);
    setStreamText("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const final = await streamSuggest(role, controller.signal, (chunk) => {
        setStreamText(chunk);
      });

      const parsed = parseSuggestion(final);
      if (parsed) {
        setDraft((c) => ({
          ...c,
          expertise: parsed.expertise.join("\n"),
          gaps: parsed.gaps.join("\n"),
        }));
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Suggest failed:", err);
      }
    } finally {
      setSuggesting(false);
      setStreamText("");
    }
  }

  function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const profile: GlobalProfile = {
      role: draft.role,
      expertise_areas: splitLines(draft.expertise),
      knowledge_gaps: splitLines(draft.gaps),
      custom_fields: draft.customFields.filter(
        (f) => f.label.trim() || f.value.trim(),
      ),
      updated_at: null,
    };
    saveGlobalProfile(profile);
    setLastSaved(new Date().toISOString());
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // Parse partial stream for live preview
  const partialParsed = suggesting ? parseSuggestion(streamText) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <span className="eyebrow">My Profile</span>
        <h1 className="text-2xl font-bold tracking-[-0.03em] text-[var(--text-primary)] sm:text-3xl">
          내 프로필
        </h1>
        <p className="max-w-xl text-sm leading-7 text-[var(--text-secondary)]">
          여기서 설정한 프로필은 미팅 세션 진입 시 자동으로 적용됩니다.
        </p>
      </div>

      <form className="panel flex max-w-2xl flex-col gap-6" onSubmit={handleSave}>
        {/* ── 그룹 1: 역할 선택 ── */}
        <fieldset className="space-y-3 rounded-2xl border border-[var(--border-soft)] p-4">
          <legend className="field-label px-2">역할</legend>
          <div className="flex flex-wrap gap-2">
            {availableRoles.map((role) => {
              const theme = resolveRoleTheme(role);
              const isSelected = draft.role === role;
              return (
                <button
                  className="role-chip transition-all"
                  key={role}
                  onClick={() => handleRoleSelect(role)}
                  style={{
                    background: isSelected ? theme.background : "transparent",
                    borderColor: isSelected ? theme.border : "var(--border-soft)",
                    color: isSelected ? theme.text : "var(--text-tertiary)",
                    opacity: isSelected ? 1 : 0.7,
                  }}
                  type="button"
                >
                  {role}
                </button>
              );
            })}
          </div>
          {draft.role && (
            <p
              className="text-xs leading-5"
              style={{ color: resolveRoleTheme(draft.role).text }}
            >
              {suggesting
                ? `${draft.role} 역할에 맞는 프로필을 추천하고 있습니다...`
                : `${draft.role} 역할로 맞춤 보조를 받습니다.`}
            </p>
          )}
        </fieldset>

        {/* ── 그룹 2: 역량 ── */}
        <fieldset className="relative space-y-4 rounded-2xl border border-[var(--border-soft)] p-4">
          <legend className="field-label px-2">역량</legend>

          {suggesting && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-[var(--bg-secondary)]/80 backdrop-blur-sm">
              <div className="flex max-w-md flex-col items-center gap-3 px-6 text-center">
                <div className="h-1 w-32 overflow-hidden rounded-full bg-[var(--border-soft)]">
                  <div className="h-full animate-[shimmer_1.2s_ease-in-out_infinite] rounded-full bg-[var(--accent)]" />
                </div>
                <p className="text-sm text-[var(--text-secondary)]">AI가 추천 중...</p>
                {partialParsed && (
                  <div className="mt-1 flex flex-wrap justify-center gap-1.5">
                    {partialParsed.expertise.map((item, i) => (
                      <span
                        key={i}
                        className="inline-block rounded-md bg-[var(--accent-soft)] px-2 py-0.5 text-xs text-[var(--accent)]"
                      >
                        {item}
                      </span>
                    ))}
                    {partialParsed.gaps.map((item, i) => (
                      <span
                        key={`g-${i}`}
                        className="inline-block rounded-md bg-[rgba(245,158,11,0.08)] px-2 py-0.5 text-xs text-[var(--warning)]"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <label className="field-group">
              <span className="text-xs font-medium text-[var(--text-secondary)]">잘 아는 분야</span>
              <textarea
                className="textarea-shell"
                rows={4}
                placeholder={"한 줄에 하나씩\n예: API 설계\n예: 장애 대응"}
                value={draft.expertise}
                onChange={(e) =>
                  setDraft((c) => ({ ...c, expertise: e.target.value }))
                }
              />
            </label>
            <label className="field-group">
              <span className="text-xs font-medium text-[var(--text-secondary)]">부족한 영역</span>
              <textarea
                className="textarea-shell"
                rows={4}
                placeholder={"한 줄에 하나씩\n예: PII\n예: 보관 정책"}
                value={draft.gaps}
                onChange={(e) =>
                  setDraft((c) => ({ ...c, gaps: e.target.value }))
                }
              />
            </label>
          </div>
        </fieldset>

        {/* ── 그룹 3: 추가 정보 ── */}
        <fieldset className="space-y-3 rounded-2xl border border-[var(--border-soft)] p-4">
          <div className="flex items-center justify-between">
            <legend className="field-label px-2">추가 정보</legend>
            <button
              type="button"
              className="button-ghost text-xs"
              onClick={() =>
                setDraft((c) => ({
                  ...c,
                  customFields: [...c.customFields, { label: "", value: "" }],
                }))
              }
            >
              + 필드 추가
            </button>
          </div>
          <div className="grid gap-3">
            {draft.customFields.map((field, index) => (
              <div
                className="grid gap-3 md:grid-cols-[0.9fr_1.1fr_auto]"
                key={`${index}-${field.label}`}
              >
                <input
                  className="input-shell"
                  placeholder="필드 이름"
                  value={field.label}
                  onChange={(e) =>
                    setDraft((c) => ({
                      ...c,
                      customFields: c.customFields.map((f, i) =>
                        i === index ? { ...f, label: e.target.value } : f,
                      ),
                    }))
                  }
                />
                <input
                  className="input-shell"
                  placeholder="값"
                  value={field.value}
                  onChange={(e) =>
                    setDraft((c) => ({
                      ...c,
                      customFields: c.customFields.map((f, i) =>
                        i === index ? { ...f, value: e.target.value } : f,
                      ),
                    }))
                  }
                />
                <button
                  type="button"
                  className="button-ghost text-xs"
                  onClick={() =>
                    setDraft((c) => ({
                      ...c,
                      customFields:
                        c.customFields.length > 1
                          ? c.customFields.filter((_, i) => i !== index)
                          : [{ label: "", value: "" }],
                    }))
                  }
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        </fieldset>

        {/* 저장 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-soft)] pt-4">
          <span className="text-xs text-[var(--text-tertiary)]">
            {lastSaved
              ? `마지막 저장: ${new Intl.DateTimeFormat("ko-KR", {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(lastSaved))}`
              : "아직 저장된 프로필이 없습니다"}
          </span>
          <button className="button-primary" disabled={suggesting} type="submit">
            {saved ? "저장 완료!" : "프로필 저장"}
          </button>
        </div>
      </form>
    </div>
  );
}
