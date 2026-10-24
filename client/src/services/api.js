import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  withCredentials: true,
});

let accessToken = null;
export function setAccessToken(token) {
  accessToken = token;
}
api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    // A refresh request must NEVER trigger another refresh: when the refresh
    // cookie is expired/invalid, retrying it recurses unboundedly (each retry
    // is a new request, so _retry never stops it), flooding /auth/refresh
    // until the rate limit and leaving the app stuck on "Loading…" forever
    // because AuthProvider never reaches ready=true.
    const isRefreshCall = original.url?.includes('/auth/refresh');
    if (err.response?.status === 401 && !original._retry && !isRefreshCall) {
      original._retry = true;
      try {
        const r = await api.post('/auth/refresh');
        accessToken = r.data.accessToken;
        original.headers.Authorization = `Bearer ${accessToken}`;
        return api(original);
      } catch {
        accessToken = null;
      }
    }
    throw err;
  }
);

export { api };
export default api;
