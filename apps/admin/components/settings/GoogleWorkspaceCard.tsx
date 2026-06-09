"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, RefreshCw, Video } from "lucide-react";

import { getWorkspaceStatus, workspaceConnectUrl } from "@/lib/api";
import { shortDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Kết nối Google Workspace (1 nút): lấy refresh token Calendar + Drive cho
 * Live Match (tạo Google Meet) và đồng bộ tài liệu RAG. Admin bấm → đăng nhập
 * Google → Cho phép → token được lưu bền ở backend (không cần set env Railway).
 */
export function GoogleWorkspaceCard() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["workspace-status"],
    queryFn: getWorkspaceStatus,
  });

  const connected = data?.connected ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Video className="h-4 w-4 text-primary" /> Google Workspace
          </span>
          {!isLoading &&
            (connected ? (
              <Badge variant="success">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Đã kết nối
              </Badge>
            ) : (
              <Badge variant="muted">Chưa kết nối</Badge>
            ))}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Cấp quyền tạo Google Meet (Live Match) và đồng bộ tài liệu Google Drive
          (RAG). Bấm nút bên dưới, đăng nhập đúng tài khoản Workspace rồi chọn
          &ldquo;Cho phép&rdquo;.
        </p>

        {connected && (
          <div className="rounded-lg border border-border bg-card p-3 text-sm">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
              {data?.email && (
                <span>
                  Tài khoản: <span className="text-foreground">{data.email}</span>
                </span>
              )}
              {data?.connected_at && (
                <span>Kết nối: {shortDate(data.connected_at)}</span>
              )}
            </div>
            {data?.scopes && data.scopes.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {data.scopes.map((s) => (
                  <Badge key={s} variant="muted" className="font-normal">
                    {s.replace("https://www.googleapis.com/auth/", "")}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => {
              window.location.href = workspaceConnectUrl();
            }}
          >
            <Video className="h-4 w-4" />
            {connected ? "Kết nối lại" : "Kết nối Google Workspace"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Làm mới
          </Button>
        </div>

        {data?.redirect_uri && (
          <p className="text-xs text-muted-foreground">
            Redirect URI cần khai báo trong Google OAuth client (Authorized
            redirect URIs):{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-foreground">
              {data.redirect_uri}
            </code>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
