import { Bookmark, Eye, ImageOff } from "lucide-react";

import { ProductPhoto } from "@/features/admin/components/ProductPhoto";
import { formatMoney } from "@/features/save/lib/format";
import type { MessageKey } from "@/i18n/messages";

import type { PriceDrop } from "../lib/price-drop";

/**
 * Vista previa de cómo se ve este producto en la app pública.
 *
 * Implementación pixel-perfect contra Figma nodo 708:25970.
 * Usa SVG path exacto para la forma de la card (curva cóncava en el bottom).
 */
export function ProductPreviewCard({
  name,
  displaySize,
  currency,
  priceMinor,
  previousPriceMinor,
  drop,
  imageUrl,
  imageCount,
  matchedProviderCount,
  publicHref,
  t,
}: {
  name: string;
  displaySize: string | null | undefined;
  currency: string;
  priceMinor: number | null | undefined;
  previousPriceMinor: number | null | undefined;
  drop: PriceDrop | null;
  imageUrl: string | null | undefined;
  imageCount: number;
  matchedProviderCount: number;
  publicHref: string | null;
  t: (key: MessageKey) => string;
}) {
  return (
    <div className="relative w-[240px] shrink-0">
      {/* SVG shell de fondo — escalado para matchear el contenido más grande */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 143.74 250.52"
        preserveAspectRatio="none"
      >
        <path
          d="M16.9141 1H126.829C135.616 1.00008 142.739 8.12295 142.739 16.9102V225.183C142.739 232.573 137.654 238.975 130.489 240.669L130.146 240.746L105.791 245.942C83.4285 250.713 60.3157 250.713 37.9531 245.942L13.5928 240.746C6.24807 239.182 1 232.694 1 225.183V16.9111C1.00364 8.26057 7.90631 1.22262 16.5039 1.00488L16.9141 1Z"
          fill="white"
          stroke="#F4F4F4"
          strokeWidth="2"
        />
      </svg>

      {/* Badge de descuento flotante */}
      {drop?.significant ? (
        <div
          data-testid="preview-price-drop"
          className="absolute -top-5 left-1/2 z-20 -translate-x-1/2"
        >
          <div
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F5243C] shadow-[0_1px_0_0_rgba(237,44,44,0.25)]"
          >
            <span className="text-[13px] font-semibold text-white">-{drop.percent}%</span>
          </div>
        </div>
      ) : null}

      {/* Contenido — escalado ~1.67x excepto la imagen */}
      <div className="relative z-10 flex h-full flex-col items-center px-[11px] pt-[15px] pb-3">
        {/* Header: número + bookmark */}
        <div className="mb-[6px] flex w-full items-center justify-between">
          <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[#CEFFFB]">
            <span className="text-[26px] font-semibold leading-none text-[#3BA198]">
              {matchedProviderCount}
            </span>
          </div>
          <Bookmark
            className="h-[36px] w-[36px]"
            strokeWidth={2}
            stroke="#93D555"
            fill="none"
            aria-hidden
          />
        </div>

        {/* Imagen — contenedor cuadrado sin radius, con padding interno */}
        <div className="mb-[5px] flex flex-1 items-center justify-center">
          <div className="flex h-[180px] w-[180px] items-center justify-center bg-white px-2 py-2">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt=""
                loading="lazy"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <ImageOff className="h-24 w-24 text-gray-300" aria-hidden />
            )}
          </div>
        </div>

        {/* Nombre del producto */}
        <p className="px-2 text-center text-[16px] font-medium leading-[1.09em] text-[#034842]">
          {name}
        </p>

        {/* Moneda + tamaño */}
        <div className="mt-[6px] flex items-center gap-[8px]">
          <span className="text-[13px] font-semibold text-[#A6D56E]">DOP</span>
          <div className="h-[5px] w-[5px] rounded-full bg-[#B7F0F8]" />
          <span className="text-[13px] font-medium text-[#898989]">{displaySize}</span>
        </div>

        {/* Precio anterior (tachado) */}
        {previousPriceMinor ? (
          <div className="mt-[6px] flex flex-col items-center">
            <div className="relative flex items-baseline justify-center">
              <span className="text-[22px] font-semibold text-[#480303]">
                {typeof previousPriceMinor === "number"
                  ? formatMoney(previousPriceMinor, currency).replace(/^RD\$?/, "$").replace(/\.(\d{2})$/, ".")
                  : "—"}
              </span>
              <sup className="text-[11px] font-semibold leading-none text-[#480303]">
                {typeof previousPriceMinor === "number"
                  ? formatMoney(previousPriceMinor, currency).split(".").pop()
                  : ""}
              </sup>
              {/* Línea roja de tachado */}
              <div className="absolute left-0 right-0 top-1/2 h-[2px] bg-[#FF9797]" />
            </div>
            <span className="mt-[2px] text-[11px] font-bold text-[#7E7C7C]">X UND</span>
          </div>
        ) : null}

        {/* Precio actual */}
        <div className="mt-[4px] flex flex-col items-center">
          <div className="flex items-baseline justify-center">
            <span className="text-[30px] font-semibold leading-none text-[#034842]">
              {typeof priceMinor === "number"
                ? formatMoney(priceMinor, currency).replace(/^RD\$?/, "$").replace(/\.(\d{2})$/, ".")
                : "—"}
            </span>
            <sup className="text-[20px] font-semibold leading-none text-[#034842]">
              {typeof priceMinor === "number"
                ? formatMoney(priceMinor, currency).split(".").pop()
                : ""}
            </sup>
          </div>
          <div className="mt-[3px] flex items-center gap-[4px]">
            <span className="text-[14px] font-medium text-[#A6D46F]">X</span>
            <span className="text-[14px] font-bold text-[#00A7BE]">UND</span>
          </div>
        </div>

        {/* Botón ojo — empujado al fondo con mt-auto */}
        <a
          href={publicHref ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          aria-disabled={!publicHref}
          className={`relative mt-auto block h-[64px] w-[216px] transition-opacity hover:opacity-85 ${
            publicHref ? "" : "pointer-events-none opacity-50"
          }`}
        >
          <svg
            className="absolute inset-0 h-full w-full"
            viewBox="0 0 130 38"
            preserveAspectRatio="none"
          >
            <path
              d="M121.59 30.6347L95.8636 35.257C75.5148 38.9143 54.4813 38.9143 34.1325 35.257L8.40644 30.6347C3.50494 29.7546 0 26.1037 0 21.8791V6.37598C0 2.8555 3.38888 0 7.56696 0L31.115 3.73561C53.5064 7.28543 76.4897 7.28543 98.885 3.73561L122.433 0C126.611 0 130 2.8555 130 6.37598V21.8791C130 26.1037 126.495 29.7513 121.594 30.6347H121.59Z"
              fill="#BBEB71"
            />
          </svg>
          <Eye className="absolute left-1/2 top-[55%] h-10 w-10 -translate-x-1/2 -translate-y-1/2 text-[#0B6A53]" aria-hidden />
        </a>
      </div>
    </div>
  );
}
