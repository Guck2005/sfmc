export const LORDICONS = {
  dashboard: 'https://cdn.lordicon.com/wloilxuq.json',
  orders: 'https://cdn.lordicon.com/slduhdil.json',
  inventory: 'https://cdn.lordicon.com/wloilxuq.json',
  production: 'https://cdn.lordicon.com/gqzfzudq.json',
  billing: 'https://cdn.lordicon.com/rcnecnyt.json',
  notification: 'https://cdn.lordicon.com/lznlxwtc.json',
  users: 'https://cdn.lordicon.com/dxjqoygy.json',
  settings: 'https://cdn.lordicon.com/hwuyudid.json',
  reports: 'https://cdn.lordicon.com/qhviklyi.json',
  logout: 'https://cdn.lordicon.com/gwqxaune.json',
} as const

export type LordIconKey = keyof typeof LORDICONS
