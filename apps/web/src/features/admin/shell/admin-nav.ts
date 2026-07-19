import type { LucideIcon } from "lucide-react";
import {
  CircleDollarSign,
  LineChart,
  Share2,
  Store,
  UserCog,
  Users,
} from "lucide-react";

import { ADMIN_RESOURCES } from "./admin-resource";

// Modelo de navegación del sidebar admin (Figma nodo 483:13776). Más rico que el
// `ADMIN_RESOURCES` plano de hoy: agrega secciones/grupos/leafs y un flag `status` para
// distinguir lo YA construido ("ready", enlaza a una ruta Vike real + capability) de lo
// pendiente ("wip", sin href — el componente lo debe renderizar como no-navegable / toast).
// Los `href`/`capability` de los ítems "ready" se derivan de `ADMIN_RESOURCES` (única fuente
// de verdad de rutas admin) para que nunca puedan driftear entre el nav y el resource real.
export type AdminNavStatus = "ready" | "wip";

export interface AdminNavSubItem {
  key: string;
  labelKey: string;
  status: AdminNavStatus;
  href?: string;
  capability?: string;
}

export interface AdminNavGroup {
  kind: "group";
  key: string;
  labelKey: string;
  icon: LucideIcon;
  defaultOpen: boolean;
  items: AdminNavSubItem[];
}

export interface AdminNavLeaf {
  kind: "leaf";
  key: string;
  labelKey: string;
  icon: LucideIcon;
  status: AdminNavStatus;
  href?: string;
  capability?: string;
}

export interface AdminNavSection {
  key: string;
  labelKey: string;
  entries: (AdminNavGroup | AdminNavLeaf)[];
}

function findAdminResource(key: string) {
  const resource = ADMIN_RESOURCES.find((r) => r.key === key);
  if (!resource) {
    throw new Error(`admin-nav: ADMIN_RESOURCES no tiene el resource "${key}" (drift de rutas)`);
  }
  return resource;
}

function readySubItem(key: string, labelKey: string, resourceKey: string): AdminNavSubItem {
  const resource = findAdminResource(resourceKey);
  return {
    key,
    labelKey,
    status: "ready",
    href: resource.path,
    capability: resource.capability,
  };
}

function wipSubItem(key: string, labelKey: string): AdminNavSubItem {
  return { key, labelKey, status: "wip" };
}

// Orden EXACTO del Figma (nodo 483:13776): MENÚ → Users → News → Save.
// Dashboard y Supermercado arrancan expandidos (defaultOpen: true); los demás grupos, colapsados.
export const ADMIN_NAV: AdminNavSection[] = [
  {
    key: "menu",
    labelKey: "admin.nav.section.menu",
    entries: [
      {
        kind: "group",
        key: "dashboard",
        labelKey: "admin.nav.dashboard",
        icon: LineChart,
        defaultOpen: true,
        items: [
          wipSubItem("users", "admin.nav.dashboard.users"),
          wipSubItem("news", "admin.nav.dashboard.news"),
          wipSubItem("save", "admin.nav.dashboard.save"),
        ],
      },
    ],
  },
  {
    key: "users",
    labelKey: "admin.nav.section.users",
    entries: [
      {
        kind: "group",
        key: "soporte-usuarios",
        labelKey: "admin.nav.users.support",
        icon: UserCog,
        defaultOpen: false,
        items: [],
      },
      {
        kind: "group",
        key: "gestion-usuarios",
        labelKey: "admin.nav.users.management",
        icon: Users,
        defaultOpen: false,
        items: [],
      },
    ],
  },
  {
    key: "news",
    labelKey: "admin.nav.section.news",
    entries: [
      {
        kind: "group",
        key: "publicaciones",
        labelKey: "admin.nav.news.publications",
        icon: Share2,
        defaultOpen: false,
        items: [],
      },
    ],
  },
  {
    key: "save",
    labelKey: "admin.nav.section.save",
    entries: [
      {
        kind: "group",
        key: "supermercado",
        labelKey: "admin.nav.save.supermarket",
        icon: Store,
        defaultOpen: true,
        items: [
          wipSubItem("metricas", "admin.nav.save.metrics"),
          readySubItem("review-queue", "admin.nav.save.reviewQueue", "save-matching-review"),
          readySubItem("providers", "admin.nav.save.providers", "save-providers"),
          readySubItem("sources", "admin.nav.save.sources", "save-sources"),
          readySubItem("basket", "admin.nav.save.basket", "save-basket"),
          readySubItem("orquestacion", "admin.nav.save.orchestration", "save-orchestration"),
        ],
      },
      {
        kind: "leaf",
        key: "productos-financieros",
        labelKey: "admin.nav.save.financialProducts",
        icon: CircleDollarSign,
        status: "wip",
      },
    ],
  },
];

export function isActiveHref(href: string | undefined, urlPathname: string): boolean {
  if (!href) return false;
  return urlPathname === href || urlPathname.startsWith(href + "/");
}
