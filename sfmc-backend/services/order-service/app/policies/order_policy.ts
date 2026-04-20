/**
 * Policy CLIENT pour l'accès aux commandes.
 *
 * Règles :
 *  - Un CLIENT ne voit / manipule QUE ses propres commandes
 *    (`order.customerId === auth.id`).
 *  - Un OPERATOR ou ADMIN voit tout.
 *  - Un CLIENT qui crée une commande se voit forcer `customerId = auth.id`
 *    (même s'il tente de passer un autre ID dans le body).
 *  - Les requêtes non authentifiées ne sont pas gérées ici (elles sont
 *    rejetées en amont par `AuthMiddleware`).
 *
 * Cette couche est séparée du contrôleur pour rester testable unitairement
 * sans monter une requête HTTP.
 */

export type Role = 'ADMIN' | 'OPERATOR' | 'CLIENT' | string

export interface Principal {
  id: string
  role: Role
}

export interface OrderLike {
  customerId: string
}

export function isClientRole(role: Role | null | undefined): boolean {
  return role === 'CLIENT'
}

/**
 * Retourne le `customerId` effectif à appliquer comme filtre SQL :
 *   - CLIENT → force son propre id (ignore le paramètre de l'appelant)
 *   - OPERATOR/ADMIN → utilise le paramètre tel quel (peut être undefined)
 */
export function effectiveCustomerFilter(
  principal: Principal | null,
  requested: string | undefined | null
): string | undefined {
  if (principal && isClientRole(principal.role)) return principal.id
  return requested ?? undefined
}

/**
 * Détermine le `customerId` à inscrire sur une commande nouvellement créée :
 *   - CLIENT → toujours son propre id (pas de création pour un tiers)
 *   - OPERATOR/ADMIN → valeur fournie (obligatoire sinon InvalidOrder)
 */
export function effectiveOrderCustomerId(
  principal: Principal | null,
  provided: string | undefined | null
): string {
  if (principal && isClientRole(principal.role)) return principal.id
  if (!provided) throw new Error('customerId requis pour la création de la commande')
  return provided
}

/**
 * Vérifie qu'un principal peut lire/annuler une commande donnée.
 * Un CLIENT ne peut accéder qu'aux commandes dont il est l'auteur.
 */
export function canAccessOrder(principal: Principal | null, order: OrderLike): boolean {
  if (!principal) return false
  if (!isClientRole(principal.role)) return true
  return order.customerId === principal.id
}
