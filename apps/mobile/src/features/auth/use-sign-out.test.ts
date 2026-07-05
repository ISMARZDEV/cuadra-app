import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

// Clerk mode → useSignOut returns a fn that calls Clerk's signOut.
const { useAuthMock, signOutMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  signOutMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("./clerk", () => ({ CLERK_ENABLED: true }));
vi.mock("@clerk/expo", () => ({ useAuth: useAuthMock }));

import { useSignOut } from "./use-sign-out";

describe("useSignOut (Clerk mode)", () => {
  test("returns a function that calls Clerk signOut", async () => {
    useAuthMock.mockReturnValue({ signOut: signOutMock });

    const signOut = renderHook(() => useSignOut()).result.current;
    await signOut();

    expect(signOutMock).toHaveBeenCalled();
  });
});
