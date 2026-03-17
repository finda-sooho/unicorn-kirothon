from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:10]}"


def clean_text(value: str) -> str:
    return value.strip()


def clean_text_list(values: list[str] | None) -> list[str]:
    if not values:
        return []

    cleaned: list[str] = []
    seen: set[str] = set()

    for raw in values:
        value = raw.strip()
        if not value:
            continue
        lowered = value.casefold()
        if lowered in seen:
            continue
        seen.add(lowered)
        cleaned.append(value)

    return cleaned


class ApiError(BaseModel):
    message: str


class CustomField(BaseModel):
    label: str
    value: str = ""

    @field_validator("label")
    @classmethod
    def validate_label(cls, value: str) -> str:
        cleaned = clean_text(value)
        if not cleaned:
            raise ValueError("커스텀 필드 이름을 입력해 주세요")
        return cleaned

    @field_validator("value")
    @classmethod
    def validate_value(cls, value: str) -> str:
        return clean_text(value)


class MeetingCreateRequest(BaseModel):
    title: str
    description: str = ""
    agenda_items: list[str] = Field(default_factory=list)
    background_material: str = ""
    participant_roles: list[str] = Field(default_factory=list)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        cleaned = clean_text(value)
        if not cleaned:
            raise ValueError("미팅 제목을 입력해 주세요")
        return cleaned

    @field_validator("description", "background_material")
    @classmethod
    def validate_free_text(cls, value: str) -> str:
        return clean_text(value)

    @field_validator("agenda_items", "participant_roles")
    @classmethod
    def validate_list_fields(cls, value: list[str]) -> list[str]:
        return clean_text_list(value)

    @field_validator("participant_roles")
    @classmethod
    def validate_roles_present(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("참석자 역할을 하나 이상 입력해 주세요")
        return value


class KnowledgeProfileInput(BaseModel):
    attendee_id: str
    role: str
    expertise_areas: list[str] = Field(default_factory=list)
    knowledge_gaps: list[str] = Field(default_factory=list)
    custom_fields: list[CustomField] = Field(default_factory=list)

    @field_validator("attendee_id")
    @classmethod
    def validate_attendee_id(cls, value: str) -> str:
        cleaned = clean_text(value)
        if not cleaned:
            raise ValueError("참석자 ID가 필요합니다")
        return cleaned

    @field_validator("role")
    @classmethod
    def validate_role(cls, value: str) -> str:
        cleaned = clean_text(value)
        if not cleaned:
            raise ValueError("역할을 입력해 주세요")
        return cleaned

    @field_validator("expertise_areas", "knowledge_gaps")
    @classmethod
    def validate_profile_lists(cls, value: list[str]) -> list[str]:
        return clean_text_list(value)


class KnowledgeProfile(KnowledgeProfileInput):
    updated_at: datetime = Field(default_factory=utc_now)


class GlossaryItem(BaseModel):
    term: str
    explanation: str


BriefingStatus = Literal["idle", "generating", "ready", "failed"]


class Briefing(BaseModel):
    role: str
    status: BriefingStatus = "idle"
    summary: str = ""
    background_knowledge: list[str] = Field(default_factory=list)
    discussion_points: list[str] = Field(default_factory=list)
    glossary: list[GlossaryItem] = Field(default_factory=list)
    generated_at: datetime | None = None
    error_message: str | None = None


class BriefingDraft(BaseModel):
    summary: str
    background_knowledge: list[str] = Field(default_factory=list)
    discussion_points: list[str] = Field(default_factory=list)
    glossary: list[GlossaryItem] = Field(default_factory=list)


class ChatRequest(BaseModel):
    attendee_id: str
    question: str

    @field_validator("attendee_id")
    @classmethod
    def validate_chat_attendee_id(cls, value: str) -> str:
        cleaned = clean_text(value)
        if not cleaned:
            raise ValueError("참석자 ID가 필요합니다")
        return cleaned

    @field_validator("question")
    @classmethod
    def validate_question(cls, value: str) -> str:
        cleaned = clean_text(value)
        if not cleaned:
            raise ValueError("질문을 입력해 주세요")
        return cleaned


class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: new_id("chat"))
    attendee_id: str
    role: str
    question: str
    answer: str
    created_at: datetime = Field(default_factory=utc_now)


class ChatAnswerDraft(BaseModel):
    answer: str


class TranscriptAppendRequest(BaseModel):
    attendee_id: str | None = None
    text: str
    speaker: str = "회의"
    source: Literal["speech", "manual"] = "speech"

    @field_validator("attendee_id")
    @classmethod
    def validate_optional_attendee_id(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = clean_text(value)
        return cleaned or None

    @field_validator("speaker")
    @classmethod
    def validate_speaker(cls, value: str) -> str:
        cleaned = clean_text(value)
        return cleaned or "회의"

    @field_validator("text")
    @classmethod
    def validate_text(cls, value: str) -> str:
        cleaned = clean_text(value)
        if not cleaned:
            raise ValueError("스크립트 텍스트를 입력해 주세요")
        return cleaned


class TranscriptSegment(BaseModel):
    id: str = Field(default_factory=lambda: new_id("seg"))
    text: str
    speaker: str
    source: Literal["speech", "manual"]
    created_at: datetime = Field(default_factory=utc_now)


class Annotation(BaseModel):
    id: str = Field(default_factory=lambda: new_id("anno"))
    attendee_id: str
    role: str
    segment_id: str
    title: str
    body: str
    created_at: datetime = Field(default_factory=utc_now)


class SuggestedTopic(BaseModel):
    title: str
    reason: str
    current_discussion: str
    original_agenda: str
    created_at: datetime = Field(default_factory=utc_now)


class SessionRecommendations(BaseModel):
    attendee_id: str
    suggested_questions: list[str] = Field(default_factory=list)
    suggested_topic: SuggestedTopic | None = None
    updated_at: datetime = Field(default_factory=utc_now)


class SessionAssistDraft(BaseModel):
    should_annotate: bool = False
    annotation_title: str = ""
    annotation_body: str = ""
    suggested_questions: list[str] = Field(default_factory=list)
    offtrack_detected: bool = False
    offtrack_title: str = ""
    offtrack_reason: str = ""
    current_discussion: str = ""
    original_agenda: str = ""


class RecordingState(BaseModel):
    meeting_id: str
    recording_active: bool
    updated_at: datetime = Field(default_factory=utc_now)


class Meeting(BaseModel):
    id: str = Field(default_factory=lambda: new_id("meeting"))
    title: str
    description: str = ""
    agenda_items: list[str] = Field(default_factory=list)
    background_material: str = ""
    participant_roles: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)
    briefings: dict[str, Briefing] = Field(default_factory=dict)
    profiles: dict[str, KnowledgeProfile] = Field(default_factory=dict)
    chat_messages: list[ChatMessage] = Field(default_factory=list)
    transcript_segments: list[TranscriptSegment] = Field(default_factory=list)
    annotations: list[Annotation] = Field(default_factory=list)
    recommendations: dict[str, SessionRecommendations] = Field(default_factory=dict)
    recording_active: bool = False


class MeetingSummary(BaseModel):
    id: str
    title: str
    participant_roles: list[str]
    participant_role_count: int
    created_at: datetime
    briefing_ready_count: int
    briefing_total_count: int


class MeetingDetailResponse(BaseModel):
    id: str
    title: str
    description: str
    agenda_items: list[str]
    background_material: str
    participant_roles: list[str]
    created_at: datetime
    briefings: list[Briefing]
    profiles: list[KnowledgeProfile]
    chat_messages: list[ChatMessage]
    transcript_segments: list[TranscriptSegment]
    recording_active: bool


class SessionStateResponse(BaseModel):
    meeting_id: str
    title: str
    agenda_items: list[str]
    recording_active: bool
    knowledge_profile: KnowledgeProfile | None = None
    chat_messages: list[ChatMessage] = Field(default_factory=list)
    transcript_segments: list[TranscriptSegment] = Field(default_factory=list)
    annotations: list[Annotation] = Field(default_factory=list)
    recommendations: SessionRecommendations | None = None


class AppState(BaseModel):
    meetings: list[Meeting] = Field(default_factory=list)
