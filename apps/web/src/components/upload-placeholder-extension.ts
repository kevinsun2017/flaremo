import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/react";

const uploadPlaceholderKey = new PluginKey("uploadPlaceholder");

type UploadPlaceholderState = {
  decorations: DecorationSet;
};

/**
 * Inline "uploading…" chips for pasted/dropped images. Widgets are pure
 * decorations: the document model stays untouched, so markdown serialization
 * and the draft pipeline never see an upload in flight. The caller tracks one
 * id per file and swaps the placeholder for the real reference on settle.
 */
export const UploadPlaceholder = Extension.create({
  name: "uploadPlaceholder",

  addProseMirrorPlugins() {
    return [
      new Plugin<UploadPlaceholderState>({
        key: uploadPlaceholderKey,
        state: {
          init: () => ({ decorations: DecorationSet.empty }),
          apply(tr, value) {
            let decorations = value.decorations.map(tr.mapping, tr.doc);
            const meta:
              | {
                  id: string;
                  action: "add" | "remove";
                  pos?: number;
                  name?: string;
                }
              | undefined = tr.getMeta(uploadPlaceholderKey);
            if (meta?.action === "add" && meta.pos !== undefined) {
              const chip = document.createElement("span");
              chip.className = "composer-upload-chip";
              chip.dataset.uploadId = meta.id;
              chip.textContent = meta.name ?? "";
              decorations = decorations.add(tr.doc, [
                Decoration.widget(meta.pos, chip, { id: meta.id, side: 1 }),
              ]);
            }
            if (meta?.action === "remove") {
              const stale = decorations.find(
                undefined,
                undefined,
                (spec) => spec.id === meta.id,
              );
              if (stale.length > 0) decorations = decorations.remove(stale);
            }
            return { decorations };
          },
        },
        props: {
          decorations(state) {
            return uploadPlaceholderKey.getState(state)?.decorations;
          },
        },
      }),
    ];
  },
});

/** Inserts an "uploading…" chip at `pos`; returns its tracking id. */
export function addUploadPlaceholder(
  editor: Editor,
  pos: number,
  name: string,
): string {
  const id = `upload-${Math.random().toString(36).slice(2)}`;
  const { tr } = editor.state;
  editor.view.dispatch(
    tr.setMeta(uploadPlaceholderKey, { id, action: "add", pos, name }),
  );
  return id;
}

/** Current mapped position of a placeholder, or null once it is gone. */
export function findUploadPlaceholder(
  editor: Editor,
  id: string,
): number | null {
  const set = uploadPlaceholderKey.getState(editor.state)?.decorations;
  if (!set) return null;
  const found = set.find(
    undefined,
    undefined,
    (spec: { id?: string }) => spec.id === id,
  );
  return found.length > 0 ? found[0].from : null;
}

export function removeUploadPlaceholder(editor: Editor, id: string): void {
  const { tr } = editor.state;
  editor.view.dispatch(
    tr.setMeta(uploadPlaceholderKey, { id, action: "remove" }),
  );
}
