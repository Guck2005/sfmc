import { test } from '@japa/runner'
import { sendEmail, __setTransporterForTest } from '#services/dispatcher'

test.group('Dispatcher — sendEmail (mocked SMTP)', (group) => {
  let calls: any[] = []

  group.each.setup(() => {
    calls = []
    __setTransporterForTest({
      sendMail: async (opts: any) => {
        calls.push(opts)
        return { messageId: 'mocked-id-123' }
      },
    } as any)
    return () => __setTransporterForTest(null)
  })

  test('forwards recipient / subject / body to nodemailer', async ({ assert }) => {
    const ok = await sendEmail({
      recipient: 'client@test.local',
      subject: 'Commande validée',
      body: 'Votre commande n°42 a été validée.',
      channel: 'EMAIL',
    })
    assert.isTrue(ok)
    assert.lengthOf(calls, 1)
    assert.equal(calls[0].to, 'client@test.local')
    assert.equal(calls[0].subject, 'Commande validée')
    assert.include(calls[0].text, 'commande n°42')
    assert.match(calls[0].from, /<.+@.+>/)
  })

  test('returns false when SMTP throws', async ({ assert }) => {
    __setTransporterForTest({
      sendMail: async () => {
        throw new Error('smtp down')
      },
    } as any)
    const ok = await sendEmail({
      recipient: 'x@test.local',
      body: 'x',
      channel: 'EMAIL',
    })
    assert.isFalse(ok)
  })
})
