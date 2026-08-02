"""Mapa `subfamiliaArticulo → sección` de Bravo. GENERADO — no editar a mano.

Lo produce `seeds/build_bravo_section_map.py` navegando el catálogo completo. Existe porque
el camino de CANASTA (`/public/articulo/search`) devuelve la subfamilia pero NO la sección, y
sin sección Bravo no aporta señal de ORIGEN al clasificador. Bravo no publica catálogo de
familias (`/public/familia/list` → HTTP 500), así que el mapa se DERIVA de los datos.

Una subfamilia entra sólo si aparece en UNA sola sección, o si una se lleva
≥70% con ≥5 muestras (ahí va anotado el reparto). Lo demás NO se mapea:
el producto cae al nombre/vector/juez, que es la regla sagrada — ante duda, no inventar.

Las secciones TRANSVERSALES (Alimentación general, OFERTAS, promociones…) se excluyen del
conteo: un producto vive en la suya Y en ésas, y contarlas ensucia el voto.
"""
from __future__ import annotations

SUBFAMILY_SECTIONS: dict[str, str] = {
    'AP-005': 'Congelados',  # 5/7 (compite: Salsa y aderezos 2)
    'AP-006': 'Panes y galletas',  # n=2
    'AP-009': 'Panes y galletas',  # n=2
    'AR-002': 'Comida mascotas',  # n=19
    'AR-003': 'Higiene caninos',  # 93/121 (compite: Higiene felinos 15, Salud y bienestar 8, Hogar y limpieza 4, Accesorios caninos 1)
    'AR-004': 'Accesorios caninos',  # 413/445 (compite: Higiene caninos 14, Accesorios felinos y otros 10, Higiene felinos 5, Hogar y limpieza 1, Salud y bienestar 1, Treats caninos 1)
    'AR-007': 'Acuario',  # n=71
    'AR-008': 'Accesorios felinos y otros',  # 29/34 (compite: Salud y bienestar 3, Alimentos otras mascotas 2)
    'AR-009': 'Accesorios felinos y otros',  # 95/99 (compite: Accesorios caninos 3, Higiene felinos 1)
    'AR-010': 'Accesorios felinos y otros',  # 29/32 (compite: Salud y bienestar 1, Accesorios caninos 1, Comida mascotas 1)
    'AR-011': 'Alimentos otras mascotas',  # 9/10 (compite: Comida mascotas 1)
    'AR-012': 'Salud y bienestar',  # 77/103 (compite: Higiene caninos 14, Higiene felinos 10, Alimentos otras mascotas 2)
    'AR-013': 'Alimentos otras mascotas',  # 20/22 (compite: Comida mascotas 2)
    'AR-014': 'Alimentos otras mascotas',  # n=2
    'AR-015': 'Alimentos felinos',  # 30/32 (compite: Comida mascotas 2)
    'AR-017': 'Treats caninos',  # 94/107 (compite: Accesorios caninos 11, Alimentos felinos 1, Acuario 1)
    'AR-019': 'Higiene felinos',  # n=10
    'AR-021': 'Accesorios felinos y otros',  # n=1
    'AR-022': 'Comida mascotas',  # 9/11 (compite: Alimentos otras mascotas 1, Alimentos felinos 1)
    'AR-023': 'Alimentos felinos',  # 9/10 (compite: Comida mascotas 1)
    'BO-008': 'Agua y refrescos',  # n=2
    'BO-011': 'Salsa y aderezos',  # n=2
    'CA-018': 'Dulces y caramelos',  # n=1
    'CO-001': 'Congelados',  # 15/18 (compite: Frutas y vegetales 3)
    'CO-002': 'Panes y galletas',  # n=3
    'CO-003': 'Congelados',  # n=16
    'CO-006': 'Congelados',  # 35/40 (compite: Picaderas, Snacks, Chips 5)
    'CO-007': 'Congelados',  # n=27
    'CO-011': 'Congelados',  # n=3
    'CO-012': 'Congelados',  # 9/12 (compite: Pasta 3)
    'CO-013': 'Congelados',  # n=2
    'CO-014': 'Embutidos',  # n=7
    'CO-017': 'Congelados',  # 7/8 (compite: Frutas y vegetales 1)
    'CO-018': 'Congelados',  # n=2
    'CR-001': 'Carnes',  # n=36
    'CR-002': 'Carnes',  # n=16
    'CR-005': 'Carnes',  # n=10
    'DR-002': 'Salud y bienestar',  # n=1
    'DR-012': 'Accesorios caninos',  # n=1
    'EM-001': 'Embutidos',  # n=16
    'EM-002': 'Embutidos',  # n=10
    'EM-006': 'Embutidos',  # n=2
    'EM-007': 'Embutidos',  # n=15
    'EM-008': 'Embutidos',  # n=21
    'EM-009': 'Embutidos',  # n=9
    'EM-010': 'Embutidos',  # 23/24 (compite: Congelados 1)
    'EM-011': 'Embutidos',  # n=15
    'EM-013': 'Embutidos',  # n=5
    'EM-014': 'Embutidos',  # n=3
    'EM-018': 'Embutidos',  # 5/6 (compite: Carnes 1)
    'EM-019': 'Embutidos',  # n=9
    'EM-020': 'Embutidos',  # n=1
    'FE-003': 'Hogar y limpieza',  # n=28
    'FE-006': 'Hogar y limpieza',  # n=7
    'FE-007': 'Hogar y limpieza',  # n=2
    'FE-010': 'Hogar y limpieza',  # n=6
    'FE-018': 'Hogar y limpieza',  # n=3
    'FV-001': 'Frutas y vegetales',  # 22/23 (compite: Víveres 1)
    'FV-002': 'Frutas y vegetales',  # 29/30 (compite: Agua y refrescos 1)
    'FV-004': 'Víveres',  # 22/28 (compite: Frutas y vegetales 6)
    'FV-005': 'Frutas y vegetales',  # 101/103 (compite: Granos 2)
    'FV-006': 'Frutas y vegetales',  # n=2
    'FV-007': 'Frutas y vegetales',  # n=18
    'FV-010': 'Frutas y vegetales',  # n=6
    'FV-014': 'Frutas y vegetales',  # n=25
    'FV-016': 'Frutas y vegetales',  # 8/11 (compite: Víveres 3)
    'FV-017': 'Jugos',  # n=2
    'FV-019': 'Jugos',  # 20/22 (compite: Frutas y vegetales 2)
    'FV-021': 'Frutas y vegetales',  # n=12
    'FV-025': 'Frutas y vegetales',  # 15/17 (compite: Víveres 2)
    'FV-027': 'Frutas y vegetales',  # 38/50 (compite: Víveres 12)
    'FV-028': 'Agua y refrescos',  # n=3
    'GR-001': 'Granos',  # n=14
    'GR-003': 'Granos',  # n=2
    'GR-005': 'Granos',  # 20/21 (compite: Cereales 1)
    'GR-008': 'Granos',  # n=19
    'GR-010': 'Granos',  # n=8
    'GR-011': 'Picaderas, Snacks, Chips',  # n=5
    'GR-013': 'Picaderas, Snacks, Chips',  # 89/92 (compite: Granos 2, Especias 1)
    'GR-014': 'Picaderas, Snacks, Chips',  # n=6
    'HS-002': 'Higiene y salud',  # 42/58 (compite: Bebés 16)
    'HS-003': 'Higiene y salud',  # n=5
    'HS-005': 'Higiene y salud',  # n=4
    'HS-007': 'Higiene y salud',  # n=11
    'HS-008': 'Higiene y salud',  # n=18
    'HS-009': 'Higiene y salud',  # n=39
    'HS-011': 'Higiene y salud',  # n=20
    'HS-013': 'Higiene y salud',  # n=13
    'HS-014': 'Higiene y salud',  # n=24
    'HS-015': 'Higiene y salud',  # n=2
    'HS-019': 'Higiene y salud',  # 54/55 (compite: Hogar y limpieza 1)
    'HS-021': 'Higiene y salud',  # n=40
    'HS-022': 'Higiene y salud',  # n=29
    'HS-023': 'Higiene y salud',  # n=1
    'HS-025': 'Higiene y salud',  # 28/29 (compite: Bebés 1)
    'HS-026': 'Higiene y salud',  # n=1
    'HS-027': 'Higiene y salud',  # n=1
    'HS-028': 'Higiene y salud',  # n=28
    'HS-030': 'Higiene y salud',  # n=30
    'HS-032': 'Higiene y salud',  # n=35
    'HS-037': 'Higiene y salud',  # n=19
    'HS-038': 'Higiene y salud',  # n=33
    'HS-039': 'Higiene y salud',  # n=4
    'HS-040': 'Higiene y salud',  # n=19
    'HS-041': 'Higiene y salud',  # n=38
    'HS-042': 'Higiene y salud',  # n=5
    'HS-043': 'Higiene y salud',  # n=2
    'HS-045': 'Higiene y salud',  # n=67
    'HS-046': 'Higiene y salud',  # n=8
    'HS-047': 'Higiene y salud',  # n=9
    'HS-050': 'Higiene y salud',  # n=6
    'HS-052': 'Higiene y salud',  # n=6
    'HS-054': 'Higiene y salud',  # n=2
    'HS-055': 'Bebés',  # 13/17 (compite: Hogar y limpieza 2, Higiene y salud 2)
    'LA-001': 'Lácteos',  # n=3
    'LA-003': 'Lácteos',  # n=12
    'LA-004': 'Lácteos',  # n=5
    'LA-006': 'Lácteos',  # 10/14 (compite: Dulces y caramelos 4)
    'LA-007': 'Lácteos',  # n=22
    'LA-008': 'Lácteos',  # n=23
    'LA-009': 'Lácteos',  # 27/37 (compite: Salsa y aderezos 7, Congelados 3)
    'LA-011': 'Lácteos',  # n=46
    'LA-013': 'Lácteos',  # n=9
    'LA-014': 'Lácteos',  # n=2
    'LA-015': 'Lácteos',  # n=5
    'LA-016': 'Lácteos',  # n=18
    'LA-017': 'Lácteos',  # n=11
    'LA-020': 'Lácteos',  # n=41
    'LA-021': 'Lácteos',  # 122/123 (compite: Dulces y caramelos 1)
    'LA-025': 'Lácteos',  # n=1
    'MA-003': 'Comida mascotas',  # n=13
    'MA-005': 'Comida mascotas',  # n=34
    'MG-003': 'Bebés',  # n=16
    'MG-005': 'Hogar y limpieza',  # n=50
    'MG-007': 'Hogar y limpieza',  # 63/64 (compite: Bebés 1)
    'MG-008': 'Hogar y limpieza',  # n=17
    'MG-009': 'Hogar y limpieza',  # 22/23 (compite: Desechables 1)
    'MG-010': 'Hogar y limpieza',  # n=14
    'MG-011': 'Hogar y limpieza',  # n=28
    'MG-012': 'Hogar y limpieza',  # n=6
    'MG-014': 'Hogar y limpieza',  # n=1
    'MG-020': 'Hogar y limpieza',  # n=6
    'MG-021': 'Hogar y limpieza',  # n=2
    'MG-028': 'Hogar y limpieza',  # n=9
    'MG-029': 'Hogar y limpieza',  # n=5
    'MG-031': 'Hogar y limpieza',  # n=17
    'MG-034': 'Hogar y limpieza',  # n=19
    'MG-035': 'Hogar y limpieza',  # 8/11 (compite: Higiene y salud 3)
    'MG-038': 'Hogar y limpieza',  # n=8
    'MG-039': 'Hogar y limpieza',  # n=30
    'MG-040': 'Hogar y limpieza',  # n=1
    'MG-045': 'Hogar y limpieza',  # n=5
    'MG-046': 'Hogar y limpieza',  # n=28
    'OC-004': 'Carnes',  # n=44
    'OC-006': 'Pollo y aves',  # 32/34 (compite: Carnes 2)
    'OC-007': 'Pollo y aves',  # n=1
    'OC-008': 'Carnes',  # n=10
    'OC-009': 'Pollo y aves',  # n=1
    'OC-011': 'Pollo y aves',  # n=4
    'OC-012': 'Pollo y aves',  # n=2
    'OC-013': 'Pollo y aves',  # n=2
    'OC-024': 'Carnes',  # 6/7 (compite: Congelados 1)
    'PA-001': 'Panes y galletas',  # n=34
    'PA-002': 'Panes y galletas',  # n=10
    'PA-010': 'Panes y galletas',  # n=45
    'PA-012': 'Panes y galletas',  # n=17
    'PC-001': 'Aceites y vinagres',  # n=29
    'PC-002': 'Aceites y vinagres',  # n=11
    'PC-003': 'Aceites y vinagres',  # n=11
    'PC-004': 'Aceitunas y encurtidos',  # 67/72 (compite: Picaderas, Snacks, Chips 4, Aceites y vinagres 1)
    'PC-005': 'Salsa y aderezos',  # n=17
    'PC-006': 'Agua y refrescos',  # 23/25 (compite: Bebés 2)
    'PC-007': 'Granos',  # n=2
    'PC-011': 'Panes y galletas',  # 13/16 (compite: Picaderas, Snacks, Chips 3)
    'PC-012': 'Cereales',  # n=22
    'PC-013': 'Cereales',  # n=51
    'PC-014': 'Bebés',  # 24/27 (compite: Panes y galletas 2, Cereales 1)
    'PC-016': 'Bebés',  # n=16
    'PC-018': 'Lácteos',  # n=2
    'PC-020': 'Dulces y caramelos',  # n=32
    'PC-021': 'Dulces y caramelos',  # n=30
    'PC-022': 'Dulces y caramelos',  # n=68
    'PC-023': 'Especias',  # 69/70 (compite: Granos 1)
    'PC-024': 'Especias',  # 70/71 (compite: Frutas y vegetales 1)
    'PC-025': 'Bebés',  # 24/25 (compite: Lácteos 1)
    'PC-026': 'Enlatados',  # 15/20 (compite: Dulces y caramelos 4, Frutas y vegetales 1)
    'PC-027': 'Panes y galletas',  # n=48
    'PC-028': 'Panes y galletas',  # 77/79 (compite: Dulces y caramelos 2)
    'PC-029': 'Panes y galletas',  # 37/38 (compite: Picaderas, Snacks, Chips 1)
    'PC-031': 'Enlatados',  # n=38
    'PC-033': 'Cereales',  # n=3
    'PC-034': 'Enlatados',  # 9/10 (compite: Cereales 1)
    'PC-035': 'Jugos',  # 41/48 (compite: Agua y refrescos 7)
    'PC-036': 'Jugos',  # 22/24 (compite: Cereales 2)
    'PC-038': 'Jugos',  # n=53
    'PC-039': 'Salsa y aderezos',  # n=11
    'PC-040': 'Lácteos',  # 6/8 (compite: Bebés 2)
    'PC-041': 'Lácteos',  # n=8
    'PC-042': 'Lácteos',  # n=18
    'PC-043': 'Agua y refrescos',  # n=6
    'PC-045': 'Salsa y aderezos',  # n=16
    'PC-046': 'Dulces y caramelos',  # n=9
    'PC-048': 'Salsa y aderezos',  # n=6
    'PC-052': 'Salsa y aderezos',  # n=6
    'PC-054': 'Pasta',  # 62/63 (compite: Cereales 1)
    'PC-055': 'Picaderas, Snacks, Chips',  # 117/123 (compite: Comida mexicana 5, Panes y galletas 1)
    'PC-057': 'Picaderas, Snacks, Chips',  # n=3
    'PC-062': 'Lácteos',  # n=5
    'PC-064': 'Lácteos',  # 26/28 (compite: Bebés 2)
    'PC-065': 'Agua y refrescos',  # n=60
    'PC-066': 'Granos',  # 16/18 (compite: Especias 2)
    'PC-067': 'Enlatados',  # n=7
    'PC-068': 'Salsa y aderezos',  # n=27
    'PC-069': 'Salsa y aderezos',  # 43/46 (compite: Enlatados 2, Pasta 1)
    'PC-070': 'Salsa y aderezos',  # 4/5 (compite: Comida mexicana 1)
    'PC-071': 'Enlatados',  # n=22
    'PC-072': 'Especias',  # n=6
    'PC-075': 'Enlatados',  # n=2
    'PC-077': 'Especias',  # n=1
    'PC-079': 'Enlatados',  # n=17
    'PC-082': 'Aceites y vinagres',  # 21/23 (compite: Salsa y aderezos 2)
    'PC-085': 'Dulces y caramelos',  # n=1
    'PC-087': 'Lácteos',  # n=3
    'PC-088': 'Lácteos',  # n=12
    'PC-090': 'Cereales',  # n=1
    'PC-092': 'Dulces y caramelos',  # n=1
    'PC-106': 'Pasta',  # n=9
    'PC-107': 'Panes y galletas',  # n=1
    'PC-108': 'Lácteos',  # n=2
    'PC-109': 'Aceites y vinagres',  # n=1
    'PC-110': 'Pasta',  # n=1
    'PC-112': 'Agua y refrescos',  # n=24
    'PC-120': 'Lácteos',  # 6/8 (compite: Bebés 2)
    'PC-123': 'Bebés',  # n=22
    'PC-125': 'Lácteos',  # n=1
    'PC-126': 'Dulces y caramelos',  # n=5
    'PC-127': 'Dulces y caramelos',  # n=2
    'PC-132': 'Comida mexicana',  # 24/25 (compite: Panes y galletas 1)
    'PC-135': 'Salsa y aderezos',  # n=9
    'PC-138': 'Agua y refrescos',  # n=10
    'PC-140': 'Lácteos',  # n=5
    'PC-142': 'Jugos',  # 18/20 (compite: Agua y refrescos 2)
    'PC-143': 'Lácteos',  # n=2
    'PC-145': 'Dulces y caramelos',  # 58/59 (compite: Panes y galletas 1)
    'PC-147': 'Lácteos',  # n=1
    'PC-148': 'Pasta',  # n=5
    'PC-149': 'Cereales',  # 16/17 (compite: Dulces y caramelos 1)
    'PC-151': 'Cereales',  # 11/13 (compite: Picaderas, Snacks, Chips 2)
    'PC-153': 'Panes y galletas',  # 10/11 (compite: Especias 1)
    'PC-155': 'Panes y galletas',  # 27/31 (compite: Congelados 4)
    'PM-001': 'Pescados y mariscos',  # n=21
    'PM-002': 'Pescados y mariscos',  # n=4
    'PM-003': 'Pescados y mariscos',  # n=7
    'PM-004': 'Pescados y mariscos',  # n=16
    'PM-005': 'Pescados y mariscos',  # n=4
    'PM-006': 'Pescados y mariscos',  # n=3
    'PN-001': 'Hogar y limpieza',  # n=4
    'PN-002': 'Hogar y limpieza',  # 15/17 (compite: Higiene y salud 2)
    'PN-003': 'Hogar y limpieza',  # n=80
    'PN-004': 'Hogar y limpieza',  # 6/7 (compite: Higiene y salud 1)
    'PN-005': 'Hogar y limpieza',  # n=3
    'PN-006': 'Hogar y limpieza',  # 13/17 (compite: Desechables 4)
    'PN-007': 'Hogar y limpieza',  # n=3
    'PN-008': 'Higiene y salud',  # 5/6 (compite: Hogar y limpieza 1)
    'PN-009': 'Hogar y limpieza',  # n=29
    'PN-010': 'Hogar y limpieza',  # 15/16 (compite: Higiene y salud 1)
    'PN-011': 'Hogar y limpieza',  # 12/14 (compite: Bebés 1, Higiene y salud 1)
    'PN-012': 'Hogar y limpieza',  # n=30
    'PN-013': 'Hogar y limpieza',  # n=32
    'PN-014': 'Hogar y limpieza',  # n=6
    'PN-015': 'Hogar y limpieza',  # n=11
    'PN-016': 'Hogar y limpieza',  # 10/12 (compite: Desechables 2)
    'PN-017': 'Hogar y limpieza',  # n=3
    'PN-018': 'Hogar y limpieza',  # n=17
    'PN-019': 'Hogar y limpieza',  # n=5
    'PN-020': 'Hogar y limpieza',  # n=4
    'PN-021': 'Hogar y limpieza',  # n=15
    'PN-022': 'Hogar y limpieza',  # n=6
    'PN-023': 'Hogar y limpieza',  # n=19
    'PN-025': 'Hogar y limpieza',  # n=6
    'PN-026': 'Hogar y limpieza',  # n=2
    'PN-027': 'Hogar y limpieza',  # n=1
    'PN-028': 'Desechables',  # n=11
    'PN-031': 'Bebés',  # n=33
    'PN-032': 'Higiene y salud',  # 14/16 (compite: Hogar y limpieza 2)
    'PN-033': 'Desechables',  # 15/18 (compite: Hogar y limpieza 3)
    'PN-035': 'Desechables',  # 14/18 (compite: Hogar y limpieza 3, Higiene y salud 1)
    'PN-036': 'Higiene y salud',  # n=31
    'PN-037': 'Hogar y limpieza',  # n=4
    'PN-039': 'Hogar y limpieza',  # n=2
    'PN-040': 'Hogar y limpieza',  # 25/26 (compite: Bebés 1)
    'PN-041': 'Desechables',  # 26/31 (compite: Hogar y limpieza 5)
    'PN-042': 'Hogar y limpieza',  # 29/30 (compite: Higiene y salud 1)
    'PN-043': 'Hogar y limpieza',  # 7/9 (compite: Desechables 2)
    'PN-044': 'Desechables',  # n=10
    'PN-047': 'Hogar y limpieza',  # n=17
    'PN-048': 'Hogar y limpieza',  # n=4
    'PN-049': 'Hogar y limpieza',  # n=2
    'PN-050': 'Hogar y limpieza',  # n=2
    'PN-051': 'Hogar y limpieza',  # n=12
    'SF-007': 'Congelados',  # n=6
}

# SIN mapear por ambigüedad real (no ruido): la subfamilia vive de verdad en varias secciones.
# p.ej. la fórmula infantil es Bebés Y Lácteos; el agua es Bebés Y Agua y refrescos.
#   AP-001: {'Panes y galletas': 19, 'Dulces y caramelos': 11}
#   AR-001: {'Alimentos otras mascotas': 11, 'Salud y bienestar': 4, 'Comida mascotas': 1, 'Acuario': 11}
#   AR-018: {'Alimentos felinos': 3, 'Treats caninos': 3}
#   CO-004: {'Congelados': 1, 'Panes y galletas': 1}
#   CO-005: {'Congelados': 20, 'Frutas y vegetales': 2, 'Jugos': 14}
#   DR-003: {'Higiene caninos': 3, 'Salud y bienestar': 8, 'Accesorios felinos y otros': 1, 'Accesorios caninos': 2}
#   FV-018: {'Salsa y aderezos': 1, 'Agua y refrescos': 1, 'Jugos': 4}
#   GR-004: {'Cereales': 2, 'Granos': 3, 'Alimentos otras mascotas': 1}
#   GR-007: {'Cereales': 4, 'Granos': 3, 'Alimentos otras mascotas': 1}
#   HS-053: {'Hogar y limpieza': 4, 'Higiene y salud': 4}
#   MA-001: {'Alimentos felinos': 8, 'Comida mascotas': 6}
#   MA-021: {'Alimentos felinos': 10, 'Comida mascotas': 9}
#   MA-024: {'Treats caninos': 3, 'Comida mascotas': 3}
#   MA-035: {'Higiene felinos': 1, 'Higiene caninos': 1, 'Accesorios felinos y otros': 1}
#   MG-019: {'Hogar y limpieza': 1, 'Desechables': 1}
#   MG-043: {'Hogar y limpieza': 1, 'Higiene y salud': 3}
#   OC-002: {'Pollo y aves': 1, 'Carnes': 1}
#   OC-018: {'Embutidos': 1, 'Pollo y aves': 1}
#   OC-021: {'Pollo y aves': 1, 'Carnes': 1}
#   OC-025: {'Congelados': 1, 'Pollo y aves': 3}
#   PC-010: {'Embutidos': 3, 'Enlatados': 4}
#   PC-017: {'Lácteos': 3, 'Enlatados': 6}
#   PC-030: {'Especias': 1, 'Dulces y caramelos': 1, 'Jugos': 1}
#   PC-037: {'Agua y refrescos': 4, 'Jugos': 9}
#   PC-044: {'Enlatados': 9, 'Pescados y mariscos': 6}
#   PC-047: {'Cereales': 1, 'Especias': 6, 'Granos': 2, 'Lácteos': 2, 'Enlatados': 1, 'Dulces y caramelos': 9}
#   PC-053: {'Pasta': 4, 'Enlatados': 5}
#   PC-060: {'Especias': 1, 'Salsa y aderezos': 11, 'Comida mexicana': 22, 'Picaderas, Snacks, Chips': 5}
#   PC-063: {'Bebés': 4, 'Cereales': 4, 'Lácteos': 1, 'Pasta': 1, 'Salsa y aderezos': 1, 'Enlatados': 1, 'Agua y refrescos': 2, 'Aceites y vinagres': 1, 'Picaderas, Snacks, Chips': 2}
#   PC-074: {'Pasta': 4, 'Enlatados': 2}
#   PC-078: {'Salsa y aderezos': 4, 'Enlatados': 7, 'Aceitunas y encurtidos': 2}
#   PC-081: {'Especias': 2, 'Frutas y vegetales': 1, 'Enlatados': 34, 'Aceitunas y encurtidos': 20}
#   PC-086: {'Bebés': 15, 'Lácteos': 10}
#   PC-100: {'Cereales': 1, 'Pasta': 1, 'Salsa y aderezos': 1}
#   PC-119: {'Bebés': 4, 'Lácteos': 4}
#   PC-128: {'Frutas y vegetales': 1, 'Salsa y aderezos': 2}
#   PC-136: {'Salsa y aderezos': 1, 'Aceitunas y encurtidos': 1}
#   PC-146: {'Agua y refrescos': 22, 'Jugos': 12}
#   PC-154: {'Cereales': 4, 'Panes y galletas': 2}
#   PN-029: {'Hogar y limpieza': 3, 'Desechables': 5}
#   PN-030: {'Higiene y salud': 4, 'Desechables': 2}
#   PN-034: {'Hogar y limpieza': 2, 'Desechables': 4}


def section_for_subfamily(code: str) -> str | None:
    """Nombre de sección para una subfamilia, o `None` si no está mapeada (ambigua o nueva)."""
    return SUBFAMILY_SECTIONS.get(code.strip()) if code else None
