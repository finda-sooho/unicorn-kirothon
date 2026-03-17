/**
 * GET /api/stt
 * Deepgram API 키를 반환합니다.
 * 클라이언트에서 브라우저 WebSocket으로 Deepgram에 직접 연결합니다.
 */
export async function GET() {
  const apiKey = process.env.DEEPGRAM_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      { error: "DEEPGRAM_API_KEY not set" },
      { status: 500 },
    );
  }

  return Response.json({ key: apiKey });
}
