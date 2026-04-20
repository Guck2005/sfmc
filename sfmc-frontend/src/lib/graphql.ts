import { GraphQLClient } from 'graphql-request'
import { createClient as createWsClient, type Client as WsClient } from 'graphql-ws'
import { useAuthStore } from '@/stores/auth-store'

export const gqlClient = new GraphQLClient('/graphql', {
  requestMiddleware: (req) => {
    const token = useAuthStore.getState().token
    if (token) {
      return {
        ...req,
        headers: { ...req.headers, Authorization: `Bearer ${token}` },
      }
    }
    return req
  },
})

let wsClient: WsClient | null = null

export function getWsClient(): WsClient {
  if (wsClient) return wsClient
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  wsClient = createWsClient({
    url: `${proto}://${window.location.host}/graphql`,
    connectionParams: () => {
      const token = useAuthStore.getState().token
      return token ? { Authorization: `Bearer ${token}` } : {}
    },
    lazy: true,
    retryAttempts: 5,
  })
  return wsClient
}

export function closeWsClient() {
  if (wsClient) {
    wsClient.dispose()
    wsClient = null
  }
}
