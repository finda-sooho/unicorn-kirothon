import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{
    meetingId: string;
  }>;
};

export default async function MeetingDetailPage({ params }: PageProps) {
  const { meetingId } = await params;
  redirect(`/meetings/${meetingId}/session`);
}
