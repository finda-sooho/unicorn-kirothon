import { MeetingDetailShell } from "@/components/meeting-detail-shell";

type PageProps = {
  params: Promise<{
    meetingId: string;
  }>;
};

export default async function MeetingDetailPage({ params }: PageProps) {
  const { meetingId } = await params;
  return <MeetingDetailShell meetingId={meetingId} />;
}
