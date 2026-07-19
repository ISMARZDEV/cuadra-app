import { beforeEach, describe, expect, test, vi } from "vitest";

const getMe = vi.fn();
vi.mock("@cuadra/api-client", () => ({ getMe: (...a: unknown[]) => getMe(...a) }));
vi.mock("@/lib/api", () => ({ apiClient: {} }));

import { extractToken, hasAnyAdminCapability } from "./require-admin";

const headers = (token: string) => ({ authorization: `Bearer ${token}` });

describe("extractToken", () => {
  test("reads the __session cookie", () => {
    expect(extractToken({ cookie: "a=1; __session=jwt-x; b=2" })).toBe("jwt-x");
  });
  test("prefers the Authorization header", () => {
    expect(extractToken({ authorization: "Bearer hdr" })).toBe("hdr");
  });
  test("null when no token", () => {
    expect(extractToken({})).toBeNull();
  });
});

describe("hasAnyAdminCapability (10.D — robust parent gate)", () => {
  beforeEach(() => getMe.mockReset());

  test("true when the user has ANY admin capability", async () => {
    getMe.mockResolvedValue({
      data: { id: "u", capabilities: ["admin_save_ingestion_ops"], locale: "es", name: "x", email: null },
    });
    expect(await hasAnyAdminCapability(headers("t"))).toBe(true);
  });

  test("false when the user has NO admin capability (only unrelated caps)", async () => {
    getMe.mockResolvedValue({
      data: { id: "u", capabilities: ["some_other_cap"], locale: "es", name: "x", email: null },
    });
    expect(await hasAnyAdminCapability(headers("t"))).toBe(false);
  });

  test("false without a token", async () => {
    expect(await hasAnyAdminCapability({})).toBe(false);
    expect(getMe).not.toHaveBeenCalled();
  });
});
