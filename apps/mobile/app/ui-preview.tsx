import { ScrollView, Text, View } from "react-native";

import { AgentMessage } from "@/features/aispace/components/agent-message";
import { BasketCard } from "@/features/aispace/components/basket-card";
import { ProductCard } from "@/features/aispace/components/product-card";

// Banco de pruebas visual de las respuestas del agente — el equivalente móvil del `/ui-preview`
// de la web. Existe porque verificar el RENDER escribiendo en el chat exige manejar el simulador
// (tocar + teclear), y eso necesita permisos que un agente no siempre tiene. Se abre sin tocar
// nada:
//
//     xcrun simctl openurl booted cuadra://ui-preview
//     xcrun simctl ui booted appearance light|dark
//
// Los textos son CAPTURAS REALES de lo que devolvió el agente, no maquetas: si acá se ve bien,
// se ve bien en el chat. Actualizarlos cuando cambie el formato.
const BASKET = `Con RD$10,000 aquí está cómo se distribuye tu compra:

## Sirena
20 grupos · 60 artículos
Gastaste RD$9,760.92 · RD$239.08 restantes

## Nacional
20 grupos · 59 artículos
Gastaste RD$9,893.84 · RD$106.16 restantes

## Bravo
20 grupos · 56 artículos
Gastaste RD$9,943.36 · RD$56.64 restantes

Sirena te permite llevar 1 artículo más. Precios del 2 de agosto; pueden diferir en tienda.`;

const ONE_PRODUCT = `Encontré el café Santo Domingo en Sirena a **RD$472.67**. Este precio fue capturado el 2 de agosto; puede diferir en la tienda.`;

const NO_MATCH = "No encontré el arroz Rica en el catálogo.";

const BULLETS = `## Bravo
- Arroz Campos Premium 20 Lb
- Aceite Vegetal Mazola 48 Oz — el de mayor rendimiento por onza de los tres que comparé
- Leche Entera Rica 1 Lt`;

const COACH = `**Wow!!! 🫣**
Eso es mucho dinero Ismael`;

function Case({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mb-6">
      <Text className="mb-1 px-3 text-xs uppercase text-text/40">{label}</Text>
      {children}
    </View>
  );
}

export default function UiPreview() {
  return (
    <ScrollView className="flex-1 bg-bg" contentContainerStyle={{ paddingVertical: 48 }}>
      <Case label="canasta por presupuesto · accordion + carrusel">
        <BasketCard
          data={{
            budget: "RD$5,000.00",
            currency: "DOP",
            providers: [
              {
                provider_id: "sirena",
                provider_name: "Sirena",
                total: "RD$4,998.06",
                remaining: "RD$1.94",
                items_count: 32,
                groups_covered: ["Arroz", "Aceite", "Leche", "Café", "Azúcar"],
                groups_unavailable: [],
                groups_unaffordable: [],
                is_cheapest: true,
                items: [
                  {
                    index: 1,
                    canonical_product_id: "a1",
                    name: "Arroz Pimco Gourmet 10 Lbs",
                    brand: "Pimco",
                    size: "10 Lb",
                    image_url: "https://gruporamos.vteximg.com.br/arquivos/ids/165377/1-und-7464510500710.jpg",
                    url: "https://sirena.com/arroz-pimco",
                    unit_price: "RD$485.00",
                    subtotal: "RD$485.00",
                    units: 1,
                  },
                  {
                    index: 2,
                    canonical_product_id: "a2",
                    name: "Cebolla Roja Criolla",
                    brand: null,
                    size: "Unidad",
                    image_url: null,
                    url: "https://sirena.com/cebolla",
                    unit_price: "RD$47.00",
                    subtotal: "RD$47.00",
                    units: 1,
                  },
                ],
              },
              {
                provider_id: "nacional",
                provider_name: "Nacional",
                total: "RD$4,994.68",
                remaining: "RD$5.32",
                items_count: 30,
                groups_covered: ["Arroz", "Aceite", "Leche", "Café", "Azúcar"],
                groups_unavailable: [],
                groups_unaffordable: [],
                is_cheapest: false,
                items: [
                  {
                    index: 1,
                    canonical_product_id: "b1",
                    name: "Arroz Pimco Gourmet 10 Lbs",
                    brand: "Pimco",
                    size: "10 Lb",
                    image_url: null,
                    url: "https://nacional.com/arroz-pimco",
                    unit_price: "RD$490.00",
                    subtotal: "RD$490.00",
                    units: 1,
                  },
                ],
              },
            ],
          }}
        />
      </Case>
      <Case label="tarjeta de comparación · 3 tiendas">
        <AgentMessage text="Encontré el café Santo Domingo. Precios del 2 de agosto." />
        <ProductCard
          data={{
            name: "Café Molido Santo Domingo 1 Lb",
            brand: "Santo Domingo",
            image_url: null,
            captured_at: "2026-08-02",
            stores: [
              { provider: "Sirena", price: "RD$472.67", is_cheapest: true },
              { provider: "Nacional", price: "RD$478.00", is_cheapest: false },
              { provider: "Bravo", price: "RD$487.73", is_cheapest: false },
            ],
          }}
        />
      </Case>
      <Case label="tarjeta · UNA sola tienda (nada es «lo más barato»)">
        <ProductCard
          data={{
            name: "Sándwich De Pollo Del Mostrador",
            brand: "Mostrador",
            image_url: null,
            captured_at: "2026-08-02",
            stores: [{ provider: "Sirena", price: "RD$185.00", is_cheapest: false }],
          }}
        />
      </Case>
      <Case label="canasta · secciones ##">
        <AgentMessage text={BASKET} />
      </Case>
      <Case label="un producto · negrita inline">
        <AgentMessage text={ONE_PRODUCT} />
      </Case>
      <Case label="degradación honesta">
        <AgentMessage text={NO_MATCH} />
      </Case>
      <Case label="viñetas · sangría colgante">
        <AgentMessage text={BULLETS} />
      </Case>
      <Case label="titular del coach (NO debe achicarse)">
        <AgentMessage text={COACH} />
      </Case>
    </ScrollView>
  );
}
