import type {
  ApiErrorResponse,
  AppendTranscriptPayload,
  AskQuestionPayload,
  Briefing,
  CreateMeetingPayload,
  KnowledgeProfile,
  MeetingDetail,
  MeetingSummary,
  RecordingState,
  SaveProfilePayload,
  SessionState,
} from "@/lib/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = "요청 처리에 실패했습니다.";

    try {
      const payload = (await response.json()) as ApiErrorResponse;
      if (payload.message) {
        message = payload.message;
      }
    } catch {
      message = response.statusText || message;
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

export function listMeetings() {
  return request<MeetingSummary[]>("/api/meetings");
}

export function createMeeting(payload: CreateMeetingPayload) {
  return request<MeetingDetail>("/api/meetings", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getMeeting(meetingId: string) {
  return request<MeetingDetail>(`/api/meetings/${meetingId}`);
}

export function generateBriefings(meetingId: string) {
  return request<MeetingDetail>(`/api/meetings/${meetingId}/briefings/generate`, {
    method: "POST",
  });
}

export function generateSingleBriefing(meetingId: string, role: string) {
  return request<Briefing>(`/api/meetings/${meetingId}/briefings/${encodeURIComponent(role)}/generate`, {
    method: "POST",
  });
}

export function saveProfile(meetingId: string, payload: SaveProfilePayload) {
  return request<KnowledgeProfile>(`/api/meetings/${meetingId}/profiles`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getSessionState(meetingId: string, attendeeId?: string) {
  const search = attendeeId
    ? `?attendee_id=${encodeURIComponent(attendeeId)}`
    : "";
  return request<SessionState>(`/api/meetings/${meetingId}/session${search}`);
}

export function askQuestion(meetingId: string, payload: AskQuestionPayload) {
  return request<SessionState>(`/api/meetings/${meetingId}/chat`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function askQuestionStream(
  meetingId: string,
  payload: AskQuestionPayload,
  onChunk: (text: string) => void,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/meetings/${meetingId}/chat/stream`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = "답변을 생성할 수 없습니다.";
    try {
      const err = (await response.json()) as ApiErrorResponse;
      if (err.message) message = err.message;
    } catch { /* ignore */ }
    throw new Error(message);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("스트림을 읽을 수 없습니다.");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") return;
      onChunk(data);
    }
  }
}

export function startRecording(meetingId: string) {
  return request<RecordingState>(`/api/meetings/${meetingId}/recording/start`, {
    method: "POST",
  });
}

export function stopRecording(meetingId: string) {
  return request<RecordingState>(`/api/meetings/${meetingId}/recording/stop`, {
    method: "POST",
  });
}

export function refreshRecommendations(meetingId: string, attendeeId: string) {
  return request<SessionState>(
    `/api/meetings/${meetingId}/recommendations/refresh?attendee_id=${encodeURIComponent(attendeeId)}`,
    { method: "POST" },
  );
}

export function appendTranscript(
  meetingId: string,
  payload: AppendTranscriptPayload,
) {
  return request<SessionState>(`/api/meetings/${meetingId}/transcript`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
