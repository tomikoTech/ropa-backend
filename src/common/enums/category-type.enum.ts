// Rol de una categoría dentro del catálogo. Genérico y escalable: cualquier
// tenant puede marcar una categoría como insumo (esencia) o envase (frasco)
// sin depender del nombre literal de la categoría.
//   STANDARD → producto vendible normal (incluye "productos finales").
//   ESSENCE  → insumo consumido por receta (perfumería: esencias por gramos).
//   FRASCO   → envase que se descuenta al vender el producto final.
export enum CategoryType {
  STANDARD = 'STANDARD',
  ESSENCE = 'ESSENCE',
  FRASCO = 'FRASCO',
}
