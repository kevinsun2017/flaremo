import type { SupportedLocale } from "@/lib/seo";

export const ECOSYSTEM_CONTENT: Record<
  SupportedLocale,
  {
    badge: string;
    heading: string;
    subtitle: string;
    clients: Array<{
      title: string;
      tag: string;
      desc: string;
    }>;
  }
> = {
  zh: {
    badge: "连接你已有的工具",
    heading: "全面的 Memos 生态无缝兼容",
    subtitle:
      "完整兼容 Memos /api/v1 协议与可撤销个人访问令牌（PAT），你的现有工具链立即可用。",
    clients: [
      {
        title: "Moe Memos",
        tag: "iOS & Android",
        desc: "最受欢迎的开源移动双端，支持直接以 FlareMo 地址与 PAT 凭据连接。",
      },
      {
        title: "Telegram Bot",
        tag: "即时捕捉",
        desc: "随手向专属 Bot 发送文字、图片与语音，几秒内完成碎片灵感入库。",
      },
      {
        title: "AI MCP Server",
        tag: "Model Context Protocol",
        desc: "连接 Claude Desktop、Cursor 与 Codex，将记录库作为 AI 长期记忆体。",
      },
      {
        title: "Raycast / Alfred",
        tag: "桌面心流",
        desc: "全局快捷键一秒唤起输入框，不打断手头心流快速记下闪念。",
      },
    ],
  },
  en: {
    badge: "Bring Your Own Tools",
    heading: "Full Memos Ecosystem Compatibility",
    subtitle:
      "Drop-in compatibility with Memos /api/v1 endpoints and Personal Access Tokens (PAT). Keep your favorite daily tools.",
    clients: [
      {
        title: "Moe Memos",
        tag: "iOS & Android",
        desc: "The most popular open-source mobile client for iOS and Android with direct PAT connection.",
      },
      {
        title: "Telegram Bot",
        tag: "Instant Capture",
        desc: "Send notes, voice memos, and photos directly to your personal bot in seconds.",
      },
      {
        title: "AI MCP Server",
        tag: "Model Context Protocol",
        desc: "Connect Claude Desktop, Cursor, and Codex as your AI long-term external brain.",
      },
      {
        title: "Raycast / Alfred",
        tag: "Desktop Workflow",
        desc: "Trigger global quick-capture shortcuts on desktop without breaking your creative flow.",
      },
    ],
  },
  ja: {
    badge: "既存ツールをそのまま",
    heading: "Memos エコシステムとの完全互換",
    subtitle:
      "Memos /api/v1 エンドポイントと PAT トークンを標準サポート。使い慣れたツールをそのまま活用できます。",
    clients: [
      {
        title: "Moe Memos",
        tag: "iOS & Android",
        desc: "iOS/Android 対応の人気オープンソースモバイルクライアント。PAT で直接連携。",
      },
      {
        title: "Telegram Bot",
        tag: "即時キャプチャ",
        desc: "専用 Bot にテキストや写真、音声メモを送信して数秒でインプット完了。",
      },
      {
        title: "AI MCP Server",
        tag: "Model Context Protocol",
        desc: "Claude Desktop や Cursor、Codex と連携し、ノートを AI の長期記憶として活用。",
      },
      {
        title: "Raycast / Alfred",
        tag: "デスクトップ",
        desc: "ショートカットで瞬時にメモウィンドウを起動し、思考の流れを中断せず記録。",
      },
    ],
  },
  fr: {
    badge: "Vos outils restent",
    heading: "Compatibilité totale avec l'écosystème Memos",
    subtitle:
      "Compatibilité directe avec l'API Memos /api/v1 et les jetons PAT. Conservez vos outils préférés.",
    clients: [
      {
        title: "Moe Memos",
        tag: "iOS & Android",
        desc: "Client mobile open-source populaire pour iOS et Android avec synchronisation directe.",
      },
      {
        title: "Telegram Bot",
        tag: "Capture instantanée",
        desc: "Envoyez des notes, des messages vocaux et des photos directement à votre bot en quelques secondes.",
      },
      {
        title: "AI MCP Server",
        tag: "Model Context Protocol",
        desc: "Connectez Claude Desktop, Cursor et Codex comme mémoire externe à long terme pour l'IA.",
      },
      {
        title: "Raycast / Alfred",
        tag: "Flux de bureau",
        desc: "Raccourci clavier global pour capturer des pensées sans interrompre votre concentration.",
      },
    ],
  },
  es: {
    badge: "Tus herramientas siguen",
    heading: "Compatibilidad total con el ecosistema Memos",
    subtitle:
      "Compatibilidad directa con la API /api/v1 de Memos y tokens PAT. Conserva todas tus herramientas diarias.",
    clients: [
      {
        title: "Moe Memos",
        tag: "iOS y Android",
        desc: "Cliente móvil de código abierto líder para iOS y Android con conexión directa mediante PAT.",
      },
      {
        title: "Telegram Bot",
        tag: "Captura instantánea",
        desc: "Envía notas, audios y fotos directamente a tu bot personal en cuestión de segundos.",
      },
      {
        title: "AI MCP Server",
        tag: "Model Context Protocol",
        desc: "Conecta Claude Desktop, Cursor y Codex como memoria externa a largo plazo para IA.",
      },
      {
        title: "Raycast / Alfred",
        tag: "Flujo de escritorio",
        desc: "Atajo de teclado global para captura rápida en escritorio sin interrumpir tu concentración.",
      },
    ],
  },
  ko: {
    badge: "기존 도구 연결",
    heading: "완벽한 Memos 생태계 호환성",
    subtitle:
      "Memos /api/v1 표준 API 및 PAT 토큰 호환. 기존에 사용하던 모든 도구를 즉시 연결할 수 있습니다.",
    clients: [
      {
        title: "Moe Memos",
        tag: "iOS & Android",
        desc: "iOS 및 Android를 지원하는 인기 오픈소스 모바일 클라이언트. PAT로 즉시 연결.",
      },
      {
        title: "Telegram Bot",
        tag: "즉각적인 기록",
        desc: "전용 봇에 텍스트, 음성, 사진을 보내 몇 초 만에 아이디어를 안전하게 저장.",
      },
      {
        title: "AI MCP Server",
        tag: "Model Context Protocol",
        desc: "Claude Desktop, Cursor, Codex에 연결하여 나만의 AI 장기 외장 기억 저장소로 활용.",
      },
      {
        title: "Raycast / Alfred",
        tag: "데스크톱 워크플로",
        desc: "단축키로 1초 만에 캡처 창을 호출하여 작업 흐름의 중단 없이 빠르게 메모.",
      },
    ],
  },
  ru: {
    badge: "Ваши инструменты",
    heading: "Полная совместимость с экосистемой Memos",
    subtitle:
      "Поддержка Memos /api/v1 и токенов PAT. Ваши любимые приложения и скрипты работают сразу.",
    clients: [
      {
        title: "Moe Memos",
        tag: "iOS и Android",
        desc: "Популярный мобильный клиент с открытым исходным кодом для iOS и Android.",
      },
      {
        title: "Telegram Bot",
        tag: "Быстрый сбор",
        desc: "Отправляйте заметки, голос и фото в личного бота за пару секунд.",
      },
      {
        title: "AI MCP Server",
        tag: "Model Context Protocol",
        desc: "Подключение Claude Desktop, Cursor и Codex в качестве внешней памяти для ИИ.",
      },
      {
        title: "Raycast / Alfred",
        tag: "Настольный поток",
        desc: "Глобальное сочетание клавиш для мгновенной фиксации идей на рабочем столе.",
      },
    ],
  },
  ar: {
    badge: "أدواتك الحالية تعمل",
    heading: "توافق كامل مع منظومة Memos",
    subtitle:
      "توافق مباشر مع واجهة Memos /api/v1 ورموز الوصول الشخصية (PAT). احتفظ بأدواتك اليومية المفضلة.",
    clients: [
      {
        title: "Moe Memos",
        tag: "iOS و Android",
        desc: "عميل الهاتف المحمول مفتوح المصدر الشهير لنظامي iOS و Android مع اتصال مباشر.",
      },
      {
        title: "Telegram Bot",
        tag: "التقاط فوري",
        desc: "أرسل الملاحظات والرسائل الصوتية والصور مباشرة إلى روبوتك الشخصي في ثوانٍ.",
      },
      {
        title: "AI MCP Server",
        tag: "Model Context Protocol",
        desc: "اربط Claude Desktop و Cursor كذاكرة طويلة المدى للذكاء الاصطناعي الخاص بك.",
      },
      {
        title: "Raycast / Alfred",
        tag: "سير العمل المكتبي",
        desc: "مفتاح اختصار شامل لالتقاط الأفكار على سطح المكتب دون مقاطعة تركيزك.",
      },
    ],
  },
};
