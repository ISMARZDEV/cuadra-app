// Las DOS superficies sobre las que se muestra una foto de producto en el OFV.
//
// Van juntas porque el diseño ES el par: las fotos de las tiendas vienen recortadas sobre blanco,
// así que lo que le da contorno a cada cuadrado no es la foto sino el contraste entre un lienzo
// gris y una tarjeta casi blanca. Poner las dos en blanco borra el límite y la galería (o la
// columna Imagen) se lee como una sola mancha.
//
// Fijadas por diseño y NO tokens del tema: tampoco cambian en oscuro, porque una foto de producto
// necesita respaldo claro para leerse — sobre fondo oscuro el recorte blanco se vuelve un bloque.
export const PRODUCT_CANVAS_BG = "#F4F6F7";
export const PRODUCT_CARD_BG = "#FDFFFF";
