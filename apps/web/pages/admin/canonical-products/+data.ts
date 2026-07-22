import { listCanonicalProducts } from "@cuadra/api-client";
import { render } from "vike/abort";
import type { PageContextServer } from "vike/types";

import { extractToken } from "@/features/admin/shell/require-admin";
import { apiClient } from "@/lib/api";

import { data as adminShellData, type AdminShellData } from "../+data";

export async function data(pageContext: PageContextServer) {
  const shell = await adminShellData(pageContext);
  const token = extractToken(pageContext.headers);
  const auth = token ? { authorization: `Bearer ${token}` } : undefined;

  const res = await listCanonicalProducts({
    client: apiClient,
    headers: auth,
    query: { limit: 50, offset: 0 },
  });

  if (res.error || !res.data) {
    throw render(500, "No se pudo cargar el listado de productos canónicos.");
  }

  return {
    list: res.data,
    ...shell,
  };
}

export type { AdminShellData };
