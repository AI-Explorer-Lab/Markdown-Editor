import { test as base, expect } from "@playwright/test";
export * from "@playwright/test";
const credentials = {
  username: process.env.TEST_USERNAME || "test-writer",
  password: process.env.TEST_PASSWORD || "browser-test-only-password",
};
export const test = base.extend({
  context: async ({ context, baseURL }, use) => {
    if (
      !baseURL?.startsWith("http://127.0.0.1:") &&
      !baseURL?.startsWith("http://localhost:")
    )
      throw new Error("Regression tests require an isolated local service");
    const login = await context.request.post("/api/auth/login", {
      data: credentials,
    });
    expect(login.ok()).toBeTruthy();
    const current = await (await context.request.get("/api/themes")).json();
    await context.request.put("/api/themes", {
      data: { themes: [], baseRevision: current.revision },
    });
    await use(context);
  },
  request: async ({ request }, use) => {
    const login = await request.post("/api/auth/login", { data: credentials });
    expect(login.ok()).toBeTruthy();
    await use(request);
  },
});
