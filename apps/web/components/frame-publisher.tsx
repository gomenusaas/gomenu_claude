"use client";

import { Alert, Button, Field, Input, Label } from "@gomenu/ui";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { publishFrame } from "@/app/actions/frames";
import { uploadMedia } from "./media-upload";

/** Pick a photo or short video, add a caption per language, optional dish link and branches, publish. */
export function FramePublisher({ restaurantId, locales, items, branches, labels }: {
  restaurantId: string;
  locales: { code: string; name: string; dir: string }[];
  items: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  labels: { file: string; caption: string; item: string; noItem: string; branches: string; publish: string; publishing: string; videoTooLarge: string };
}) {
  const form = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) return;
    setBusy(true);
    setError(null);
    try {
      const media = await uploadMedia(restaurantId, "frames", file, labels.videoTooLarge);
      const caption = Object.fromEntries(locales.map((l) => [l.code, String(fd.get(`caption:${l.code}`) ?? "")]));
      const result = await publishFrame({
        restaurantId, media, caption, itemId: String(fd.get("item_id") ?? "") || null, branchIds: fd.getAll("branches").map(String),
      });
      if (result?.error) throw new Error(result.error);
      form.current?.reset();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={form} onSubmit={submit} className="grid gap-4" noValidate>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="grid gap-2">
        <Label htmlFor="frame-file">{labels.file}</Label>
        <input id="frame-file" name="file" type="file" accept="image/*,video/mp4,video/webm" required data-testid="frame-file" className="text-sm" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {locales.map((l) => (
          <Field key={l.code} id={`frame-caption-${l.code}`} label={labels.caption.replace("{lang}", l.name)}>
            <Input name={`caption:${l.code}`} dir={l.dir} />
          </Field>
        ))}
        <div className="grid gap-2">
          <Label htmlFor="frame-item">{labels.item}</Label>
          <select id="frame-item" name="item_id" className="h-11 rounded-md border border-input bg-background px-3">
            <option value="">{labels.noItem}</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
      </div>
      {branches.length > 1 ? (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-medium">{labels.branches}</legend>
          <div className="flex flex-wrap gap-4">
            {branches.map((b) => (
              <label key={b.id} className="flex items-center gap-2 text-sm"><input type="checkbox" name="branches" value={b.id} /> {b.name}</label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div><Button type="submit" disabled={busy} aria-busy={busy} data-testid="frame-publish">{busy ? labels.publishing : labels.publish}</Button></div>
    </form>
  );
}
