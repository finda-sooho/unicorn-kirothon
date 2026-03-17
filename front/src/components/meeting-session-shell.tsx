"use client";

import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

import {
  appendTranscript,
  askQuestion,
  getMeeting,
  getSessionState,
  saveProfile,
  startRecording,
  stopRecording,
} from "@/lib/api";
import { useDeepgramSTT, type DeepgramTranscriptEvent } from "@/lib/audio/use-deepgram-stt";
import { useAudioRecorder } from "@/lib/audio/use-audio-recorder";
import { loadGlobalProfile } from "@/lib/profile-store";
import { resolveRoleTheme } from "@/lib/role-theme";
import type {
  Annotation,
  ChatMessage,
  CustomField,
  MeetingDetail,
  SessionState,
  SuggestedTopic,
} from "@/lib/types";

type MobileTab = "script" | "chat" | "guide" | "settings";

type ProfileDraft = {
  role: string;
  expertise: string;
  gaps: string;
  customFields: CustomField[];
};

const emptyProfileDraft: ProfileDraft = {
  role: "",
  expertise: "",
  gaps: "",
  customFields: [{ label: "", value: "" }],
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}

function splitLines(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function initialProfileDraft(meeting: MeetingDetail | null, session: SessionState | null) {
  if (session?.knowledge_profile) {
    return {
      role: session.knowledge_profile.role,
      expertise: session.knowledge_profile.expertise_areas.join("\n"),
      gaps: session.knowledge_profile.knowledge_gaps.join("\n"),
      customFields:
        session.knowledge_profile.custom_fields.length > 0
          ? session.knowledge_profile.custom_fields
          : [{ label: "", value: "" }],
    };
  }

  // Fall back to global profile
  const global = loadGlobalProfile();
  if (global.updated_at) {
    return {
      role: global.role || meeting?.participant_roles[0] || "",
      expertise: global.expertise_areas.join("\n"),
      gaps: global.knowledge_gaps.join("\n"),
      customFields:
        global.custom_fields.length > 0
          ? global.custom_fields
          : [{ label: "", value: "" }],
    };
  }

  return {
    ...emptyProfileDraft,
    role: meeting?.participant_roles[0] ?? "",
  };
}

function annotationForSegment(
  annotations: Annotation[],
  segmentId: string,
) {
  return annotations.find((annotation) => annotation.segment_id === segmentId) ?? null;
}

function speakerLabel(role: string, session: SessionState | null) {
  return session?.knowledge_profile?.role || role || "회의";
}

export function MeetingSessionShell({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [attendeeId, setAttendeeId] = useState("");
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(emptyProfileDraft);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [sendingChat, setSendingChat] = useState(false);
  const [submittingTranscript, setSubmittingTranscript] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [manualTranscript, setManualTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [microphoneMessage, setMicrophoneMessage] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("script");
  const [dismissedTopicAt, setDismissedTopicAt] = useState<string | null>(null);

  const attendeeIdRef = useRef("");
  const hydratedProfileRef = useRef(false);
  const lastTranscriptAtRef = useRef(0);

  const deferredSegments = useDeferredValue(session?.transcript_segments ?? []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storageKey = `meeting-attendee:${meetingId}`;
    const existing = window.localStorage.getItem(storageKey);
    const fallbackId = `attendee-${Date.now()}`;
    const created = window.crypto?.randomUUID?.() ?? fallbackId;
    const resolved = existing || created;

    if (!existing) {
      window.localStorage.setItem(storageKey, resolved);
    }

    attendeeIdRef.current = resolved;
    setAttendeeId(resolved);
  }, [meetingId]);

  const loadSessionData = useEffectEvent(async () => {
    if (!attendeeIdRef.current) {
      return;
    }

    try {
      setLoading(true);
      const [nextMeeting, nextSession] = await Promise.all([
        getMeeting(meetingId),
        getSessionState(meetingId, attendeeIdRef.current),
      ]);

      startTransition(() => {
        setMeeting(nextMeeting);
        setSession(nextSession);
        setError(null);
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "세션 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  });

  const refreshSession = useEffectEvent(async () => {
    if (!attendeeIdRef.current) {
      return;
    }

    try {
      const nextSession = await getSessionState(meetingId, attendeeIdRef.current);
      startTransition(() => {
        setSession(nextSession);
      });
    } catch {
      // Passive refresh failures should not interrupt the session UI.
    }
  });

  const submitTranscriptText = useEffectEvent(
    async (text: string, source: "speech" | "manual") => {
      if (!attendeeIdRef.current) {
        return;
      }

      try {
        setSubmittingTranscript(true);
        const nextSession = await appendTranscript(meetingId, {
          attendee_id: attendeeIdRef.current,
          text,
          speaker: speakerLabel(profileDraft.role, session),
          source,
        });

        lastTranscriptAtRef.current = Date.now();
        startTransition(() => {
          setSession(nextSession);
          setError(null);
        });
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "스크립트를 반영하지 못했습니다.",
        );
      } finally {
        setSubmittingTranscript(false);
      }
    },
  );

  useEffect(() => {
    if (!attendeeId) {
      return;
    }

    void loadSessionData();
  }, [attendeeId]);

  useEffect(() => {
    if (hydratedProfileRef.current || !meeting) {
      return;
    }

    setProfileDraft(initialProfileDraft(meeting, session));
    hydratedProfileRef.current = true;
  }, [meeting, session]);

  // --- Deepgram STT ---
  const handleDeepgramTranscript = useCallback(
    (event: DeepgramTranscriptEvent) => {
      if (event.type === "final" && event.text.trim()) {
        setMicrophoneMessage(null);
        lastTranscriptAtRef.current = Date.now();
        void submitTranscriptText(event.text.trim(), "speech");
      }
    },
    [],
  );

  const { connect: dgConnect, disconnect: dgDisconnect, send: dgSend, isConnected: dgConnected } =
    useDeepgramSTT({
      onTranscript: handleDeepgramTranscript,
      onError: () => setMicrophoneMessage("Deepgram 연결 오류 — 마이크를 확인해 주세요"),
    });

  const { start: recorderStart, stop: recorderStop } = useAudioRecorder({
    onAudioChunk: dgSend,
  });

  useEffect(() => {
    if (!attendeeId) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshSession();
    }, session?.recording_active ? 2200 : 5000);

    return () => window.clearInterval(interval);
  }, [attendeeId, session?.recording_active]);

  async function handleSaveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!attendeeIdRef.current) {
      return;
    }

    try {
      setSavingProfile(true);
      await saveProfile(meetingId, {
        attendee_id: attendeeIdRef.current,
        role: profileDraft.role,
        expertise_areas: splitLines(profileDraft.expertise),
        knowledge_gaps: splitLines(profileDraft.gaps),
        custom_fields: profileDraft.customFields.filter(
          (field) => field.label.trim() || field.value.trim(),
        ),
      });

      const [nextMeeting, nextSession] = await Promise.all([
        getMeeting(meetingId),
        getSessionState(meetingId, attendeeIdRef.current),
      ]);

      startTransition(() => {
        setMeeting(nextMeeting);
        setSession(nextSession);
        setProfileDraft(initialProfileDraft(nextMeeting, nextSession));
        setError(null);
      });
      setMobileTab("guide");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "프로필 저장에 실패했습니다.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleSubmitChat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chatInput.trim() || !attendeeIdRef.current) {
      return;
    }

    try {
      setSendingChat(true);
      const nextSession = await askQuestion(meetingId, {
        attendee_id: attendeeIdRef.current,
        question: chatInput,
      });

      startTransition(() => {
        setSession(nextSession);
        setChatInput("");
        setError(null);
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "답변을 생성할 수 없습니다. 다시 시도해 주세요.",
      );
    } finally {
      setSendingChat(false);
    }
  }

  async function handleManualTranscript(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manualTranscript.trim()) {
      return;
    }

    if (!attendeeIdRef.current) {
      return;
    }

    try {
      setSubmittingTranscript(true);
      const nextSession = await appendTranscript(meetingId, {
        attendee_id: attendeeIdRef.current,
        text: manualTranscript,
        speaker: speakerLabel(profileDraft.role, session),
        source: "manual",
      });

      lastTranscriptAtRef.current = Date.now();
      startTransition(() => {
        setSession(nextSession);
        setManualTranscript("");
        setError(null);
      });
      setMobileTab("script");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "스크립트를 반영하지 못했습니다.",
      );
    } finally {
      setSubmittingTranscript(false);
    }
  }

  async function handleStartRecording() {
    try {
      setRecordingBusy(true);
      await startRecording(meetingId);
      startTransition(() => {
        setSession((current) =>
          current ? { ...current, recording_active: true } : current,
        );
      });

      lastTranscriptAtRef.current = Date.now();
      setMicrophoneMessage(null);
      await dgConnect();
      await recorderStart();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "녹음을 시작하지 못했습니다.");
    } finally {
      setRecordingBusy(false);
    }
  }

  async function handleStopRecording() {
    try {
      setRecordingBusy(true);
      await stopRecording(meetingId);
      setMicrophoneMessage(null);

      recorderStop();
      await dgDisconnect();

      startTransition(() => {
        setSession((current) =>
          current ? { ...current, recording_active: false } : current,
        );
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "녹음을 중지하지 못했습니다.");
    } finally {
      setRecordingBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="panel h-28 animate-pulse" />
        <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
          <div className="panel h-[40rem] animate-pulse" />
          <div className="panel h-[40rem] animate-pulse" />
        </div>
      </div>
    );
  }

  if (!meeting || !session) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="empty-state max-w-xl text-center">
          {error ?? "세션 정보를 불러오지 못했습니다."}
        </div>
      </div>
    );
  }

  const currentTopic = session.recommendations?.suggested_topic;
  const visibleTopic =
    currentTopic && currentTopic.created_at !== dismissedTopicAt
      ? currentTopic
      : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Sticky header */}
      <section className="panel sticky top-4 z-20 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <span className="eyebrow">Live Session</span>
              <h1 className="text-lg font-bold tracking-[-0.02em] text-[var(--text-primary)] sm:text-xl">
                {session.title}
              </h1>
            </div>
            {session.recording_active && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--error)]">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--error)]" />
                REC
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="button-secondary"
              onClick={() => router.push(`/meetings/${meeting.id}`)}
              type="button"
            >
              상세로 이동
            </button>
            <button
              className={session.recording_active ? "button-danger" : "button-primary"}
              disabled={recordingBusy}
              onClick={() =>
                void (session.recording_active
                  ? handleStopRecording()
                  : handleStartRecording())
              }
              type="button"
            >
              {recordingBusy
                ? "처리 중..."
                : session.recording_active
                  ? "녹음 중지"
                  : "녹음 시작"}
            </button>
          </div>
        </div>

        {session.agenda_items.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {session.agenda_items.map((item) => (
              <span className="agenda-pill" key={item}>
                {item}
              </span>
            ))}
          </div>
        )}

        {microphoneMessage ? (
          <div className="warning-banner">{microphoneMessage}</div>
        ) : null}
        {error ? <div className="error-banner">{error}</div> : null}
      </section>

      {/* Mobile tabs */}
      <div className="mobile-tabs lg:hidden">
        {[
          { id: "script", label: "스크립트" },
          { id: "chat", label: "채팅" },
          { id: "guide", label: "추천" },
          { id: "settings", label: "설정" },
        ].map((tab) => (
          <button
            className={`mobile-tab ${mobileTab === tab.id ? "mobile-tab-active" : ""}`}
            key={tab.id}
            onClick={() => setMobileTab(tab.id as MobileTab)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Desktop layout */}
      <section className="hidden gap-3 lg:grid lg:grid-cols-[1.2fr_0.8fr]">
        <ScriptPanel
          annotations={session.annotations}
          deferredSegments={deferredSegments}
          submittingTranscript={submittingTranscript}
        />

        <div className="flex flex-col gap-3">
          <GuidePanel
            onDismissTopic={setDismissedTopicAt}
            onPickQuestion={(question) => {
              setChatInput(question);
              setMobileTab("chat");
            }}
            onProfileDraftChange={setProfileDraft}
            onSaveProfile={handleSaveProfile}
            profileDraft={profileDraft}
            savingProfile={savingProfile}
            session={session}
            visibleTopic={visibleTopic}
            meeting={meeting}
          />

          <ChatPanel
            chatInput={chatInput}
            messages={session.chat_messages}
            onChangeChatInput={setChatInput}
            onChangeManualTranscript={setManualTranscript}
            onSubmitChat={handleSubmitChat}
            onSubmitManualTranscript={handleManualTranscript}
            manualTranscript={manualTranscript}
            sendingChat={sendingChat}
            submittingTranscript={submittingTranscript}
          />
        </div>
      </section>

      {/* Mobile layout */}
      <section className="flex flex-col gap-3 lg:hidden">
        {mobileTab === "script" ? (
          <ScriptPanel
            annotations={session.annotations}
            deferredSegments={deferredSegments}
            submittingTranscript={submittingTranscript}
          />
        ) : null}

        {mobileTab === "chat" ? (
          <ChatPanel
            chatInput={chatInput}
            messages={session.chat_messages}
            onChangeChatInput={setChatInput}
            onChangeManualTranscript={setManualTranscript}
            onSubmitChat={handleSubmitChat}
            onSubmitManualTranscript={handleManualTranscript}
            manualTranscript={manualTranscript}
            sendingChat={sendingChat}
            submittingTranscript={submittingTranscript}
          />
        ) : null}

        {mobileTab === "guide" ? (
          <GuidePanel
            onDismissTopic={setDismissedTopicAt}
            onPickQuestion={(question) => {
              setChatInput(question);
              setMobileTab("chat");
            }}
            onProfileDraftChange={setProfileDraft}
            onSaveProfile={handleSaveProfile}
            profileDraft={profileDraft}
            savingProfile={savingProfile}
            session={session}
            visibleTopic={visibleTopic}
            meeting={meeting}
          />
        ) : null}

        {mobileTab === "settings" ? (
          <ProfileSettingsPanel
            meeting={meeting}
            onProfileDraftChange={setProfileDraft}
            onSaveProfile={handleSaveProfile}
            profileDraft={profileDraft}
            savingProfile={savingProfile}
            session={session}
          />
        ) : null}
      </section>
    </div>
  );
}

function ScriptPanel({
  deferredSegments,
  annotations,
  submittingTranscript,
}: {
  deferredSegments: SessionState["transcript_segments"];
  annotations: SessionState["annotations"];
  submittingTranscript: boolean;
}) {
  return (
    <div className="panel flex h-[calc(100vh-10rem)] flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] pb-3">
        <div className="space-y-0.5">
          <span className="eyebrow">Transcript</span>
          <h2 className="section-title">실시간 스크립트</h2>
        </div>
        <span className="status-pill">
          {submittingTranscript ? "동기화 중..." : `${deferredSegments.length}개 구간`}
        </span>
      </div>

      <div className="scroll-area mt-3 flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {deferredSegments.length > 0 ? (
          deferredSegments.map((segment) => {
            const annotation = annotationForSegment(annotations, segment.id);
            return (
              <article className="transcript-card" key={segment.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="speaker-pill">{segment.speaker}</span>
                    <span className="text-xs text-[var(--text-tertiary)]">
                      {formatDateTime(segment.created_at)}
                    </span>
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                    {segment.source}
                  </span>
                </div>

                <p className="mt-3 text-sm leading-7 text-[var(--text-primary)]">
                  {segment.text}
                </p>

                {annotation ? (
                  <details className="annotation-card mt-3">
                    <summary className="cursor-pointer list-none">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                          {annotation.title}
                        </span>
                        <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
                          맞춤 설명
                        </span>
                      </div>
                    </summary>
                    <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
                      {annotation.body}
                    </p>
                  </details>
                ) : null}
              </article>
            );
          })
        ) : (
          <div className="empty-state flex-1">
            녹음을 시작하거나 수동으로 스크립트를 입력하면<br />
            여기에 회의 내용이 쌓입니다.
          </div>
        )}
      </div>
    </div>
  );
}

function GuidePanel({
  meeting,
  session,
  profileDraft,
  savingProfile,
  onProfileDraftChange,
  onSaveProfile,
  onPickQuestion,
  visibleTopic,
  onDismissTopic,
}: {
  meeting: MeetingDetail;
  session: SessionState;
  profileDraft: ProfileDraft;
  savingProfile: boolean;
  onProfileDraftChange: React.Dispatch<React.SetStateAction<ProfileDraft>>;
  onSaveProfile: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onPickQuestion: (question: string) => void;
  visibleTopic: SuggestedTopic | null;
  onDismissTopic: (value: string | null) => void;
}) {
  return (
    <div className="panel flex flex-col gap-3 overflow-y-auto">
      {visibleTopic ? (
        <div className="offtrack-banner">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <span className="eyebrow text-[var(--warning)]">Focus Nudge</span>
              <h2 className="section-title">{visibleTopic.title}</h2>
            </div>
            <button
              className="button-ghost text-xs"
              onClick={() => onDismissTopic(visibleTopic.created_at)}
              type="button"
            >
              닫기
            </button>
          </div>
          <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
            {visibleTopic.reason}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="sub-panel">
          <div className="flex items-center justify-between gap-3">
            <h2 className="section-title">추천 질문</h2>
            <span className="status-pill">
              {session.recommendations?.suggested_questions.length ?? 0}개
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {session.recommendations?.suggested_questions?.length ? (
              session.recommendations.suggested_questions.map((question) => (
                <button
                  className="suggestion-chip"
                  key={question}
                  onClick={() => onPickQuestion(question)}
                  type="button"
                >
                  {question}
                </button>
              ))
            ) : (
              <div className="empty-inline">
                스크립트가 쌓이면 추천 질문이 여기에 갱신됩니다.
              </div>
            )}
          </div>
        </div>

        <div className="sub-panel">
          <div className="flex items-center justify-between gap-3">
            <h2 className="section-title">내 프로필</h2>
            {session.knowledge_profile?.role ? (
              <span
                className="role-chip"
                style={{
                  background: resolveRoleTheme(session.knowledge_profile.role).background,
                  borderColor: resolveRoleTheme(session.knowledge_profile.role).border,
                  color: resolveRoleTheme(session.knowledge_profile.role).text,
                }}
              >
                {session.knowledge_profile.role}
              </span>
            ) : null}
          </div>
          <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">
            {session.knowledge_profile
              ? `${session.knowledge_profile.expertise_areas.join(", ") || "전문 분야 미입력"} / 부족 영역 ${
                  session.knowledge_profile.knowledge_gaps.join(", ") || "미입력"
                }`
              : "저장된 프로필이 없습니다. 하단에서 저장하면 맞춤 보조가 정확해집니다."}
          </p>
        </div>
      </div>

      <ProfileSettingsPanel
        meeting={meeting}
        onProfileDraftChange={onProfileDraftChange}
        onSaveProfile={onSaveProfile}
        profileDraft={profileDraft}
        savingProfile={savingProfile}
        session={session}
      />
    </div>
  );
}

function ProfileSettingsPanel({
  meeting,
  session,
  profileDraft,
  savingProfile,
  onProfileDraftChange,
  onSaveProfile,
}: {
  meeting: MeetingDetail;
  session: SessionState;
  profileDraft: ProfileDraft;
  savingProfile: boolean;
  onProfileDraftChange: React.Dispatch<React.SetStateAction<ProfileDraft>>;
  onSaveProfile: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  const selectedTheme = profileDraft.role
    ? resolveRoleTheme(profileDraft.role)
    : null;

  return (
    <form className="sub-panel flex flex-col gap-5" onSubmit={onSaveProfile}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-title">지식 프로필 설정</h2>
        <span className="status-pill">
          {session.knowledge_profile ? "저장됨" : "미저장"}
        </span>
      </div>

      {/* ── 그룹 1: 역할 선택 ── */}
      <fieldset className="space-y-3 rounded-2xl border border-[var(--border-soft)] p-4">
        <legend className="field-label px-2">역할</legend>
        <div className="flex flex-wrap gap-2">
          {meeting.participant_roles.map((role) => {
            const theme = resolveRoleTheme(role);
            const isSelected = profileDraft.role === role;
            return (
              <button
                className="role-chip transition-all"
                key={role}
                onClick={() =>
                  onProfileDraftChange((current) => ({ ...current, role }))
                }
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
        {selectedTheme && (
          <p className="text-xs leading-5" style={{ color: selectedTheme.text }}>
            {profileDraft.role} 역할로 맞춤 보조를 받습니다.
          </p>
        )}
      </fieldset>

      {/* ── 그룹 2: 역량 (잘 아는 분야 / 부족한 영역) ── */}
      <fieldset className="space-y-4 rounded-2xl border border-[var(--border-soft)] p-4">
        <legend className="field-label px-2">역량</legend>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="field-group">
            <span className="text-xs font-medium text-[var(--text-secondary)]">잘 아는 분야</span>
            <textarea
              className="textarea-shell"
              onChange={(event) =>
                onProfileDraftChange((current) => ({
                  ...current,
                  expertise: event.target.value,
                }))
              }
              placeholder={"한 줄에 하나씩\n예: API 설계\n예: 장애 대응"}
              rows={3}
              value={profileDraft.expertise}
            />
          </label>
          <label className="field-group">
            <span className="text-xs font-medium text-[var(--text-secondary)]">부족한 영역</span>
            <textarea
              className="textarea-shell"
              onChange={(event) =>
                onProfileDraftChange((current) => ({
                  ...current,
                  gaps: event.target.value,
                }))
              }
              placeholder={"한 줄에 하나씩\n예: PII\n예: 보관 정책"}
              rows={3}
              value={profileDraft.gaps}
            />
          </label>
        </div>
      </fieldset>

      {/* ── 그룹 3: 추가 정보 (커스텀 필드) ── */}
      <fieldset className="space-y-3 rounded-2xl border border-[var(--border-soft)] p-4">
        <div className="flex items-center justify-between">
          <legend className="field-label px-2">추가 정보</legend>
          <button
            className="button-ghost text-xs"
            onClick={() =>
              onProfileDraftChange((current) => ({
                ...current,
                customFields: [...current.customFields, { label: "", value: "" }],
              }))
            }
            type="button"
          >
            + 필드 추가
          </button>
        </div>
        <div className="grid gap-3">
          {profileDraft.customFields.map((field, index) => (
            <div className="grid gap-3 md:grid-cols-[0.9fr_1.1fr_auto]" key={`${index}-${field.label}`}>
              <input
                className="input-shell"
                onChange={(event) =>
                  onProfileDraftChange((current) => ({
                    ...current,
                    customFields: current.customFields.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, label: event.target.value }
                        : item,
                    ),
                  }))
                }
                placeholder="필드 이름"
                value={field.label}
              />
              <input
                className="input-shell"
                onChange={(event) =>
                  onProfileDraftChange((current) => ({
                    ...current,
                    customFields: current.customFields.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, value: event.target.value }
                        : item,
                    ),
                  }))
                }
                placeholder="값"
                value={field.value}
              />
              <button
                className="button-ghost text-xs"
                onClick={() =>
                  onProfileDraftChange((current) => ({
                    ...current,
                    customFields:
                      current.customFields.length > 1
                        ? current.customFields.filter((_, itemIndex) => itemIndex !== index)
                        : [{ label: "", value: "" }],
                  }))
                }
                type="button"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      </fieldset>

      {/* 저장 */}
      <div className="flex justify-end">
        <button className="button-primary" disabled={savingProfile} type="submit">
          {savingProfile ? "저장 중..." : "프로필 저장"}
        </button>
      </div>
    </form>
  );
}

function ChatPanel({
  messages,
  chatInput,
  manualTranscript,
  sendingChat,
  submittingTranscript,
  onChangeChatInput,
  onChangeManualTranscript,
  onSubmitChat,
  onSubmitManualTranscript,
}: {
  messages: ChatMessage[];
  chatInput: string;
  manualTranscript: string;
  sendingChat: boolean;
  submittingTranscript: boolean;
  onChangeChatInput: (value: string) => void;
  onChangeManualTranscript: (value: string) => void;
  onSubmitChat: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  onSubmitManualTranscript: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <div className="panel flex flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] pb-3">
        <div className="space-y-0.5">
          <span className="eyebrow">Chat QA</span>
          <h2 className="section-title">실시간 질문</h2>
        </div>
        <span className="status-pill">{messages.length}개 메시지</span>
      </div>

      <div className="scroll-area mt-3 flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {messages.length > 0 ? (
          messages.map((message) => (
            <article className="chat-card" key={message.id}>
              <div className="space-y-3">
                <div className="chat-question">{message.question}</div>
                <div className="chat-answer">{message.answer}</div>
                <div className="flex items-center justify-between gap-3">
                  <span
                    className="role-chip"
                    style={{
                      background: resolveRoleTheme(message.role).background,
                      borderColor: resolveRoleTheme(message.role).border,
                      color: resolveRoleTheme(message.role).text,
                    }}
                  >
                    {message.role}
                  </span>
                  <span className="text-xs text-[var(--text-tertiary)]">
                    {formatDateTime(message.created_at)}
                  </span>
                </div>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-inline">
            아직 질문이 없습니다. 추천 질문을 눌러 바로 채팅 입력으로 가져올 수 있습니다.
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-3 border-t border-[var(--border-soft)] pt-3">
        <form className="grid gap-2" onSubmit={onSubmitChat}>
          <label className="field-group">
            <span className="field-label">질문 보내기</span>
            <textarea
              className="textarea-shell"
              onChange={(event) => onChangeChatInput(event.target.value)}
              placeholder="예: PII 마스킹이 이 안건에서 왜 중요한가요?"
              rows={2}
              value={chatInput}
            />
          </label>
          <div className="flex justify-end">
            <button className="button-primary" disabled={sendingChat} type="submit">
              {sendingChat ? "답변 생성 중..." : "질문 전송"}
            </button>
          </div>
        </form>

        <form className="grid gap-2" onSubmit={onSubmitManualTranscript}>
          <label className="field-group">
            <span className="field-label">수동 스크립트 입력</span>
            <textarea
              className="textarea-shell"
              onChange={(event) => onChangeManualTranscript(event.target.value)}
              placeholder="브라우저 음성인식이 어려우면 회의 발화를 직접 붙여 넣을 수 있습니다."
              rows={3}
              value={manualTranscript}
            />
          </label>
          <div className="flex justify-end">
            <button
              className="button-secondary"
              disabled={submittingTranscript}
              type="submit"
            >
              {submittingTranscript ? "반영 중..." : "스크립트 추가"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
