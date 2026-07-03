import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const getMetrics = vi.fn().mockResolvedValue({ data: { by_currency: [] } });
const getDailyTarget = vi.fn().mockResolvedValue({ data: { by_currency: [] } });
const listAccounts = vi.fn().mockResolvedValue({ data: [] });
const listTransactions = vi.fn().mockResolvedValue({ data: [] });
const listSpaces = vi.fn().mockResolvedValue({ data: [] });

vi.mock("@cuadra/api-client", () => ({
  getMetrics: (...args: unknown[]) => getMetrics(...args),
  getDailyTarget: (...args: unknown[]) => getDailyTarget(...args),
  listAccounts: (...args: unknown[]) => listAccounts(...args),
  listTransactions: (...args: unknown[]) => listTransactions(...args),
  listSpaces: (...args: unknown[]) => listSpaces(...args),
}));

import { currentMonthRange } from "./date-range";
import { pickByCurrency, useAccounts, useDailyTarget, useMetrics, useSpaces, useTransactions } from "./api";

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("insights api hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  test("useMetrics calls getMetrics with the current-month range by default", async () => {
    const { result } = renderHook(() => useMetrics(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getMetrics).toHaveBeenCalledWith({ query: currentMonthRange() });
  });

  test("useDailyTarget calls getDailyTarget with no args", async () => {
    const { result } = renderHook(() => useDailyTarget(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getDailyTarget).toHaveBeenCalledWith();
  });

  test("useAccounts calls listAccounts with no args", async () => {
    const { result } = renderHook(() => useAccounts(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(listAccounts).toHaveBeenCalledWith();
  });

  test("useTransactions defaults to limit=5", async () => {
    const { result } = renderHook(() => useTransactions(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(listTransactions).toHaveBeenCalledWith({ query: { limit: 5 } });
  });

  test("useSpaces calls listSpaces with no args", async () => {
    const { result } = renderHook(() => useSpaces(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(listSpaces).toHaveBeenCalledWith();
  });
});

describe("pickByCurrency", () => {
  const items = [
    { currency: "DOP", value: 1 },
    { currency: "USD", value: 2 },
  ];

  test("returns the matching item for the given currency", () => {
    expect(pickByCurrency(items, "USD")).toEqual({ currency: "USD", value: 2 });
  });

  test("returns undefined when the currency has no entry", () => {
    expect(pickByCurrency(items, "EUR")).toBeUndefined();
  });

  test("returns undefined when items or currency are missing", () => {
    expect(pickByCurrency(undefined, "USD")).toBeUndefined();
    expect(pickByCurrency(items, undefined)).toBeUndefined();
  });
});
