import { auth } from "@/auth";

interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  start: string;
  end: string;
  attendees: Array<{ email: string; name?: string }>;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.accessToken) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const days = Math.min(Number(url.searchParams.get("days") || "7"), 30);

  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const calendarUrl = new URL(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events",
  );
  calendarUrl.searchParams.set("timeMin", now.toISOString());
  calendarUrl.searchParams.set("timeMax", until.toISOString());
  calendarUrl.searchParams.set("singleEvents", "true");
  calendarUrl.searchParams.set("orderBy", "startTime");
  calendarUrl.searchParams.set("maxResults", "50");

  const res = await fetch(calendarUrl.toString(), {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      return Response.json(
        {
          error: "calendar_scope_missing",
          message: "캘린더 권한이 없습니다. 다시 로그인해 주세요.",
        },
        { status: 403 },
      );
    }
    return Response.json(
      { error: "Failed to fetch calendar" },
      { status: 502 },
    );
  }

  const data = await res.json();

  const events: CalendarEvent[] = (data.items || [])
    .filter((item: any) => item.status !== "cancelled")
    .map((item: any) => ({
      id: item.id,
      title: item.summary || "(제목 없음)",
      description: item.description || "",
      start: item.start?.dateTime || item.start?.date || "",
      end: item.end?.dateTime || item.end?.date || "",
      attendees: (item.attendees || [])
        .filter(
          (a: any) =>
            !a.self &&
            !a.resource &&
            !a.email?.endsWith("resource.calendar.google.com"),
        )
        .map((a: any) => ({
          email: a.email,
          name: a.displayName || undefined,
        })),
    }));

  return Response.json(events);
}
