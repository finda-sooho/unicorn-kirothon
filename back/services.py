from __future__ import annotations

import re
from collections.abc import Iterable

from ai import openai_content_service
from models import (
    Annotation,
    Briefing,
    ChatMessage,
    GlossaryItem,
    KnowledgeProfile,
    Meeting,
    SessionRecommendations,
    SuggestedTopic,
    TranscriptSegment,
    utc_now,
)

ROLE_GUIDES = {
    "po": {
        "lens": "제품 전략과 우선순위",
        "background_focus": "왜 지금 이 안건을 결정해야 하는지와 사용자 영향",
        "decision_focus": "목표, 일정, 의사결정 범위",
        "question_focus": "어떤 선택이 사용자 가치와 출시 일정에 가장 직접적으로 연결되는지",
        "annotation_prefix": "제품 맥락",
    },
    "be": {
        "lens": "백엔드 구조와 시스템 안정성",
        "background_focus": "API 계약, 데이터 흐름, 성능과 보안 영향",
        "decision_focus": "인터페이스 변경, 데이터 모델, 운영 리스크",
        "question_focus": "구현 복잡도와 장애 가능성을 어디에서 줄일 수 있는지",
        "annotation_prefix": "시스템 맥락",
    },
    "fe": {
        "lens": "사용자 인터페이스와 상호작용 흐름",
        "background_focus": "사용자 상태 전이, 입력/출력 구조, 응답성",
        "decision_focus": "화면 흐름, 상태 관리, 에러 경험",
        "question_focus": "사용자에게 드러나는 변화와 필요한 피드백이 충분한지",
        "annotation_prefix": "인터페이스 맥락",
    },
    "designer": {
        "lens": "사용자 경험과 정보 전달",
        "background_focus": "사용자 맥락, 인지 부하, 인터랙션 명확성",
        "decision_focus": "UX 리스크, 정보 위계, 화면 복잡도",
        "question_focus": "이 결정이 사용자의 이해와 행동을 어떻게 바꾸는지",
        "annotation_prefix": "UX 맥락",
    },
    "legal": {
        "lens": "규정 준수와 법적 책임",
        "background_focus": "개인정보, 계약상 책임, 운영 정책",
        "decision_focus": "동의, 보관, 접근 통제, 감사 가능성",
        "question_focus": "어떤 규제나 내부 정책 리스크가 남는지",
        "annotation_prefix": "규정 맥락",
    },
    "qa": {
        "lens": "품질 보증과 예외 흐름 검증",
        "background_focus": "실패 케이스, 경계 조건, 테스트 전략",
        "decision_focus": "검증 범위, 회귀 위험, 관측 가능성",
        "question_focus": "무엇을 테스트해야 실제 장애를 미리 막을 수 있는지",
        "annotation_prefix": "품질 맥락",
    },
    "default": {
        "lens": "회의 맥락 정렬",
        "background_focus": "회의 목표, 핵심 용어, 의사결정 포인트",
        "decision_focus": "무엇을 결정하고 무엇이 열려 있는지",
        "question_focus": "이 안건에서 지금 확인해야 할 핵심이 무엇인지",
        "annotation_prefix": "맥락 보조",
    },
}

TERM_EXPLANATIONS = {
    "api": "시스템 간 요청과 응답 방식에 대한 계약입니다.",
    "pii": "개인을 식별할 수 있는 정보로, 수집과 보관 시 보호 의무가 큽니다.",
    "latency": "요청을 보낸 뒤 응답이 돌아오기까지 걸리는 지연 시간입니다.",
    "sla": "서비스 수준 약속으로, 가용성이나 응답 시간 기준을 의미합니다.",
    "mvp": "가설 검증에 필요한 최소 기능 묶음입니다.",
    "audit": "변경과 접근 이력을 확인할 수 있게 남기는 추적 장치입니다.",
    "masking": "민감 정보를 그대로 노출하지 않도록 일부를 숨기는 처리입니다.",
    "consent": "데이터 수집이나 활용 전에 명시적으로 동의를 받는 절차입니다.",
    "rollout": "기능을 단계적으로 배포하며 위험을 통제하는 운영 방식입니다.",
    "fallback": "예상 흐름이 실패했을 때 서비스 연속성을 지키는 대체 경로입니다.",
    "rate": "단위 시간당 처리량이나 호출 횟수를 의미합니다.",
    "schema": "데이터 구조와 제약 조건을 정의한 형식입니다.",
    "retention": "데이터를 얼마 동안 보관할지 정한 정책입니다.",
}

STOPWORDS = {
    "그리고",
    "그러면",
    "관련",
    "이번",
    "현재",
    "회의",
    "안건",
    "내용",
    "설명",
    "기준",
    "해야",
    "합니다",
    "있는",
    "으로",
    "에서",
    "the",
    "and",
    "with",
}

OFFTRACK_HINTS = {
    "점심",
    "회식",
    "채용",
    "복지",
    "좌석",
    "여행",
    "휴가",
    "오피스",
    "인테리어",
}


def role_key(role: str) -> str:
    normalized = role.casefold()
    if "po" in normalized or "pm" in normalized or "product" in normalized or "기획" in normalized:
        return "po"
    if "backend" in normalized or "back-end" in normalized or "be" in normalized or "서버" in normalized:
        return "be"
    if "frontend" in normalized or "front-end" in normalized or "fe" in normalized or "웹" in normalized:
        return "fe"
    if "design" in normalized or "designer" in normalized or "디자인" in normalized:
        return "designer"
    if "legal" in normalized or "law" in normalized or "법무" in normalized:
        return "legal"
    if "qa" in normalized or "test" in normalized or "품질" in normalized:
        return "qa"
    return "default"


def role_guide(role: str) -> dict[str, str]:
    return ROLE_GUIDES[role_key(role)]


def unique(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        key = value.casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(value)
    return result


def extract_keywords(*parts: str, limit: int = 5) -> list[str]:
    text = " ".join(part for part in parts if part)
    tokens = re.findall(r"[A-Za-z][A-Za-z0-9_-]{1,}|[가-힣]{2,}", text)
    keywords: list[str] = []
    seen: set[str] = set()
    for token in tokens:
        lowered = token.casefold()
        if lowered in STOPWORDS or lowered in seen:
            continue
        seen.add(lowered)
        keywords.append(token)
        if len(keywords) >= limit:
            break
    return keywords


def explain_term(term: str, role: str) -> str:
    base = TERM_EXPLANATIONS.get(term.casefold())
    lens = role_guide(role)["lens"]
    if base:
        return f"{base} 이 회의에서는 {lens} 관점에서 왜 중요한지 함께 봐야 합니다."
    return f"'{term}'은(는) 이번 회의의 핵심 맥락 중 하나이며, {lens} 관점에서 영향 범위를 정리할 필요가 있습니다."


def meeting_focus_sentence(meeting: Meeting) -> str:
    if meeting.description:
        return meeting.description
    if meeting.agenda_items:
        return meeting.agenda_items[0]
    return meeting.title


def build_briefing(meeting: Meeting, role: str) -> Briefing:
    relevant_profiles = [
        profile for profile in meeting.profiles.values() if role_key(profile.role) == role_key(role)
    ]

    if openai_content_service.enabled:
        try:
            draft = openai_content_service.generate_briefing(meeting, role, relevant_profiles)
            return Briefing(
                role=role,
                status="ready",
                summary=draft.summary.strip(),
                background_knowledge=unique(
                    item.strip() for item in draft.background_knowledge if item.strip()
                ),
                discussion_points=unique(
                    item.strip() for item in draft.discussion_points if item.strip()
                ),
                glossary=[
                    GlossaryItem(
                        term=item.term.strip(),
                        explanation=item.explanation.strip(),
                    )
                    for item in draft.glossary
                    if item.term.strip() and item.explanation.strip()
                ],
                generated_at=utc_now(),
            )
        except Exception:
            pass

    guide = role_guide(role)
    knowledge_gaps = unique(
        gap for profile in relevant_profiles for gap in profile.knowledge_gaps
    )
    expertise_areas = unique(
        area for profile in relevant_profiles for area in profile.expertise_areas
    )
    focus = meeting_focus_sentence(meeting)
    agenda_preview = meeting.agenda_items[:3] or ["핵심 안건 정리"]
    keywords = extract_keywords(
        meeting.title,
        meeting.description,
        " ".join(meeting.agenda_items),
        meeting.background_material,
        limit=4,
    )
    glossary = [GlossaryItem(term=term, explanation=explain_term(term, role)) for term in keywords]

    background_knowledge = [
        f"{guide['lens']} 관점에서 보면 이번 미팅의 중심은 '{focus}'입니다.",
        f"먼저 알아둘 배경은 {guide['background_focus']}입니다.",
    ]

    if expertise_areas:
        background_knowledge.append(
            f"이미 강점으로 표시한 영역은 {', '.join(expertise_areas[:3])}이며, 이 부분은 의사결정 검토에 바로 활용할 수 있습니다."
        )

    if knowledge_gaps:
        for gap in knowledge_gaps[:2]:
            background_knowledge.append(
                f"{gap} 보충: '{gap}'이 이번 안건에서 어떤 결정과 연결되는지 먼저 이해하면 회의 맥락을 놓치지 않기 쉽습니다."
            )

    discussion_points = [
        f"{item}를 논의할 때 {guide['decision_focus']} 기준으로 확인할 것" for item in agenda_preview
    ]
    discussion_points.append(
        f"최종적으로 {guide['question_focus']}를 기준으로 결정 로그를 남기는 것이 좋습니다."
    )

    summary = (
        f"{meeting.title}은(는) {focus}를 중심으로 정렬해야 하는 미팅입니다. "
        f"{role} 역할에서는 {guide['lens']} 관점에서 우선순위와 리스크를 읽어야 합니다."
    )

    return Briefing(
        role=role,
        status="ready",
        summary=summary,
        background_knowledge=background_knowledge,
        discussion_points=discussion_points,
        glossary=glossary,
        generated_at=utc_now(),
    )


def generate_briefings(meeting: Meeting) -> None:
    for role in meeting.participant_roles:
        meeting.briefings[role] = Briefing(role=role, status="generating")

    for role in meeting.participant_roles:
        meeting.briefings[role] = build_briefing(meeting, role)


def related_context(meeting: Meeting) -> str:
    recent_segments = " ".join(segment.text for segment in meeting.transcript_segments[-3:])
    return recent_segments or meeting_focus_sentence(meeting)


def stream_chat_answer(meeting: Meeting, profile: KnowledgeProfile, question: str):
    """Yield text chunks for a streaming chat answer."""
    if openai_content_service.enabled and openai_content_service.client:
        try:
            import json as _json
            system_prompt = (
                "You answer live meeting questions in Korean. "
                "Adapt the explanation to the attendee's role, expertise, and knowledge gaps. "
                "Answer in 3 short paragraphs separated by blank lines: core explanation, role-specific impact, current meeting context. "
                "When useful, add one extra sentence for the attendee's stated knowledge gap."
            )
            user_payload = {
                "meeting": {
                    "title": meeting.title,
                    "description": meeting.description,
                    "agenda_items": meeting.agenda_items,
                    "background_material": meeting.background_material,
                    "recent_transcript": [
                        {"speaker": s.speaker, "text": s.text}
                        for s in meeting.transcript_segments[-4:]
                    ],
                },
                "attendee_profile": {
                    "role": profile.role,
                    "expertise_areas": profile.expertise_areas,
                    "knowledge_gaps": profile.knowledge_gaps,
                },
                "question": question,
            }
            stream = openai_content_service.client.chat.completions.create(
                model=openai_content_service.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": _json.dumps(user_payload, ensure_ascii=False)},
                ],
                stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta if chunk.choices else None
                if delta and delta.content:
                    yield delta.content
            return
        except Exception:
            pass

    # Fallback: yield full answer at once
    answer = build_chat_answer(meeting, profile, question)
    yield answer


def build_chat_answer(meeting: Meeting, profile: KnowledgeProfile, question: str) -> str:
    if openai_content_service.enabled:
        try:
            draft = openai_content_service.answer_chat(meeting, profile, question)
            if draft.answer.strip():
                return draft.answer.strip()
        except Exception:
            pass

    guide = role_guide(profile.role)
    context = related_context(meeting)
    keywords = extract_keywords(question, context, meeting.background_material, limit=2)
    term_focus = keywords[0] if keywords else question

    sections = [
        f"핵심: {explain_term(term_focus, profile.role)}",
        f"{profile.role} 관점: 이번 질문은 {guide['decision_focus']} 기준으로 보면 답이 더 분명해집니다.",
        f"현재 회의 맥락: 최근 논의는 '{context[:120]}' 방향으로 이어지고 있으니, 답변도 그 흐름에 맞춰 해석하면 됩니다.",
    ]

    if profile.knowledge_gaps:
        sections.append(
            f"보충 설명: 특히 {profile.knowledge_gaps[0]}에 익숙하지 않다면 용어 정의보다 '이게 어떤 결정에 영향을 주는지'를 먼저 보세요."
        )

    return "\n\n".join(sections)


def build_chat_message(meeting: Meeting, profile: KnowledgeProfile, question: str) -> ChatMessage:
    return ChatMessage(
        attendee_id=profile.attendee_id,
        role=profile.role,
        question=question,
        answer=build_chat_answer(meeting, profile, question),
    )


def annotation_focus(segment: TranscriptSegment, profile: KnowledgeProfile) -> str | None:
    lowered = segment.text.casefold()
    for gap in profile.knowledge_gaps:
        if gap.casefold() in lowered:
            return gap

    for keyword in extract_keywords(segment.text, limit=4):
        if keyword.casefold() in TERM_EXPLANATIONS:
            return keyword

    if len(segment.text.split()) >= 12:
        return extract_keywords(segment.text, limit=1)[0] if extract_keywords(segment.text, limit=1) else None

    return None


def build_annotation(segment: TranscriptSegment, profile: KnowledgeProfile) -> Annotation | None:
    focus = annotation_focus(segment, profile)
    if not focus:
        return None

    guide = role_guide(profile.role)
    body = (
        f"{guide['annotation_prefix']}: '{focus}'은(는) 이 구간에서 놓치기 쉬운 핵심입니다. "
        f"{profile.role} 역할에서는 {guide['lens']} 기준으로 이 표현이 어떤 리스크나 결정과 연결되는지 보는 것이 좋습니다."
    )
    return Annotation(
        attendee_id=profile.attendee_id,
        role=profile.role,
        segment_id=segment.id,
        title=f"{focus} 보조 설명",
        body=body,
    )


def build_suggested_questions(meeting: Meeting, profile: KnowledgeProfile, segment: TranscriptSegment) -> list[str]:
    guide = role_guide(profile.role)
    agenda_item = meeting.agenda_items[0] if meeting.agenda_items else meeting.title
    keyword = extract_keywords(segment.text, limit=1)
    lead = keyword[0] if keyword else agenda_item

    suggestions = [
        f"{lead}이(가) 이번 안건에서 어떤 결정으로 이어지는지 확인해 주세요.",
        f"{guide['decision_focus']} 기준으로 아직 열려 있는 쟁점이 무엇인지 질문해 보세요.",
        f"{agenda_item}와 직접 연결되는 다음 액션이 무엇인지 정리해 달라고 요청해 보세요.",
    ]

    if profile.knowledge_gaps:
        suggestions.insert(
            1,
            f"{profile.knowledge_gaps[0]}를 잘 모르는 사람 기준으로 다시 설명해 달라고 요청해 보세요.",
        )

    return unique(suggestions)[:3]


def build_offtrack_topic(meeting: Meeting, segment: TranscriptSegment) -> SuggestedTopic | None:
    if not meeting.agenda_items:
        return None

    agenda_tokens = {token.casefold() for token in extract_keywords(" ".join(meeting.agenda_items), limit=12)}
    segment_tokens = {token.casefold() for token in extract_keywords(segment.text, limit=8)}
    overlap = agenda_tokens & segment_tokens

    hinted = any(hint in segment.text for hint in OFFTRACK_HINTS)
    if overlap or not segment_tokens:
        return None
    if not hinted and len(segment.text) < 28:
        return None

    original_agenda = meeting.agenda_items[0]
    current_discussion = segment.text[:80]
    return SuggestedTopic(
        title=f"안건 복귀 제안: {original_agenda}",
        reason=(
            f"현재 논의는 '{current_discussion}' 쪽으로 확장되고 있습니다. "
            f"원래 안건인 '{original_agenda}'와 다시 연결해 결론을 정리하는 것이 좋습니다."
        ),
        current_discussion=current_discussion,
        original_agenda=original_agenda,
    )


def build_session_assist(
    meeting: Meeting,
    profile: KnowledgeProfile,
    segment: TranscriptSegment,
    *,
    use_llm: bool = True,
) -> tuple[Annotation | None, SessionRecommendations]:
    if use_llm and openai_content_service.enabled:
        try:
            draft = openai_content_service.generate_session_assist(meeting, profile, segment)
            annotation: Annotation | None = None
            if draft.should_annotate and draft.annotation_body.strip():
                annotation = Annotation(
                    attendee_id=profile.attendee_id,
                    role=profile.role,
                    segment_id=segment.id,
                    title=(draft.annotation_title.strip() or "보조 설명"),
                    body=draft.annotation_body.strip(),
                )

            suggested_topic: SuggestedTopic | None = None
            if draft.offtrack_detected and draft.offtrack_reason.strip():
                suggested_topic = SuggestedTopic(
                    title=(draft.offtrack_title.strip() or f"안건 복귀 제안: {meeting.agenda_items[0] if meeting.agenda_items else meeting.title}"),
                    reason=draft.offtrack_reason.strip(),
                    current_discussion=(draft.current_discussion.strip() or segment.text[:80]),
                    original_agenda=(
                        draft.original_agenda.strip()
                        or (meeting.agenda_items[0] if meeting.agenda_items else meeting.title)
                    ),
                )

            recommendations = SessionRecommendations(
                attendee_id=profile.attendee_id,
                suggested_questions=unique(
                    question.strip() for question in draft.suggested_questions if question.strip()
                )[:3],
                suggested_topic=suggested_topic,
                updated_at=utc_now(),
            )
            return annotation, recommendations
        except Exception:
            pass

    annotation = build_annotation(segment, profile)
    recommendations = SessionRecommendations(
        attendee_id=profile.attendee_id,
        suggested_questions=build_suggested_questions(meeting, profile, segment),
        suggested_topic=build_offtrack_topic(meeting, segment),
        updated_at=utc_now(),
    )
    return annotation, recommendations


def update_session_artifacts(meeting: Meeting, segment: TranscriptSegment) -> None:
    for profile in meeting.profiles.values():
        annotation, recommendations = build_session_assist(meeting, profile, segment, use_llm=True)
        if annotation:
            already_exists = any(
                item.attendee_id == annotation.attendee_id and item.segment_id == annotation.segment_id
                for item in meeting.annotations
            )
            if not already_exists:
                meeting.annotations.append(annotation)

        meeting.recommendations[profile.attendee_id] = recommendations


def rebuild_profile_artifacts(meeting: Meeting, profile: KnowledgeProfile) -> None:
    meeting.annotations = [
        annotation for annotation in meeting.annotations if annotation.attendee_id != profile.attendee_id
    ]
    meeting.recommendations.pop(profile.attendee_id, None)

    latest_segment: TranscriptSegment | None = None
    for segment in meeting.transcript_segments:
        # Historical transcript hydration runs on profile save, so keep it fast and local.
        annotation, recommendations = build_session_assist(
            meeting,
            profile,
            segment,
            use_llm=False,
        )
        if annotation:
            meeting.annotations.append(annotation)
        meeting.recommendations[profile.attendee_id] = recommendations
        latest_segment = segment

    if not latest_segment:
        meeting.recommendations.pop(profile.attendee_id, None)
