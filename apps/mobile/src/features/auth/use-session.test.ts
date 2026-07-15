import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

// Force Clerk mode; mock the Clerk hook. useSession maps Clerk's isLoaded/isSignedIn → our status.
const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock("./clerk", () => ({ CLERK_ENABLED: true }));
vi.mock("@clerk/expo", () => ({ useAuth: useAuthMock }));

import { useSession } from "./use-session";

describe("useSession (Clerk mode)", () => {
  beforeEach(() => useAuthMock.mockReset());

  test("loading while Clerk hasn't loaded", () => {
    useAuthMock.mockReturnValue({ isLoaded: false, isSignedIn: false });
    expect(renderHook(() => useSession()).result.current).toBe("loading");
  });

  test("authenticated when signed in", () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    expect(renderHook(() => useSession()).result.current).toBe("authenticated");
  });

  test("unauthenticated when loaded and not signed in", () => {
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: false });
    expect(renderHook(() => useSession()).result.current).toBe("unauthenticated");
  });
});
