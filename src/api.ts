/// <reference types="vite/client" />
export const apiURL = (url: string) =>
  import.meta.env.BASE_URL + url.replace(/^\//, "");
export async function authFetch(url: string, options?: RequestInit) {
  const response = await fetch(apiURL(url), options);
  if (response.status === 401 && !url.includes("/auth/"))
    window.dispatchEvent(new Event("session-lost"));
  return response;
}
export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await authFetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "操作失败");
  return data;
}
