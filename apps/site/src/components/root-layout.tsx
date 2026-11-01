import { DirectionProvider } from "@base-ui/react/direction-provider";
import { Outlet, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { ThemeProvider } from "@/components/theme-provider";
import { getLocaleFromPath, localeDirection, localeHtmlLang } from "@/lib/seo";

export function RootLayout() {
  const { pathname } = useLocation();
  const locale = getLocaleFromPath(pathname);
  const dir = localeDirection(locale);

  // <html lang>/<html dir> are written at build time by the SSG shell only.
  // LocaleSwitcher navigates client-side (no document reload), so switching to
  // /ja or /ar would otherwise leave zh's :lang(zh) font scope and ltr on the
  // document — exactly the two rules tokens.css keys off <html>. The root
  // route component stays mounted across every navigation (locale routes, docs,
  // the 404 route), so this effect is the single choke point that also covers
  // back/forward. Effects never run during renderToString, so prerendering is
  // untouched; the guard keeps it safe under a DOM-less renderer too.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = localeHtmlLang(locale);
    document.documentElement.dir = dir;
  }, [locale, dir]);

  return (
    <DirectionProvider direction={dir}>
      <ThemeProvider>
        <div className="flex min-h-screen flex-col bg-paper text-ink antialiased selection:bg-signal/20 selection:text-signal-ink transition-colors duration-200">
          <SiteNav currentPath={pathname} locale={locale} />
          <main className="flex-1">
            <Outlet />
          </main>
          <SiteFooter locale={locale} />
        </div>
      </ThemeProvider>
    </DirectionProvider>
  );
}
