import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

// Force Clerk mode; mock Clerk's hooks + the side deps. useAuth() should reflect Clerk's state.
const { useClerkAuthMock, signOutMock } = vi.hoisted(() => ({
  useClerkAuthMock: vi.fn(),
  signOutMock: vi.fn(),
}));
vi.mock("./clerk", () => ({ CLERK_ENABLED: true }));
vi.mock("@clerk/clerk-react", () => ({
  useAuth: useClerkAuthMock,
  useClerk: () => ({ signOut: signOutMock }),
}));
vi.mock("@cuadra/api-client", () => ({ devLogin: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiClient: {} }));

import { useAuth } from "./use-auth";

describe("useAuth (Clerk mode)", () => {
  test("isAuthed reflects Clerk isSignedIn", () => {
    useClerkAuthMock.mockReturnValue({ isSignedIn: true });
    expect(renderHook(() => useAuth()).result.current.isAuthed).toBe(true);

    useClerkAuthMock.mockReturnValue({ isSignedIn: false });
    expect(renderHook(() => useAuth()).result.current.isAuthed).toBe(false);
  });

  test("logout calls Clerk signOut", () => {
    useClerkAuthMock.mockReturnValue({ isSignedIn: true });
    renderHook(() => useAuth()).result.current.logout();
    expect(signOutMock).toHaveBeenCalled();
  });
});
