import { Radio, Smartphone, Sparkles, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ECOSYSTEM_CONTENT } from "@/content/ecosystem-i18n";
import type { SupportedLocale } from "@/lib/seo";

/* ============================================================
   5. 多端生态与无缝兼容展示
   ============================================================ */

const ECOSYSTEM_ICONS = [Smartphone, Radio, Sparkles, Zap];

export function EcosystemSection({ locale }: { locale: SupportedLocale }) {
  const content = ECOSYSTEM_CONTENT[locale] || ECOSYSTEM_CONTENT.en;

  return (
    <section id="ecosystem" className="container-x space-y-8 scroll-mt-20">
      <div className="max-w-2xl space-y-2">
        <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl md:text-4xl">
          {content.heading}
        </h2>
        <p className="text-sm text-mist">{content.subtitle}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {content.clients.map((c, idx) => {
          const Icon = ECOSYSTEM_ICONS[idx] ?? Sparkles;
          return (
            <div
              key={c.title}
              className="panel-card p-5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="icon-dock flex size-9 items-center justify-center text-signal">
                    <Icon className="size-4" />
                  </div>
                  <Badge variant="secondary">{c.tag}</Badge>
                </div>
                <h3 className="mt-4 text-base font-bold text-ink">{c.title}</h3>
                <p className="mt-1.5 text-xs text-mist leading-relaxed">
                  {c.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
