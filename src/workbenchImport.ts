import { acceptWorkbenchArticle } from "./draft";

export type WorkbenchRequest = { id: string; origin: string };

export function readWorkbenchRequest(): WorkbenchRequest | null {
  if (!window.opener) return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const id = params.get("workbench-import");
  const origin = params.get("origin");
  if (!id || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id) || !origin)
    return null;
  try {
    const url = new URL(origin);
    if (
      origin === url.origin &&
      ["http:", "https:"].includes(url.protocol) &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    )
      return { id, origin };
  } catch {}
  return null;
}

export function receiveWorkbenchArticle(
  request: WorkbenchRequest,
  onReceive: () => void,
  onError: (message: string) => void,
) {
  const opener: Window = window.opener;
  const receive = (event: MessageEvent) => {
    const data = event.data;
    if (
      event.source !== opener ||
      event.origin !== request.origin ||
      data?.type !== "workbench:article" ||
      data.id !== request.id
    )
      return;
    if (
      typeof data.title !== "string" ||
      !data.title.trim() ||
      typeof data.body !== "string"
    )
      return;
    try {
      acceptWorkbenchArticle(data.title.trim(), data.body);
    } catch {
      onError(
        "浏览器无法暂存这篇文章。请检查浏览器存储空间，再回到工作台重新导出。",
      );
      return;
    }
    window.removeEventListener("message", receive);
    opener.postMessage(
      { type: "markdown-editor:received", id: request.id },
      request.origin,
    );
    window.opener = null;
    onReceive();
  };
  window.addEventListener("message", receive);
  opener.postMessage(
    { type: "markdown-editor:ready", id: request.id },
    request.origin,
  );
  return () => window.removeEventListener("message", receive);
}
