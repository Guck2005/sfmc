import axios from 'axios'

/** Appel sans intercepteur Axios (évite boucle sur 401). */
export async function postAuthRefresh(refreshToken: string) {
  const { data } = await axios.post<{
    data: { accessToken: string; refreshToken: string; tokenType: string; expiresIn: number }
  }>('/api/v1/auth/refresh', { refreshToken }, { headers: { 'Content-Type': 'application/json' }, timeout: 20_000 })
  return data.data
}
