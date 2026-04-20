import { initTracer } from '@sfmc/telemetry'

/**
 * Bootstraps OpenTelemetry for inventory-service. Must be imported as early as
 * possible so the auto-instrumentations can patch http, pg and amqplib
 * before the application creates any of those clients.
 *
 * Enabled only when OTEL_EXPORTER_OTLP_ENDPOINT (or the legacy
 * OTEL_EXPORTER_JAEGER_ENDPOINT) env var is defined.
 */
initTracer({ serviceName: 'inventory-service' })
