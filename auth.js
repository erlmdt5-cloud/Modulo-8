/**
 * auth.js — Módulo de Autenticación y Roles
 * Responsabilidad: Login, logout, sesión, gestión de usuarios
 */

const Auth = (() => {
  const SESSION_KEY = 'pf_sesion';
  const TOKEN_KEY   = 'pf_jwt';
  const USERS_KEY   = 'pf_usuarios';

  const DEFAULTS = [
    { id: 1, usuario: 'admin',    password: 'Pf_Admin_2026',    nombre: 'Administrador',   rol: 'admin' },
    { id: 2, usuario: 'empleado', password: 'Pf_Empleado_2026', nombre: 'Empleado demo',   rol: 'empleado' },
  ];

  /** Sin acentos, minúsculas — evita rol "Administrador"/"ADMIN" rompiendo esAdmin(). */
  const _normStr = (s) =>
    String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  /** Variantes típicas de rol guardadas incorrectamente en localStorage. */
  const _ROL_ADMIN = ['admin','administrador','administrator','superadmin','superusuario','dueño','dueno'];
  const _ROL_EMP   = ['empleado','empleada','empleados','employee','usuario','user','vendedor','seller','cajero','auxiliar'];

  function _resolverRol(rolCrudo, usuario) {
    const r = _normStr(rolCrudo);
    if (_ROL_ADMIN.includes(r)) return 'admin';
    if (_ROL_EMP.includes(r)) return 'empleado';
    const u = _normStr(usuario);
    const def = DEFAULTS.find(d => _normStr(d.usuario) === u);
    if (def) return def.rol;
    if (u === 'admin' || u === 'administrator' || u === 'administrador') return 'admin';
    return 'empleado';
  }

  /** Registro persistente siempre con `rol` canónico. */
  function _snapshotUsuario(u) {
    const rol = _resolverRol(u.rol, u.usuario);
    return { ...u, rol };
  }

  /** Migra instalaciones antiguas que usaban la contraseña demo anterior. */
  function _migrarLegacy(lista) {
    return lista.map(u =>
      u.usuario === 'admin' && u.password === 'admin123'
        ? { ...u, password: 'Pf_Admin_2026' }
        : u
    );
  }

  /** Añade cuentas demo que falten (p. ej. empleado) sin borrar usuarios ya guardados. */
  function _mergeDefaults(lista) {
    let maxId = lista.reduce((m, u) => Math.max(m, Number(u.id) || 0), 0);
    let out = [...lista];
    for (const def of DEFAULTS) {
      if (!out.some(u => u.usuario === def.usuario)) {
        maxId += 1;
        out.push({ ...def, id: maxId });
      }
    }
    return out;
  }

  /** Unifica cualquier valor de rol o usuario conocido demo. */
  function _normalizarRol(u) {
    return _snapshotUsuario(u);
  }

  // ── Persistencia de usuarios ────────────────────────────────
  function _getUsuarios() {
    let lista;
    try {
      const raw = localStorage.getItem(USERS_KEY);
      lista = raw ? JSON.parse(raw) : null;
    } catch {
      lista = null;
    }
    if (!Array.isArray(lista) || lista.length === 0) {
      return DEFAULTS.map(u => ({ ...u }));
    }
    const merged = _mergeDefaults(_migrarLegacy(lista));
    const normalized = merged.map(_normalizarRol);
    if (merged.some((u, i) => u.rol !== normalized[i].rol)) {
      _saveUsuarios(normalized);
    }
    return normalized;
  }
  function _saveUsuarios(lista) {
    localStorage.setItem(USERS_KEY, JSON.stringify(lista));
  }

  // ── Sesión ─────────────────────────────────────────────────
  function getSesion() {
    let s;
    try { s = JSON.parse(sessionStorage.getItem(SESSION_KEY)); }
    catch { return null; }
    if (!s || !s.usuario) return null;

    const users = _getUsuarios();
    const u =
      users.find(x => _normStr(x.usuario) === _normStr(s.usuario)) ||
      users.find(x => String(x.id) === String(s.id));
    if (!u) return null;

    const rol = _resolverRol(u.rol, u.usuario);
    const fixed = {
      id    : u.id,
      nombre: u.nombre,
      rol,
      usuario: u.usuario,
      tenantId: s.tenantId || 'tienda-demo',
    };
    if (fixed.rol !== s.rol || fixed.id !== s.id || fixed.nombre !== s.nombre) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(fixed));
    }
    return fixed;
  }
  function esAdmin() {
    const s = getSesion();
    return s && s.rol === 'admin';
  }

  // ── Login / Logout ─────────────────────────────────────────
  function _loginLocal(usuario, password) {
    const uIn = _normStr(usuario);
    const users = _getUsuarios();
    const user  = users.find(x => _normStr(x.usuario) === uIn && x.password === password);
    if (!user) return { ok: false, error: 'Usuario o contraseña incorrectos.' };
    const rol = _resolverRol(user.rol, user.usuario);
    const sesion = {
      id: user.id,
      nombre: user.nombre,
      rol,
      usuario: user.usuario,
      tenantId: 'tienda-demo',
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(sesion));
    sessionStorage.removeItem(TOKEN_KEY);
    return { ok: true, sesion, token: null };
  }

  async function login(usuario, password) {
    try {
      const data = await ApiClient.login(usuario, password);
      sessionStorage.setItem(TOKEN_KEY, data.token);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data.sesion));
      return { ok: true, sesion: data.sesion, token: data.token };
    } catch (err) {
      if (err.status === 401) return { ok: false, error: err.message };
      return _loginLocal(usuario, password);
    }
  }

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || '';
  }

  function logout() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  }

  // ── Gestión de empleados ────────────────────────────────────
  function getEmpleados() {
    return _getUsuarios().filter(u => u.rol === 'empleado');
  }

  function agregarEmpleado(usuario, password, nombre) {
    if (!usuario || !password || !nombre) return { ok: false, error: 'Todos los campos son requeridos.' };
    const lista = _getUsuarios();
    if (lista.find(u => u.usuario === usuario)) return { ok: false, error: 'El usuario ya existe.' };
    lista.push({ id: Date.now(), usuario, password, nombre, rol: 'empleado' });
    _saveUsuarios(lista);
    return { ok: true };
  }

  function eliminarEmpleado(id) {
    const lista = _getUsuarios().filter(u => u.id !== id || u.rol === 'admin');
    _saveUsuarios(lista);
  }

  return {
    login, logout, getSesion, getToken, esAdmin,
    getEmpleados, agregarEmpleado, eliminarEmpleado,
  };
})();
