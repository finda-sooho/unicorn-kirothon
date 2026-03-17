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
  askQuestionStream,
  getMeeting,
  getSessionState,
  refreshRecommendations,
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
  MeetingDetail,
  SessionState,
  SuggestedTopic,
} from "@/lib/types";

type MobileTab = "script" | "chat" | "guide";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    month: "numeric",
    day: "numeric",
  }).format(new Date(value));
}

function annotationForSegment(annotations: Annotation[], segmentId: string) {
  return annotations.find((a) => a.segment_id === segmentId) ?? null;
}

<<<<<<< Updated upstream
function speakerLabel(session: SessionState | null) {
  return session?.knowledge_profile?.role || "회의";
=======
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
>>>>>>> Stashed changes
}

export function MeetingSessionShell({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [session, setSession] = useState<SessionState | null>(null);
  const [attendeeId, setAttendeeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [sendingChat, setSendingChat] = useState(false);
  const [submittingTranscript, setSubmittingTranscript] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [manualTranscript, setManualTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [microphoneMessage, setMicrophoneMessage] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("script");
  const [dismissedTopicAt, setDismissedTopicAt] = useState<string | null>(null);
  const [streamingAnswer, setStreamingAnswer] = useState<string>("");
  const [streamingQuestion, setStreamingQuestion] = useState<string>("");

  const attendeeIdRef = useRef("");
  const hydratedRef = useRef(false);
  const lastTranscriptAtRef = useRef(0);
  const deferredSegments = useDeferredValue(session?.transcript_segments ?? []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `meeting-attendee:${meetingId}`;
    const existing = window.localStorage.getItem(key);
    const resolved = existing || (window.crypto?.randomUUID?.() ?? `attendee-${Date.now()}`);
    if (!existing) window.localStorage.setItem(key, resolved);
    attendeeIdRef.current = resolved;
    setAttendeeId(resolved);
  }, [meetingId]);

  const loadSessionData = useEffectEvent(async () => {
    if (!attendeeIdRef.current) return;
    try {
      setLoading(true);
      const [m, s] = await Promise.all([getMeeting(meetingId), getSessionState(meetingId, attendeeIdRef.current)]);
      startTransition(() => { setMeeting(m); setSession(s); setError(null); });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "세션 정보를 불러오지 못했습니다.");
    } finally { setLoading(false); }
  });

  const refreshSession = useEffectEvent(async () => {
    if (!attendeeIdRef.current) return;
    try { const s = await getSessionState(meetingId, attendeeIdRef.current); startTransition(() => { setSession(s); }); } catch { /* silent */ }
  });

  const submitTranscriptText = useEffectEvent(async (text: string, source: "speech" | "manual") => {
    if (!attendeeIdRef.current) return;
    try {
      setSubmittingTranscript(true);
      const s = await appendTranscript(meetingId, { attendee_id: attendeeIdRef.current, text, speaker: speakerLabel(session), source });
      lastTranscriptAtRef.current = Date.now();
      startTransition(() => { setSession(s); setError(null); });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "스크립트를 반영하지 못했습니다."); }
    finally { setSubmittingTranscript(false); }
  });

  useEffect(() => { if (attendeeId) void loadSessionData(); }, [attendeeId]);

  useEffect(() => {
    if (hydratedRef.current || !meeting || !session || !attendeeIdRef.current) return;
    hydratedRef.current = true;
    if (!session.knowledge_profile) {
      const gp = loadGlobalProfile();
      if (gp.updated_at && gp.role) {
        void saveProfile(meetingId, { attendee_id: attendeeIdRef.current, role: gp.role, expertise_areas: gp.expertise_areas, knowledge_gaps: gp.knowledge_gaps, custom_fields: gp.custom_fields })
          .then(() => refreshSession()).catch(() => {});
      }
    }
  }, [meeting, session, meetingId]);

  const handleDeepgramTranscript = useCallback((event: DeepgramTranscriptEvent) => {
    if (event.type === "final" && event.text.trim()) {
      setMicrophoneMessage(null);
      lastTranscriptAtRef.current = Date.now();
      void submitTranscriptText(event.text.trim(), "speech");
    }
  }, []);

  const { connect: dgConnect, disconnect: dgDisconnect, send: dgSend } = useDeepgramSTT({
    onTranscript: handleDeepgramTranscript,
    onError: () => setMicrophoneMessage("Deepgram 연결 오류 — 마이크를 확인해 주세요"),
  });
  const { start: recorderStart, stop: recorderStop } = useAudioRecorder({ onAudioChunk: dgSend });

  useEffect(() => {
    if (!attendeeId) return;
    const iv = window.setInterval(() => void refreshSession(), session?.recording_active ? 2200 : 5000);
    return () => window.clearInterval(iv);
  }, [attendeeId, session?.recording_active]);

  // 추천 질문 20초 자동 갱신 (녹음 중 + 프로필 있을 때)
  useEffect(() => {
    if (!attendeeId || !session?.recording_active || !session?.knowledge_profile) return;
    const iv = window.setInterval(async () => {
      try {
        const s = await refreshRecommendations(meetingId, attendeeIdRef.current);
        startTransition(() => { setSession(s); });
      } catch { /* silent */ }
    }, 20_000);
    return () => window.clearInterval(iv);
  }, [attendeeId, meetingId, session?.recording_active, session?.knowledge_profile]);

  async function handleSubmitChat(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!chatInput.trim() || !attendeeIdRef.current) return;
    const question = chatInput.trim();
    setChatInput("");
    setStreamingQuestion(question);
    setStreamingAnswer("");
    setSendingChat(true);
    setError(null);
    try {
      await askQuestionStream(
        meetingId,
        { attendee_id: attendeeIdRef.current, question },
        (chunk) => setStreamingAnswer((prev) => prev + chunk),
      );
      // After stream done, refresh session to get the saved message
      setStreamingQuestion("");
      setStreamingAnswer("");
      await refreshSession();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "답변을 생성할 수 없습니다.");
      setStreamingQuestion("");
      setStreamingAnswer("");
    } finally {
      setSendingChat(false);
    }
  }

  async function handleManualTranscript(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!manualTranscript.trim() || !attendeeIdRef.current) return;
    try { setSubmittingTranscript(true); const s = await appendTranscript(meetingId, { attendee_id: attendeeIdRef.current, text: manualTranscript, speaker: speakerLabel(session), source: "manual" }); lastTranscriptAtRef.current = Date.now(); startTransition(() => { setSession(s); setManualTranscript(""); setError(null); }); setMobileTab("script"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "스크립트를 반영하지 못했습니다."); }
    finally { setSubmittingTranscript(false); }
  }

  async function handleStartRecording() {
    try { setRecordingBusy(true); await startRecording(meetingId); startTransition(() => { setSession((c) => c ? { ...c, recording_active: true } : c); }); lastTranscriptAtRef.current = Date.now(); setMicrophoneMessage(null); await dgConnect(); await recorderStart(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "녹음을 시작하지 못했습니다."); }
    finally { setRecordingBusy(false); }
  }

  async function handleStopRecording() {
    try { setRecordingBusy(true); await stopRecording(meetingId); setMicrophoneMessage(null); recorderStop(); await dgDisconnect(); startTransition(() => { setSession((c) => c ? { ...c, recording_active: false } : c); }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "녹음을 중지하지 못했습니다."); }
    finally { setRecordingBusy(false); }
  }

<<<<<<< Updated upstream
  if (loading) return (
    <div className="full-width flex flex-col gap-4">
      <div className="panel h-20 animate-pulse" />
      <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]"><div className="panel h-[36rem] animate-pulse" /><div className="panel h-[36rem] animate-pulse" /></div>
    </div>
  );

  if (!meeting || !session) return (
    <div className="full-width flex items-center justify-center py-12">
      <div className="empty-state max-w-md text-center">{error ?? "세션 정보를 불러오지 못했습니다."}</div>
    </div>
  );
=======
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
>>>>>>> Stashed changes

  const currentTopic = session.recommendations?.suggested_topic;
  const visibleTopic = currentTopic && currentTopic.created_at !== dismissedTopicAt ? currentTopic : null;

  return (
<<<<<<< Updated upstream
    <div className="full-width flex h-screen flex-col">
      {/* Header — compact, sticky top */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[var(--border-soft)] bg-[var(--bg-base)] px-4 py-2">
        <div className="flex items-center gap-3 overflow-hidden">
          <button className="button-ghost shrink-0 text-xs" onClick={() => router.push("/")} type="button">&larr;</button>
          <h1 className="truncate text-sm font-semibold text-[var(--text-primary)]">{session.title}</h1>
          {session.recording_active && (
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-[var(--error)]">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--error)]" />REC
=======
    <div className="flex flex-col gap-4">
      {/* Sticky header */}
      <section className="panel sticky top-4 z-20 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <span className="eyebrow">Live Session</span>
              <h1 className="text-xl font-bold tracking-[-0.02em] text-[var(--text-primary)] sm:text-2xl">
                {session.title}
              </h1>
            </div>
            {session.recording_active && (
              <span className="inline-flex items-center gap-2 text-xs font-medium text-[var(--error)]">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--error)]" />
                REC
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
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

        <div className="flex flex-wrap gap-2">
          {session.agenda_items.map((item) => (
            <span className="agenda-pill" key={item}>
              {item}
>>>>>>> Stashed changes
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button className={`text-xs ${session.recording_active ? "button-danger" : "button-primary"}`} disabled={recordingBusy} onClick={() => void (session.recording_active ? handleStopRecording() : handleStartRecording())} type="button">
            {recordingBusy ? "처리 중..." : session.recording_active ? "녹음 중지" : "녹음 시작"}
          </button>
        </div>
      </header>
      {microphoneMessage && <div className="warning-banner mx-4 mt-2">{microphoneMessage}</div>}
      {error && <div className="error-banner mx-4 mt-2">{error}</div>}

      {/* Mobile tabs */}
      <div className="mobile-tabs mt-2 lg:hidden">
        {([{ id: "script" as const, label: "스크립트" }, { id: "chat" as const, label: "채팅" }, { id: "guide" as const, label: "추천" }]).map((tab) => (
          <button className={`mobile-tab ${mobileTab === tab.id ? "mobile-tab-active" : ""}`} key={tab.id} onClick={() => setMobileTab(tab.id)} type="button">{tab.label}</button>
        ))}
      </div>

      {/* Desktop */}
      <section className="hidden flex-1 gap-4 overflow-hidden p-4 lg:grid lg:grid-cols-[1.2fr_0.8fr]">
        <ScriptPanel annotations={session.annotations} deferredSegments={deferredSegments} submittingTranscript={submittingTranscript} />
        <div className="flex h-full flex-col gap-4 overflow-hidden">
          <GuidePanel session={session} visibleTopic={visibleTopic} onDismissTopic={setDismissedTopicAt} onPickQuestion={(q) => { setChatInput(q); }} />
          <ChatPanel chatInput={chatInput} messages={session.chat_messages} onChangeChatInput={setChatInput} onChangeManualTranscript={setManualTranscript} onSubmitChat={handleSubmitChat} onSubmitManualTranscript={handleManualTranscript} manualTranscript={manualTranscript} sendingChat={sendingChat} submittingTranscript={submittingTranscript} streamingQuestion={streamingQuestion} streamingAnswer={streamingAnswer} />
        </div>
      </section>

      {/* Mobile */}
      <section className="flex flex-1 flex-col gap-3 overflow-hidden p-4 lg:hidden">
        {mobileTab === "script" && <ScriptPanel annotations={session.annotations} deferredSegments={deferredSegments} submittingTranscript={submittingTranscript} />}
        {mobileTab === "chat" && <ChatPanel chatInput={chatInput} messages={session.chat_messages} onChangeChatInput={setChatInput} onChangeManualTranscript={setManualTranscript} onSubmitChat={handleSubmitChat} onSubmitManualTranscript={handleManualTranscript} manualTranscript={manualTranscript} sendingChat={sendingChat} submittingTranscript={submittingTranscript} streamingQuestion={streamingQuestion} streamingAnswer={streamingAnswer} />}
        {mobileTab === "guide" && <GuidePanel session={session} visibleTopic={visibleTopic} onDismissTopic={setDismissedTopicAt} onPickQuestion={(q) => { setChatInput(q); setMobileTab("chat"); }} />}
      </section>
    </div>
  );
}

function ScriptPanel({ deferredSegments, annotations, submittingTranscript }: { deferredSegments: SessionState["transcript_segments"]; annotations: SessionState["annotations"]; submittingTranscript: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  // 스크롤이 바닥 근처인지 체크
  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }

  // 세그먼트 추가될 때 자동 스크롤
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [deferredSegments.length]);

  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] pb-3">
        <h2 className="section-title">스크립트</h2>
        <span className="status-pill">{submittingTranscript ? "동기화 중..." : `${deferredSegments.length}개`}</span>
      </div>
      <div ref={scrollRef} onScroll={handleScroll} className="scroll-area mt-2 flex flex-1 flex-col gap-0.5 overflow-y-auto pr-1">
        {deferredSegments.length > 0 ? deferredSegments.map((seg) => {
          const ann = annotationForSegment(annotations, seg.id);
          return (
            <article className="group rounded-lg px-3 py-1.5 transition-colors hover:bg-[rgba(255,255,255,0.02)]" key={seg.id}>
              <div className="flex items-baseline gap-2">
                <span className="shrink-0 text-[11px] font-semibold" style={{ color: resolveRoleTheme(seg.speaker).text }}>{seg.speaker}</span>
                <span className="text-[10px] text-[var(--text-tertiary)]">{formatDateTime(seg.created_at)}</span>
                <span className="ml-auto text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100">{seg.source}</span>
              </div>
              <p className="text-[13px] leading-[1.65] text-[var(--text-primary)]">{seg.text}</p>
              {ann && (
                <details className="mt-1 rounded-md border-l-2 border-[rgba(108,123,242,0.4)] bg-[rgba(108,123,242,0.04)] px-2.5 py-1.5">
                  <summary className="cursor-pointer list-none text-[12px] font-medium text-[var(--accent)]">{ann.title}</summary>
                  <p className="mt-1 text-[12px] leading-[1.6] text-[var(--text-secondary)]">{ann.body}</p>
                </details>
              )}
            </article>
          );
        }) : (
          <div className="empty-state flex-1">녹음을 시작하거나 수동 입력하면<br />여기에 내용이 쌓입니다.</div>
        )}
      </div>
    </div>
  );
}

function GuidePanel({ session, visibleTopic, onDismissTopic, onPickQuestion }: { session: SessionState; visibleTopic: SuggestedTopic | null; onDismissTopic: (v: string | null) => void; onPickQuestion: (q: string) => void }) {
  const profile = session.knowledge_profile;
  return (
    <div className="panel flex shrink-0 flex-col gap-3 overflow-y-auto" style={{ maxHeight: "40%" }}>
      {visibleTopic && (
        <div className="offtrack-banner">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1"><span className="eyebrow text-[var(--warning)]">Focus</span><h2 className="section-title">{visibleTopic.title}</h2></div>
            <button className="button-ghost text-xs" onClick={() => onDismissTopic(visibleTopic.created_at)} type="button">닫기</button>
          </div>
          <p className="mt-1 text-sm leading-6 text-[var(--text-secondary)]">{visibleTopic.reason}</p>
        </div>
      )}
      {profile && (
        <div className="flex items-center gap-2">
          <span className="role-chip" style={{ background: resolveRoleTheme(profile.role).background, borderColor: resolveRoleTheme(profile.role).border, color: resolveRoleTheme(profile.role).text }}>{profile.role}</span>
          <span className="text-xs text-[var(--text-tertiary)]">{profile.expertise_areas.slice(0, 3).join(", ")}</span>
        </div>
      )}
      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="section-title">추천 질문</h2>
          <span className="status-pill">{session.recommendations?.suggested_questions.length ?? 0}개</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {session.recommendations?.suggested_questions?.length ? session.recommendations.suggested_questions.map((q) => (
            <button className="suggestion-chip" key={q} onClick={() => onPickQuestion(q)} type="button">{q}</button>
          )) : <p className="text-xs text-[var(--text-tertiary)]">스크립트가 쌓이면 추천 질문이 표시됩니다.</p>}
        </div>
      </div>
    </div>
  );
}

<<<<<<< Updated upstream
function ChatPanel({ messages, chatInput, manualTranscript, sendingChat, submittingTranscript, onChangeChatInput, onChangeManualTranscript, onSubmitChat, onSubmitManualTranscript, streamingQuestion, streamingAnswer }: { messages: ChatMessage[]; chatInput: string; manualTranscript: string; sendingChat: boolean; submittingTranscript: boolean; onChangeChatInput: (v: string) => void; onChangeManualTranscript: (v: string) => void; onSubmitChat: (e: React.FormEvent<HTMLFormElement>) => Promise<void>; onSubmitManualTranscript: (e: React.FormEvent<HTMLFormElement>) => Promise<void>; streamingQuestion: string; streamingAnswer: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, streamingAnswer]);

  return (
    <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] pb-3">
        <h2 className="section-title">질문</h2>
        <span className="status-pill">{messages.length}개</span>
      </div>
      <div ref={scrollRef} className="scroll-area mt-3 flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {messages.length > 0 ? messages.map((msg) => (
          <article className="chat-card" key={msg.id}>
            <div className="chat-question">{msg.question}</div>
            <div className="chat-answer">{msg.answer}</div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="role-chip" style={{ background: resolveRoleTheme(msg.role).background, borderColor: resolveRoleTheme(msg.role).border, color: resolveRoleTheme(msg.role).text }}>{msg.role}</span>
              <span className="text-xs text-[var(--text-tertiary)]">{formatDateTime(msg.created_at)}</span>
            </div>
          </article>
        )) : !streamingQuestion && <p className="py-4 text-center text-xs text-[var(--text-tertiary)]">추천 질문을 눌러 바로 질문할 수 있습니다.</p>}

        {/* Streaming answer */}
        {streamingQuestion && (
          <article className="chat-card border-[var(--border-glow)]">
            <div className="chat-question">{streamingQuestion}</div>
            <div className="chat-answer whitespace-pre-wrap">
              {streamingAnswer || (
                <span className="inline-flex items-center gap-1.5 text-[var(--text-tertiary)]">
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
                  답변 생성 중...
                </span>
              )}
            </div>
          </article>
=======
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
    <div className="panel flex min-h-[20rem] flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] pb-4">
        <div className="space-y-1">
          <span className="eyebrow">Chat QA</span>
          <h2 className="section-title">실시간 질문</h2>
        </div>
        <span className="status-pill">{messages.length}개 메시지</span>
      </div>

      <div className="scroll-area mt-4 flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
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
>>>>>>> Stashed changes
        )}
      </div>
      <div className="mt-3 border-t border-[var(--border-soft)] pt-3">
        <form className="flex gap-2" onSubmit={onSubmitChat}>
          <input
            className="input-shell flex-1"
            onChange={(e) => onChangeChatInput(e.target.value)}
            placeholder="질문 또는 스크립트를 입력하세요..."
            value={chatInput}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}
          />
          <button className="button-primary shrink-0" disabled={sendingChat} type="submit">
            {sendingChat ? "..." : "전송"}
          </button>
        </form>
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-[var(--text-tertiary)]">수동 스크립트 입력</summary>
          <form className="mt-2 flex gap-2" onSubmit={onSubmitManualTranscript}>
            <input className="input-shell flex-1" onChange={(e) => onChangeManualTranscript(e.target.value)} placeholder="회의 발화를 직접 입력..." value={manualTranscript} />
            <button className="button-secondary shrink-0" disabled={submittingTranscript} type="submit">{submittingTranscript ? "..." : "추가"}</button>
          </form>
        </details>
      </div>
    </div>
  );
}
