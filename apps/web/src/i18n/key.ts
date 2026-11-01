// TranslationKey derives from the zh-CN catalog: every locale record is
// type-checked against this union, so a missing or extra key fails
// typecheck. Keys are stable public identifiers — never rename, only add.
import type { zhCN } from "./messages/zh-CN";

export type TranslationKey = keyof typeof zhCN;
