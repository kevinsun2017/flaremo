import { useEffect, useRef } from "react";

/**
 * The account panel's leaf bits: the password floor the password dialog and
 * its submit handler both enforce, the avatar presets, and the hook that
 * closes a dialog once the mutation behind it has landed. They sit here rather
 * than in `account-panel.tsx` so the three section modules can import them
 * without a child→parent import cycle.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** Closes a dialog on the pending→idle edge of its mutation, unless the write
 *  failed — that is the only evidence the caller has that it succeeded. */
export function useCloseOnSuccess(
  isPending: boolean,
  hasError: boolean,
  close: () => void,
) {
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && !hasError) close();
    wasPending.current = isPending;
  }, [isPending, hasError, close]);
}

export const CUTE_AVATAR_PRESETS = [
  {
    id: "bottts",
    name: "机器人",
    getUrl: (seed: string) =>
      `https://api.dicebear.com/9.x/bottts/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`,
  },
  {
    id: "lorelei",
    name: "二次元",
    getUrl: (seed: string) =>
      `https://api.dicebear.com/9.x/lorelei/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`,
  },
  {
    id: "thumbs",
    name: "大拇指",
    getUrl: (seed: string) =>
      `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`,
  },
  {
    id: "adventurer",
    name: "冒险家",
    getUrl: (seed: string) =>
      `https://api.dicebear.com/9.x/adventurer/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`,
  },
  {
    id: "pixel-art",
    name: "像素小人",
    getUrl: (seed: string) =>
      `https://api.dicebear.com/9.x/pixel-art/svg?seed=${encodeURIComponent(seed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`,
  },
  {
    id: "notionists",
    name: "极简手绘",
    getUrl: (seed: string) =>
      `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=e5e7eb,f3f4f6,fee2e2,fef3c7,ecfdf5`,
  },
];
