import { CheckIcon, LanguagesIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOCALE_LABELS, type Locale, SUPPORTED_LOCALES, useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

/** Native-name language switcher covering the same locales as the site. */
export function LocaleSwitcher({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("language.toggle")}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 cursor-pointer",
          className,
        )}
        title={t("language.toggle")}
        type="button"
      >
        <LanguagesIcon className="shrink-0" />
        <span className="max-w-24 truncate">{LOCALE_LABELS[locale]}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        {SUPPORTED_LOCALES.map((next: Locale) => (
          <DropdownMenuItem
            className="flex items-center justify-between gap-3"
            key={next}
            onClick={() => setLocale(next)}
          >
            <span className={cn(next === locale && "text-foreground")}>
              {LOCALE_LABELS[next]}
            </span>
            {next === locale && <CheckIcon className="size-3.5 shrink-0" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
