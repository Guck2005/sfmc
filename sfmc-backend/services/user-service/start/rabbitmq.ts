import { connectRabbitMQ, consume } from '#services/rabbitmq'
import logger from '@adonisjs/core/services/logger'

export async function initRabbitMQ() {
  await connectRabbitMQ()

  const { onUserCreated, onUserDeleted } = await import('#listeners/user_listeners')

  await consume({
    queue: 'user.user_created_q',
    routingKeys: ['user.created'],
    handler: onUserCreated,
  })

  await consume({
    queue: 'user.user_deleted_q',
    routingKeys: ['user.deleted'],
    handler: onUserDeleted,
  })
}

initRabbitMQ().catch((err) => {
  logger.error({ err }, '[rabbitmq] failed to initialize (continuing without event consumers)')
})
