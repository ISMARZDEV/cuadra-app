import { Fragment, useState, type ComponentType } from "react";
import { usePageContext } from "vike-react/usePageContext";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Headset, MessageSquare, PanelLeft } from "lucide-react";
import type { LucideProps } from "lucide-react";

import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, useSidebar } from "@/components/ui-base/sidebar";
import { Separator } from "@/components/ui-base/separator";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/config";
import type { MessageKey } from "@/i18n/messages";

import cuadraLogo from "./cuadra-logo.png";
import {
  ADMIN_NAV,
  isActiveHref,
  type AdminNavGroup,
  type AdminNavLeaf,
  type AdminNavSubItem,
} from "./admin-nav";
import { useAdminI18n } from "./useAdminI18n";

// Sidebar admin fiel al Figma (nodo 483:13776). Compone las primitivas Base UI aisladas
// (`components/ui-base/sidebar`) — SIN wiring en `AdminLayout` todavía (eso es Batch 6). Todo el
// texto viene de `useAdminI18n(locale)`; `admin-nav.ts` tipa `labelKey` como `string` (no puede
// importar `MessageKey` sin crear un ciclo con `i18n/messages.ts`), así que cada label se castea
// acá con `as MessageKey` (nota dejada en Batch 4).
//
// Batch 7 (polish): logo real (import Vite del PNG exportado del Figma), sub-ítems sin bullet con
// una píldora activa full-width (el indent se hace con `padding-left` de la FILA, no con un
// `ps-*`/margin del `<ul>` — así el fondo `bg-sidebar-accent` de la fila activa sigue ocupando el
// ancho completo de la columna), separadores entre secciones y un colapso a icon-only manual
// (`useSidebar().state === "collapsed"`): dado que Batch 5 decidió NO usar
// `SidebarMenuButton`/`SidebarMenuSubButton` (sus variantes no calzaban el Figma), el estado
// colapsado de la primitiva (`data-collapsible=icon`, clases `group-data-[collapsible=icon]:*`) no
// aplica a nuestras filas hand-rolled — hay que ocultar labels/sub-ítems explícitamente en JSX.
interface AdminSidebarProps {
  capabilities: string[];
  locale: Locale;
}

type Translate = (key: MessageKey) => string;

function isCapabilityVisible(capabilities: string[], capability: string | undefined): boolean {
  return !capability || capabilities.includes(capability);
}

export function AdminSidebar({ capabilities, locale }: AdminSidebarProps) {
  const { urlPathname } = usePageContext();
  const { toggleSidebar, state } = useSidebar();
  const { t } = useAdminI18n(locale);
  const collapsed = state === "collapsed";

  const notifyWip = () => {
    toast(t("admin.nav.wip" as MessageKey));
  };

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="flex flex-row items-center justify-between gap-2 px-[7px] pt-8 pb-0">
        {!collapsed ? (
          <img src={cuadraLogo} alt="Cuadra" className="h-10 w-auto shrink-0" />
        ) : (
          <span className="sr-only">Cuadra</span>
        )}
        <button
          type="button"
          aria-label="Toggle sidebar"
          onClick={toggleSidebar}
          className="flex size-[35px] shrink-0 items-center justify-center rounded-full border-[0.725px] border-sidebar-accent-border bg-sidebar-accent"
        >
          <PanelLeft className="size-3.5 text-sidebar-accent-foreground" />
        </button>
      </SidebarHeader>

      <SidebarContent className="gap-[13px] px-2 pt-[25px] pb-5">
        {ADMIN_NAV.map((section, index) => (
          <Fragment key={section.key}>
            <div className="flex flex-col gap-3">
              <div
                className={cn(
                  "px-2 text-sm font-medium text-sidebar-section-label overflow-hidden whitespace-nowrap transition-all duration-200 ease-linear",
                  collapsed ? "max-h-0 opacity-0 py-0" : "max-h-8 opacity-40",
                )}
              >
                {t(section.labelKey as MessageKey)}
              </div>
              <div className="flex flex-col gap-2">
                {section.entries.map((entry) =>
                  entry.kind === "group" ? (
                    <NavGroup
                      key={entry.key}
                      group={entry}
                      capabilities={capabilities}
                      urlPathname={urlPathname}
                      t={t}
                      onWip={notifyWip}
                      collapsed={collapsed}
                    />
                  ) : (
                    <NavLeaf
                      key={entry.key}
                      leaf={entry}
                      capabilities={capabilities}
                      t={t}
                      onWip={notifyWip}
                      collapsed={collapsed}
                    />
                  ),
                )}
              </div>
            </div>
            {index < ADMIN_NAV.length - 1 ? (
              <Separator
                className={cn(
                  "mx-auto w-[196px] bg-sidebar-border transition-all duration-200 ease-linear",
                  collapsed ? "max-h-0 opacity-0" : "max-h-4 opacity-100",
                )}
              />
            ) : null}
          </Fragment>
        ))}
      </SidebarContent>

      <SidebarFooter className="flex flex-col gap-3 px-4 pb-[21px]">
        <FooterItem
          icon={MessageSquare}
          label={t("admin.nav.footer.feedback" as MessageKey)}
          onClick={notifyWip}
          collapsed={collapsed}
        />
        <FooterItem
          icon={Headset}
          label={t("admin.nav.footer.help" as MessageKey)}
          onClick={notifyWip}
          collapsed={collapsed}
        />
      </SidebarFooter>
    </Sidebar>
  );
}

function NavGroup({
  group,
  capabilities,
  urlPathname,
  t,
  onWip,
  collapsed,
}: {
  group: AdminNavGroup;
  capabilities: string[];
  urlPathname: string;
  t: Translate;
  onWip: () => void;
  collapsed: boolean;
}) {
  const [open, setOpen] = useState(group.defaultOpen);
  const Icon = group.icon;
  const hasItems = group.items.length > 0;
  const visibleItems = group.items.filter((item) => isCapabilityVisible(capabilities, item.capability));

  const handleRowClick = () => {
    if (hasItems) {
      setOpen((prev) => !prev);
    } else {
      onWip();
    }
  };

  const Chevron = hasItems && !open ? ChevronDown : hasItems ? ChevronUp : ChevronDown;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleRowClick}
        className={cn(
          "flex min-h-5 w-full items-center gap-[4.6px] rounded-[10px] px-2 py-1 text-sm font-semibold text-sidebar-group-item outline-none",
          collapsed ? "justify-center px-0" : "justify-between",
        )}
      >
        <Icon className="size-6 shrink-0 text-[#9DCD64]" data-testid={`admin-nav-icon-${group.key}`} />
        <span
          className={cn(
            "flex items-center gap-1 overflow-hidden whitespace-nowrap transition-all duration-200 ease-linear",
            collapsed ? "max-w-0 opacity-0" : "flex-1 opacity-100",
          )}
        >
          <span className="text-left">{t(group.labelKey as MessageKey)}</span>
        </span>
        <Chevron
          className={cn(
            "size-5 shrink-0 text-[#9D9B9B] transition-all duration-200 ease-linear",
            collapsed && "opacity-0 max-w-0",
          )}
        />
      </button>
      {hasItems && visibleItems.length > 0 && (
        <ul
          className={cn(
            "flex flex-col gap-2 overflow-hidden transition-all duration-200 ease-linear",
            collapsed || !open ? "max-h-0 opacity-0" : "max-h-[500px] opacity-100",
          )}
        >
          {visibleItems.map((item) => (
            <SubItem key={item.key} item={item} urlPathname={urlPathname} t={t} onWip={onWip} collapsed={collapsed} open={open} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SubItem({
  item,
  urlPathname,
  t,
  onWip,
  collapsed,
  open,
}: {
  item: AdminNavSubItem;
  urlPathname: string;
  t: Translate;
  onWip: () => void;
  collapsed: boolean;
  open: boolean;
}) {
  const active = isActiveHref(item.href, urlPathname);
  const label = t(item.labelKey as MessageKey);
  // El contenedor ocupa todo el ancho (área clickeable amplia), pero la píldora activa/hover
  // es `w-fit` al texto — el background/border se aplica al <span> interno, no a la fila completa.
  // El indent del texto se logra con `pl-[29px]` en el contenedor.
  const containerClass = cn(
    "flex h-[30px] w-full items-center pl-[20px] pr-2 text-[13px] text-sidebar-foreground",
  );
  const pillClass = cn(
    "flex-1 rounded-[10px] px-2 py-1 text-left transition-all duration-200 ease-linear",
    "hover:bg-sidebar-accent/50",
    active && "bg-sidebar-accent border-[0.725px] border-sidebar-accent-border font-bold hover:bg-sidebar-accent",
    (collapsed || !open) && "opacity-0",
  );

  if (item.status === "ready" && item.href) {
    return (
      <li>
        <a href={item.href} className={containerClass}>
          <span className={pillClass}>{label}</span>
        </a>
      </li>
    );
  }

  return (
    <li>
      <button type="button" onClick={onWip} className={containerClass}>
        <span className={pillClass}>{label}</span>
      </button>
    </li>
  );
}

function NavLeaf({
  leaf,
  capabilities,
  t,
  onWip,
  collapsed,
}: {
  leaf: AdminNavLeaf;
  capabilities: string[];
  t: Translate;
  onWip: () => void;
  collapsed: boolean;
}) {
  if (!isCapabilityVisible(capabilities, leaf.capability)) {
    return null;
  }

  const Icon = leaf.icon;
  const label = t(leaf.labelKey as MessageKey);
  const className = cn(
    "flex min-h-6 items-center gap-[4.6px] rounded-[10px] px-2 py-1 text-sm font-medium text-sidebar-group-item outline-none",
    collapsed && "justify-center px-0",
  );

  if (leaf.status === "ready" && leaf.href) {
    return (
      <a href={leaf.href} className={className}>
        <Icon className="size-6 shrink-0 text-[#9DCD64]" data-testid={`admin-nav-icon-${leaf.key}`} />
        <span
          className={cn(
            "overflow-hidden whitespace-nowrap transition-all duration-200 ease-linear",
            collapsed ? "max-w-0 opacity-0" : "opacity-100",
          )}
        >
          {label}
        </span>
      </a>
    );
  }

  return (
    <button type="button" onClick={onWip} className={className}>
      <Icon className="size-6 shrink-0 text-[#9DCD64]" data-testid={`admin-nav-icon-${leaf.key}`} />
      <span
        className={cn(
          "overflow-hidden whitespace-nowrap transition-all duration-200 ease-linear",
          collapsed ? "max-w-0 opacity-0" : "opacity-100",
        )}
      >
        {label}
      </span>
    </button>
  );
}

function FooterItem({
  icon: Icon,
  label,
  onClick,
  collapsed,
}: {
  icon: ComponentType<LucideProps>;
  label: string;
  onClick: () => void;
  collapsed: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 text-[15px] font-medium text-sidebar-muted outline-none",
        collapsed && "justify-center",
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      <span
        className={cn(
          "overflow-hidden whitespace-nowrap transition-all duration-200 ease-linear",
          collapsed ? "max-w-0 opacity-0" : "opacity-100",
        )}
      >
        {label}
      </span>
    </button>
  );
}
