import { test } from '@japa/runner'
import jwt from 'jsonwebtoken'

const JWT_SECRET = 'test-secret-for-unit-tests'

test.group('TokenService — JWT', () => {
  test('génère un JWT valide avec les bonnes claims', ({ assert }) => {
    const payload = { sub: 'user-uuid-123', email: 'test@sfmc.bj', role: 'ADMIN' }
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' })

    const decoded = jwt.verify(token, JWT_SECRET) as typeof payload & { iat: number; exp: number }
    assert.equal(decoded.sub, 'user-uuid-123')
    assert.equal(decoded.email, 'test@sfmc.bj')
    assert.equal(decoded.role, 'ADMIN')
    assert.isNumber(decoded.exp)
  })

  test('rejette un JWT avec un secret invalide', ({ assert }) => {
    const token = jwt.sign({ sub: 'x' }, JWT_SECRET, { expiresIn: '1m' })
    assert.throws(() => jwt.verify(token, 'mauvais-secret'), /invalid signature/)
  })

  test('rejette un JWT expiré', async ({ assert }) => {
    const token = jwt.sign({ sub: 'x' }, JWT_SECRET, { expiresIn: '1ms' })
    await new Promise((r) => setTimeout(r, 5))
    assert.throws(() => jwt.verify(token, JWT_SECRET), /jwt expired/)
  })

  test('un token ADMIN a le bon rôle encodé', ({ assert }) => {
    const token = jwt.sign({ sub: 'id', email: 'admin@sfmc.bj', role: 'ADMIN' }, JWT_SECRET)
    const decoded = jwt.verify(token, JWT_SECRET) as { role: string }
    assert.equal(decoded.role, 'ADMIN')
  })
})
