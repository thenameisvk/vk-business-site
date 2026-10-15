import axios from 'axios';

/* ---------------------------------------------------------------
   One axios instance for the whole app.
   • attaches the login token to every request
   • on a 401 (expired / invalid token) signs the user out
   • errorMessage() turns any failure into friendly text
   Change API_BASE for production, e.g. 'https://your-api.onrender.com/api'
   --------------------------------------------------------------- */
export const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
export const LOGIN_PATH = '/login';
const SESSION_KEY = 'vk_session';

export const getSession = () => {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
};
export const saveSession = (s) => localStorage.setItem(SESSION_KEY, JSON.stringify(s));
export const clearSession = () => localStorage.removeItem(SESSION_KEY);

const API = axios.create({ baseURL: API_BASE, timeout: 20000 });

API.interceptors.request.use((config) => {
  const s = getSession();
  if (s?.token) config.headers.Authorization = `Bearer ${s.token}`;
  return config;
});

API.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const isLogin = (err.config?.url || '').includes('/user/login');
    if (status === 401 && !isLogin) {
      clearSession();
      if (!window.location.pathname.startsWith(LOGIN_PATH)) window.location.replace(LOGIN_PATH);
    }
    return Promise.reject(err);
  }
);

export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (err?.response?.data?.message) return err.response.data.message;
  if (err?.code === 'ECONNABORTED') return 'The server took too long to respond. Please try again.';
  if (err?.message === 'Network Error') return 'Cannot reach the server. Check your internet connection.';
  return fallback;
}

/** { fieldName: message } from a 400 response, so forms can show errors under inputs */
export function fieldErrors(err, rename = {}) {
  const out = {};
  (err?.response?.data?.errors || []).forEach((e) => { out[rename[e.field] || e.field] = e.message; });
  return out;
}

export default API;