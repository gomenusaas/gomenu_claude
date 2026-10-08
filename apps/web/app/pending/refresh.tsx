"use client";

import { Button } from "@gomenu/ui";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-asks the server every 30s; once a role is assigned, routing moves them on. */
export function PendingRefresh({ label }: { label: string }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 30_000);
    return () => clearInterval(id);
  }, [router]);
  return (
    <Button variant="outline" block onClick={() => router.refresh()}>
      {label}
    </Button>
  );
}
