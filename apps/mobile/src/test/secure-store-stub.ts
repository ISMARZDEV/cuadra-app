// Test stub for expo-secure-store. Aliased in vitest.config so Vite never resolves the real
// package: su implementación llama al módulo NATIVO (`setValueWithKeyAsync`), que en jsdom no
// existe — el error no aparece al importar sino al ESCRIBIR, así que se manifiesta como un
// "unhandled error" en cualquier test que toque una acción que persiste. Misma razón que los
// stubs de haptics/skia/svg.
//
// NO es inerte: guarda en memoria, así un test puede escribir y volver a leer. Un stub que
// devuelve siempre null convertiría "se persistió mal" en "el test pasa igual".
const store = new Map<string, string>();

export async function getItemAsync(key: string): Promise<string | null> {
  return store.get(key) ?? null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  store.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  store.delete(key);
}

/** Sólo para tests: vacía el almacén entre casos. */
export function __resetSecureStore(): void {
  store.clear();
}
