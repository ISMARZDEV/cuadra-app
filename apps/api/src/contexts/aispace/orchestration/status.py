"""Qué está HACIENDO el agente mientras el usuario espera — la señal detrás de la línea que brilla.

El chat sólo podía decir «Pensando», porque el protocolo no tenía con qué decir otra cosa. Una tool
que tarda cuatro segundos consultando el catálogo se veía exactamente igual que el modelo
escribiendo: el usuario no sabía si lo estaban buscando, calculando, o si nada estaba pasando.

**Por qué el mapa vive acá y no en `sse.py`.** El transporte promete en su docstring no saber de
dominio, y lo cumple: `ui_actions` viaja verbatim justamente para que ninguna feature tenga que
tocarlo. Ese principio se mantiene — `sse.py` pregunta el estado, no lo decide.

**Por qué un mapa central NO es aquí el antipatrón que `ui_action_frames` evita.** Allá un `type`
desconocido ROMPÍA el switch del cliente, así que el despacho por tipo era obligatorio y tenía que
ser genérico. Acá lo peor que le pasa a una tool sin entrada es mostrar `thinking`: el estado
genérico, y verdadero. El mapa es ENRIQUECIMIENTO OPCIONAL, no despacho — una tool nueva funciona
sin tocar este archivo, sólo se ve menos específica. Ese es el trade-off, y es deliberado.

El estado es una decisión de PRODUCTO (qué palabra ve el usuario), no una propiedad técnica de la
tool, y por eso se decide en un solo lugar legible en vez de repartirse por cada `@tool`.
"""
from __future__ import annotations

# Los valores viajan por el cable y son los del `ChatStatus` del cliente (apps/mobile).
THINKING = "thinking"
SEARCHING = "searching"
# Valor VÁLIDO del protocolo que hoy ninguna tool emite, y a propósito: el cliente pinta
# «Razonando…» y «Pensando…» como la MISMA espera con dos palabras, así que distinguirlos acá sería
# una distinción que no discrimina nada — y las que no discriminan terminan interpretándose mal.
# Se conserva para que los dos lados del cable acepten el mismo juego de valores.
REASONING = "reasoning"

# El eje NO es «busca» vs «computa» — ese fue el primer intento y estaba mal. El eje es **qué le
# toca ver al usuario mientras espera**, y hay exactamente dos respuestas:
#
#   SEARCHING → hay una tool corriendo: trabajo real, con fases. El cliente camina
#               «Buscando… → Validando… → Analizando…», que es una promesa de AVANCE.
#   THINKING  → no hay tool: el modelo está decidiendo qué hacer. El cliente alterna
#               «Pensando…/Razonando…», que es un latido de «sigo acá», sin prometer avance.
#
# Por qué toda tool de datos se gana la progresión, incluso las rápidas: **la secuencia se
# autolimita por duración**. El indicador desaparece con el primer token y cada paso dura ~1.4s, así
# que una tool de 400ms sólo llega a mostrar «Buscando…» y una de 5s recorre el camino entero.
# Nunca se ve un paso que la espera no pagó — así que asignarla de más no cuesta nada, y el único
# lugar donde RINDE son justamente las tools lentas.
#
# El caso que decidió esto es `basket_for_budget` (la pregunta insignia, y la que más tarda):
# `BudgetBasket.execute` hace literalmente tres cosas en este orden — `list_basket_offers` BUSCA en
# el catálogo qué producto de cada proveedor cubre cada rubro; `plan_basket` VALIDA qué entra en el
# presupuesto; el orden por cobertura + `is_cheapest` ANALIZA y compara entre tiendas. Las tres
# palabras no son decoración ahí: son la descripción del trabajo.
_TOOL_STATUS: dict[str, str] = {
    # Groceries — catálogo
    "search_groceries": SEARCHING,
    "compare_prices": SEARCHING,
    "explore_alternatives": SEARCHING,
    "cheapest_store_by_category": SEARCHING,
    # Groceries — canasta y evaluaciones (las más lentas; donde la progresión más se nota)
    "basket_for_budget": SEARCHING,
    "monthly_cost": SEARCHING,
    "worth_second_store": SEARCHING,
    # Finance — leen los números del propio usuario
    "get_monthly_summary": SEARCHING,
    "get_safe_to_spend": SEARCHING,
    # `register_transaction` NO está mapeada a propósito: es una tool de STAGING (prepara una
    # escritura que el usuario todavía tiene que confirmar en el dock). No busca nada, así que
    # anunciar «Buscando» sería mentir; `thinking` —el fallback— es exactamente lo correcto.
}

# Hoy TODAS las tools de datos resuelven a `SEARCHING`, así que el mapa parece un set. Se mantiene
# como dict a propósito: es la forma correcta para «qué palabras se ve cada tool», y el día que una
# merezca un trato distinto es UNA línea, no un refactor.


def status_for_tool(name: str) -> str:
    """El estado que se le muestra al usuario mientras corre `name`. Nunca falla: default `thinking`."""
    return _TOOL_STATUS.get(name, THINKING)
