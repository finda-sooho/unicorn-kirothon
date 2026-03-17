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

function speakerLabel(session: SessionState | null) {
  return session?.knowledge_profile?.role || "회의";
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
    try { setSendingChat(true); const s = await askQuestion(meetingId, { attendee_id: attendeeIdRef.current, question: chatInput }); startTransition(() => { setSession(s); setChatInput(""); setError(null); }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "답변을 생성할 수 없습니다."); }
    finally { setSendingChat(false); }
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

  const currentTopic = session.recommendations?.suggested_topic;
  const visibleTopic = currentTopic && currentTopic.created_at !== dismissedTopicAt ? currentTopic : null;

  return (
    <div className="full-width flex h-screen flex-col">
      {/* Header — compact, sticky top */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[var(--border-soft)] bg-[var(--bg-base)] px-4 py-2">
        <div className="flex items-center gap-3 overflow-hidden">
          <button className="button-ghost shrink-0 text-xs" onClick={() => router.push("/")} type="button">&larr;</button>
          <h1 className="truncate text-sm font-semibold text-[var(--text-primary)]">{session.title}</h1>
          {session.recording_active && (
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-[var(--error)]">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--error)]" />REC
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
          <ChatPanel chatInput={chatInput} messages={session.chat_messages} onChangeChatInput={setChatInput} onChangeManualTranscript={setManualTranscript} onSubmitChat={handleSubmitChat} onSubmitManualTranscript={handleManualTranscript} manualTranscript={manualTranscript} sendingChat={sendingChat} submittingTranscript={submittingTranscript} />
        </div>
      </section>

      {/* Mobile */}
      <section className="flex flex-1 flex-col gap-3 overflow-hidden p-4 lg:hidden">
        {mobileTab === "script" && <ScriptPanel annotations={session.annotations} deferredSegments={deferredSegments} submittingTranscript={submittingTranscript} />}
        {mobileTab === "chat" && <ChatPanel chatInput={chatInput} messages={session.chat_messages} onChangeChatInput={setChatInput} onChangeManualTranscript={setManualTranscript} onSubmitChat={handleSubmitChat} onSubmitManualTranscript={handleManualTranscript} manualTranscript={manualTranscript} sendingChat={sendingChat} submittingTranscript={submittingTranscript} />}
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

function ChatPanel({ messages, chatInput, manualTranscript, sendingChat, submittingTranscript, onChangeChatInput, onChangeManualTranscript, onSubmitChat, onSubmitManualTranscript }: { messages: ChatMessage[]; chatInput: string; manualTranscript: string; sendingChat: boolean; submittingTranscript: boolean; onChangeChatInput: (v: string) => void; onChangeManualTranscript: (v: string) => void; onSubmitChat: (e: React.FormEvent<HTMLFormElement>) => Promise<void>; onSubmitManualTranscript: (e: React.FormEvent<HTMLFormElement>) => Promise<void> }) {
  return (
    <div className="panel flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border-soft)] pb-3">
        <h2 className="section-title">질문</h2>
        <span className="status-pill">{messages.length}개</span>
      </div>
      <div className="scroll-area mt-3 flex flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {messages.length > 0 ? messages.map((msg) => (
          <article className="chat-card" key={msg.id}>
            <div className="chat-question">{msg.question}</div>
            <div className="chat-answer">{msg.answer}</div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="role-chip" style={{ background: resolveRoleTheme(msg.role).background, borderColor: resolveRoleTheme(msg.role).border, color: resolveRoleTheme(msg.role).text }}>{msg.role}</span>
              <span className="text-xs text-[var(--text-tertiary)]">{formatDateTime(msg.created_at)}</span>
            </div>
          </article>
        )) : <p className="py-4 text-center text-xs text-[var(--text-tertiary)]">추천 질문을 눌러 바로 질문할 수 있습니다.</p>}
      </div>
      <div className="mt-3 grid gap-3 border-t border-[var(--border-soft)] pt-3">
        <form className="grid gap-2" onSubmit={onSubmitChat}>
          <textarea className="textarea-shell" onChange={(e) => onChangeChatInput(e.target.value)} placeholder="질문을 입력하세요..." rows={2} value={chatInput} />
          <div className="flex justify-end"><button className="button-primary" disabled={sendingChat} type="submit">{sendingChat ? "생성 중..." : "질문"}</button></div>
        </form>
        <details className="text-xs">
          <summary className="cursor-pointer text-[var(--text-tertiary)]">수동 스크립트 입력</summary>
          <form className="mt-2 grid gap-2" onSubmit={onSubmitManualTranscript}>
            <textarea className="textarea-shell" onChange={(e) => onChangeManualTranscript(e.target.value)} placeholder="회의 발화를 직접 붙여 넣을 수 있습니다." rows={2} value={manualTranscript} />
            <div className="flex justify-end"><button className="button-secondary" disabled={submittingTranscript} type="submit">{submittingTranscript ? "반영 중..." : "추가"}</button></div>
          </form>
        </details>
      </div>
    </div>
  );
}
