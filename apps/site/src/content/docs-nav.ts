import type { DocGroup } from "@/lib/docs-source.generated";
import {
  getLocalizedPath,
  type Locale,
  normalizeLocale,
  type SupportedLocale,
} from "@/lib/seo";

export type DocNavGroup = {
  id: DocGroup;
  label: string;
};

const GROUPS_BY_LOCALE: Record<SupportedLocale, Record<DocGroup, string>> = {
  en: {
    start: "Get started",
    concept: "Architecture and concepts",
    compatibility: "Compatibility and ecosystem",
    agent: "Agent integrations",
    reference: "Reference",
  },
  zh: {
    start: "开始",
    concept: "架构与概念",
    compatibility: "兼容与生态",
    agent: "Agent 集成",
    reference: "参考",
  },
  ja: {
    start: "始める",
    concept: "アーキテクチャと概念",
    compatibility: "互換性とエコシステム",
    agent: "Agent 統合",
    reference: "リファレンス",
  },
  fr: {
    start: "Démarrage",
    concept: "Architecture et concepts",
    compatibility: "Compatibilité et écosystème",
    agent: "Intégrations d'agents",
    reference: "Référence",
  },
  es: {
    start: "Primeros pasos",
    concept: "Arquitectura y conceptos",
    compatibility: "Compatibilidad y ecosistema",
    agent: "Integraciones de agentes",
    reference: "Referencia",
  },
  ko: {
    start: "시작하기",
    concept: "아키텍처 및 개념",
    compatibility: "호환성 및 생태계",
    agent: "에이전트 연동",
    reference: "참고자료",
  },
  ru: {
    start: "Начало работы",
    concept: "Архитектура и концепции",
    compatibility: "Совместимость и экосистема",
    agent: "Интеграция агентов",
    reference: "Справочник",
  },
  ar: {
    start: "البدء",
    concept: "البنية المعمارية والمفاهيم",
    compatibility: "التوافق والمنظومة",
    agent: "تكاملات الوكلاء",
    reference: "المراجع",
  },
};

export function getDocNavGroups(locale: Locale): DocNavGroup[] {
  const norm = normalizeLocale(locale);
  const labels = GROUPS_BY_LOCALE[norm] || GROUPS_BY_LOCALE.en;
  const order: DocGroup[] = [
    "start",
    "concept",
    "compatibility",
    "agent",
    "reference",
  ];
  return order.map((id) => ({ id, label: labels[id] }));
}

export function docPath(slug: string, locale: Locale): string {
  return getLocalizedPath(`/docs/${slug}`, locale);
}
