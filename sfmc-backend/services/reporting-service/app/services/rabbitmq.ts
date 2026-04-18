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
}

let connection: amqp.ChannelModel | null = null
let channel: amqp.Channel | null = null
let connecting: Promise<void> | null = null

export async function connectRabbitMQ(): Promise<void> {
  if (channel) return
  if (connecting) return connecting
  connecting = (async () => {
    const url = env.get('RABBITMQ_URL')
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

export interface ConsumerOptions {
  queue: string
  routingKeys: string[]
  handler: (event: DomainEvent) => Promise<void>
}

const RETRY_DELAYS_MS = [1000, 5000, 30000]

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
      const attempts = Number(msg.properties.headers?.['x-retry-count'] ?? 0)
      logger.error({ err, event: event.type, attempts }, '[rabbitmq] handler error')
      if (attempts < RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[attempts]
        setTimeout(() => {
          try {
            ch.publish(EXCHANGE_NAME, event.type, msg.content, {
              ...msg.properties,
              headers: { ...(msg.properties.headers ?? {}), 'x-retry-count': attempts + 1 },
              persistent: true,
            })
            ch.ack(msg)
          } catch (e) {
            logger.error({ err: e }, '[rabbitmq] retry publish failed')
          }
        }, delay)
      } else {
        logger.error({ event: event.type }, '[rabbitmq] max retries reached → DLQ')
        ch.nack(msg, false, false)
      }
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
