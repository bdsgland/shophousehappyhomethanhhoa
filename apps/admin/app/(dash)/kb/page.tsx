import { ComingSoon } from "@/components/ComingSoon";

export default function KbPage() {
  return (
    <ComingSoon
      title="Tài liệu RAG"
      description="Kho tri thức cho AI agent: upload tài liệu và re-index."
      bullets={[
        "Upload PDF / DOCX tài liệu dự án",
        "Danh sách tài liệu đã index + trạng thái",
        "Nút re-index (BM25 / embedding)",
        "Xem nguồn agent trích dẫn",
      ]}
    />
  );
}
