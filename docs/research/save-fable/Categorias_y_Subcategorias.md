# Categorías y Subcategorías

> **Este archivo es la FUENTE DE VERDAD de la taxonomía.** `seeds/save_taxonomy_seed.py` lo lee
> directamente (`## Categoría` → nivel 0, `- Subcategoría` → nivel 1) y siembra `save.taxonomy_node`.
> Editar acá + `uv run python -m seeds.save_taxonomy_seed` es la única forma correcta de cambiar el árbol.
>
> **Regla al nombrar una subcategoría:** el clasificador léxico (`lexicon.py`) deriva keywords de estos
> nombres y **descarta todo token que aparezca en más de una hoja**. Una hoja cuyos tokens sean todos
> ambiguos queda INVISIBLE para la etapa léxica barata. Por eso cada nombre debe aportar al menos un
> token propio (≥3 caracteres) que ninguna otra hoja use. El tokenizador no lematiza: `leche` ≠ `leches`,
> `frescas` ≠ `frescos`, `congelada` ≠ `congelados`.
>
> **La key entre backticks es la IDENTIDAD del nodo; el texto es sólo la ETIQUETA.** El seed busca
> por `(market_id, key)`, así que **renombrar una etiqueta actualiza el nodo** en vez de crear uno
> nuevo. Una línea sin key es un error — nunca se deriva del nombre. Al agregar una subcategoría,
> inventá una key nueva y no la cambies después; corregirla es posible (es un UPDATE de texto) pero
> el criterio es que la key nace una vez y se queda.
>
> **Los nombres de acá son etiquetas EN ESPAÑOL para el mercado DO.** Para mercados en otro idioma,
> ver `docs/research/save-fable/taxonomia-multi-idioma.md`.

## Alcohol `alcohol`

-   Brandy / Cognac `alcohol.brandy-cognac`
-   Cerveza `alcohol.cerveza`
-   Cigarrillos `alcohol.cigarrillos`
-   Espumantes / Champagne `alcohol.espumantes-champagne`
-   Ginebra `alcohol.ginebra`
-   Hard Seltzer `alcohol.hard-seltzer`
-   Licor `alcohol.licor`
-   Mamajuana `alcohol.mamajuana`
-   Ron `alcohol.ron`
-   Sangría `alcohol.sangria`
-   Sidra `alcohol.sidra`
-   Tequila `alcohol.tequila`
-   Vino `alcohol.vino`
-   Vodka `alcohol.vodka`
-   Whisky `alcohol.whisky`

## Bebés `bebes`

-   Alimentos Para Bebé `bebes.alimentos-para-bebe`
-   Biberones & Chupetes `bebes.biberones-chupetes`
-   Cuidado & Aseo Del Bebé `bebes.cuidado-aseo-del-bebe`
-   Detergente De Bebé `bebes.detergente-de-bebe`
-   Juguetes & Muebles Del Bebé `bebes.juguetes-muebles-del-bebe`
-   Maternidad & Lactancia `bebes.maternidad-lactancia`
-   Pañales & Toallitas De Bebé `bebes.panales-toallitas-de-bebe`

## Bebidas `bebidas`

-   Agua `bebidas.agua`
-   Bebidas De Almendra & Avena `bebidas.bebidas-de-almendra-avena`
-   Bebidas Energéticas `bebidas.bebidas-energeticas`
-   Bebidas En Polvo `bebidas.bebidas-en-polvo`
-   Bebidas Hidratantes `bebidas.bebidas-hidratantes`
-   Jugo `bebidas.jugo`
-   Maltas `bebidas.maltas`
-   Refresco `bebidas.refresco`
-   Té Líquido `bebidas.te-liquido`

## Carnes & Pescados `carnes-pescados`

-   Albóndigas `carnes-pescados.albondigas`
-   Aves & Carnes Especiales `carnes-pescados.aves-carnes-especiales`
-   Carnes Congeladas `carnes-pescados.carnes-congeladas`
-   Cerdo `carnes-pescados.cerdo`
-   Chimi `carnes-pescados.chimi`
-   Hamburguesas `carnes-pescados.hamburguesas`
-   Pavo `carnes-pescados.pavo`
-   Pescados & Mariscos `carnes-pescados.pescados-mariscos`
-   Pollo `carnes-pescados.pollo`
-   Res `carnes-pescados.res`
-   Sustituto De Carne `carnes-pescados.sustituto-de-carne`

## Comidas Preparadas `comidas-preparadas`

-   Rotisería `comidas-preparadas.rotiseria`
-   Sándwiches & Wraps `comidas-preparadas.sandwiches-wraps`
-   Sushi `comidas-preparadas.sushi`

## Congelados `congelados`

-   Helados `congelados.helados`
-   Hielo `congelados.hielo`
-   Paletas & Sorbetes `congelados.paletas-sorbetes`
-   Papas & Frituras `congelados.papas-frituras`
-   Pizzas & Empanadas `congelados.pizzas-empanadas`
-   Vegetales Congelados `congelados.vegetales-congelados`

## Cuidado Del Hogar `cuidado-del-hogar`

-   Cocina & Comedor `cuidado-del-hogar.cocina-comedor`
-   Control De Plagas `cuidado-del-hogar.control-de-plagas`
-   Cuidado De Calzado `cuidado-del-hogar.cuidado-de-calzado`
-   Detergentes & Suavizantes `cuidado-del-hogar.detergentes-suavizantes`
-   Eléctricos Del Hogar `cuidado-del-hogar.electricos-del-hogar`
-   Limpieza Del Hogar `cuidado-del-hogar.limpieza-del-hogar`
-   Papel & Desechables `cuidado-del-hogar.papel-desechables`
-   Parrilla & Encendido `cuidado-del-hogar.parrilla-encendido`

## Cuidado Personal `cuidado-personal`

-   Accesorios De Baño `cuidado-personal.accesorios-de-bano`
-   Afeitado & Depilación `cuidado-personal.afeitado-depilacion`
-   Cuidado Bucal `cuidado-personal.cuidado-bucal`
-   Cuidado Capilar `cuidado-personal.cuidado-capilar`
-   Cuidado Corporal `cuidado-personal.cuidado-corporal`
-   Cuidado Facial `cuidado-personal.cuidado-facial`
-   Higiene Íntima `cuidado-personal.higiene-intima`
-   Higiene Personal `cuidado-personal.higiene-personal`
-   Maquillaje `cuidado-personal.maquillaje`
-   Repelente `cuidado-personal.repelente`

## Despensa & Abarrotes `despensa-abarrotes`

-   Aceite & Vinagre `despensa-abarrotes.aceite-vinagre`
-   Arroz, Granos & Legumbres `despensa-abarrotes.arroz-granos-legumbres`
-   Café `despensa-abarrotes.cafe`
-   Caldos & Sopas `despensa-abarrotes.caldos-sopas`
-   Chocolate Para Beber `despensa-abarrotes.chocolate-para-beber`
-   Condimentos & Especias `despensa-abarrotes.condimentos-especias`
-   Desayuno & Cereal `despensa-abarrotes.desayuno-cereal`
-   Endulzantes `despensa-abarrotes.endulzantes`
-   Enlatados & Conservas `despensa-abarrotes.enlatados-conservas`
-   Harinas `despensa-abarrotes.harinas`
-   Leches Condensadas & Evaporadas `despensa-abarrotes.leches-condensadas-evaporadas`
-   Pastas `despensa-abarrotes.pastas`
-   Repostería `despensa-abarrotes.reposteria`
-   Salsas `despensa-abarrotes.salsas`
-   Semillas & Frutos Secos `despensa-abarrotes.semillas-frutos-secos`
-   Té & Infusiones `despensa-abarrotes.te-infusiones`
-   Untables & Mermeladas `despensa-abarrotes.untables-mermeladas`

## Embutidos & Delicatessen `embutidos-delicatessen`

-   Charcutería `embutidos-delicatessen.charcuteria`
-   Jamón `embutidos-delicatessen.jamon`
-   Longaniza `embutidos-delicatessen.longaniza`
-   Salami `embutidos-delicatessen.salami`
-   Salchichas `embutidos-delicatessen.salchichas`

## Escolares & Oficina `escolares-oficina`

-   Accesorios Escolares `escolares-oficina.accesorios-escolares`
-   Arte & Manualidades `escolares-oficina.arte-manualidades`
-   Cuadernos & Agendas `escolares-oficina.cuadernos-agendas`
-   Escritura `escolares-oficina.escritura`
-   Herramientas De Oficina & Geometría `escolares-oficina.herramientas-de-oficina-geometria`
-   Libros `escolares-oficina.libros`
-   Papelería Escolar & Oficina `escolares-oficina.papeleria-escolar-oficina`
-   Pegamentos & Cintas `escolares-oficina.pegamentos-cintas`

## Frutas & Verduras `frutas-verduras`

-   Ensaladas `frutas-verduras.ensaladas`
-   Frutas Deshidratadas `frutas-verduras.frutas-deshidratadas`
-   Frutas Frescas `frutas-verduras.frutas-frescas`
-   Hierbas Aromáticas `frutas-verduras.hierbas-aromaticas`
-   Pulpa De Frutas `frutas-verduras.pulpa-de-frutas`
-   Vegetales Frescos `frutas-verduras.vegetales-frescos`
-   Víveres `frutas-verduras.viveres`

## Lácteos & Huevos `lacteos-huevos`

-   Crema Agria `lacteos-huevos.crema-agria`
-   Huevos `lacteos-huevos.huevos`
-   Leche `lacteos-huevos.leche`
-   Mantequilla & Margarina `lacteos-huevos.mantequilla-margarina`
-   Queso `lacteos-huevos.queso`
-   Yogurt `lacteos-huevos.yogurt`

## Mascotas `mascotas`

-   Alimento Para Gato `mascotas.alimento-para-gato`
-   Alimento Para Perro `mascotas.alimento-para-perro`
-   Arena Sanitaria `mascotas.arena-sanitaria`
-   Correas & Camas `mascotas.correas-camas`
-   Otras Mascotas `mascotas.otras-mascotas`
-   Shampoo Para Mascotas `mascotas.shampoo-para-mascotas`

## Panadería & Tortillería `panaderia-tortilleria`

-   Bizcochos & Bizcochitos `panaderia-tortilleria.bizcochos-bizcochitos`
-   Discos De Masa `panaderia-tortilleria.discos-de-masa`
-   Masa De Pizza `panaderia-tortilleria.masa-de-pizza`
-   Pan `panaderia-tortilleria.pan`
-   Tortillas `panaderia-tortilleria.tortillas`

## Salud & Farmacia `salud-farmacia`

-   Cuidado Prenatal & Postparto `salud-farmacia.cuidado-prenatal-postparto`
-   Medicinas `salud-farmacia.medicinas`
-   Primeros Auxilios `salud-farmacia.primeros-auxilios`
-   Vitaminas & Suplementos `salud-farmacia.vitaminas-suplementos`

## Snacks & Dulces `snacks-dulces`

-   Chocolates & Caramelos `snacks-dulces.chocolates-caramelos`
-   Dulces Típicos `snacks-dulces.dulces-tipicos`
-   Galletas & Barras `snacks-dulces.galletas-barras`
-   Postres Listos `snacks-dulces.postres-listos`
-   Snacks Salados & Picaderas `snacks-dulces.snacks-salados-picaderas`
-   Tostadas & Snacks Horneados `snacks-dulces.tostadas-snacks-horneados`
