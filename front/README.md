# Meeting Alignment AI Frontend

Next.js 16 기반 프론트엔드입니다. 대시보드, 미팅 상세, 실시간 세션 화면을 제공합니다.

## 실행

```bash
npm install
npm run dev
```

기본 주소는 `http://127.0.0.1:3000`입니다.

백엔드는 기본적으로 `http://127.0.0.1:8000`을 바라봅니다. 다른 주소를 쓰려면 `NEXT_PUBLIC_API_BASE_URL` 환경 변수를 지정하면 됩니다.

## 검증

```bash
npm run lint
npm run build
```

## 주요 화면

- `/` : 미팅 목록과 생성 폼
- `/meetings/[meetingId]` : 미팅 상세와 역할별 브리핑
- `/meetings/[meetingId]/session` : 실시간 스크립트, 보조설명, 추천 질문, 채팅 Q&A, 프로필 설정
