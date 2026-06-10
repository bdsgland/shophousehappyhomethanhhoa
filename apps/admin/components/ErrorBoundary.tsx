"use client";

import * as React from "react";

/**
 * Error boundary nhẹ: chặn lỗi render của 1 khối con KHÔNG làm trắng cả trang
 * (App Router không có error.tsx ở segment này). Hiện thông báo gọn + cho phép
 * phần còn lại của trang tiếp tục hoạt động.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; message?: string }
> {
  constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: unknown) {
    return { hasError: true, message: (error as Error)?.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="rounded-lg border border-danger/30 bg-danger/5 p-5 text-sm text-danger">
            Không hiển thị được khối này{this.state.message ? `: ${this.state.message}` : ""}.
          </div>
        )
      );
    }
    return this.props.children;
  }
}
