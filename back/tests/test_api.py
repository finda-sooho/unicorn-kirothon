from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient

os.environ["MEETING_ASSIST_DISABLE_LLM"] = "1"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import main
from models import Meeting
from storage import JsonStore


def make_client(tmp_path) -> TestClient:
    main.store = JsonStore(tmp_path / "meeting-store.json")
    return TestClient(main.app)


def test_meeting_creation_validation_returns_specific_message(tmp_path) -> None:
    client = make_client(tmp_path)
    response = client.post(
        "/api/meetings",
        json={
            "title": " ",
            "description": "desc",
            "agenda_items": ["안건"],
            "background_material": "배경",
            "participant_roles": [],
        },
    )

    assert response.status_code == 422
    assert response.json()["message"] == "미팅 제목을 입력해 주세요"


def test_profile_briefing_and_session_flow(tmp_path) -> None:
    client = make_client(tmp_path)
    meeting = client.post(
        "/api/meetings",
        json={
            "title": "개인정보 마스킹 전략 정렬",
            "description": "PII 처리 방식을 정리한다.",
            "agenda_items": ["PII 마스킹 정책", "API 응답 필드 재정의"],
            "background_material": "현재 일부 응답에 raw email이 포함된다.",
            "participant_roles": ["PO", "BE 개발자", "법무"],
        },
    ).json()

    attendee_id = "attendee-be"
    profile_response = client.post(
        f"/api/meetings/{meeting['id']}/profiles",
        json={
            "attendee_id": attendee_id,
            "role": "BE 개발자",
            "expertise_areas": ["API 설계"],
            "knowledge_gaps": ["PII", "보관 정책"],
            "custom_fields": [{"label": "서비스", "value": "정산"}],
        },
    )
    assert profile_response.status_code == 200
    assert profile_response.json()["role"] == "BE 개발자"

    briefing_response = client.post(f"/api/meetings/{meeting['id']}/briefings/generate")
    assert briefing_response.status_code == 200
    briefing_roles = [briefing["role"] for briefing in briefing_response.json()["briefings"]]
    assert briefing_roles == ["PO", "BE 개발자", "법무"]
    assert all(briefing["status"] == "ready" for briefing in briefing_response.json()["briefings"])

    transcript_response = client.post(
        f"/api/meetings/{meeting['id']}/transcript",
        json={
            "attendee_id": attendee_id,
            "text": "이번 주에는 API 응답에서 PII masking 과 retention 기준을 함께 논의해야 합니다.",
            "speaker": "PO",
            "source": "manual",
        },
    )
    assert transcript_response.status_code == 200
    session_payload = transcript_response.json()
    assert len(session_payload["transcript_segments"]) == 1
    assert session_payload["annotations"][0]["title"].startswith("PII")
    assert len(session_payload["recommendations"]["suggested_questions"]) <= 3

    chat_response = client.post(
        f"/api/meetings/{meeting['id']}/chat",
        json={"attendee_id": attendee_id, "question": "PII masking이 뭔데?"},
    )
    assert chat_response.status_code == 200
    latest_answer = chat_response.json()["chat_messages"][-1]["answer"]
    assert "BE 개발자 관점" in latest_answer
    assert "현재 회의 맥락" in latest_answer


def test_pydantic_roundtrip_preserves_meeting() -> None:
    meeting = Meeting(
        title="정렬 회의",
        description="라운드트립 테스트",
        agenda_items=["안건 1"],
        background_material="배경 자료",
        participant_roles=["QA"],
    )

    encoded = meeting.model_dump_json()
    restored = Meeting.model_validate_json(encoded)

    assert restored == meeting
