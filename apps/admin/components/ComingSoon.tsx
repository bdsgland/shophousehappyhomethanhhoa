import { Rocket } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export function ComingSoon({
  title,
  description,
  bullets,
}: {
  title: string;
  description: string;
  bullets: string[];
}) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Rocket className="h-7 w-7" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Sắp ra mắt (Phase 2)</h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              Chức năng này đang trong kế hoạch phát triển. Dự kiến gồm:
            </p>
          </div>
          <ul className="mx-auto max-w-sm space-y-1.5 text-left text-sm text-muted-foreground">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {b}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
