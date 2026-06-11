"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ExternalLink,
  RefreshCw,
} from "lucide-react";

import { getPlatformsHealth } from "@/lib/api";
import { PLATFORMS } from "@/lib/platforms";
import type { PlatformHealth } from "@/lib/types";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HealthDot } from "@/components/platforms/HealthDot";

export function PlatformsPanel() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["platforms-health"],
    queryFn: getPlatformsHealth,
    refetchInterval: 60_000,
  });

  const healthByKey = new Map<string, PlatformHealth>(
    (data?.platforms ?? []).map((p) => [p.key, p]),
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Sức khoẻ & truy cập nhanh các nền tảng của hệ thống ELC.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Kiểm tra lại
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {PLATFORMS.map((p) => {
          const health = healthByKey.get(p.key);
          const status = health?.status;
          return (
            <Card key={p.key} className="flex flex-col">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold uppercase text-primary">
                      {p.name.slice(0, 2)}
                    </span>
                    <div>
                      <CardTitle>{p.name}</CardTitle>
                      <div className="mt-1 flex items-center gap-1.5">
                        <HealthDot status={status} loading={isLoading} />
                        <span className="text-xs text-muted-foreground">
                          {isLoading
                            ? "đang kiểm tra…"
                            : status === "up"
                              ? `Hoạt động${health?.code ? ` (${health.code})` : ""}`
                              : status === "down"
                                ? "Không phản hồi"
                                : "Không rõ"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <CardDescription className="mt-3">
                  {p.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="mt-auto space-y-3">
                {p.warning && (
                  <Badge variant="warning" className="w-full justify-center">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {p.warning}
                  </Badge>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted-foreground">
                    {p.url.replace(/^https?:\/\//, "")}
                  </span>
                  <a href={p.url} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline">
                      <ExternalLink className="h-4 w-4" />
                      Mở
                    </Button>
                  </a>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Trạng thái được kiểm tra phía máy chủ qua{" "}
        <code className="rounded bg-muted px-1 py-0.5">
          /admin/platforms/health
        </code>{" "}
        và tự làm mới mỗi 60 giây. Nếu một subdomain báo &quot;không phản hồi&quot;
        nhưng dịch vụ vẫn chạy, hãy chỉnh URL thật trong biến môi trường{" "}
        <code className="rounded bg-muted px-1 py-0.5">PLATFORM_*_URL</code> của
        backend.
      </p>
    </div>
  );
}
