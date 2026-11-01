import type { SupportedLocale } from "@/lib/seo";

export type RouteMeta = {
  /** Route path with :param placeholders resolved, e.g. /docs/deploy */
  path: string;
  locale: SupportedLocale;
  title: string;
  description: string;
  ogType?: "website" | "article";
  jsonLd?: unknown;
};

export const STATIC_PAGE_META: Record<
  SupportedLocale,
  {
    homeTitle: string;
    homeDesc: string;
    docsTitle: string;
    docsDesc: string;
  }
> = {
  en: {
    homeTitle: "FlareMo - Cloudflare-Native Personal Knowledge System",
    homeDesc:
      "A personal note system that runs 24/7 on a free Cloudflare account. D1 + R2 + Better Auth + Memos-compatible API.",
    docsTitle: "Documentation",
    docsDesc:
      "FlareMo documentation overview: deployment, architecture, compatibility, agent integrations, and reference.",
  },
  zh: {
    homeTitle: "FlareMo - Cloudflare 原生个人知识库",
    homeDesc:
      "一个免费 Cloudflare 账号就能 24 小时在线的个人记录系统。D1 + R2 + Better Auth + Memos 兼容 API。",
    docsTitle: "文档总览",
    docsDesc: "FlareMo 文档总览：部署、架构、兼容矩阵、Agent 集成与参考。",
  },
  ja: {
    homeTitle: "FlareMo - Cloudflare ネイティブ個人ナレッジベース",
    homeDesc:
      "無料の Cloudflare アカウントで 24 時間 365 日稼働する個人メモシステム。D1 + R2 + Better Auth + Memos 互換 API。",
    docsTitle: "ドキュメント総覧",
    docsDesc:
      "FlareMo ドキュメント総覧：デプロイ、アーキテクチャ、互換性、Agent 統合、リファレンス。",
  },
  fr: {
    homeTitle:
      "FlareMo - Système de connaissances personnelles natif Cloudflare",
    homeDesc:
      "Un système de notes personnelles fonctionnant 24/7 sur un compte Cloudflare gratuit. D1 + R2 + Better Auth + API compatible Memos.",
    docsTitle: "Documentation",
    docsDesc:
      "Vue d'ensemble de la documentation FlareMo : déploiement, architecture, compatibilité, intégration d'agents et référence.",
  },
  es: {
    homeTitle:
      "FlareMo - Sistema de conocimiento personal nativo de Cloudflare",
    homeDesc:
      "Un sistema de notas personales que funciona 24/7 en una cuenta gratuita de Cloudflare. D1 + R2 + Better Auth + API compatible con Memos.",
    docsTitle: "Documentación",
    docsDesc:
      "Resumen de la documentación de FlareMo: despliegue, arquitectura, compatibilidad, integración de agentes y referencia.",
  },
  ko: {
    homeTitle: "FlareMo - Cloudflare 네이티브 개인 지식 관리 시스템",
    homeDesc:
      "무료 Cloudflare 계정 하나로 24시간 상시 운영되는 개인 노트 시스템. D1 + R2 + Better Auth + Memos 호환 API.",
    docsTitle: "문서 개요",
    docsDesc:
      "FlareMo 문서 개요: 배포, 아키텍처, 호환성 매트릭스, 에이전트 연동 및 레퍼런스.",
  },
  ru: {
    homeTitle: "FlareMo - Cloudflare-native персональная база знаний",
    homeDesc:
      "Персональная система заметок, работающая 24/7 на бесплатном аккаунте Cloudflare. D1 + R2 + Better Auth + совместимый с Memos API.",
    docsTitle: "Обзор документации",
    docsDesc:
      "Обзор документации FlareMo: развертывание, архитектура, совместимость, интеграция агентов и справочник.",
  },
  ar: {
    homeTitle: "FlareMo - نظام إدارة المعرفة الشخصية المبني لـ Cloudflare",
    homeDesc:
      "نظام ملاحظات شخصي يعمل على مدار الساعة بحساب Cloudflare مجاني. D1 + R2 + Better Auth + واجهة برمجية متوافقة مع Memos.",
    docsTitle: "نظرة عامة على المستندات",
    docsDesc:
      "نظرة عامة على مستندات FlareMo: النشر، الهندسة المعمارية، مصفوفة التوافق، تكاملات الوكلاء والمراجع.",
  },
};
