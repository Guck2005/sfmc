import adonisServer from '@adonisjs/core/services/server'
import logger from '@adonisjs/core/services/logger'
import { WebSocketServer } from 'ws'
import { useServer } from 'graphql-ws/lib/use/ws'
import { schema } from '../app/graphql/schema.js'
import { verifyWsConnectionParams } from '../app/services/graphql_auth.js'

/**
 * Attaches a GraphQL-over-WebSocket server on ws://<host>:<port>/graphql
 * using the standard `graphql-ws` sub-protocol. Multiplexed onto the same
 * Node http.Server Adonis already manages — no extra port required.
 *
 * The Node server is only created when `server.listen()` is called, which
 * happens AFTER preloads finish. We therefore poll until it becomes
 * available (typically ready within a few hundred ms).
 */
const MAX_ATTEMPTS = 60 // ~6 s
const POLL_INTERVAL_MS = 100

let attempts = 0
const poll = setInterval(() => {
  attempts += 1
  const httpServer = adonisServer.getNodeServer()
  if (httpServer) {
    clearInterval(poll)
    const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' })
    useServer(
      {
        schema,
        onConnect: async (ctx) => {
          const ok = verifyWsConnectionParams(ctx.connectionParams as Record<string, unknown>)
          if (!ok) return false
          return true
        },
      },
      wsServer as any
    )
    logger.info('[graphql-ws] subscriptions ready on ws://<host>:<port>/graphql (JWT requis)')
    return
  }
  if (attempts >= MAX_ATTEMPTS) {
    clearInterval(poll)
    logger.warn('[graphql-ws] no node http server available — subscriptions disabled')
  }
}, POLL_INTERVAL_MS)
