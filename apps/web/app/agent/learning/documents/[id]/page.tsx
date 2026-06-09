import { DocumentDetail } from "@/components/agent/DocumentDetail";

export default function DocumentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  return <DocumentDetail id={params.id} />;
}
