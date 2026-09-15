/** Keep mixed inline content in explicit text runs when copying to WeChat.
 *
 * The publishing checker measures a container differently when raw text sits
 * beside emphasis, an image, or a footnote. Ordinary styled spans preserve
 * those runs through paste without relying on editor-owned `leaf` attributes.
 * No block is wrapped, and no text, formatting, or link is discarded.
 */
export function normalizeWechatTextRuns(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const text of nodes) {
    const parent = text.parentElement;
    if (!parent?.children.length || !text.data.trim()) continue;
    const span = document.createElement("span");
    // Persist the same font metrics as the containing element. This is normal
    // article formatting, not an exemption attribute for the checker.
    span.style.fontSize =
      parent.style.fontSize || root.style.fontSize || "16px";
    span.style.lineHeight =
      parent.style.lineHeight || root.style.lineHeight || "1.6";
    text.replaceWith(span);
    span.append(text);
  }
}
