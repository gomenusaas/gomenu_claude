"use client";

import { Button } from "@gomenu/ui";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { setBrandImage } from "@/app/actions/settings";
import { compressImage } from "@/lib/media/compress";
import { createClient } from "@/lib/supabase/browser";

/** Logo / cover: compressed in the browser, uploaded straight to storage (RLS), then saved. */
export function BrandUpload({ restaurantId, kind, currentUrl, labels }: {
  restaurantId: string; kind: "logo" | "cover"; currentUrl: string | null;
  labels: { title: string; upload: string; uploading: string };
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const { blob } = await compressImage(file, kind === "logo" ? 512 : 1920);
      const path = `${restaurantId}/brand/${kind}-${crypto.randomUUID()}.webp`;
      const { error: upErr } = await createClient().storage.from("restaurant-public").upload(path, blob, { contentType: "image/webp" });
      if (upErr) throw upErr;
      const result = await setBrandImage(restaurantId, kind, path);
      if (result?.error) throw new Error(result.error);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="text-sm font-medium">{labels.title}</div>
      {currentUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={currentUrl} alt="" className={kind === "logo" ? "size-20 rounded-md border object-cover" : "h-28 w-full rounded-md border object-cover"} />
      ) : null}
      <input ref={input} type="file" accept="image/*" hidden data-testid={`${kind}-input`}
             onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? labels.uploading : labels.upload}
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
