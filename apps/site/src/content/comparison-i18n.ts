import type { SupportedLocale } from "@/lib/seo";

export const STAT_TITLES: Record<
  SupportedLocale,
  { servers: string; ownership: string }
> = {
  en: { servers: "0 Servers", ownership: "100% Yours" },
  zh: { servers: "0 台服务器", ownership: "100% 自主" },
  ja: { servers: "0台のサーバー", ownership: "100% 自主管理" },
  fr: { servers: "0 serveur", ownership: "100 % à vous" },
  es: { servers: "0 servidores", ownership: "100% tuyo" },
  ko: { servers: "0대 서버", ownership: "100% 완전 소유" },
  ru: { servers: "0 серверов", ownership: "100% ваше" },
  ar: { servers: "0 خوادم", ownership: "100% ملكك" },
};

export const COMP_HEADERS: Record<
  SupportedLocale,
  { nas: string; vps: string }
> = {
  en: { nas: "Home NAS / Homelab", vps: "Traditional VPS Cloud" },
  zh: { nas: "家用 NAS / 软路由", vps: "传统 VPS 云主机" },
  ja: { nas: "自宅 NAS / ルーター", vps: "従来の VPS" },
  fr: { nas: "NAS domestique", vps: "VPS traditionnel" },
  es: { nas: "NAS doméstico", vps: "VPS tradicional" },
  ko: { nas: "홈 NAS", vps: "기존 VPS" },
  ru: { nas: "Домашний NAS", vps: "Обычный VPS" },
  ar: { nas: "وحدة NAS منزلية", vps: "خوادم VPS التقليدية" },
};

export const COMP_DIMENSIONS: Record<SupportedLocale, string> = {
  en: "Dimension",
  zh: "对比维度",
  ja: "比較項目",
  fr: "Dimension",
  es: "Dimensión",
  ko: "비교 기준",
  ru: "Критерий",
  ar: "معيار المقارنة",
};
