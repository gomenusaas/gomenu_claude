import "server-only";
import { z } from "zod";
import { serverEnv } from "@/lib/server-env";

/** What the AI reads off a menu file. Prices are decimals as printed; null when none is shown. */
export const MenuExtraction = z.object({
  currency: z.string().nullable(),
  categories: z.array(
    z.object({
      name: z.string(),
      items: z.array(z.object({ name: z.string(), description: z.string().nullable(), price: z.number().nullable() })),
    }),
  ),
});
export type MenuExtraction = z.infer<typeof MenuExtraction>;

const Named = z.object({ id: z.string(), name: z.string() });
const NamedItem = z.object({ id: z.string(), name: z.string(), description: z.string().nullable() });

/** Source texts from start_translation, and the same shape translated (ids preserved). */
export const TranslationSet = z.object({
  items: z.array(NamedItem),
  categories: z.array(Named),
  variants: z.array(Named),
  option_groups: z.array(Named),
  options: z.array(Named),
});
export type TranslationSet = z.infer<typeof TranslationSet>;

export type MenuFile = { data: Buffer; mediaType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp" };

/** A failure we can show the person: refusals, unreadable files, truncated output. */
export class AiError extends Error {
  constructor(public code: "refused" | "too_long" | "unreadable" | "not_configured", message: string) {
    super(message);
  }
}

export interface AiProvider {
  extractMenu(file: MenuFile, opts: { locale: string; currency: string }): Promise<MenuExtraction>;
  translate(source: TranslationSet, opts: { from: string; to: string; restaurantName: string }): Promise<TranslationSet>;
}

/** Decision P3-Q2: Claude. The fake provider is deterministic and used in tests and local dev. */
export async function getAiProvider(): Promise<AiProvider> {
  const choice = serverEnv.GOMENU_AI_PROVIDER ?? (serverEnv.ANTHROPIC_API_KEY ? "anthropic" : "fake");
  if (choice === "fake") return (await import("./fake")).fakeProvider;
  if (!serverEnv.ANTHROPIC_API_KEY) throw new AiError("not_configured", "ANTHROPIC_API_KEY is not set");
  return (await import("./anthropic")).anthropicProvider(serverEnv.ANTHROPIC_API_KEY);
}

const EXPONENT: Record<string, number> = { OMR: 3, BHD: 3, KWD: 3 };

/** Turn an extraction into the payload complete_menu_import / apply_menu_import expect. */
export function toImportPayload(extraction: MenuExtraction, currency: string) {
  const exp = EXPONENT[currency] ?? 2;
  return {
    currency: extraction.currency,
    categories: extraction.categories
      .map((c) => ({
        name: c.name.trim(),
        items: c.items
          .filter((i) => i.name.trim())
          .map((i) => ({
            name: i.name.trim(),
            description: i.description?.trim() || null,
            price_minor: i.price == null ? 0 : Math.max(0, Math.round(i.price * 10 ** exp)),
          })),
      }))
      .filter((c) => c.name && c.items.length),
  };
}
export type ImportPayload = ReturnType<typeof toImportPayload>;
