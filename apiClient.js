/**
 * apiClient.js — Cliente REST con JWT para el backend PixelFit
 */
const ApiClient = (() => {
  const BASE = window.location.origin;

  function getToken() {
    return sessionStorage.getItem('pf_jwt') || '';
  }

  async function _request(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${BASE}${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const err = new Error(data.error || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function login(usuario, password) {
    return _request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ usuario, password }),
    });
  }

  async function fetchState() {
    return _request('/api/state');
  }

  async function syncState(state) {
    return _request('/api/state', {
      method: 'PUT',
      body: JSON.stringify(state),
    });
  }

  async function registrarVenta(codigo, precioVenta, talla, color) {
    return _request('/api/ventas', {
      method: 'POST',
      body: JSON.stringify({ codigo, precioVenta, talla, color }),
    });
  }

  async function anularVenta(id) {
    return _request(`/api/ventas/${id}`, { method: 'DELETE' });
  }

  async function health() {
    const res = await fetch(`${BASE}/api/health`);
    return res.ok;
  }

  return { login, fetchState, syncState, registrarVenta, anularVenta, health, getToken };
})();
