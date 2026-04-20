import { connectRabbitMQ, consume } from '#services/rabbitmq'
import logger from '@adonisjs/core/services/logger'

export async function initRabbitMQ() {
  await connectRabbitMQ()

  const { onUserRoleChanged } = await import('#listeners/user_listeners')

  await consume({
    queue: 'auth.user_role_changed_q',
    routingKeys: ['user.role_changed'],
    handler: onUserRoleChanged,
  })
}

initRabbitMQ().catch((err) => {
  logger.error({ err }, '[rabbitmq] failed to initialize (continuing without event consumers)')
})
