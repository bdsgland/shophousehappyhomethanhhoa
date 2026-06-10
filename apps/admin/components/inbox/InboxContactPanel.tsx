"use client";

import { ExternalLink, Mail, Phone, UserRound } from "lucide-react";
import Link from "next/link";

import type { InboxConversation } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { channelLabel } from "./channels";

export function InboxContactPanel({
  conversation,
}: {
  conversation: InboxConversation;
}) {
  const { contact, crm_lead_id, crm_lead_name } = conversation;
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <UserRound className="h-5 w-5 text-muted-foreground" />
        <span className="text-sm font-semibold">
          {contact?.name || "Khách"}
        </span>
      </div>

      <dl className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Phone className="h-4 w-4" />
          <span>{contact?.phone || "Chưa có SĐT"}</span>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Mail className="h-4 w-4" />
          <span className="truncate">{contact?.email || "Chưa có email"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Kênh:</span>
          <Badge variant="muted">{channelLabel(conversation.channel)}</Badge>
        </div>
      </dl>

      <div className="border-t border-border pt-4">
        {crm_lead_id ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Đã khớp khách CRM
              {crm_lead_name ? `: ${crm_lead_name}` : ""}
            </p>
            <Link href={`/customers/${crm_lead_id}`}>
              <Button variant="outline" size="sm" className="w-full">
                <ExternalLink className="h-4 w-4" />
                Mở Hồ sơ 360°
              </Button>
            </Link>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Chưa khớp khách CRM nào theo SĐT/email. Khi liên hệ trùng SĐT/email
            với một khách trong CRM, hệ thống sẽ tự liên kết.
          </p>
        )}
      </div>
    </div>
  );
}
