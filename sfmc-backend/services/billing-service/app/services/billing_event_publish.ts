import { randomUUID } from 'node:crypto'
import { publishEvent } from '#services/rabbitmq'

const SERVICE_NAME = 'billing-service'

/**
 * Publie un événement domaine sur l’exchange `sfmc.events` (facturation).
 */
export async function publishBillingEvent(
  type: string,
  payload: Record<string, unknown>,
  sagaId?: string
): Promise<void> {
  const event = {
    id: randomUUID(),
    type,
    version: '1.0',
    timestamp: new Date().toISOString(),
    payload,
    metadata: {
      sourceService: SERVICE_NAME,
      correlationId: randomUUID(),
      ...(sagaId ? { sagaId } : {}),
    },
  }
  await publishEvent(event as any)
}
