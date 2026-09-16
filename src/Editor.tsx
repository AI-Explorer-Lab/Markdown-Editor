import { useEffect, useRef } from "react";
import { EditorView, keymap } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { basicSetup } from "codemirror";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
export type Insert = (
  before: string,
  after?: string,
  placeholder?: string,
) => void;
export function Editor({
  value,
  onChange,
  viewRef,
  onFiles,
  onSave,
}: {
  value: string;
  onChange: (v: string) => void;
  viewRef: React.RefObject<EditorView | null>;
  onFiles: (files: File[]) => void;
  onSave: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onChange, onFiles, onSave });
  callbacks.current = { onChange, onFiles, onSave };
  useEffect(() => {
    if (!container.current) return;
    const view = new EditorView({
      parent: container.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          markdown(),
          syntaxHighlighting(
            HighlightStyle.define([
              {
                tag: tags.heading,
                color: "var(--editor-heading, #1d5685)",
                fontWeight: "700",
                textDecoration: "none",
              },
              {
                tag: tags.link,
                color: "var(--editor-link, #3c7561)",
                textDecoration: "none",
              },
              { tag: tags.url, color: "var(--editor-url, #9e4966)" },
              { tag: tags.quote, color: "var(--editor-quote, #688473)" },
              { tag: tags.keyword, color: "var(--editor-code, #785aa0)" },
              {
                tag: [tags.string, tags.number, tags.bool],
                color: "var(--editor-link, #3c7561)",
              },
              { tag: tags.comment, color: "var(--editor-quote, #688473)" },
              { tag: tags.monospace, color: "var(--editor-code, #785aa0)" },
            ]),
          ),
          EditorView.lineWrapping,
          keymap.of([
            {
              key: "Mod-s",
              run: () => {
                callbacks.current.onSave();
                return true;
              },
            },
          ]),
          EditorView.contentAttributes.of({
            "aria-label": "Markdown 源码",
            spellcheck: "false",
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged)
              callbacks.current.onChange(update.state.doc.toString());
          }),
          EditorView.domEventHandlers({
            paste: (event) => {
              const files = Array.from(event.clipboardData?.files || []);
              if (files.length) {
                event.preventDefault();
                callbacks.current.onFiles(files);
                return true;
              }
              return false;
            },
            drop: (event) => {
              const files = Array.from(event.dataTransfer?.files || []);
              if (files.length) {
                event.preventDefault();
                const pos = view.posAtCoords({
                  x: event.clientX,
                  y: event.clientY,
                });
                if (pos !== null) view.dispatch({ selection: { anchor: pos } });
                callbacks.current.onFiles(files);
                return true;
              }
              return false;
            },
          }),
          EditorView.theme({
            "&": {
              height: "100%",
              fontSize: "14px",
              backgroundColor: "var(--editor-bg, #fafbfc)",
            },
            ".cm-scroller": {
              overflow: "auto",
              fontFamily: '"SFMono-Regular",Consolas,"PingFang SC",monospace',
              lineHeight: "1.95",
            },
            ".cm-content": { padding: "22px 0" },
            ".cm-line": { padding: "0 22px 0 12px" },
            ".cm-gutters": {
              backgroundColor: "var(--editor-gutter, #f6f8fa)",
              color: "var(--editor-muted, #a0a9b4)",
              borderRight: "1px solid #edf0f2",
              minWidth: "46px",
            },
            ".cm-activeLine": {
              backgroundColor: "var(--editor-active, #edf3ef77)",
            },
            ".cm-activeLineGutter": { backgroundColor: "transparent" },
            "&.cm-focused": { outline: "none" },
            ".cm-selectionBackground": {
              backgroundColor: "var(--editor-selection, #dcebdd)!important",
            },
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);
  useEffect(() => {
    const v = viewRef.current;
    if (v && v.state.doc.toString() !== value)
      v.dispatch({
        changes: { from: 0, to: v.state.doc.length, insert: value },
      });
  }, [value]);
  return <div ref={container} className="editor-host" />;
}
