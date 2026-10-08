"use client";

import { Button } from "@gomenu/ui";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { runMenuImport } from "@/app/actions/ai";
import { compressImage } from "@/lib/media/compress";
import { createClient } from "@/lib/supabase/browser";

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Upload a menu PDF/photo to private storage, then ask the server to read it with AI. Photos are
 * downscaled (still sharp enough to read prices) so large phone pictures upload quickly.
 */
export function MenuImport({ restaurantId, labels }: {
  restaurantId: string;
  labels: { file: string; start: string; processing: string; fileInvalid: string };
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function start() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      let body: Blob = file;
      let type = file.type;
      const ext = file.type === "application/pdf" ? "pdf" : "webp";
      if (file.type.startsWith("image/")) {
        body = (await compressImage(file, 2400, 0.9)).blob;
        type = "image/webp";
      } else if (file.type !== "application/pdf") {
        throw new Error(labels.fileInvalid);
      }
      if (body.size > MAX_BYTES) throw new Error(labels.fileInvalid);
      const path = `${restaurantId}/imports/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await createClient().storage.from("restaurant-private").upload(path, body, { contentType: type });
      if (upErr) throw upErr;
      const result = await runMenuImport(restaurantId, path, type);
      if (result.error || !result.jobId) throw new Error(result.error);
      router.push(`/r/${restaurantId}/menu/import/${result.jobId}`);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : labels.fileInvalid);
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <label className="grid gap-2 text-sm font-medium">
        {labels.file}
        <input ref={input} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" data-testid="import-file"
               onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
      </label>
      <div>
        <Button type="button" onClick={start} disabled={!file || busy} aria-busy={busy} data-testid="import-start">
          {busy ? labels.processing : labels.start}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
