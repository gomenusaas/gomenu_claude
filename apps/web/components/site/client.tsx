"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toggleFavorite, trackEvent } from "@/app/actions/site";

type EventType = Parameters<typeof trackEvent>[0]["type"];

/** Anonymous per-browser session id for analytics (no personal data). */
function sessionId(): string {
  try {
    let id = localStorage.getItem("gm_sid");
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem("gm_sid", id);
    }
    return id;
  } catch {
    return "nostorage-session";
  }
}

export function track(restaurantId: string, type: EventType, extra?: { entityId?: string | null; branchId?: string | null; locale?: string }) {
  void trackEvent({ restaurantId, type, sessionId: sessionId(), ...extra }).catch(() => undefined);
}

/** Fires page-level events once per mount (website_view, menu_view, item_view). */
export function Tracker({ restaurantId, events, branchId, locale, disabled }: {
  restaurantId: string; events: { type: EventType; entityId?: string }[]; branchId?: string | null; locale: string; disabled?: boolean;
}) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current || disabled) return;
    sent.current = true;
    for (const e of events) track(restaurantId, e.type, { entityId: e.entityId, branchId, locale });
  }, [restaurantId, events, branchId, locale, disabled]);
  return null;
}

export type GoBranch = { id: string; name: string; address: string | null; url: string; isOpen: boolean; openLabel: string };

/** spec §7: the standard GO button. One branch → maps; several → choose, then maps. */
export function GoButton({ restaurantId, branches, label, chooseLabel, closeLabel, className, preview }: {
  restaurantId: string; branches: GoBranch[]; label: string; chooseLabel: string; closeLabel: string; className?: string; preview?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (branches.length === 0) return null;
  const go = (b: GoBranch) => {
    if (!preview) track(restaurantId, "go_click", { branchId: b.id, entityId: b.id });
    window.open(b.url, "_blank", "noopener");
  };
  return (
    <>
      <button type="button" data-testid="go-button" className={className ?? "gm-go"}
              onClick={() => (branches.length === 1 ? go(branches[0]) : setOpen(true))}>
        {label}
      </button>
      {open ? (
        <div role="dialog" aria-modal="true" aria-label={chooseLabel} className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
             onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm rounded-lg bg-card p-4 text-card-foreground shadow-md" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">{chooseLabel}</h2>
              <button type="button" className="text-sm underline" onClick={() => setOpen(false)}>{closeLabel}</button>
            </div>
            <ul className="grid gap-2">
              {branches.map((b) => (
                <li key={b.id}>
                  <button type="button" data-testid="go-branch" onClick={() => go(b)}
                          className="flex w-full items-center justify-between rounded-md border p-3 text-start hover:bg-muted">
                    <span><span className="block font-medium">{b.name}</span>
                      {b.address ? <span className="block text-sm text-muted-foreground">{b.address}</span> : null}</span>
                    <span className="text-xs text-muted-foreground">{b.openLabel}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Native share sheet where available; WhatsApp otherwise. */
export function ShareButton({ restaurantId, url, title, label, whatsappLabel, entityId, className, preview }: {
  restaurantId: string; url: string; title: string; label: string; whatsappLabel: string; entityId?: string; className?: string; preview?: boolean;
}) {
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`;
  const share = async () => {
    if (!preview) track(restaurantId, "share_click", { entityId });
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        /* cancelled: fall through to nothing */
        return;
      }
    }
    window.open(whatsapp, "_blank", "noopener");
  };
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" onClick={share} className={className ?? "gm-chip"} data-testid="share-button">{label}</button>
      <a href={whatsapp} target="_blank" rel="noopener" className="gm-chip" aria-label={whatsappLabel}
         onClick={() => !preview && track(restaurantId, "share_click", { entityId })}>WhatsApp</a>
    </span>
  );
}

export type FrameView = { id: string; kind: "image" | "video"; url: string; poster: string | null; caption: string; link: string | null };

/** spec §8: Frames are stories (not reels): tap through, auto-advance, close. */
export function FramesBar({ restaurantId, frames, labels, branchId, preview }: {
  restaurantId: string; frames: FrameView[]; branchId?: string | null; preview?: boolean;
  labels: { title: string; close: string; next: string; previous: string; open: string };
}) {
  const [index, setIndex] = useState<number | null>(null);
  const viewed = useRef(new Set<string>());
  const router = useRouter();
  const current = index === null ? null : frames[index];
  useEffect(() => {
    if (!current || preview) return;
    if (!viewed.current.has(current.id)) {
      viewed.current.add(current.id);
      track(restaurantId, "frame_view", { entityId: current.id, branchId });
    }
    if (current.kind === "image") {
      const timer = setTimeout(() => {
        track(restaurantId, "frame_complete", { entityId: current.id, branchId });
        setIndex((i) => (i !== null && i + 1 < frames.length ? i + 1 : null));
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [current, frames.length, restaurantId, branchId, preview]);
  if (frames.length === 0) return null;
  return (
    <section aria-label={labels.title} className="gm-frames">
      <ul className="flex gap-3 overflow-x-auto px-4 py-3">
        {frames.map((f, i) => (
          <li key={f.id}>
            <button type="button" data-testid="frame-thumb" onClick={() => setIndex(i)} className="gm-frame-ring" aria-label={f.caption || labels.title}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.poster ?? (f.kind === "image" ? f.url : "")} alt="" loading="lazy" className="size-16 rounded-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      {current ? (
        <div role="dialog" aria-modal="true" aria-label={labels.title} data-testid="frame-viewer"
             className="fixed inset-0 z-50 flex flex-col bg-black text-white">
          <div className="flex gap-1 p-2">
            {frames.map((f, i) => <span key={f.id} className={`h-1 flex-1 rounded ${i <= (index ?? 0) ? "bg-white" : "bg-white/30"}`} />)}
          </div>
          <div className="flex justify-end p-2">
            <button type="button" onClick={() => setIndex(null)} className="rounded px-3 py-1 text-sm underline">{labels.close}</button>
          </div>
          <div className="relative flex flex-1 items-center justify-center">
            {current.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.url} alt={current.caption} className="max-h-full max-w-full object-contain" />
            ) : (
              <video src={current.url} poster={current.poster ?? undefined} autoPlay playsInline muted controls
                     className="max-h-full max-w-full" onEnded={() => {
                       if (!preview) track(restaurantId, "frame_complete", { entityId: current.id, branchId });
                       setIndex((i) => (i !== null && i + 1 < frames.length ? i + 1 : null));
                     }} />
            )}
            <button type="button" aria-label={labels.previous} className="absolute inset-y-0 start-0 w-1/3"
                    onClick={() => setIndex((i) => (i ? i - 1 : 0))} />
            <button type="button" aria-label={labels.next} className="absolute inset-y-0 end-0 w-1/3"
                    onClick={() => setIndex((i) => (i !== null && i + 1 < frames.length ? i + 1 : null))} />
          </div>
          {current.caption || current.link ? (
            <div className="grid gap-2 p-4 text-center">
              {current.caption ? <p>{current.caption}</p> : null}
              {current.link ? (
                <button type="button" className="mx-auto rounded-full bg-white px-4 py-2 font-medium text-black"
                        onClick={() => {
                          if (!preview) track(restaurantId, "frame_click", { entityId: current.id, branchId });
                          router.push(current.link!);
                        }}>
                  {labels.open}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Records a promotion view when it scrolls into sight, and clicks on its link. */
export function PromotionTracker({ restaurantId, promotionId, branchId, preview, children, href, className }: {
  restaurantId: string; promotionId: string; branchId?: string | null; preview?: boolean; children: React.ReactNode; href?: string | null; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (preview || !ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        track(restaurantId, "promotion_view", { entityId: promotionId, branchId });
        io.disconnect();
      }
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [restaurantId, promotionId, branchId, preview]);
  const body = <div ref={ref} className={className} data-testid="promotion">{children}</div>;
  return href ? (
    <a href={href} onClick={() => !preview && track(restaurantId, "promotion_click", { entityId: promotionId, branchId })}>{body}</a>
  ) : body;
}

/** Heart button. Signed-out visitors are sent to sign in and come back. */
export function FavoriteButton({ restaurantId, itemId, initial, labels, signInUrl, className }: {
  restaurantId: string; itemId: string | null; initial: boolean; signInUrl: string; className?: string;
  labels: { on: string; off: string };
}) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button type="button" aria-pressed={on} aria-label={on ? labels.on : labels.off} disabled={pending} data-testid="favorite-button"
            className={className ?? "gm-chip"}
            onClick={() => start(async () => {
              const result = await toggleFavorite(restaurantId, itemId);
              if (result === "signin") router.push(signInUrl);
              else if (result !== "error") setOn(result === "on");
            })}>
      {on ? "♥" : "♡"}
    </button>
  );
}
