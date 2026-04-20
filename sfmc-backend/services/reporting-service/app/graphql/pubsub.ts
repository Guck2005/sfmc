import { EventEmitter } from 'node:events'

/**
 * Ultra-light in-process pub/sub used to feed GraphQL subscriptions from the
 * RabbitMQ listeners. Suitable for a single reporting-service pod. For
 * multi-pod deployments, swap for Redis-backed pubsub and enable the sticky
 * session on the Ingress for the `/graphql` WebSocket path.
 */
class ReportingPubSub {
  private readonly emitter = new EventEmitter()

  constructor() {
    this.emitter.setMaxListeners(0)
  }

  publish<T>(topic: string, payload: T): void {
    this.emitter.emit(topic, payload)
  }

  async *asyncIterator<T>(topic: string): AsyncIterableIterator<T> {
    const queue: T[] = []
    const waiters: Array<(value: IteratorResult<T>) => void> = []
    let closed = false

    const handler = (payload: T) => {
      if (waiters.length > 0) {
        const w = waiters.shift()!
        w({ value: payload, done: false })
      } else {
        queue.push(payload)
      }
    }
    this.emitter.on(topic, handler)

    try {
      while (!closed) {
        if (queue.length > 0) {
          yield queue.shift() as T
        } else {
          yield await new Promise<T>((resolve) => {
            waiters.push(({ value }) => resolve(value as T))
          })
        }
      }
    } finally {
      this.emitter.off(topic, handler)
    }
  }
}

export const pubsub = new ReportingPubSub()

export const TOPICS = {
  ORDER_STATUS_UPDATED: 'ORDER_STATUS_UPDATED',
  KPI_UPDATED: 'KPI_UPDATED',
  PRODUCTION_ORDER_UPDATED_ALL: 'PRODUCTION_ORDER_UPDATED_ALL',
} as const

export function productionOrderTopic(productionOrderId: string): string {
  return `PRODUCTION_ORDER_UPDATED_${productionOrderId}`
}
