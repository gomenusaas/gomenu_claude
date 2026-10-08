/** Per-language text stored as {"en": "...", "ar": "..."}. */
export type I18nText = Record<string, string>;

/** Pick the best text for `locale`, falling back to the restaurant default, then any language. */
export function tx(value: unknown, locale: string, fallback?: string): string {
  const v = (value ?? {}) as I18nText;
  return v[locale] || (fallback ? v[fallback] : "") || Object.values(v).find(Boolean) || "";
}

/** Collect form fields named `${prefix}:${locale}` into {"en": "...", "ar": "..."}. */
export function i18nFromForm(fd: FormData, prefix: string): I18nText {
  const out: I18nText = {};
  for (const [key, value] of fd.entries()) {
    if (key.startsWith(`${prefix}:`) && String(value).trim()) out[key.slice(prefix.length + 1)] = String(value).trim();
  }
  return out;
}

/** AI-translated locales awaiting review: {"ar": {"source": "ai", "reviewed": false}}. */
export function unreviewed(meta: unknown): string[] {
  return Object.entries((meta ?? {}) as Record<string, { reviewed?: boolean }>)
    .filter(([, m]) => m?.reviewed === false)
    .map(([loc]) => loc);
}

/** After a person edits texts, the locales whose text changed count as reviewed. */
export function markEdited(meta: unknown, before: unknown, after: I18nText): Record<string, unknown> {
  const m = { ...((meta ?? {}) as Record<string, Record<string, unknown>>) };
  const b = (before ?? {}) as I18nText;
  for (const [loc, text] of Object.entries(after)) {
    if (m[loc] && b[loc] !== text) m[loc] = { ...m[loc], reviewed: true };
  }
  return m;
}
