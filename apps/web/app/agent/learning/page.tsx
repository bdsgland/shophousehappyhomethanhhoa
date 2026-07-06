import { LearningCenter } from "@/components/agent/LearningCenter";

export const metadata = {
  title: "Kho học tập | Happy Home Thanh Hóa",
};

export default function LearningPage({
  searchParams,
}: {
  searchParams?: { tab?: string; unit?: string };
}) {
  return (
    <LearningCenter
      initialTab={searchParams?.tab}
      initialUnit={searchParams?.unit}
    />
  );
}
