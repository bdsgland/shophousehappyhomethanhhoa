"use client";

import { useQuery } from "@tanstack/react-query";

import { getReferralTree } from "@/lib/api";
import type { ReferralNode } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const ROLE_LABEL: Record<string, string> = {
  admin: "Quản trị",
  sale: "Sale",
  client: "Khách hàng",
};

function TreeNode({ node, depth }: { node: ReferralNode; depth: number }) {
  const role = node.role ?? undefined;
  return (
    <div
      className={
        depth > 0 ? "ml-4 border-l border-border pl-4" : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-2 py-1.5">
        <span className="font-medium">{node.full_name}</span>
        <span className="text-xs text-muted-foreground">{node.email}</span>
        {role && (
          <Badge variant={role === "admin" ? "default" : "muted"}>
            {ROLE_LABEL[role] ?? role}
          </Badge>
        )}
        {node.referral_code && (
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {node.referral_code}
          </span>
        )}
      </div>
      {node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function ReferralTree() {
  const { data, isLoading } = useQuery({
    queryKey: ["referral-tree"],
    queryFn: getReferralTree,
  });

  const tree = data?.tree ?? [];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="space-y-3 pt-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-2/3" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (tree.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          Chưa có dữ liệu cây giới thiệu.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-5">
        {tree.map((node) => (
          <TreeNode key={node.id} node={node} depth={0} />
        ))}
      </CardContent>
    </Card>
  );
}
