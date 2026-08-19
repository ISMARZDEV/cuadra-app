"""Mide el ancho de una cadena en un .ttf sumando avances de glifo (cmap fmt 4 + hmtx).

Existe para que las constantes de maquetación que dependen del ancho de un texto se puedan
CALCULAR en vez de estimarlas a ojo en un simulador — que es como se cuela un truncado que sólo
aparece en las pantallas que uno no tiene abiertas.

Dueño actual: `WIDEST_TITLE_PT` en
`apps/mobile/src/features/save/hub/components/vertical-card.tsx`. Si cambian los títulos del hub,
el test «las líneas de título son las que están medidas» cae y hay que volver a correr esto:

    python3 scripts/measure-title-width.py \\
      apps/mobile/node_modules/@expo-google-fonts/kantumruy-pro/600SemiBold/KantumruyPro_600SemiBold.ttf \\
      30 "Insurance" "Loans &" "market"

No contempla kerning (GPOS): el resultado es el ancho SIN ajustes de par, que es lo que usa
un layout simple y queda del lado conservador (kerning casi siempre RESTA ancho).
"""

import struct
import sys


def tables(buf):
    num = struct.unpack(">H", buf[4:6])[0]
    out = {}
    for i in range(num):
        off = 12 + i * 16
        tag, _cs, toff, tlen = struct.unpack(">4sIII", buf[off : off + 16])
        out[tag.decode("latin-1")] = (toff, tlen)
    return out


def cmap_fmt4(buf, off):
    """Devuelve dict char-code -> glyph id."""
    ver, ntab = struct.unpack(">HH", buf[off : off + 4])
    best = None
    for i in range(ntab):
        p = off + 4 + i * 8
        pid, eid, soff = struct.unpack(">HHI", buf[p : p + 8])
        if (pid, eid) in ((3, 1), (0, 3), (0, 4), (3, 10), (0, 6)):
            best = off + soff
            if (pid, eid) == (3, 1):
                break
    if best is None:
        raise SystemExit("sin subtabla cmap unicode")

    fmt = struct.unpack(">H", buf[best : best + 2])[0]
    if fmt != 4:
        raise SystemExit(f"cmap formato {fmt} no soportado")

    seg2 = struct.unpack(">H", buf[best + 6 : best + 8])[0]
    seg = seg2 // 2
    base = best + 14
    end = struct.unpack(f">{seg}H", buf[base : base + seg2])
    start = struct.unpack(f">{seg}H", buf[base + seg2 + 2 : base + seg2 * 2 + 2])
    delta = struct.unpack(f">{seg}h", buf[base + seg2 * 2 + 2 : base + seg2 * 3 + 2])
    iro_off = base + seg2 * 3 + 2
    iro = struct.unpack(f">{seg}H", buf[iro_off : iro_off + seg2])

    table = {}
    for i in range(seg):
        for c in range(start[i], min(end[i], 0xFFFF) + 1):
            if iro[i] == 0:
                g = (c + delta[i]) & 0xFFFF
            else:
                gp = iro_off + i * 2 + iro[i] + (c - start[i]) * 2
                if gp + 2 > len(buf):
                    continue
                g = struct.unpack(">H", buf[gp : gp + 2])[0]
                if g:
                    g = (g + delta[i]) & 0xFFFF
            if g:
                table[c] = g
    return table


def widths(path):
    buf = open(path, "rb").read()
    tb = tables(buf)
    head = tb["head"][0]
    upem = struct.unpack(">H", buf[head + 18 : head + 20])[0]
    hhea = tb["hhea"][0]
    n_hm = struct.unpack(">H", buf[hhea + 34 : hhea + 36])[0]
    hmtx = tb["hmtx"][0]
    adv = []
    for i in range(n_hm):
        adv.append(struct.unpack(">H", buf[hmtx + i * 4 : hmtx + i * 4 + 2])[0])
    cm = cmap_fmt4(buf, tb["cmap"][0])
    return upem, adv, cm


def measure(text, upem, adv, cm, size):
    total = 0
    for ch in text:
        g = cm.get(ord(ch))
        if g is None:
            raise SystemExit(f"glifo ausente: {ch!r}")
        total += adv[g] if g < len(adv) else adv[-1]
    return total * size / upem


if __name__ == "__main__":
    font = sys.argv[1]
    size = float(sys.argv[2])
    upem, adv, cm = widths(font)
    print(f"unitsPerEm={upem}  tamaño={size}pt\n")
    for text in sys.argv[3:]:
        print(f"  {text!r:16} -> {measure(text, upem, adv, cm, size):7.2f} pt")
