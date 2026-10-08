import "server-only";
import type { AiProvider } from "./provider";

/**
 * Deterministic stand-in for Claude (GOMENU_AI_PROVIDER=fake). It ignores the file and always
 * "reads" the same small menu, and "translates" by tagging each text with the target language.
 */
export const fakeProvider: AiProvider = {
  async extractMenu() {
    return {
      currency: null,
      categories: [
        {
          name: "Starters",
          items: [
            { name: "Hummus", description: "Chickpeas, tahini, olive oil", price: 1.5 },
            { name: "Lentil soup", description: null, price: 1.2 },
          ],
        },
        { name: "Mains", items: [{ name: "Chicken shawarma plate", description: "With fries and garlic sauce", price: 3.5 }] },
      ],
    };
  },
  async translate(source, { to }) {
    const tag = (s: string) => `${s} [${to}]`;
    return {
      items: source.items.map((i) => ({ id: i.id, name: tag(i.name), description: i.description ? tag(i.description) : null })),
      categories: source.categories.map((c) => ({ id: c.id, name: tag(c.name) })),
      variants: source.variants.map((v) => ({ id: v.id, name: tag(v.name) })),
      option_groups: source.option_groups.map((g) => ({ id: g.id, name: tag(g.name) })),
      options: source.options.map((o) => ({ id: o.id, name: tag(o.name) })),
    };
  },
};
