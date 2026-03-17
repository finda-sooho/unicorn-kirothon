import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `너는 회의 참석자의 역할에 맞는 프로필을 추천해주는 AI다.
사용자가 역할을 알려주면, 해당 역할이 보통 갖추고 있을 전문 분야와 부족할 수 있는 지식 영역을 제안해.

반드시 아래 JSON 형식으로만 응답해. 다른 텍스트 없이 JSON만 출력해:
{
  "expertise": ["항목1", "항목2", "항목3", "항목4", "항목5"],
  "gaps": ["항목1", "항목2", "항목3"]
}

- expertise: 해당 역할이 보통 잘 아는 분야 5개
- gaps: 해당 역할이 상대적으로 부족할 수 있는 영역 3개
- 모든 항목은 한국어, 간결하게 (2~5단어)`;

export async function POST(request: Request) {
  const { role } = (await request.json()) as { role: string };

  if (!role) {
    return Response.json({ error: "role is required" }, { status: 400 });
  }

  const stream = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    stream: true,
    temperature: 0.7,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `역할: ${role}` },
    ],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) {
          controller.enqueue(encoder.encode(text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "Cache-Control": "no-cache",
    },
  });
}
