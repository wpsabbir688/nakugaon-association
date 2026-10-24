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
    if (err.response?.status === 401 && !original._retry) {
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
