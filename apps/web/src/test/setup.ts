import "@testing-library/jest-dom/vitest";

// jsdom no implementa `window.matchMedia` — lo necesita `hooks/use-mobile.ts` (usado por el
// Base UI `SidebarProvider`, Batch 5/6 del admin sidebar). Sin este stub, CUALQUIER test que
// renderice un `SidebarProvider` revienta con "window.matchMedia is not a function", sin
// relación alguna con el componente bajo test.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;
}

// jsdom tampoco implementa `ResizeObserver` — lo necesita el `Slider` de radix (vía
// `@radix-ui/react-use-size`) que usa `FilterRangeSlider` dentro del modal de filtros. Sin este
// stub, cualquier test que abra el modal revienta con "ResizeObserver is not defined".
if (typeof globalThis !== "undefined" && !("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
