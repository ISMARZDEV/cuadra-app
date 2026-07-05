import { beforeEach, describe, expect, test, vi } from "vitest";

// use-auth imports the SDK + base client + Clerk only as side deps; mock them so the test stays pure.
vi.mock("@cuadra/api-client", () => ({ devLogin: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiClient: {} }));
vi.mock("@clerk/clerk-react", () => ({ useAuth: vi.fn(), useClerk: vi.fn() }));

import { authHeaders, registerTokenGetter } from "./use-auth";

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
