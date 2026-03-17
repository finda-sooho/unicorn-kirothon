export type BriefingStatus = "idle" | "generating" | "ready" | "failed";

export type ApiErrorResponse = {
  message: string;
};

export type GlossaryItem = {
  term: string;
  explanation: string;
};

export type Briefing = {
  role: string;
  status: BriefingStatus;
  summary: string;
  background_knowledge: string[];
  discussion_points: string[];
  glossary: GlossaryItem[];
  generated_at: string | null;
  error_message: string | null;
};

export type CustomField = {
  label: string;
  value: string;
};

export type KnowledgeProfile = {
  attendee_id: string;
  role: string;
  expertise_areas: string[];
  knowledge_gaps: string[];
  custom_fields: CustomField[];
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  attendee_id: string;
  role: string;
  question: string;
  answer: string;
  created_at: string;
};

export type TranscriptSegment = {
  id: string;
  text: string;
  speaker: string;
  source: "speech" | "manual";
  created_at: string;
};

export type Annotation = {
  id: string;
  attendee_id: string;
  role: string;
  segment_id: string;
  title: string;
  body: string;
  created_at: string;
};

export type SuggestedTopic = {
  title: string;
  reason: string;
  current_discussion: string;
  original_agenda: string;
  created_at: string;
};

export type SessionRecommendations = {
  attendee_id: string;
  suggested_questions: string[];
  suggested_topic: SuggestedTopic | null;
  updated_at: string;
};

export type MeetingSummary = {
  id: string;
  title: string;
  participant_roles: string[];
  participant_role_count: number;
  created_at: string;
  briefing_ready_count: number;
  briefing_total_count: number;
};

export type MeetingDetail = {
  id: string;
  title: string;
  description: string;
  agenda_items: string[];
  background_material: string;
  participant_roles: string[];
  created_at: string;
  briefings: Briefing[];
  profiles: KnowledgeProfile[];
  chat_messages: ChatMessage[];
  transcript_segments: TranscriptSegment[];
  recording_active: boolean;
};

export type SessionState = {
  meeting_id: string;
  title: string;
  agenda_items: string[];
  recording_active: boolean;
  knowledge_profile: KnowledgeProfile | null;
  chat_messages: ChatMessage[];
  transcript_segments: TranscriptSegment[];
  annotations: Annotation[];
  recommendations: SessionRecommendations | null;
};

export type RecordingState = {
  meeting_id: string;
  recording_active: boolean;
  updated_at: string;
};

export type CreateMeetingPayload = {
  title: string;
  description: string;
  agenda_items: string[];
  background_material: string;
  participant_roles: string[];
};

export type SaveProfilePayload = {
  attendee_id: string;
  role: string;
  expertise_areas: string[];
  knowledge_gaps: string[];
  custom_fields: CustomField[];
};

export type AskQuestionPayload = {
  attendee_id: string;
  question: string;
};

export type AppendTranscriptPayload = {
  attendee_id?: string;
  text: string;
  speaker: string;
  source: "speech" | "manual";
};
