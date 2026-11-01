import { BRANDING_ACCENT_CHOICES, type BrandingAccent } from "@/branding";
import { useI18n } from "@/i18n";
import type { TranslationKey } from "@/i18n/key";

/** Swatch dots are fixed hex so the palette reads the same in any theme. */
export const ACCENT_SWATCH_HEX: Record<
  Exclude<BrandingAccent, "custom">,
  string
> = {
  flame: "#ff6a00",
  ocean: "#0090ff",
  indigo: "#3e63dd",
  iris: "#5b5bd6",
  jade: "#29a383",
  teal: "#12a594",
  crimson: "#e93d82",
  amber: "#ffc53d",
};

export function accentSummaryLabel(
  accent: string | null | undefined,
  accentHex: string | null | undefined,
  t: (key: TranslationKey) => string,
): string {
  if (accent === "custom") {
    const base = t("admin.branding.accentCustom");
    return accentHex ? `${base} · ${accentHex}` : base;
  }
  const preset = accent ?? "flame";
  return t(`admin.branding.accent_${preset}` as TranslationKey);
}

export function AccentPicker({
  value,
  customHex,
  disabled,
  onSelect,
}: {
  value: string;
  customHex: string | null;
  disabled: boolean;
  onSelect: (accent: BrandingAccent) => void;
}) {
  const { t } = useI18n();
  const isCustom = value === "custom";
  return (
    <fieldset
      aria-label={t("admin.branding.accent")}
      className="flex flex-wrap gap-2 border-0 p-0"
    >
      {BRANDING_ACCENT_CHOICES.map((accent) => {
        if (accent === "custom") {
          return (
            <button
              key={accent}
              aria-label={t("admin.branding.accentCustom")}
              aria-pressed={isCustom}
              className="size-6 shrink-0 rounded-full border transition-all focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 data-[active=true]:ring-[2px] data-[active=true]:ring-ring data-[active=true]:ring-offset-2 data-[active=true]:ring-offset-background"
              data-active={isCustom}
              disabled={disabled}
              style={{
                background:
                  isCustom && customHex
                    ? customHex
                    : "conic-gradient(from 140deg, #f43f5e, #f97316, #facc15, #4ade80, #22d3ee, #818cf8, #e879f9, #f43f5e)",
              }}
              title={t("admin.branding.accentCustom")}
              type="button"
              onClick={() => onSelect(accent)}
            />
          );
        }
        const active = accent === value;
        return (
          <button
            key={accent}
            aria-label={t(`admin.branding.accent_${accent}`)}
            aria-pressed={active}
            className="size-6 shrink-0 rounded-full border transition-all focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 data-[active=true]:ring-[2px] data-[active=true]:ring-ring data-[active=true]:ring-offset-2 data-[active=true]:ring-offset-background"
            data-active={active}
            disabled={disabled}
            style={{ backgroundColor: ACCENT_SWATCH_HEX[accent] }}
            title={t(`admin.branding.accent_${accent}`)}
            type="button"
            onClick={() => onSelect(accent)}
          />
        );
      })}
    </fieldset>
  );
}
