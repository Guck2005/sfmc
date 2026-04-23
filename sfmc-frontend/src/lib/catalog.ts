/**
 * Indique si le catalogue chargé contient un nom lisible pour ce produit
 * (évite d’afficher l’UUID en doublon sous le nom).
 */
export function isKnownCatalogProductId(
  nameById: Record<string, string>,
  productId: string | null | undefined
): boolean {
  return !!productId && Object.prototype.hasOwnProperty.call(nameById, productId)
}
