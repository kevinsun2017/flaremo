/** One row of the owner's plugin list: bundled or installed. */
export type PluginRow = {
  id: string;
  name: string;
  version: string;
  tier: "official" | "community";
  source: "bundled" | "installed";
  cardCount: number;
};

/** Resolve a localized label table against the active locale. */
export function localized(
  table: Record<string, string> | undefined,
  locale: string,
  fallback: string,
): string {
  if (!table) return fallback;
  return table[locale] ?? table["en-US"] ?? Object.values(table)[0] ?? fallback;
}
