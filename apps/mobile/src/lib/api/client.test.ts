import { beforeEach, describe, expect, test, vi } from "vitest";

// Mock the generated SDK client so importing client.ts (side effects: setConfig + interceptor)
// doesn't need the real SDK. We capture the interceptor fn to assert Bearer injection.
// vi.hoisted so useMock exists before the hoisted vi.mock factory runs.
const { useMock } = vi.hoisted(() => ({ useMock: vi.fn() }));
vi.mock("@cuadra/api-client", () => ({
  client: {
    setConfig: vi.fn(),
    interceptors: { request: { use: useMock } },
  },
}));

import { getApiAuthToken, registerTokenGetter, setApiAuthToken } from "./client";

describe("api client token getter", () => {
  beforeEach(() => registerTokenGetter(null));

  test("no getter registered → null", async () => {
    expect(await getApiAuthToken()).toBeNull();
  });

  test("setApiAuthToken registers a static token (dev-login path)", async () => {
    setApiAuthToken("dev-jwt");
    expect(await getApiAuthToken()).toBe("dev-jwt");
    setApiAuthToken(null);
    expect(await getApiAuthToken()).toBeNull();
  });

  test("registerTokenGetter supports an async getter that refreshes (Clerk getToken)", async () => {
    let n = 0;
    registerTokenGetter(async () => `fresh-${++n}`);
    // fresh token per call — Clerk tokens are short-lived, we never cache them ourselves
    expect(await getApiAuthToken()).toBe("fresh-1");
    expect(await getApiAuthToken()).toBe("fresh-2");
  });

  test("the request interceptor injects the Bearer from the current getter", async () => {
    const interceptor = useMock.mock.calls[0][0] as (r: { headers: Headers }) => Promise<unknown>;
    registerTokenGetter(() => "abc");
    const request = { headers: new Headers() };
    await interceptor(request);
    expect(request.headers.get("Authorization")).toBe("Bearer abc");
  });

  test("the interceptor sets no Authorization header when there is no token", async () => {
    const interceptor = useMock.mock.calls[0][0] as (r: { headers: Headers }) => Promise<unknown>;
    registerTokenGetter(null);
    const request = { headers: new Headers() };
    await interceptor(request);
    expect(request.headers.get("Authorization")).toBeNull();
  });
});
