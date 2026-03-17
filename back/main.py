from __future__ import annotations

from fastapi import FastAPI, HTTPException, Query, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from models import (
    ApiError,
    Briefing,
    ChatRequest,
    KnowledgeProfile,
    KnowledgeProfileInput,
    Meeting,
    MeetingCreateRequest,
    MeetingDetailResponse,
    MeetingSummary,
    RecordingState,
    SessionStateResponse,
    TranscriptSegment,
    TranscriptAppendRequest,
    utc_now,
)
from services import (
    build_chat_message,
    generate_briefings,
    rebuild_profile_artifacts,
    stream_chat_answer,
    update_session_artifacts,
)
from storage import JsonStore

app = FastAPI(
    title="Meeting Alignment AI API",
    description="Meeting assist backend for briefing, Q&A, transcript, and contextual guidance.",
)
store = JsonStore()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def handle_validation_error(_, exc: RequestValidationError) -> JSONResponse:
    messages = [
        error["msg"].replace("Value error, ", "").replace("value_error, ", "")
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content=ApiError(message=messages[0] if messages else "입력값을 확인해 주세요").model_dump(),
    )


@app.exception_handler(HTTPException)
async def handle_http_error(_, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=ApiError(message=str(exc.detail)).model_dump(),
    )


def get_meeting_or_404(meetings: list[Meeting], meeting_id: str) -> Meeting:
    for meeting in meetings:
        if meeting.id == meeting_id:
            return meeting
    raise HTTPException(status_code=404, detail="미팅을 찾을 수 없습니다")


def serialize_meeting(meeting: Meeting) -> MeetingDetailResponse:
    serialized_briefings = [
        meeting.briefings.get(role) or Briefing(role=role, status="idle")
        for role in meeting.participant_roles
    ]

    profiles = sorted(meeting.profiles.values(), key=lambda item: item.updated_at)
    return MeetingDetailResponse(
        id=meeting.id,
        title=meeting.title,
        description=meeting.description,
        agenda_items=meeting.agenda_items,
        background_material=meeting.background_material,
        participant_roles=meeting.participant_roles,
        created_at=meeting.created_at,
        briefings=serialized_briefings,
        profiles=profiles,
        chat_messages=meeting.chat_messages,
        transcript_segments=meeting.transcript_segments,
        recording_active=meeting.recording_active,
    )


def serialize_session(meeting: Meeting, attendee_id: str | None) -> SessionStateResponse:
    knowledge_profile = meeting.profiles.get(attendee_id) if attendee_id else None
    annotations = (
        [annotation for annotation in meeting.annotations if annotation.attendee_id == attendee_id]
        if attendee_id
        else []
    )
    recommendations = meeting.recommendations.get(attendee_id) if attendee_id else None

    return SessionStateResponse(
        meeting_id=meeting.id,
        title=meeting.title,
        agenda_items=meeting.agenda_items,
        recording_active=meeting.recording_active,
        knowledge_profile=knowledge_profile,
        chat_messages=meeting.chat_messages,
        transcript_segments=meeting.transcript_segments,
        annotations=annotations,
        recommendations=recommendations,
    )


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "Meeting Alignment AI API"}


@app.get("/api/meetings", response_model=list[MeetingSummary])
def list_meetings() -> list[MeetingSummary]:
    state = store.load()
    ordered = sorted(state.meetings, key=lambda item: item.created_at, reverse=True)
    return [
        MeetingSummary(
            id=meeting.id,
            title=meeting.title,
            participant_roles=meeting.participant_roles,
            participant_role_count=len(meeting.participant_roles),
            created_at=meeting.created_at,
            briefing_ready_count=sum(1 for briefing in meeting.briefings.values() if briefing.status == "ready"),
            briefing_total_count=len(meeting.participant_roles),
        )
        for meeting in ordered
    ]


@app.post(
    "/api/meetings",
    response_model=MeetingDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_meeting(payload: MeetingCreateRequest) -> MeetingDetailResponse:
    def handler(state):
        meeting = Meeting(**payload.model_dump())
        state.meetings.append(meeting)
        return serialize_meeting(meeting)

    return store.transaction(handler)


@app.get("/api/meetings/{meeting_id}", response_model=MeetingDetailResponse)
def get_meeting(meeting_id: str) -> MeetingDetailResponse:
    state = store.load()
    meeting = get_meeting_or_404(state.meetings, meeting_id)
    return serialize_meeting(meeting)


@app.post("/api/meetings/{meeting_id}/profiles", response_model=KnowledgeProfile)
def save_profile(meeting_id: str, payload: KnowledgeProfileInput) -> KnowledgeProfile:
    def handler(state):
        meeting = get_meeting_or_404(state.meetings, meeting_id)
        profile = KnowledgeProfile(**payload.model_dump(), updated_at=utc_now())
        meeting.profiles[payload.attendee_id] = profile
        rebuild_profile_artifacts(meeting, profile)
        return profile

    return store.transaction(handler)


@app.post("/api/meetings/{meeting_id}/briefings/generate", response_model=MeetingDetailResponse)
def generate_meeting_briefings(meeting_id: str) -> MeetingDetailResponse:
    def handler(state):
        meeting = get_meeting_or_404(state.meetings, meeting_id)
        try:
            generate_briefings(meeting)
        except Exception as exc:  # pragma: no cover - defensive surface for API response
            raise HTTPException(
                status_code=500,
                detail="브리핑 생성에 실패했습니다. 다시 시도해 주세요.",
            ) from exc
        return serialize_meeting(meeting)

    return store.transaction(handler)


@app.post("/api/meetings/{meeting_id}/briefings/{role}/generate", response_model=Briefing)
def generate_single_briefing(meeting_id: str, role: str) -> Briefing:
    def handler(state):
        meeting = get_meeting_or_404(state.meetings, meeting_id)
        if role not in meeting.participant_roles:
            raise HTTPException(status_code=404, detail="해당 역할을 찾을 수 없습니다")
        try:
            from services import build_briefing
            briefing = build_briefing(meeting, role)
            meeting.briefings[role] = briefing
            return briefing
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"'{role}' 브리핑 생성에 실패했습니다.",
            ) from exc

    return store.transaction(handler)


@app.get("/api/meetings/{meeting_id}/session", response_model=SessionStateResponse)
def get_session_state(
    meeting_id: str,
    attendee_id: str | None = Query(default=None),
) -> SessionStateResponse:
    state = store.load()
    meeting = get_meeting_or_404(state.meetings, meeting_id)
    return serialize_session(meeting, attendee_id)


@app.post("/api/meetings/{meeting_id}/chat", response_model=SessionStateResponse)
def ask_chat_question(meeting_id: str, payload: ChatRequest) -> SessionStateResponse:
    def handler(state):
        meeting = get_meeting_or_404(state.meetings, meeting_id)
        profile = meeting.profiles.get(payload.attendee_id)
        if not profile:
            raise HTTPException(status_code=400, detail="지식 프로필을 먼저 저장해 주세요")

        try:
            message = build_chat_message(meeting, profile, payload.question)
        except Exception as exc:  # pragma: no cover - defensive surface for API response
            raise HTTPException(
                status_code=500,
                detail="답변을 생성할 수 없습니다. 다시 시도해 주세요.",
            ) from exc
        meeting.chat_messages.append(message)
        return serialize_session(meeting, payload.attendee_id)

    return store.transaction(handler)


@app.post("/api/meetings/{meeting_id}/chat/stream")
def stream_chat_question(meeting_id: str, payload: ChatRequest) -> StreamingResponse:
    state = store.load()
    meeting = get_meeting_or_404(state.meetings, meeting_id)
    profile = meeting.profiles.get(payload.attendee_id)
    if not profile:
        raise HTTPException(status_code=400, detail="지식 프로필을 먼저 저장해 주세요")

    def event_stream():
        full_answer = ""
        for chunk in stream_chat_answer(meeting, profile, payload.question):
            full_answer += chunk
            yield f"data: {chunk}\n\n"
        yield "data: [DONE]\n\n"

        # Save the complete message
        message = ChatMessage(
            attendee_id=profile.attendee_id,
            role=profile.role,
            question=payload.question,
            answer=full_answer,
        )

        def save_handler(s):
            m = get_meeting_or_404(s.meetings, meeting_id)
            m.chat_messages.append(message)

        store.transaction(save_handler)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/meetings/{meeting_id}/recording/start", response_model=RecordingState)
def start_recording(meeting_id: str) -> RecordingState:
    def handler(state):
        meeting = get_meeting_or_404(state.meetings, meeting_id)
        meeting.recording_active = True
        return RecordingState(meeting_id=meeting.id, recording_active=True, updated_at=utc_now())

    return store.transaction(handler)


@app.post("/api/meetings/{meeting_id}/recording/stop", response_model=RecordingState)
def stop_recording(meeting_id: str) -> RecordingState:
    def handler(state):
        meeting = get_meeting_or_404(state.meetings, meeting_id)
        meeting.recording_active = False
        return RecordingState(meeting_id=meeting.id, recording_active=False, updated_at=utc_now())

    return store.transaction(handler)


@app.post("/api/meetings/{meeting_id}/recommendations/refresh", response_model=SessionStateResponse)
def refresh_recommendations(
    meeting_id: str,
    attendee_id: str = Query(),
) -> SessionStateResponse:
    def handler(state):
        meeting = get_meeting_or_404(state.meetings, meeting_id)
        profile = meeting.profiles.get(attendee_id)
        if not profile:
            raise HTTPException(status_code=400, detail="지식 프로필을 먼저 저장해 주세요")

        if not meeting.transcript_segments:
            return serialize_session(meeting, attendee_id)

        latest_segment = meeting.transcript_segments[-1]
        from services import build_session_assist
        annotation, recommendations = build_session_assist(meeting, profile, latest_segment, use_llm=True)
        if annotation:
            already_exists = any(
                item.attendee_id == annotation.attendee_id and item.segment_id == annotation.segment_id
                for item in meeting.annotations
            )
            if not already_exists:
                meeting.annotations.append(annotation)
        meeting.recommendations[profile.attendee_id] = recommendations
        return serialize_session(meeting, attendee_id)

    return store.transaction(handler)


@app.post("/api/meetings/{meeting_id}/transcript", response_model=SessionStateResponse)
def append_transcript(meeting_id: str, payload: TranscriptAppendRequest) -> SessionStateResponse:
    def handler(state):
        meeting = get_meeting_or_404(state.meetings, meeting_id)
        created_segment = TranscriptSegment(
            text=payload.text,
            speaker=payload.speaker,
            source=payload.source,
        )
        meeting.transcript_segments.append(created_segment)
        update_session_artifacts(meeting, created_segment)
        return serialize_session(meeting, payload.attendee_id)

    return store.transaction(handler)
