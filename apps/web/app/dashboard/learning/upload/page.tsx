import { LearningUpload } from "@/components/dashboard/LearningUpload";

export const metadata = {
  title: "Tải tài liệu | Kho học tập ELC",
};

export default function LearningUploadPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <LearningUpload />
    </div>
  );
}
