/**
 * socketClient.js — Socket.IO con JWT, rooms por tenant y reconexión
 */
const SocketClient = (() => {
  let socket = null;
  let handlers = {};
  let _connected = false;

  function _getUrl() {
    return window.location.origin;
  }

  function connect(token, callbacks = {}) {
    if (typeof io === 'undefined') {
      console.warn('[SocketClient] Socket.IO no cargó desde CDN.');
      return null;
    }

    handlers = callbacks;
    disconnect();

    socket = io(_getUrl(), {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      timeout: 15000,
    });

    socket.on('connect', () => {
      _connected = true;
      handlers.onConnect?.();
    });

    socket.on('disconnect', (reason) => {
      _connected = false;
      handlers.onDisconnect?.(reason);
    });

    socket.io.on('reconnect_attempt', () => {
      const fresh = sessionStorage.getItem('pf_jwt');
      if (fresh) socket.auth = { token: fresh };
    });

    socket.io.on('reconnect', (attempt) => {
      _connected = true;
      handlers.onReconnect?.(attempt);
    });

    socket.io.on('reconnect_failed', () => {
      handlers.onReconnectFailed?.();
    });

    socket.on('connect_error', (err) => {
      handlers.onConnectError?.(err.message || String(err));
    });

    socket.on('socket:ready', (payload) => {
      handlers.onReady?.(payload);
    });

    socket.on('venta:nueva', (payload) => {
      handlers.onVentaNueva?.(payload);
    });

    socket.on('venta:anulada', (payload) => {
      handlers.onVentaAnulada?.(payload);
    });

    return socket;
  }

  function disconnect() {
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }
    _connected = false;
  }

  function isConnected() {
    return _connected && socket?.connected;
  }

  function updateToken(token) {
    if (socket) socket.auth = { token };
  }

  return { connect, disconnect, isConnected, updateToken };
})();
