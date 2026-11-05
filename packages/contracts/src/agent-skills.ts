/**
 * Agent 技能目录：Web 菜单与 Worker 执行共用的唯一真源。
 *
 * 语义对齐 flomo Agent 的「技能」——把技能名发给它就触发。区别在于本仓库把
 * 指令注入 system prompt，而不是当作普通用户消息发出，避免长指令污染 RAG 召回。
 */

export const AGENT_SKILL_IDS = [
  "daily-insight",
  "behavior-pattern",
  "reframe",
  "yesterday-dream",
  "book-mirror",
  "echo-of-then",
  "on-this-day",
] as const;

export type AgentSkillId = (typeof AGENT_SKILL_IDS)[number];

/** 取数方式：决定 worker 在回答前给模型喂哪一类确定性上下文。 */
export type AgentSkillRetrieval =
  | "semantic" // 沿用向量召回，检索词由 skill 自己控制
  | "same-day-history" // 那年今日：往年今天的记录
  | "older-random" // 昨日回声：随机取若干条旧记录，找张力
  | "none"; // 不额外取数

export type AgentSkill = {
  id: AgentSkillId;
  retrieval: AgentSkillRetrieval;
  /** 注入 system prompt 的指令正文（面向模型，非 UI 文案）。 */
  prompt: string;
  /** 作为 RAG 检索词的主题提示（可空，空则不加语义召回）。 */
  ragHint?: string;
};

const GUARDRAIL = [
  "硬要求：只说你真正找到的东西。",
  "找不到符合要求的记录或矛盾时，直说找不到，并按给定空状态文案回答，绝不编造。",
  "引用笔记时保留 [来源N] 标记；没有来源就不要假装读过。",
].join("");

export const AGENT_SKILLS: Record<AgentSkillId, AgentSkill> = {
  "daily-insight": {
    id: "daily-insight",
    retrieval: "semantic",
    ragHint: "近期记录里反复出现的主题",
    prompt: `你正在执行「每日新知」技能：从用户已经写过的某个点出发，延伸出一条他还没有记过的新知识。\n要求：先点明是从哪条记录（[来源N]）出发的，再给出那条新知识；新知识必须是可核对的具体内容，不是空泛道理。${GUARDRAIL}`,
  },
  "behavior-pattern": {
    id: "behavior-pattern",
    retrieval: "semantic",
    ragHint: "反复出现的做法 习惯 反应",
    prompt: `你正在执行「行为洞察」技能：从用户最近的记录里，照出一个他反复出现却没有察觉的默认动作。\n要求：用具体记录举证（[来源N]），指出重复的形状，再给出一句他可能没想过的解释。不下道德判断。${GUARDRAIL}`,
  },
  reframe: {
    id: "reframe",
    retrieval: "semantic",
    ragHint: "最近困扰我 在想什么",
    prompt: `你正在执行「幸福灵药」技能：把用户最近在想的事，重新框定成一句不鸡汤的话。\n要求：先复述他真正卡住的那一点（引 [来源N]），再给重新框定；不要安慰式套话，不要感叹号。${GUARDRAIL}`,
  },
  "yesterday-dream": {
    id: "yesterday-dream",
    retrieval: "semantic",
    ragHint: "没写完 悬着 好奇 待验证",
    prompt: `你正在执行「昨天的梦」技能：从用户的记录里挑出一个他还没解开的念头或好奇，抛给他。\n要求：这个好奇必须来自他自己的话（引 [来源N]），不要替他发明新话题。${GUARDRAIL}`,
  },
  "book-mirror": {
    id: "book-mirror",
    retrieval: "semantic",
    ragHint: "想读 在看 书",
    prompt: `你正在执行「书镜」技能：用用户自己的记录照一照他提到的一本书，指出他其实已经想过哪里、还没想通哪里。\n要求：只引用他写过的内容（[来源N]）；没记过的部分明确说没记过，不要转述书的内容。${GUARDRAIL}`,
  },
  "echo-of-then": {
    id: "echo-of-then",
    retrieval: "older-random",
    prompt: `你正在执行「昨日回声」技能：从给你的旧记录里，找出两处互相**对不上**的地方，留给他一个真问题。\n要求：必须同时引两条 [来源N]，并说清矛盾在哪；找不到真实矛盾时回答「笔记还太少，找不出张力」，绝不编一个假矛盾。${GUARDRAIL}`,
  },
  "on-this-day": {
    id: "on-this-day",
    retrieval: "same-day-history",
    prompt: `你正在执行「那年今日」技能：把往年今天写过什么摆给用户，与现在对照。\n要求：只引用给你的记录；如果没有任何往年今天的记录，回答「往年今天还没有记录」，不要虚构。${GUARDRAIL}`,
  },
};

export const AGENT_SKILL_LIST: AgentSkill[] = AGENT_SKILL_IDS.map((id) => AGENT_SKILLS[id]);

export function isAgentSkillId(v: unknown): v is AgentSkillId {
  return typeof v === "string" && (AGENT_SKILL_IDS as readonly string[]).includes(v);
}
