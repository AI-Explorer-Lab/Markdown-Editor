import {
  validateAppearance,
  type Appearance,
  type CustomTheme,
} from "./customThemes";
import { isThemeId, type ThemeId } from "./themes";
import { sample } from "./sample";

const draftKey = "markdown-studio-draft";
const importDraftKey = "markdown-studio-workbench-draft";
const lastAppearanceKey = "markdown-studio-last-appearance";

export type Draft = {
  source: string;
  name: string;
  suggestedTitle?: string;
  revision: string | null;
  saved: string;
  theme: ThemeId;
  custom: CustomTheme | null;
  savedAppearance: string;
  fontSize: number;
  lineHeight: number;
};
export const appearanceOf = (d: Appearance): Appearance => ({
  theme: d.theme,
  custom: d.custom,
  fontSize: d.fontSize,
  lineHeight: d.lineHeight,
});
export const appearanceKey = (d: Appearance) => JSON.stringify(appearanceOf(d));
export const hasChanges = (d: Draft) =>
  d.source !== d.saved || (!!d.name && appearanceKey(d) !== d.savedAppearance);
export const initial = (): Draft => {
  try {
    const d = JSON.parse(
      sessionStorage.getItem(importDraftKey) ||
        localStorage.getItem(draftKey) ||
        "null",
    );
    if (d && typeof d.source === "string") {
      let appearance: Appearance = {
        theme: "forest",
        custom: null,
        fontSize: 16,
        lineHeight: 1.8,
      };
      try {
        appearance = validateAppearance({
          theme: isThemeId(d.theme) ? d.theme : "forest",
          custom: d.custom || null,
          fontSize: d.fontSize,
          lineHeight: d.lineHeight,
        });
      } catch {
        /* Keep the user's text even when a stored style is invalid. */
      }
      return {
        ...d,
        ...appearance,
        savedAppearance: d.savedAppearance || appearanceKey(appearance),
      };
    }
  } catch {}
  return {
    source: sample,
    name: "",
    revision: null,
    saved: sample,
    theme: "forest",
    custom: null,
    savedAppearance: appearanceKey({
      theme: "forest",
      custom: null,
      fontSize: 16,
      lineHeight: 1.8,
    }),
    fontSize: 16,
    lineHeight: 1.8,
  };
};

export function persistDraft(draft: Draft) {
  const json = JSON.stringify(draft);
  if (sessionStorage.getItem(importDraftKey) !== null) {
    sessionStorage.setItem(importDraftKey, json);
  } else {
    localStorage.setItem(draftKey, json);
  }
}

export function rememberAppearance(appearance: Appearance) {
  localStorage.setItem(lastAppearanceKey, appearanceKey(appearance));
}

export function suggestedFilename(title?: string) {
  if (!title) return "";
  return (
    title
      .replace(/[\\/<>:"|?*\u0000-\u001f]/g, " ")
      .trim()
      .replace(/^\.+/, "")
      .slice(0, 100)
      .replace(/[. ]+$/, "") || "未命名文章"
  );
}

export function acceptWorkbenchArticle(title: string, body: string) {
  let appearance = appearanceOf(initial());
  try {
    const recent = localStorage.getItem(lastAppearanceKey);
    if (recent) appearance = validateAppearance(JSON.parse(recent));
  } catch {
    // Older drafts still carry their complete appearance.
  }
  const draft: Draft = {
    ...appearance,
    name: "",
    suggestedTitle: title,
    source: body,
    revision: null,
    saved: "",
    savedAppearance: appearanceKey(appearance),
  };
  // Keep this tab's unsaved import separate from the previous editor draft.
  sessionStorage.setItem(importDraftKey, JSON.stringify(draft));
}
