import amqp from 'amqplib'
import env from '#start/env'
import logger from '@adonisjs/core/services/logger'

const EXCHANGE_NAME = 'sfmc.events'
const EXCHANGE_TYPE = 'topic'
const DLX_NAME = 'sfmc.dlx'
const DLQ_NAME = 'sfmc.dlq'

export interface DomainEvent {
  id: string
  type: string
  payload: any
  timestamp: string
  metadata?: Record<string, unknown>
}

let connection: amqp.ChannelModel | null = null
let channel: amqp.Channel | null = null
let connecting: Promise<void> | null = null

export async function connectRabbitMQ(): Promise<void> {
  if (channel) return
  if (connecting) return connecting
  connecting = (async () => {
    const url = env.get('RABBITMQ_URL')
    if (!url) throw new Error('RABBITMQ_URL missing')
    connection = await amqp.connect(url)
    channel = await connection.createChannel()
    await channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE, { durable: true })
    await channel.assertExchange(DLX_NAME, 'fanout', { durable: true })
    await channel.assertQueue(DLQ_NAME, { durable: true })
    await channel.bindQueue(DLQ_NAME, DLX_NAME, '')
    connection.on('error', (err) => logger.error({ err }, '[rabbitmq] connection error'))
    connection.on('close', () => {
      logger.warn('[rabbitmq] connection closed')
      channel = null
      connection = null
    })
    logger.info('[rabbitmq] connected')
  })()
  try {
    await connecting
  } finally {
    connecting = null
  }
}

export function getChannel(): amqp.Channel {
  if (!channel) throw new Error('RabbitMQ not connected — call connectRabbitMQ() first')
  return channel
}

export function isConnected(): boolean {
  return channel !== null && connection !== null
}

export async function publishEvent(event: DomainEvent): Promise<void> {
  try {
    await connectRabbitMQ()
    if (!channel) throw new Error('RabbitMQ channel not ready')
    channel.publish(EXCHANGE_NAME, event.type, Buffer.from(JSON.stringify(event)), {
      contentType: 'application/json',
      persistent: true,
      messageId: event.id,
      timestamp: Date.now(),
    })
  } catch (err) {
    logger.error({ err, eventType: event.type }, '[rabbitmq] publish failed (non-fatal)')
  }
}

export interface ConsumerOptions {
  queue: string
  routingKeys: string[]
  handler: (event: DomainEvent) => Promise<void>
}

export async function consume(options: ConsumerOptions): Promise<void> {
  await connectRabbitMQ()
  const ch = getChannel()

  await ch.assertQueue(options.queue, {
    durable: true,
    deadLetterExchange: DLX_NAME,
  })
  for (const rk of options.routingKeys) {
    await ch.bindQueue(options.queue, EXCHANGE_NAME, rk)
  }

  await ch.consume(options.queue, async (msg) => {
    if (!msg) return
    let event: DomainEvent
    try {
      event = JSON.parse(msg.content.toString()) as DomainEvent
    } catch (err) {
      logger.error({ err }, '[rabbitmq] failed to parse message, dropping')
      ch.nack(msg, false, false)
      return
    }
    try {
      await options.handler(event)
      ch.ack(msg)
    } catch (err) {
      logger.error({ err, eventType: event.type }, '[rabbitmq] handler error → DLQ')
      ch.nack(msg, false, false)
    }
  })
  logger.info({ queue: options.queue, keys: options.routingKeys }, '[rabbitmq] consumer ready')
}

export async function closeRabbitMQ(): Promise<void> {
  try {
    if (channel) await channel.close()
  } catch {}
  try {
    if (connection) await connection.close()
  } catch {}
  channel = null
  connection = null
}
