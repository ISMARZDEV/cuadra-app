import { beforeEach, describe, expect, test, vi } from "vitest";

// use-auth imports the SDK + base client + Clerk only as side deps; mock them so the test stays pure.
vi.mock("@cuadra/api-client", () => ({ devLogin: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiClient: {} }));
vi.mock("@clerk/clerk-react", () => ({ useAuth: vi.fn(), useClerk: vi.fn() }));
// dev-login mode (sin Clerk): CLERK_ENABLED=false → syncSessionCookie ESPEJA el token en __session.
vi.mock("./clerk", () => ({ CLERK_ENABLED: false }));

import { authHeaders, registerTokenGetter, syncSessionCookie } from "./use-auth";

describe("authHeaders (async token getter)", () => {
  beforeEach(() => registerTokenGetter(() => null));

  test("no token → empty headers", async () => {
    expect(await authHeaders()).toEqual({});
  });

  test("registered async getter → Bearer, fresh per call (Clerk tokens are short-lived)", async () => {
    let n = 0;
    registerTokenGetter(async () => `t-${++n}`);
    expect(await authHeaders()).toEqual({ Authorization: "Bearer t-1" });
    expect(await authHeaders()).toEqual({ Authorization: "Bearer t-2" });
  });

  test("a sync getter also works (dev-login static token)", async () => {
    registerTokenGetter(() => "dev-jwt");
    expect(await authHeaders()).toEqual({ Authorization: "Bearer dev-jwt" });
  });
});

describe("syncSessionCookie (10.D — dev-login token reaches the SSR admin gate)", () => {
  const readSession = () =>
    document.cookie
      .split(";")
      .map((c) => c.trim())
      .find((c) => c.startsWith("__session="));

  beforeEach(() => {
    document.cookie = "__session=; path=/; Max-Age=0";
  });

  test("a token is written to the __session cookie (SSR reads it via require-admin)", () => {
    syncSessionCookie("dev-jwt-123");
    expect(readSession()).toBe("__session=dev-jwt-123");
  });

  test("null clears the cookie (logout)", () => {
    syncSessionCookie("dev-jwt-123");
    syncSessionCookie(null);
    expect(readSession()).toBeUndefined();
  });
});
