import { HreflangTags } from "./hreflang";
import { ThemeScript } from "./theme-script";

// Head global (via +config): script de tema (no-flash) + hreflang (SEO multilingüe). Se compone
// con el +Head de cada página (OG/JSON-LD del producto).
export function GlobalHead() {
  return (
    <>
      <ThemeScript />
      <HreflangTags />
    </>
  );
}
