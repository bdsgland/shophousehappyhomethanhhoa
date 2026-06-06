import type { SVGProps } from "react";

export function EmptyState({
  Icon,
  title,
  description,
}: {
  Icon: (p: SVGProps<SVGSVGElement> & { size?: number }) => JSX.Element;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-brand-900">{title}</h1>
      </header>
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-brand-200 bg-white px-6 py-16 text-center shadow-sm">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-orange-100 text-orange-500">
          <Icon size={32} />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-brand-900">
          Chưa có dữ liệu
        </h2>
        <p className="mt-1 max-w-md text-sm text-brand-600">{description}</p>
        <span className="mt-4 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
          Tính năng sắp ra mắt
        </span>
      </div>
    </div>
  );
}
