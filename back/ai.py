from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

from models import (
    BriefingDraft,
    ChatAnswerDraft,
    KnowledgeProfile,
    Meeting,
    SessionAssistDraft,
    TranscriptSegment,
)

load_dotenv(Path(__file__).resolve().parent / ".env", override=False)


def _meeting_context(meeting: Meeting) -> dict[str, object]:
    return {
        "title": meeting.title,
        "description": meeting.description,
        "agenda_items": meeting.agenda_items,
        "background_material": meeting.background_material,
        "participant_roles": meeting.participant_roles,
        "recent_transcript": [
            {
                "speaker": segment.speaker,
                "text": segment.text,
                "created_at": segment.created_at.isoformat(),
            }
            for segment in meeting.transcript_segments[-4:]
        ],
    }


def _profile_context(profile: KnowledgeProfile) -> dict[str, object]:
    return {
        "attendee_id": profile.attendee_id,
        "role": profile.role,
        "expertise_areas": profile.expertise_areas,
        "knowledge_gaps": profile.knowledge_gaps,
        "custom_fields": [field.model_dump() for field in profile.custom_fields],
    }


class OpenAIContentService:
    def __init__(self) -> None:
        self.model = os.getenv("OPENAI_MODEL", "gpt-5-mini-2025-08-07")
        self.enabled = bool(os.getenv("OPENAI_API_KEY")) and os.getenv("MEETING_ASSIST_DISABLE_LLM") != "1"
        self.client = OpenAI() if self.enabled else None

    def _parse(self, output_type, system_prompt: str, user_payload: dict[str, object]):
        if not self.client:
            raise RuntimeError("OPENAI_API_KEY is not configured")

        response = self.client.responses.parse(
            model=self.model,
            input=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False, indent=2)},
            ],
            text_format=output_type,
        )
        parsed = response.output_parsed
        if parsed is None:
            raise RuntimeError("OpenAI structured output parsing failed")
        return parsed

    def generate_briefing(
        self,
        meeting: Meeting,
        role: str,
        profiles: list[KnowledgeProfile],
    ) -> BriefingDraft:
        return self._parse(
            BriefingDraft,
            (
                "You create concise Korean meeting briefings for a single attendee role. "
                "Return only data that matches the schema. "
                "The briefing must be role-specific, use the provided meeting agenda and background, "
                "and add extra explanation for knowledge gaps. "
                "Keep summary to 2-4 sentences, each list concise, and glossary terms unique."
            ),
            {
                "meeting": _meeting_context(meeting),
                "target_role": role,
                "profiles_for_role": [_profile_context(profile) for profile in profiles],
            },
        )

    def answer_chat(
        self,
        meeting: Meeting,
        profile: KnowledgeProfile,
        question: str,
    ) -> ChatAnswerDraft:
        return self._parse(
            ChatAnswerDraft,
            (
                "You answer live meeting questions in Korean. "
                "Adapt the explanation to the attendee's role, expertise, and knowledge gaps. "
                "Answer in 3 short paragraphs separated by blank lines: core explanation, role-specific impact, current meeting context. "
                "When useful, add one extra sentence for the attendee's stated knowledge gap."
            ),
            {
                "meeting": _meeting_context(meeting),
                "attendee_profile": _profile_context(profile),
                "question": question,
            },
        )

    def generate_session_assist(
        self,
        meeting: Meeting,
        profile: KnowledgeProfile,
        segment: TranscriptSegment,
    ) -> SessionAssistDraft:
        return self._parse(
            SessionAssistDraft,
            (
                "You are a live meeting copilot. Analyze one new transcript segment for a single attendee in Korean. "
                "Decide whether an inline annotation is needed for this attendee, produce up to 3 suggested questions, "
                "and detect if the conversation drifted away from the original agenda. "
                "Only mark offtrack_detected true when the segment clearly leaves the agenda. "
                "Suggested questions must be actionable and specific to the attendee's role."
            ),
            {
                "meeting": _meeting_context(meeting),
                "attendee_profile": _profile_context(profile),
                "transcript_segment": {
                    "speaker": segment.speaker,
                    "text": segment.text,
                    "source": segment.source,
                    "created_at": segment.created_at.isoformat(),
                },
            },
        )


openai_content_service = OpenAIContentService()
