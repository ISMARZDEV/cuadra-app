// Geometría COMPARTIDA del hub. Vive aparte de `hub-screen` porque el card también la necesita —
// calcula su sangría a partir del ancho que le queda—, y si la importara de la pantalla armaría un
// ciclo (la pantalla ya importa el card).

// Figma da 19 para AMBOS (márgenes laterales y paso vertical de 172 sobre un card de 153). El aire
// vertical se respeta; el lateral se apretó a pedido, para que el card gane ancho — y ese ancho va
// entero al blanco del título, que es el lado que se queda corto (el panel de arte es fijo).
export const HUB_GUTTER_X = 14;
export const HUB_GAP_Y = 19;
