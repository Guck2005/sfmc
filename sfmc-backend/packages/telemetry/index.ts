/**
 * @sfmc/telemetry — one-liner OpenTelemetry bootstrap.
 *
 * Usage from any AdonisJS service (e.g. services/<svc>/app/services/tracer.ts):
 *
 *   import { initTracer } from '@sfmc/telemetry'
 *   initTracer({ serviceName: 'auth-service' })
 *
 * Environment variables consumed (all optional):
 *   OTEL_EXPORTER_OTLP_ENDPOINT   — OTLP/HTTP collector (Jaeger / otel-collector)
 *   OTEL_EXPORTER_JAEGER_ENDPOINT — alias kept for backward compatibility
 *   OTEL_SERVICE_NAMESPACE        — defaults to "sfmc"
 *   OTEL_SDK_DISABLED             — set to "true" to skip initialisation
 */
import { NodeSDK } from '@opentelemetry/sdk-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { Resource } from '@opentelemetry/resources'
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_NAMESPACE,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions'
import { context, propagation, trace, SpanKind } from '@opentelemetry/api'

export interface TracerOptions {
  serviceName: string
  serviceVersion?: string
}

let started = false

export function initTracer(opts: TracerOptions): void {
  if (started) return
  if (process.env.OTEL_SDK_DISABLED === 'true') return

  const endpoint =
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    process.env.OTEL_EXPORTER_JAEGER_ENDPOINT ||
    ''

  if (!endpoint) {
    // Tracing is strictly optional: if no endpoint is configured, stay silent.
    return
  }

  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: opts.serviceName,
      [ATTR_SERVICE_NAMESPACE]: process.env.OTEL_SERVICE_NAMESPACE || 'sfmc',
      [ATTR_SERVICE_VERSION]: opts.serviceVersion || '1.0.0',
    }),
    traceExporter: new OTLPTraceExporter({
      url: endpoint.endsWith('/v1/traces') ? endpoint : `${endpoint.replace(/\/$/, '')}/v1/traces`,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable the FS instrumentation (very noisy, few signal value)
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  })

  sdk.start()
  started = true

  const shutdown = async () => {
    try {
      await sdk.shutdown()
    } catch {
      /* noop */
    }
  }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
}

/**
 * Extract a W3C traceparent from a message headers/metadata object so RabbitMQ
 * consumers can continue the trace started by the producer.
 */
export function extractContext(carrier: Record<string, any>) {
  return propagation.extract(context.active(), carrier)
}

/**
 * Inject the current W3C traceparent into a carrier (e.g. amqplib headers).
 */
export function injectContext(carrier: Record<string, any>): Record<string, any> {
  propagation.inject(context.active(), carrier)
  return carrier
}

/**
 * Wrap an async callback inside a CONSUMER span — handy for RabbitMQ listeners.
 */
export async function withConsumerSpan<T>(
  name: string,
  carrier: Record<string, any>,
  fn: () => Promise<T>
): Promise<T> {
  const tracer = trace.getTracer('sfmc')
  const parentContext = extractContext(carrier)
  return context.with(parentContext, async () => {
    const span = tracer.startSpan(name, { kind: SpanKind.CONSUMER })
    try {
      const result = await fn()
      span.end()
      return result
    } catch (err) {
      span.recordException(err as Error)
      span.setStatus({ code: 2, message: (err as Error).message })
      span.end()
      throw err
    }
  })
}
