import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useI18n } from "@/i18n";

type UseClipboardOptions = {
  /**
   * Auto-reset delay for the copied flag, in ms. Pass null to keep it until
   * reset() is called (the one-time secret dialogs want the label to stick).
   */
  timeout?: number | null;
  /** null suppresses the success toast; a string overrides its text. */
  successMessage?: string | null;
  /** null suppresses the error toast so the caller can surface the failure. */
  errorMessage?: string | null;
};

export function useClipboard(options: UseClipboardOptions = {}) {
  const { timeout = 2000, successMessage, errorMessage } = options;
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        if (successMessage !== null) {
          toast.success(successMessage ?? t("toast.linkCopied"));
        }
        if (timerRef.current) clearTimeout(timerRef.current);
        if (timeout !== null) {
          timerRef.current = setTimeout(() => setCopied(false), timeout);
        }
        return true;
      } catch {
        if (errorMessage !== null) {
          toast.error(errorMessage ?? t("share.copyFailed"));
        }
        return false;
      }
    },
    [timeout, successMessage, errorMessage, t],
  );

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setCopied(false);
  }, []);

  return { copied, copy, reset };
}
