"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/browser";

/**
 * Re-reads the page when an order changes in these branches. Listens on the private per-branch
 * channels (the database checks membership); the broadcast carries ids and statuses only.
 * A slow poll covers a dropped connection.
 */
export function LiveOrders({ topics, pollSeconds = 30 }: { topics: string[]; pollSeconds?: number }) {
  const router = useRouter();
  const key = topics.join(",");
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => { timer = null; router.refresh(); }, 300);  // coalesce bursts
    };
    const channels: ReturnType<typeof supabase.channel>[] = [];
    void (async () => {
      try {
        await supabase.realtime.setAuth();
      } catch {
        /* polling still works */
      }
      for (const topic of key.split(",").filter(Boolean)) {
        channels.push(supabase.channel(topic, { config: { private: true } }).on("broadcast", { event: "order" }, refresh).subscribe());
      }
    })();
    const poll = setInterval(() => router.refresh(), pollSeconds * 1000);
    return () => {
      clearInterval(poll);
      if (timer) clearTimeout(timer);
      for (const c of channels) void supabase.removeChannel(c);
    };
  }, [key, pollSeconds, router]);
  return null;
}

// One shared clock for every timer on the screen, ticking every 15 seconds.
let clock = 0;
function subscribeClock(onChange: () => void) {
  const id = setInterval(() => { clock = Date.now(); onChange(); }, 15_000);
  return () => clearInterval(id);
}
function readClock() {
  if (!clock) clock = Date.now();
  return clock;
}

/** Minutes since `since`, ticking; turns into a warning after `lateAfter` minutes. */
export function Elapsed({ since, lateAfter, lateLabel, format }: { since: string; lateAfter?: number; lateLabel?: string; format: string }) {
  const now = useSyncExternalStore(subscribeClock, readClock, () => null);
  if (now === null) return <span className="tabular-nums">…</span>;
  const minutes = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000));
  const late = lateAfter != null && minutes >= lateAfter;
  return (
    <span className={late ? "rounded bg-destructive px-1.5 font-semibold text-destructive-foreground" : "tabular-nums"} data-late={late || undefined}>
      {format.replace("{n}", String(minutes))}{late && lateLabel ? ` · ${lateLabel}` : ""}
    </span>
  );
}

/**
 * Kitchen sound: a short beep when a new ticket (or a changed one) appears. Browsers allow sound
 * only after a tap, so the button turns it on for this screen.
 */
export function KitchenSound({ ticketKeys, labels }: { ticketKeys: string[]; labels: { on: string; off: string } }) {
  const [enabled, setEnabled] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const current = new Set(ticketKeys);
    const before = seen.current;
    seen.current = current;
    if (!before || !enabled || !audio.current) return;
    if ([...current].some((k) => !before.has(k))) {
      const ctx = audio.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    }
  }, [ticketKeys, enabled]);
  return (
    <button type="button" data-testid="kitchen-sound" aria-pressed={enabled}
            className="rounded-md border px-3 py-2 text-sm hover:bg-muted"
            onClick={() => {
              audio.current ??= new AudioContext();
              void audio.current.resume();
              setEnabled(true);
            }}>
      {enabled ? `🔔 ${labels.on}` : `🔕 ${labels.off}`}
    </button>
  );
}
