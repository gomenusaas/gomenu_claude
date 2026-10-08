"use client";

import { Button } from "@gomenu/ui";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { compressImage, MAX_VIDEO_BYTES, videoPoster } from "@/lib/media/compress";
import type { UploadedMedia } from "@/lib/media/types";
import { createClient } from "@/lib/supabase/browser";
import type { FormState } from "./form-state";

/**
 * Photos are resized and compressed to WebP in the browser; videos (<= 15 MB) upload as-is with a
 * poster frame. Files go straight to storage under `folder` (RLS checks the path), then `save`
 * records the row; if the row is refused (e.g. plan limit) the server removes the upload.
 */
export function MediaUpload({ restaurantId, folder, save, allowVideo = true, labels, testId }: {
  restaurantId: string;
  folder: string;
  save: (m: UploadedMedia) => Promise<FormState>;
  allowVideo?: boolean;
  labels: { upload: string; uploading: string; videoTooLarge: string };
  testId?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    const storage = createClient().storage.from("restaurant-public");
    const base = `${restaurantId}/${folder}/${crypto.randomUUID()}`;
    try {
      let media: UploadedMedia;
      if (file.type.startsWith("video/")) {
        if (file.size > MAX_VIDEO_BYTES) throw new Error(labels.videoTooLarge);
        const path = `${base}.${file.type === "video/webm" ? "webm" : "mp4"}`;
        const { error: e1 } = await storage.upload(path, file, { contentType: file.type });
        if (e1) throw e1;
        const poster = await videoPoster(file);
        let posterPath: string | null = null;
        if (poster) {
          posterPath = `${base}-poster.webp`;
          const { error: e2 } = await storage.upload(posterPath, poster, { contentType: "image/webp" });
          if (e2) posterPath = null;
        }
        media = { kind: "video", path, posterPath, width: null, height: null, bytes: file.size };
      } else {
        const { blob, width, height } = await compressImage(file);
        const path = `${base}.webp`;
        const { error: e1 } = await storage.upload(path, blob, { contentType: "image/webp" });
        if (e1) throw e1;
        media = { kind: "image", path, posterPath: null, width, height, bytes: blob.size };
      }
      const result = await save(media);
      if (result?.error) throw new Error(result.error);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="grid gap-2">
      <input ref={input} type="file" hidden data-testid={testId}
             accept={allowVideo ? "image/*,video/mp4,video/webm" : "image/*"}
             onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <div>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? labels.uploading : labels.upload}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
