import type { MessageKey } from "@/i18n/messages";

export type OrchestrationTab = "flows" | "assets";

const TABS: { id: OrchestrationTab; label: MessageKey }[] = [
  { id: "flows", label: "admin.orchestration.tabs.flows" },
  { id: "assets", label: "admin.orchestration.tabs.assets" },
];

/**
 * §14 #10. Existe SOLO porque la tab de Assets existe: una barra con una pestaña única es decoración
 * que ocupa alto sin ofrecer una elección.
 *
 * `role="tab"` + `aria-selected` de verdad: sin eso son dos botones y un lector de pantalla no puede
 * anunciar cuál está activo.
 */
export function OrchestrationTabs({
  active,
  onChange,
  t,
}: {
  active: OrchestrationTab;
  onChange: (tab: OrchestrationTab) => void;
  t: (key: MessageKey) => string;
}) {
  return (
    <div role="tablist" className="mb-4 flex gap-2">
      {TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            data-testid={`orchestration-tab-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={`h-9 rounded-full px-4 text-sm font-semibold transition-colors ${
              selected
                ? "bg-brand-lime text-brand-forest"
                : "bg-transparent text-muted-foreground hover:bg-muted"
            }`}
          >
            {t(tab.label)}
          </button>
        );
      })}
    </div>
  );
}
