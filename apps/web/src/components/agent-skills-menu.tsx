import {
  AGENT_SKILL_LIST,
  type AgentSkill,
  type AgentSkillId,
} from "@flaremo/contracts";
import { PuzzleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/i18n";
import type { TranslationKey } from "@/i18n/key";
import { cn } from "@/lib/utils";

/**
 * 技能的界面文案映射。放在 web 侧而非 contracts：服务端只关心 id、取数方式与注入
 * 模型的指令，locale 目录才是 UI 文案的真源。satisfies 保证漏翻译会编译失败。
 */
export const AGENT_SKILL_KEYS = {
  "daily-insight": {
    label: "agent.skill.dailyInsight.label",
    desc: "agent.skill.dailyInsight.desc",
  },
  "behavior-pattern": {
    label: "agent.skill.behaviorPattern.label",
    desc: "agent.skill.behaviorPattern.desc",
  },
  reframe: {
    label: "agent.skill.reframe.label",
    desc: "agent.skill.reframe.desc",
  },
  "yesterday-dream": {
    label: "agent.skill.yesterdayDream.label",
    desc: "agent.skill.yesterdayDream.desc",
  },
  "book-mirror": {
    label: "agent.skill.bookMirror.label",
    desc: "agent.skill.bookMirror.desc",
  },
  "echo-of-then": {
    label: "agent.skill.echoOfThen.label",
    desc: "agent.skill.echoOfThen.desc",
  },
  "on-this-day": {
    label: "agent.skill.onThisDay.label",
    desc: "agent.skill.onThisDay.desc",
  },
} as const satisfies Record<
  AgentSkillId,
  { label: TranslationKey; desc: TranslationKey }
>;

/**
 * 「技能」菜单，对齐 flomo Agent。选中后：用户消息只放技能名（短，不污染 RAG 召回），
 * 技能 id 随请求交给后端，由后端把指令注入 system prompt。
 */
export function AgentSkillsMenu({
  onSelect,
  disabled,
  isMobile,
}: {
  onSelect: (skill: AgentSkill) => void;
  disabled?: boolean;
  /** Mobile: bump the trigger to a ≥44px touch target (flomo sheet). */
  isMobile?: boolean;
}) {
  const { t } = useI18n();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={t("agent.skills")}
            className={cn(
              "text-muted-foreground hover:text-foreground",
              isMobile && "size-11",
            )}
            disabled={disabled}
            size="icon-sm"
            title={t("agent.skills")}
            type="button"
            variant="ghost"
          />
        }
      >
        <PuzzleIcon className="size-4" strokeWidth={1.5} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>{t("agent.skills")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {AGENT_SKILL_LIST.map((skill) => (
          <DropdownMenuItem
            key={skill.id}
            className="flex-col items-start gap-0.5 py-2"
            onClick={() => onSelect(skill)}
          >
            <span>{t(AGENT_SKILL_KEYS[skill.id].label)}</span>
            <span className="text-xs leading-snug text-muted-foreground">
              {t(AGENT_SKILL_KEYS[skill.id].desc)}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
