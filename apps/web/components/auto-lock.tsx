"use client";

import { useEffect, useRef } from "react";
import { lockScreen } from "@/app/actions/security";

/** Locks the screen after `minutes` without interaction (shared devices, spec §4). */
export function AutoLock({ minutes }: { minutes: number }) {
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => formRef.current?.requestSubmit(), minutes * 60_000);
    };
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [minutes]);
  return <form ref={formRef} action={lockScreen} hidden />;
}

export function LockButton({ label }: { label: string }) {
  return (
    <form action={lockScreen}>
      <button type="submit" className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted" data-testid="lock-button">
        {label}
      </button>
    </form>
  );
}
