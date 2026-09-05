/**
 * El largo máximo del nombre de un grupo, en el CLIENTE.
 *
 * ⚠️ Duplica a propósito el `GROUP_NAME_MAX` del backend (`domain/groups.py`). No es un despiste:
 * allí es una REGLA —el servidor recorta lo que llegue— y aquí es una AYUDA, el `maxLength` del
 * campo, para que el usuario no escriba veinte caracteres que va a perder sin enterarse. Si los dos
 * números se separan, lo peor que pasa es que el servidor recorte; el dato nunca queda inconsistente.
 */
export const GROUP_NAME_MAX = 40;
