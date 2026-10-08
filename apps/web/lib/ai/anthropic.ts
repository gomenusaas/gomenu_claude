import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { BetaContentBlockParam, BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { z } from "zod";
import { AiError, type AiProvider, MenuExtraction, TranslationSet } from "./provider";

const MODEL = "claude-opus-5-5";

/**
 * Claude via the official SDK. Requests stream (menus can be long) and use structured outputs,
 * then are validated with zod. `fallbacks: "default"` lets the API re-run a policy-declined
 * request on Anthropic's recommended fallback model instead of failing the import.
 */
export function anthropicProvider(apiKey: string): AiProvider {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 280_000 });

  async function run<T extends z.ZodType>(schema: T, system: string, content: BetaContentBlockParam[]): Promise<z.infer<T>> {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
      system,
      messages: [{ role: "user", content }],
    });
    const message: BetaMessage = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      throw new AiError("refused", message.stop_details?.explanation ?? "The AI declined to process this file.");
    }
    if (message.stop_reason === "max_tokens") {
      throw new AiError("too_long", "The menu is too long to read in one go. Split the file and import each part.");
    }
    // A mid-stream fallback continues the partial text, so the full answer is every text block in order.
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const parsed = schema.safeParse(safeJson(text));
    if (!parsed.success) throw new AiError("unreadable", "The AI's answer could not be read.");
    return parsed.data;
  }

  return {
    async extractMenu(file, { locale, currency }) {
      const source: BetaContentBlockParam =
        file.mediaType === "application/pdf"
          ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.data.toString("base64") } }
          : { type: "image", source: { type: "base64", media_type: file.mediaType, data: file.data.toString("base64") } };
      return run(
        MenuExtraction,
        "You turn restaurant menus (PDFs or photos) into structured data for a menu management system. " +
          "Restaurant owners review your output before anything is published, so copy what is printed faithfully " +
          "rather than inventing or improving it.",
        [
          source,
          {
            type: "text",
            text:
              `Extract every category and every item from this menu.\n` +
              `- Keep names and descriptions in the language they are printed in; if the menu is bilingual, ` +
              `prefer the "${locale}" text.\n` +
              `- price is the number as printed, as a decimal (e.g. 1.500 → 1.5). If an item lists several sizes, ` +
              `use the smallest price and add the sizes to the description. Use null when no price is shown.\n` +
              `- description is null when the menu shows none.\n` +
              `- currency is the ISO code printed on the menu, or null if none is shown (the restaurant uses ${currency}).\n` +
              `- Items that appear outside any heading go in a category named after their section, or "Menu".`,
          },
        ],
      );
    },

    async translate(source, { from, to, restaurantName }) {
      return run(
        TranslationSet,
        "You translate restaurant menus for diners. Translations are natural, appetising and concise, as a native " +
          "speaker would write a menu. Dish names that diners know by their original name (e.g. shawarma, hummus, " +
          "biryani) are transliterated rather than translated literally. Restaurant staff review every translation.",
        [
          {
            type: "text",
            text:
              `Translate the menu texts of "${restaurantName}" from ${from} into ${to}. Return every entry with its id ` +
              `unchanged and only the text translated. Keep description null where it is null.\n\n` +
              JSON.stringify(source),
          },
        ],
      );
    },
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
