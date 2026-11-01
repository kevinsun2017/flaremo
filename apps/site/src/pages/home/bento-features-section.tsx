import { Bot, type LucideIcon } from "lucide-react";
import { RevealGroup, RevealItem } from "@/components/motion";
import { Badge } from "@/components/ui/badge";
/* ============================================================
   2. Bento 核心特性网格
   ============================================================ */

export function BentoFeatures({
  badge,
  heading,
  subtitle,
  items,
  icons,
}: {
  badge: string;
  heading: string;
  subtitle: string;
  items: Array<{ title: string; description: string }>;
  icons: LucideIcon[];
}) {
  return (
    <section id="features" className="container-x space-y-10 scroll-mt-20">
      <div className="max-w-2xl space-y-2">
        <Badge variant="flame">{badge}</Badge>
        <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl md:text-4xl">
          {heading}
        </h2>
        <p className="text-sm text-mist">{subtitle}</p>
      </div>

      <RevealGroup
        stagger={0.06}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {items.map((item, idx) => {
          const Icon = icons[idx] ?? Bot;
          return (
            <RevealItem key={item.title}>
              <div className="panel-card p-6 flex flex-col justify-between h-full group">
                <div>
                  <div className="mb-4 flex size-11 items-center justify-center icon-dock text-signal transition-transform duration-300 group-hover:scale-105">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="text-base font-bold tracking-tight text-ink">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-mist">
                    {item.description}
                  </p>
                </div>
              </div>
            </RevealItem>
          );
        })}
      </RevealGroup>
    </section>
  );
}
