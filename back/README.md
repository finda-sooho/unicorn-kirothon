# Meeting Alignment AI Backend

FastAPI 백엔드입니다. 미팅 생성, 지식 프로필 저장, 역할별 브리핑 생성, 채팅 Q&A, 스크립트 저장, 개인 맞춤 추천 질문/주제 생성을 담당합니다.

## 실행

```bash
uv sync
uv run uvicorn main:app --reload
```

기본 주소는 `http://127.0.0.1:8000`입니다.

## 테스트

```bash
uv run pytest
```

## 저장 방식

- 기본 저장 파일: `back/data/meeting_store.json`
- 다른 저장 경로를 쓰려면 `MEETING_STORE_PATH` 환경 변수를 지정하면 됩니다.

## OpenAI 설정

- 로컬 실행 시 `back/.env`에서 `OPENAI_API_KEY`, `OPENAI_MODEL`을 읽습니다.
- 예제 파일은 `back/.env.example`입니다.
- 키가 없거나 호출이 실패하면 규칙 기반 폴백 로직으로 계속 동작합니다.
