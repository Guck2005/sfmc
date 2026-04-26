import { test } from '@japa/runner'
import UserPolicy from '../../app/policies/user_policy.js'

const policy = new UserPolicy()

test.group('UserPolicy — RBAC', () => {
  test('ADMIN peut lister tous les utilisateurs', ({ assert }) => {
    assert.isTrue(policy.list({ id: 'a1', role: 'ADMIN' }))
  })

  test('CLIENT ne peut pas lister les utilisateurs', ({ assert }) => {
    assert.isFalse(policy.list({ id: 'c1', role: 'CLIENT' }))
  })

  test('OPERATOR peut lister les utilisateurs (ex. choix client commande)', ({ assert }) => {
    assert.isTrue(policy.list({ id: 'o1', role: 'OPERATOR' }))
  })

  test('ADMIN peut créer un utilisateur', ({ assert }) => {
    assert.isTrue(policy.create({ id: 'a1', role: 'ADMIN' }))
  })

  test('CLIENT ne peut pas créer un utilisateur', ({ assert }) => {
    assert.isFalse(policy.create({ id: 'c1', role: 'CLIENT' }))
  })

  test('un utilisateur peut voir son propre profil', ({ assert }) => {
    assert.isTrue(policy.view({ id: 'u1', role: 'CLIENT' }, 'u1'))
  })

  test("un CLIENT ne peut pas voir le profil d'un autre", ({ assert }) => {
    assert.isFalse(policy.view({ id: 'u1', role: 'CLIENT' }, 'u2'))
  })

  test('ADMIN peut voir tous les profils', ({ assert }) => {
    assert.isTrue(policy.view({ id: 'a1', role: 'ADMIN' }, 'u9'))
  })

  test('ADMIN peut supprimer un utilisateur', ({ assert }) => {
    assert.isTrue(policy.delete({ id: 'a1', role: 'ADMIN' }))
  })

  test('CLIENT ne peut pas supprimer un utilisateur', ({ assert }) => {
    assert.isFalse(policy.delete({ id: 'c1', role: 'CLIENT' }))
  })

  test('ADMIN peut changer le rôle', ({ assert }) => {
    assert.isTrue(policy.updateRole({ id: 'a1', role: 'ADMIN' }))
  })

  test('OPERATOR ne peut pas changer les rôles', ({ assert }) => {
    assert.isFalse(policy.updateRole({ id: 'o1', role: 'OPERATOR' }))
  })
})
