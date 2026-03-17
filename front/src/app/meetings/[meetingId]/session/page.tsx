import { MeetingSessionShell } from "@/components/meeting-session-shell";

type PageProps = {
  params: Promise<{
    meetingId: string;
  }>;
};

export default async function MeetingSessionPage({ params }: PageProps) {
  const { meetingId } = await params;
  return <MeetingSessionShell meetingId={meetingId} />;
}
