"use client";

import { CheckCircle2, XCircle } from "lucide-react";

import type { IntegrationStatus } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function IntegrationsList({ items }: { items: IntegrationStatus[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {items.map((it) => {
        const connected = it.status === "connected";
        return (
          <Card key={it.key} className="flex items-center gap-3 p-4">
            <span
              className={
                connected
                  ? "flex h-10 w-10 items-center justify-center rounded-lg bg-success/15 text-success"
                  : "flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground"
              }
            >
              {connected ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <XCircle className="h-5 w-5" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">{it.name}</p>
                <Badge variant={connected ? "success" : "muted"}>
                  {connected ? "Đã kết nối" : "Chưa kết nối"}
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground" title={it.detail}>
                {it.detail || "—"}
              </p>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
