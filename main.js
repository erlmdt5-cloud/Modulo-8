/**
 * main.js — Director de la Aplicación
 * Conecta: Auth ↔ DataManager ↔ Productos ↔ Ventas ↔ Gastos ↔ Render
 * No calcula. No dibuja directamente. No guarda solo.
 * Es el director de orquesta.
 */

const App = (() => {

  // ── Estado central ─────────────────────────────────────────
  let state = { productos: [], ventas: [], gastos: [], historialCodigos: [], retiros: [], cierres: [] };
  let _modoReporte = 'mes';   // semana | mes | rango | todo
  let _scanner = null;     // instancia ZXing (solo en el modo de respaldo)
  let _scanStream = null;  // MediaStream de la cámara
  let _scanTimer = null;   // temporizador del detector nativo
  let _scanSesion = 0;     // invalida lecturas de sesiones ya cerradas

  // ──────────────────────────────────────────────────────────
  // ARRANQUE
  // ──────────────────────────────────────────────────────────
  function init() {
    _cargarTema();
    const sesion = Auth.getSesion();
    sesion ? _arrancarApp(sesion) : _mostrarLogin();
  }

  async function _arrancarApp(sesion) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-screen').style.display  = 'block';

    state = DataManager.cargarTodo();
    if (!Array.isArray(state.historialCodigos)) state.historialCodigos = [];
    if (!Array.isArray(state.retiros)) state.retiros = [];
    if (!Array.isArray(state.cierres)) state.cierres = [];
    state.productos = Productos.asegurarIds(state.productos);

    if (Auth.getToken()) {
      try {
        const remoto = await ApiClient.fetchState();
        if (remoto) {
          state = {
            productos: Productos.asegurarIds(remoto.productos || []),
            ventas: remoto.ventas || [],
            gastos: remoto.gastos || [],
            historialCodigos: remoto.historialCodigos || [],
            // Si el servidor aún no guarda retiros, se conservan los locales
            retiros: Array.isArray(remoto.retiros) ? remoto.retiros : state.retiros,
            cierres: Array.isArray(remoto.cierres) ? remoto.cierres : state.cierres,
          };
          DataManager.guardarTodo(
            state.productos,
            state.ventas,
            state.gastos,
            state.historialCodigos,
            state.retiros,
            state.cierres
          );
        }
      } catch {
        Render.toast('Modo local: no se pudo sincronizar con el servidor.', 'warn');
      }
    }

    _initFiltrosReporte();
    _conectarSocket();
    Render.sesion(sesion);
    Render.aplicarRol(Auth.esAdmin());
    _renderizarTodo();
    Render.navegarA('ventas');
    if (Auth.esAdmin()) Render.navegarA('dashboard');
  }

  function _conectarSocket() {
    const token = Auth.getToken();
    if (!token) return;

    SocketClient.disconnect();
    SocketClient.connect(token, {
      onConnect: () => _setRealtimeStatus(true),
      onDisconnect: () => _setRealtimeStatus(false),
      onReconnect: () => {
        _setRealtimeStatus(true);
        Render.toast('Conexión en tiempo real restablecida.', 'success');
      },
      onReconnectFailed: () => {
        _setRealtimeStatus(false);
        Render.toast('No se pudo reconectar al servidor.', 'error');
      },
      onConnectError: () => _setRealtimeStatus(false),
      onVentaNueva: (payload) => _aplicarVentaNueva(payload),
      onVentaAnulada: (payload) => _aplicarVentaAnulada(payload),
    });
  }

  function _setRealtimeStatus(online) {
    const el = document.getElementById('realtime-status');
    if (!el) return;
    el.textContent = online ? '● En vivo' : '○ Sin conexión';
    el.className = online ? 'realtime-badge realtime-badge--on' : 'realtime-badge realtime-badge--off';
  }

  function _aplicarVentaNueva(payload) {
    if (!payload?.venta) return;
    if (Ventas.buscarPorId(state.ventas, payload.venta.id)) return;

    state.ventas = [...state.ventas, payload.venta];
    if (Array.isArray(payload.productos)) {
      state.productos = payload.productos;
    } else if (payload.producto) {
      state.productos = state.productos.map(p =>
        String(p.codigo) === String(payload.producto.codigo) &&
        Productos.normalizarColor(p.color) === Productos.normalizarColor(payload.producto.color) &&
        Productos.normalizarTalla(p.talla) === Productos.normalizarTalla(payload.producto.talla)
          ? payload.producto
          : p
      );
    }

    _guardarYRenderizar();

    if (Auth.esAdmin()) {
      Render.toast(`Nueva venta: ${payload.venta.nombre} — ${_fmt(payload.venta.venta)}`);
    }
  }

  function _aplicarVentaAnulada(payload) {
    if (!payload?.id) return;
    state.ventas = Ventas.eliminarPorId(state.ventas, payload.id);
    if (Array.isArray(payload.productos)) state.productos = payload.productos;
    _guardarYRenderizar();
    if (Auth.esAdmin()) Render.toast('Venta anulada (actualización en vivo).', 'warn');
  }

  function _mostrarLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-screen').style.display  = 'none';
  }

  // ──────────────────────────────────────────────────────────
  // AUTH
  // ──────────────────────────────────────────────────────────
  async function hacerLogin() {
    const usuario  = document.getElementById('loginUsuario').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = document.querySelector('.btn-login');
    if (btn) btn.disabled = true;

    try {
      const resultado = await Auth.login(usuario, password);
      if (resultado.ok) {
        document.getElementById('loginError').textContent = '';
        await _arrancarApp(resultado.sesion);
      } else {
        document.getElementById('loginError').textContent = resultado.error;
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function hacerLogout() {
    SocketClient.disconnect();
    Auth.logout();
    state = { productos: [], ventas: [], gastos: [], historialCodigos: [], retiros: [], cierres: [] };
    document.body.classList.remove('staff-empleado');
    _setRealtimeStatus(false);
    _mostrarLogin();
  }

  // ──────────────────────────────────────────────────────────
  // NAVEGACIÓN
  // ──────────────────────────────────────────────────────────
  function navegarA(seccion) {
    Render.navegarA(seccion);
    // En celular/tablet, al navegar se cierra el menú lateral (drawer)
    if (window.innerWidth < 1024) toggleSidebar(false);
  }

  // ──────────────────────────────────────────────────────────
  // MENÚ LATERAL (responsive / mobile first)
  // ──────────────────────────────────────────────────────────
  function toggleSidebar(forceState) {
    const abrir = typeof forceState === 'boolean'
      ? forceState
      : !document.body.classList.contains('sidebar-open');
    document.body.classList.toggle('sidebar-open', abrir);
  }

  // ──────────────────────────────────────────────────────────
  // PRODUCTOS
  // ──────────────────────────────────────────────────────────
  function agregarProducto() {
    let codigo     = document.getElementById('codBarras').value.trim();
    let nombre     = document.getElementById('nombre').value.trim();
    const color    = Productos.normalizarColor(document.getElementById('color').value);
    const talla    = Productos.normalizarTalla(document.getElementById('talla').value);
    const precio   = parseFloat(document.getElementById('precio').value);
    const cantidad = parseInt(document.getElementById('cantidad').value);

    if (!codigo && Auth.esAdmin()) {
      codigo = Productos.generarCodigoUnico(state.productos);
      document.getElementById('codBarras').value = codigo;
    }

    const error = Productos.validar(codigo, nombre, precio, cantidad, talla, color);
    if (error) { Render.toast(error, 'error'); return; }

    // Un código maestro agrupa tallas de UN mismo producto: evita mezclar productos distintos.
    const variantes = Productos.buscarVariantes(state.productos, codigo);
    if (variantes.length && variantes[0].nombre.trim().toLowerCase() !== nombre.toLowerCase()) {
      if (!confirm(`El código "${codigo}" ya pertenece a "${variantes[0].nombre}".\n\n¿Agregar la variante ${color} / talla ${talla} a ese producto?`)) return;
      nombre = variantes[0].nombre;
    }

    state.productos = Productos.agregar(state.productos, { codigo, nombre, color, talla, precio, cantidad });
    Render.toggleVariantes(codigo, true);   // deja abierto el desglose para ver la variante guardada
    _guardarYRenderizar();
    _limpiarFormProducto();
    Render.toast(`✔ "${nombre}" (${color} / talla ${talla}) guardado en inventario.`);
  }

  /** Al escribir un código existente, rellena nombre/costo y muestra sus tallas actuales. */
  function autocompletarDesdeCodigo() {
    const cod  = document.getElementById('codBarras').value.trim();
    const hint = document.getElementById('hintCodigo');
    const vars = cod ? Productos.buscarVariantes(state.productos, cod) : [];
    if (!vars.length) { if (hint) hint.textContent = ''; return; }
    const nom = document.getElementById('nombre');
    const pr  = document.getElementById('precio');
    if (nom && !nom.value.trim()) nom.value = vars[0].nombre;
    if (pr && pr.value === '')    pr.value  = vars[0].precio;
    if (hint) {
      hint.textContent = `Código existente: "${vars[0].nombre}" — variantes: ` +
        vars.map(v => `${v.color ? v.color + ' / ' : ''}${v.talla} (${v.cantidad})`).join(', ');
    }
  }

  function eliminarProd(indice) {
    if (!confirm('¿Eliminar este producto del inventario?')) return;
    state.productos = Productos.eliminar(state.productos, indice);
    _guardarYRenderizar();
    Render.toast('Producto eliminado.', 'warn');
  }

  // ──────────────────────────────────────────────────────────
  // VENTAS
  // ──────────────────────────────────────────────────────────
  let _ventaPendiente = null; // { codigo, variantes, colores, color, tallasActuales } mientras se elige la variante

  const _etiquetaVariante = p => `${p.color ? p.color + ' / ' : ''}talla ${p.talla}`;

  /**
   * Vende 1 unidad. Se ingresa el código maestro; si tiene varias variantes se
   * exige elegir color y talla (modal) y solo se descuenta esa combinación exacta.
   * `varianteElegida` = { color, talla } (lo envía el modal).
   */
  async function procesarVenta(codigo, varianteElegida) {
    if (!codigo) return;
    codigo = String(codigo).trim();

    const variantes = Productos.buscarVariantes(state.productos, codigo);
    if (!variantes.length) {
      Render.toast(`Código "${codigo}" no encontrado.`, 'error');
      _limpiarScanner();
      return;
    }

    let producto;
    if (varianteElegida !== undefined) {
      producto = Productos.buscarVariante(state.productos, codigo, varianteElegida.color, varianteElegida.talla);
    } else if (variantes.length === 1) {
      producto = variantes[0];
    } else {
      // El modal solo ofrece lo que tiene stock: colores y tallas agotados no aparecen
      const disponibles = variantes.filter(v => v.cantidad > 0);
      if (!disponibles.length) {
        Render.toast(`Sin existencias: "${variantes[0].nombre}" (todas las variantes).`, 'error');
        _limpiarScanner();
        return;
      }
      const colores = Productos.coloresDe(disponibles).map(c => ({
        color: c,
        stock: disponibles
          .filter(v => Productos.normalizarColor(v.color) === c)
          .reduce((a, v) => a + v.cantidad, 0),
      }));
      _ventaPendiente = {
        codigo, variantes: disponibles, colores,
        color: colores.length === 1 ? colores[0].color : undefined,   // un solo color: ya queda elegido
        tallasActuales: [],
      };
      _pintarModalVariante();
      return;
    }

    if (!producto) {
      Render.toast('Variante no encontrada.', 'error');
      _limpiarScanner();
      return;
    }
    if (producto.cantidad <= 0) {
      Render.toast(`Sin existencias: "${producto.nombre}" (${_etiquetaVariante(producto)}).`, 'error');
      _limpiarScanner();
      return;
    }

    const precioVenta = parseFloat(
      prompt(`💰 Precio de venta para:\n${producto.nombre} (${_etiquetaVariante(producto)})`, producto.precio)
    );
    if (isNaN(precioVenta) || precioVenta < 0) { _limpiarScanner(); return; }

    if (Auth.getToken()) {
      try {
        const res = await ApiClient.registrarVenta(codigo, precioVenta, producto.talla, producto.color || '');
        if (Ventas.buscarPorId(state.ventas, res.venta.id)) {
          _limpiarScanner();
          return;
        }
        state.ventas = [...state.ventas, res.venta];
        state.productos = res.productos || state.productos;
        _guardarYRenderizar();
        _limpiarScanner();
        Render.toast(`✔ Venta: ${producto.nombre} (${producto.color ? producto.color + ' / ' : ''}${producto.talla}) — ${_fmt(precioVenta)}`);
        return;
      } catch (err) {
        Render.toast(err.message || 'Error al registrar venta.', 'error');
        _limpiarScanner();
        return;
      }
    }

    const venta     = Ventas.crear(producto, precioVenta);
    state.ventas    = [...state.ventas, venta];
    const res       = Productos.reducirStock(state.productos, codigo, producto.color || '', producto.talla);
    state.productos = res.lista;
    _guardarYRenderizar();
    _limpiarScanner();
    Render.toast(`✔ Venta: ${producto.nombre} (${producto.color ? producto.color + ' / ' : ''}${producto.talla}) — ${_fmt(precioVenta)}`);
  }

  function _pintarModalVariante() {
    const pend = _ventaPendiente;
    if (!pend) return;
    pend.tallasActuales = pend.color === undefined
      ? []
      : pend.variantes.filter(v => Productos.normalizarColor(v.color) === pend.color);
    Render.modalTalla(pend.variantes[0].nombre, pend.colores, pend.color, pend.tallasActuales, {
      codigo: pend.codigo,
      puedeVolver: pend.colores.length > 1,
    });
  }

  /** Paso 1 del modal: botón de color (índice dentro de los colores mostrados). */
  function elegirColor(i) {
    const pend = _ventaPendiente;
    if (!pend || !pend.colores[i]) return;
    pend.color = pend.colores[i].color;
    _pintarModalVariante();
  }

  /** Vuelve al paso 1 (los colores). */
  function volverAColores() {
    const pend = _ventaPendiente;
    if (!pend) return;
    pend.color = undefined;
    _pintarModalVariante();
  }

  /** Paso 2 del modal: botón de talla del color elegido; con esto se procesa la venta. */
  function elegirTalla(i) {
    const pend = _ventaPendiente;
    if (!pend || pend.color === undefined || !pend.tallasActuales[i]) return;
    const v = pend.tallasActuales[i];
    _ventaPendiente = null;
    Render.cerrarModalTalla();
    procesarVenta(pend.codigo, { color: Productos.normalizarColor(v.color), talla: v.talla });
  }

  function cancelarTalla() {
    _ventaPendiente = null;
    Render.cerrarModalTalla();
    _limpiarScanner();
  }

  async function anularVenta(id) {
    const venta = Ventas.buscarPorId(state.ventas, id);
    if (!venta) return;
    // No se puede anular una venta si ya se retiró dinero que ella respalda
    const dispSinEsta = Retiros.disponible(Ventas.eliminarPorId(_ventasHistoricas(), id), state.retiros);
    if (dispSinEsta < 0) {
      Render.toast(
        `No se puede anular: ya se retiraron ${_fmt(Retiros.totalRetirado(state.retiros))} de las ventas brutas y quedarían ${_fmt(-dispSinEsta)} descubiertos.`,
        'error'
      );
      return;
    }
    if (!confirm('¿Anular esta venta y reponer stock?')) return;

    if (Auth.getToken()) {
      try {
        const res = await ApiClient.anularVenta(id);
        state.ventas = Ventas.eliminarPorId(state.ventas, id);
        if (res.productos) state.productos = res.productos;
        _guardarYRenderizar();
        Render.toast('Venta anulada y stock repuesto.', 'warn');
        return;
      } catch (err) {
        Render.toast(err.message || 'No se pudo anular la venta.', 'error');
        return;
      }
    }

    state.productos = Productos.aumentarStock(state.productos, venta.cod, venta.color || '', venta.talla);
    state.ventas    = Ventas.eliminarPorId(state.ventas, id);
    _guardarYRenderizar();
    Render.toast('Venta anulada y stock repuesto.', 'warn');
  }

  function imprimirTicket(id) {
    const venta = Ventas.buscarPorId(_ventasHistoricas(), id);
    if (venta) alert(Ventas.generarTicketTexto(venta));
  }

  // ──────────────────────────────────────────────────────────
  // GASTOS
  // ──────────────────────────────────────────────────────────
  function agregarGasto() {
    const desc  = document.getElementById('nombreGasto').value.trim();
    const monto = parseFloat(document.getElementById('montoGasto').value);
    if (!desc || isNaN(monto) || monto <= 0) { Render.toast('Datos de gasto inválidos.', 'error'); return; }
    state.gastos = Gastos.agregar(state.gastos, desc, monto);
    _guardarYRenderizar();
    document.getElementById('nombreGasto').value = '';
    document.getElementById('montoGasto').value  = '';
    Render.toast(`Gasto registrado: ${_fmt(monto)}`, 'warn');
  }

  function eliminarGasto(id) {
    if (!confirm('¿Eliminar este gasto?')) return;
    state.gastos = Gastos.eliminar(state.gastos, id);
    _guardarYRenderizar();
  }

  // ──────────────────────────────────────────────────────────
  // EMPLEADOS
  // ──────────────────────────────────────────────────────────
  function agregarEmpleado() {
    const usuario  = document.getElementById('empUsuario').value.trim();
    const password = document.getElementById('empPassword').value.trim();
    const nombre   = document.getElementById('empNombre').value.trim();
    const res = Auth.agregarEmpleado(usuario, password, nombre);
    if (!res.ok) { Render.toast(res.error, 'error'); return; }
    Render.empleados(Auth.getEmpleados());
    ['empUsuario', 'empPassword', 'empNombre'].forEach(id => document.getElementById(id).value = '');
    Render.toast(`Empleado "${nombre}" creado.`);
  }

  function eliminarEmpleado(id) {
    if (!confirm('¿Eliminar este empleado?')) return;
    Auth.eliminarEmpleado(id);
    Render.empleados(Auth.getEmpleados());
    Render.toast('Empleado eliminado.', 'warn');
  }

  // ──────────────────────────────────────────────────────────
  // CÁMARA / SCANNER DE CÓDIGO DE BARRAS
  // ──────────────────────────────────────────────────────────
  function abrirScanner() {
    const hayNativo = 'BarcodeDetector' in window;
    if (!hayNativo && typeof ZXing === 'undefined') {
      Render.toast('La librería de escaneo no cargó. Verifica tu conexión.', 'error');
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      Render.toast(
        window.isSecureContext === false
          ? 'La cámara solo funciona con HTTPS o en localhost. Abre la app desde una dirección segura.'
          : 'Este navegador no permite usar la cámara.',
        'error'
      );
      return;
    }
    document.getElementById('modalScanner').style.display = 'flex';
    _iniciarCamara();
  }

  function cerrarScanner() {
    _detenerCamara();
    document.getElementById('modalScanner').style.display = 'none';
  }

  /** Genera código de barras imprimible (CODE128) a partir del código de producto. */
  function mostrarCodigoBarras(codigo) {
    const modal = document.getElementById('modalBarcode');
    const tit   = document.getElementById('barcodeTitulo');
    const svg   = document.getElementById('barcodeSvg');
    if (!modal || !tit || !svg) return;
    tit.textContent = String(codigo);
    svg.innerHTML = '';
    try {
      if (typeof JsBarcode === 'undefined') {
        Render.toast('Biblioteca JsBarcode sin conexión. Comprueba internet.', 'error');
        svg.textContent = String(codigo);
      } else {
        JsBarcode(svg, String(codigo), {
          format: 'CODE128', displayValue: true, fontSize: 14, height: 70,
          margin: 10, marginLeft: 24, marginRight: 24, width: 2, background: '#ffffff',
        });
      }
    } catch (e) {
      Render.toast('Código incompatible con barcode: usa letras ASCII o dígitos. ' + (e.message || ''), 'error');
      svg.textContent = String(codigo);
    }
    modal.style.display = 'flex';
  }

  function cerrarModalBarcode() {
    const m = document.getElementById('modalBarcode');
    if (m) m.style.display = 'none';
  }

  function _requiereAdmin(mensaje) {
    if (!Auth.esAdmin()) {
      Render.toast(mensaje || 'Solo el administrador puede gestionar códigos de barras.', 'error');
      return false;
    }
    return true;
  }

  // ──────────────────────────────────────────────────────────
  // REPORTES POR PERÍODO Y CIERRE MENSUAL
  // ──────────────────────────────────────────────────────────
  /** Ventas de todos los ciclos (cierres + ciclo en curso), sin repetidos. */
  function _ventasHistoricas() {
    return Reportes.unirSinRepetidos(...state.cierres.map(c => c.ventas), state.ventas);
  }

  function _gastosHistoricos() {
    return Reportes.unirSinRepetidos(...state.cierres.map(c => c.gastos), state.gastos);
  }

  const _iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  /** "aaaa-mm-dd" (input date) → Date local, o null. */
  function _fechaInput(v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }

  function _initFiltrosReporte() {
    const hoy = new Date();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('repSemanaRef', _iso(hoy));
    set('repMes', String(hoy.getMonth()));
    set('repDesde', _iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)));
    set('repHasta', _iso(hoy));
    _modoReporte = 'mes';
    Render.reporteControles(_modoReporte);
  }

  function setModoReporte(modo) {
    _modoReporte = modo;
    Render.reporteControles(modo);
    _renderReporte();
  }

  function moverSemanaReporte(delta) {
    const el = document.getElementById('repSemanaRef');
    const ref = _fechaInput(el && el.value) || new Date();
    ref.setDate(ref.getDate() + 7 * delta);
    el.value = _iso(ref);
    _renderReporte();
  }

  function aplicarFiltroReporte() { _renderReporte(); }

  /** Rango según el modo: { desde, hasta, texto, invalido?, todo? } */
  function _rangoReporte() {
    const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };
    if (_modoReporte === 'todo') return { desde: null, hasta: null, todo: true, texto: 'Todo el historial (incluye meses cerrados)' };

    if (_modoReporte === 'semana') {
      const r = Reportes.rangoSemana(_fechaInput(val('repSemanaRef')) || new Date());
      return { ...r, texto: `Semana del ${Reportes.fmtFecha(r.desde)} al ${Reportes.fmtFecha(r.hasta)}` };
    }

    if (_modoReporte === 'rango') {
      const desde = _fechaInput(val('repDesde'));
      const hasta = _fechaInput(val('repHasta'));
      if (desde && hasta && desde > hasta) {
        return { desde, hasta, invalido: true, texto: 'Rango inválido: la fecha inicial es posterior a la final.' };
      }
      const t = [desde ? `desde el ${Reportes.fmtFecha(desde)}` : 'desde el inicio', hasta ? `hasta el ${Reportes.fmtFecha(hasta)}` : 'hasta hoy'].join(' ');
      return { desde, hasta, texto: `Rango personalizado: ${t}` };
    }

    const anio = parseInt(val('repAnio')) || new Date().getFullYear();
    const mes  = parseInt(val('repMes'));
    const r = Reportes.rangoMes(anio, isNaN(mes) ? new Date().getMonth() : mes);
    return { ...r, texto: `${Reportes.nombreMes(r.desde.getMonth())} ${anio} (${Reportes.fmtFecha(r.desde)} – ${Reportes.fmtFecha(r.hasta)})` };
  }

  function _renderReporte() {
    if (!document.getElementById('page-reportes')) return;
    const todasV = _ventasHistoricas();
    const todasG = _gastosHistoricos();

    // años disponibles para el selector de mes
    const anios = new Set([new Date().getFullYear()]);
    [...todasV, ...todasG].forEach(x => { const f = Reportes.fechaDe(x); if (f) anios.add(f.getFullYear()); });
    const lista = [...anios].sort((a, b) => b - a);
    const sel = document.getElementById('repAnio');
    const previo = sel && sel.value ? parseInt(sel.value) : new Date().getFullYear();
    Render.reporteAnios(lista, lista.includes(previo) ? previo : lista[0]);

    const r = _rangoReporte();
    let ventasR, gastosR;
    if (r.todo) { ventasR = todasV; gastosR = todasG; }
    else if (r.invalido) { ventasR = []; gastosR = []; }
    else {
      ventasR = Reportes.filtrarPorRango(todasV, r.desde, r.hasta);
      gastosR = Reportes.filtrarPorRango(todasG, r.desde, r.hasta);
    }
    const activas = new Set(state.ventas.map(v => v.id));
    Render.reporte({
      periodoTexto: r.texto,
      resumen: Reportes.resumen(ventasR, gastosR),
      productos: Reportes.agruparProductos(ventasR),
      items: ventasR.map(v => ({ v, archivada: !activas.has(v.id) })),
      esAdmin: Auth.esAdmin(),
    });
  }

  /** Reporte automático del mes (ciclo) en curso, en el Dashboard. */
  function _renderCiclo() {
    const per = Reportes.periodoDe(state.ventas);
    Render.cicloActual({
      periodoTexto: per
        ? `Ciclo actual: del ${Reportes.fmtFecha(per.desde)} al ${Reportes.fmtFecha(per.hasta)} · ${state.ventas.length} ${state.ventas.length === 1 ? 'venta' : 'ventas'}`
        : 'Ciclo actual sin ventas todavía.',
      resumen: Reportes.resumen(state.ventas, state.gastos),
      productos: Reportes.agruparProductos(state.ventas),
    });
  }

  /**
   * Cierre mensual (solo admin): guarda el reporte del ciclo y lo reinicia.
   * Las ventas y gastos del ciclo se archivan en el cierre (siguen en Reportes);
   * el panel de ventas, el dashboard y los contadores de vendidos vuelven a cero.
   */
  function cerrarMes() {
    if (!_requiereAdmin('Solo el administrador puede cerrar el mes.')) return;
    if (!state.ventas.length) {
      Render.toast('No hay ventas en el ciclo actual para cerrar.', 'warn');
      return;
    }
    const res = Reportes.resumen(state.ventas, state.gastos);
    if (!confirm(
      `¿Cerrar el mes y reiniciar las ventas?\n\n` +
      `Ventas brutas: ${_fmt(res.ventasBrutas)}\n` +
      `Costo de mercancía: ${_fmt(res.costo)}\n` +
      `Gastos extra: ${_fmt(res.gastos)}\n` +
      `Ganancia neta: ${_fmt(res.gananciaNeta)}\n\n` +
      `Se guardará el reporte del cierre y las ventas y gastos del ciclo se archivarán ` +
      `(seguirán disponibles en Reportes). El panel de ventas, el dashboard y los contadores ` +
      `de vendidos volverán a cero. Esta acción no se puede deshacer.`
    )) return;

    const ses = Auth.getSesion();
    const cierre = Reportes.crearCierre(state.cierres, {
      ventas: state.ventas,
      gastos: state.gastos,
      usuario: ses && (ses.nombre || ses.usuario),
    });
    state.cierres = [...state.cierres, cierre];
    state.ventas = [];
    state.gastos = [];
    _guardarYRenderizar();
    Render.toast(`✔ Mes cerrado (${cierre.folio}). Ventas reiniciadas.`);
    Render.modalCierre(cierre);
  }

  function verCierre(id) {
    if (!_requiereAdmin('Solo el administrador puede ver los cierres.')) return;
    const c = state.cierres.find(x => x.id === id);
    if (c) Render.modalCierre(c);
  }

  function cerrarModalCierre() { Render.cerrarModalCierre(); }

  // ──────────────────────────────────────────────────────────
  // REABASTECIMIENTO (indicador numérico + lista)
  // ──────────────────────────────────────────────────────────
  function _itemsReabasto() {
    return state.productos
      .map((p, i) => ({ p, i }))
      .filter(x => Productos.necesitaReabasto(x.p))
      .sort((a, b) => a.p.cantidad - b.p.cantidad);
  }

  function abrirReabasto() {
    Render.modalReabasto(_itemsReabasto(), Auth.esAdmin(), Productos.STOCK_MINIMO);
  }

  function cerrarReabasto() { Render.cerrarModalReabasto(); }

  /** Lleva la variante al formulario de inventario para registrar la reposición. */
  function reabastecer(i) {
    if (!_requiereAdmin('Solo el administrador puede reabastecer inventario.')) return;
    const p = state.productos[i];
    if (!p) return;
    Render.cerrarModalReabasto();
    navegarA('inventario');
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('codBarras', p.codigo);
    set('nombre', p.nombre);
    set('color', p.color || '');
    set('talla', p.talla);
    set('precio', p.precio);
    set('cantidad', '');
    autocompletarDesdeCodigo();
    const cant = document.getElementById('cantidad');
    if (cant) cant.focus();
    Render.toast('Indica la cantidad a reponer y pulsa Guardar.', 'warn');
  }

  // ──────────────────────────────────────────────────────────
  // RETIROS DE VENTAS BRUTAS (solo administrador)
  // ──────────────────────────────────────────────────────────
  function registrarRetiro() {
    if (!_requiereAdmin('Solo el administrador puede retirar dinero de las ventas.')) return;
    const inMonto = document.getElementById('montoRetiro');
    const inNota  = document.getElementById('notaRetiro');
    const monto   = parseFloat(inMonto.value);
    const disp    = Retiros.disponible(_ventasHistoricas(), state.retiros);

    const error = Retiros.validar(monto, disp);
    if (error) { Render.toast(error, 'error'); return; }

    if (!confirm(
      `¿Retirar ${_fmt(monto)} de las ventas brutas?\n\nDisponible: ${_fmt(disp)} → ${_fmt(disp - monto)}\nEl registro no se puede editar ni borrar.`
    )) return;

    const ses = Auth.getSesion();
    const retiro = Retiros.crear(state.retiros, monto, {
      disponibleAntes: disp,
      usuario: ses && (ses.nombre || ses.usuario),
      nota: inNota ? inNota.value : '',
    });
    state.retiros = [...state.retiros, retiro];
    inMonto.value = '';
    if (inNota) inNota.value = '';
    _guardarYRenderizar();
    Render.toast(`✔ Retiro ${retiro.folio} por ${_fmt(monto)} registrado.`);
    Render.modalTicketRetiro(Retiros.generarTicketTexto(retiro));   // ticket automático
  }

  function verTicketRetiro(id) {
    if (!_requiereAdmin('Solo el administrador puede ver los retiros.')) return;
    const r = state.retiros.find(x => x.id === id);
    if (r) Render.modalTicketRetiro(Retiros.generarTicketTexto(r));
  }

  function cerrarTicketRetiro() { Render.cerrarModalTicketRetiro(); }

  function _registrarHistorialCodigo({ tipo, codigoAnterior, codigoNuevo, nombre, talla }) {
    const entry = {
      id: Date.now(),
      fecha: new Date().toISOString(),
      tipo,
      codigoAnterior: codigoAnterior == null ? '' : String(codigoAnterior),
      codigoNuevo: String(codigoNuevo),
      nombre: String(nombre),
      talla: String(talla),
    };
    state.historialCodigos = [...state.historialCodigos, entry].slice(-500);
  }

  function _sincronizarVentasCodigoProducto(codigoViejo, codigoNuevo) {
    if (String(codigoViejo) === String(codigoNuevo)) return;
    state.ventas = state.ventas.map(v =>
      String(v.cod) === String(codigoViejo) ? { ...v, cod: codigoNuevo } : v
    );
  }

  function _indiceProductoEtiqueta() {
    const sel = document.getElementById('selectProductoCodigo');
    if (!sel || sel.value === '') return -1;
    const i = parseInt(sel.value, 10);
    return Number.isNaN(i) ? -1 : i;
  }

  function rellenarCodigoNuevoProducto() {
    if (!_requiereAdmin()) return;
    const el = document.getElementById('codBarras');
    if (!el) return;
    el.value = Productos.generarCodigoUnico(state.productos);
    Render.toast('Código único generado. Completa datos y pulsa Guardar.');
  }

  function adminGenerarCodigoAsignar() {
    if (!_requiereAdmin()) return;
    const i = _indiceProductoEtiqueta();
    if (i < 0 || !state.productos[i]) {
      Render.toast('Selecciona un producto.', 'error');
      return;
    }
    const p = state.productos[i];
    const tenia = String(p.codigo || '').trim();
    const grupo = tenia ? Productos.buscarVariantes(state.productos, tenia) : [p];
    const multi = grupo.length > 1;
    if (
      tenia &&
      !confirm(
        'Este producto ya tiene código.\n\n¿Generar uno nuevo y reemplazarlo?\nLas etiquetas antiguas dejarán de ser válidas. Las ventas guardadas se actualizarán al nuevo código.' +
        (multi ? `\n\nEl cambio aplica a las ${grupo.length} variantes que comparten este código.` : '')
      )
    ) {
      return;
    }
    const nuevo = Productos.generarCodigoUnico(state.productos);

    const ahora = new Date().toISOString();
    const r = tenia
      ? Productos.reasignarCodigoGrupo(state.productos, tenia, nuevo, { registradoEn: ahora })
      : Productos.asignarCodigoEnIndice(state.productos, i, nuevo, { registradoEn: ahora });
    if (r.error) {
      Render.toast(r.error, 'error');
      return;
    }
    if (tenia) _sincronizarVentasCodigoProducto(tenia, nuevo);
    state.productos = r.lista;
    _registrarHistorialCodigo({
      tipo: tenia ? 'regenerado' : 'asignado',
      codigoAnterior: tenia,
      codigoNuevo: nuevo,
      nombre: p.nombre,
      talla: grupo.map(g => (g.color ? g.color + '/' : '') + g.talla).join(', '),
    });
    _guardarYRenderizar();
    Render.toast(tenia ? 'Código reemplazado y sincronizado con ventas.' : 'Código asignado al producto.');
  }

  function adminCambiarCodigoManual() {
    if (!_requiereAdmin()) return;
    const i = _indiceProductoEtiqueta();
    if (i < 0 || !state.productos[i]) {
      Render.toast('Selecciona un producto.', 'error');
      return;
    }
    const input = document.getElementById('nuevoCodigoManualPrenda');
    const nuevo = (input && input.value.trim()) || '';
    if (!nuevo) {
      Render.toast('Escribe el nuevo código.', 'error');
      return;
    }
    const p = state.productos[i];
    const viejo = String(p.codigo || '').trim();
    if (viejo === nuevo) {
      Render.toast('El código es el mismo.', 'warn');
      return;
    }
    const grupo = viejo ? Productos.buscarVariantes(state.productos, viejo) : [p];
    if (
      !confirm(
        '¿Cambiar el código de barras de forma manual?\n\nComprueba que sea único y compatible con tu pistola (CODE128). Las ventas antiguas con el código anterior se actualizarán.' +
        (grupo.length > 1 ? `\n\nEl cambio aplica a las ${grupo.length} variantes que comparten este código.` : '')
      )
    ) {
      return;
    }
    const meta = { registradoEn: new Date().toISOString() };
    const r = viejo
      ? Productos.reasignarCodigoGrupo(state.productos, viejo, nuevo, meta)
      : Productos.asignarCodigoEnIndice(state.productos, i, nuevo, meta);
    if (r.error) {
      Render.toast(r.error, 'error');
      return;
    }
    if (viejo) _sincronizarVentasCodigoProducto(viejo, nuevo);
    state.productos = r.lista;
    _registrarHistorialCodigo({
      tipo: 'cambiado',
      codigoAnterior: viejo,
      codigoNuevo: nuevo,
      nombre: p.nombre,
      talla: grupo.map(g => (g.color ? g.color + '/' : '') + g.talla).join(', '),
    });
    if (input) input.value = '';
    _guardarYRenderizar();
    Render.toast('Código actualizado.');
  }

  function _pintarSvgBarcode(svgEl, codigo) {
    if (!svgEl) return;
    svgEl.innerHTML = '';
    try {
      if (typeof JsBarcode !== 'undefined') {
        JsBarcode(svgEl, String(codigo), {
          format: 'CODE128',
          displayValue: true,
          fontSize: 14,
          height: 70,
          margin: 10,
          marginLeft: 24,
          marginRight: 24,
          width: 2,
          background: '#ffffff',
        });
      } else {
        svgEl.textContent = String(codigo);
      }
    } catch (e) {
      Render.toast('No se pudo dibujar el código: ' + (e.message || ''), 'error');
      svgEl.textContent = String(codigo);
    }
  }

  /** Etiqueta física: únicamente el código de barras (sin nombre, talla, costo ni registro). */
  function adminVerEtiqueta() {
    if (!_requiereAdmin()) return;
    const i = _indiceProductoEtiqueta();
    if (i < 0 || !state.productos[i]) {
      Render.toast('Selecciona un producto.', 'error');
      return;
    }
    const modal = document.getElementById('modalEtiquetaPrenda');
    const svg = document.getElementById('etiquetaBarcodeSvg');
    if (!modal || !svg) return;
    _pintarSvgBarcode(svg, state.productos[i].codigo);
    modal.style.display = 'flex';
  }

  function cerrarModalEtiqueta() {
    const m = document.getElementById('modalEtiquetaPrenda');
    if (m) m.style.display = 'none';
  }

  function adminImprimirEtiqueta() {
    if (!_requiereAdmin()) return;
    adminVerEtiqueta();
    setTimeout(() => window.print(), 250);
  }

  function _mensajeErrorCamara(e) {
    switch (e && e.name) {
      case 'NotAllowedError':
      case 'SecurityError':     return 'Permiso de cámara denegado. Actívalo en la configuración del navegador.';
      case 'NotFoundError':
      case 'OverconstrainedError': return 'No se encontró una cámara disponible.';
      case 'NotReadableError':  return 'La cámara está siendo usada por otra aplicación.';
      default:                  return 'Error al acceder a la cámara: ' + ((e && e.message) || 'desconocido');
    }
  }

  /** Código leído: cierra la cámara y lo procesa como una venta. */
  function _alLeerCodigo(texto) {
    const codigo = String(texto || '').trim();
    if (!codigo) return;
    cerrarScanner();
    if (navigator.vibrate) navigator.vibrate(60);
    document.getElementById('scannerVenta').value = codigo;
    document.getElementById('btnSiguienteVenta').style.display = 'block';
    procesarVenta(codigo);
  }

  /**
   * Cámara trasera en alta resolución con enfoque continuo (los códigos 1D
   * necesitan nitidez). Usa BarcodeDetector nativo si existe (Chrome/Android,
   * más rápido y preciso) y ZXing como respaldo, limitado a formatos de producto.
   */
  async function _iniciarCamara() {
    const sesion = ++_scanSesion;
    const video = document.getElementById('scannerVideo');
    try {
      _scanStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
      });
    } catch (e) {
      if (sesion === _scanSesion) {
        Render.toast(_mensajeErrorCamara(e), 'error');
        cerrarScanner();
      }
      return;
    }
    if (sesion !== _scanSesion) {            // se cerró mientras pedía permiso
      _scanStream.getTracks().forEach(t => t.stop());
      _scanStream = null;
      return;
    }

    video.srcObject = _scanStream;
    try { await video.play(); } catch (_) { /* autoplay ya activo */ }

    // Enfoque continuo si el dispositivo lo soporta
    try {
      const track = _scanStream.getVideoTracks()[0];
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (caps.focusMode && caps.focusMode.includes('continuous')) {
        await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      }
    } catch (_) { /* no soportado: se sigue sin enfoque continuo */ }

    if (sesion !== _scanSesion) return;

    let detector = null;
    if ('BarcodeDetector' in window) {
      try {
        const soportados = await window.BarcodeDetector.getSupportedFormats();
        const formatos = ['code_128', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_39', 'itf', 'qr_code']
          .filter(f => soportados.includes(f));
        if (formatos.length) detector = new window.BarcodeDetector({ formats: formatos });
      } catch (_) { detector = null; }
    }

    if (detector) {
      const ciclo = async () => {
        if (sesion !== _scanSesion) return;
        try {
          if (video.readyState >= 2) {
            const r = await detector.detect(video);
            if (sesion !== _scanSesion) return;
            if (r.length && r[0].rawValue) { _alLeerCodigo(r[0].rawValue); return; }
          }
        } catch (_) { /* frame sin código */ }
        _scanTimer = setTimeout(ciclo, 120);
      };
      ciclo();
      return;
    }

    if (typeof ZXing === 'undefined') {
      Render.toast('La librería de escaneo no cargó. Verifica tu conexión.', 'error');
      cerrarScanner();
      return;
    }
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
      ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8,
      ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E, ZXing.BarcodeFormat.CODE_39,
      ZXing.BarcodeFormat.ITF, ZXing.BarcodeFormat.QR_CODE,
    ]);
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    _scanner = new ZXing.BrowserMultiFormatReader(hints, 150);
    _scanner
      .decodeFromStream(_scanStream, video, (result) => {
        if (result && sesion === _scanSesion) _alLeerCodigo(result.getText());
      })
      .catch(e => {
        if (sesion === _scanSesion) Render.toast('Error al escanear: ' + (e.message || e), 'error');
      });
  }

  function _detenerCamara() {
    _scanSesion++;
    if (_scanTimer) { clearTimeout(_scanTimer); _scanTimer = null; }
    if (_scanner) { try { _scanner.reset(); } catch (_) {} _scanner = null; }
    if (_scanStream) { _scanStream.getTracks().forEach(t => t.stop()); _scanStream = null; }
    const v = document.getElementById('scannerVideo');
    if (v) { try { v.pause(); } catch (_) {} v.srcObject = null; }
  }

  // ──────────────────────────────────────────────────────────
  // BACKUP
  // ──────────────────────────────────────────────────────────
  function exportarDatos() {
    DataManager.exportarBackup(
      state.productos,
      state.ventas,
      state.gastos,
      state.historialCodigos,
      state.retiros,
      state.cierres
    );
    Render.toast('Backup exportado correctamente.');
  }

  function exportarExcel() {
    try {
      DataManager.exportarExcel(
        state.productos,
        state.ventas,
        state.gastos,
        state.historialCodigos,
        state.retiros,
        state.cierres
      );
      Render.toast('Archivo Excel descargado (Productos, Ventas, Gastos, Retiros y Cierres).');
    } catch (err) {
      Render.toast(err.message || 'No se pudo exportar Excel.', 'error');
    }
  }

  function importarDatos(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const datos = DataManager.importarBackup(e.target.result);
        if (confirm('⚠️ Esto reemplazará TODOS los datos actuales. ¿Continuar?')) {
          state = {
            productos: Productos.asegurarIds(datos.productos || []),
            ventas: datos.ventas || [],
            gastos: datos.gastos || [],
            historialCodigos: datos.historialCodigos || [],
            retiros: datos.retiros || [],
            cierres: datos.cierres || [],
          };
          _guardarYRenderizar();
          Render.toast('Importación exitosa.');
        }
      } catch (err) {
        Render.toast('Error al importar: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  // ──────────────────────────────────────────────────────────
  // UI HELPERS
  // ──────────────────────────────────────────────────────────
  function toggleDarkMode() {
    const on = !document.documentElement.classList.contains('dark-mode');
    document.documentElement.classList.toggle('dark-mode', on);
    document.body.classList.toggle('dark-mode', on);
    localStorage.setItem('darkMode', on ? 'true' : 'false');
  }

  function _cargarTema() {
    const raw = localStorage.getItem('darkMode');
    const on  = raw === 'true' || raw === '1';
    document.documentElement.classList.toggle('dark-mode', on);
    document.body.classList.toggle('dark-mode', on);
  }

  function filtrarTabla() {
    Render.filtrarProductos(document.getElementById('buscador').value);
  }

  function toggleVariantes(codigo) { Render.toggleVariantes(codigo); }

  function checkEnter(e) {
    if (e.key === 'Enter') procesarVenta(e.target.value);
  }

  function detectarEntradaManual(valor) {
    document.getElementById('btnSiguienteVenta').style.display = valor.length > 0 ? 'block' : 'none';
  }

  function _limpiarScanner() {
    document.getElementById('scannerVenta').value = '';
    document.getElementById('btnSiguienteVenta').style.display = 'none';
  }

  function _limpiarFormProducto() {
    ['codBarras', 'nombre', 'color', 'talla', 'precio', 'cantidad'].forEach(id => document.getElementById(id).value = '');
    const hint = document.getElementById('hintCodigo');
    if (hint) hint.textContent = '';
  }

  function _fmt(n) { return `$${parseFloat(n).toFixed(2)}`; }

  // ──────────────────────────────────────────────────────────
  // RENDER CENTRAL
  // ──────────────────────────────────────────────────────────
  function _renderizarTodo() {
    const esAdmin       = Auth.esAdmin();
    const totalesVentas = Ventas.calcularTotales(state.ventas);
    const totalGastos   = Gastos.calcularTotal(state.gastos);

    Render.productos(state.productos, esAdmin, p => Ventas.contarVendidos(state.ventas, p.codigo, p.color, p.talla));
    Render.inversion(Productos.calcularInversion(state.productos));
    Render.ventas(state.ventas, esAdmin);
    Render.gastos(state.gastos);
    Render.empleados(Auth.getEmpleados());
    Render.resumen(totalesVentas, totalGastos);
    Render.alertaStock(
      Productos.tieneStockBajo(state.productos),
      Productos.obtenerStockBajo(state.productos)
    );
    Render.graficas(state.ventas, state.gastos);
    Render.selectProductoEtiquetas(state.productos);
    Render.historialCodigosTabla(state.historialCodigos);
    const itemsReabasto = _itemsReabasto();
    Render.reabastoContador(itemsReabasto.length);
    const mr = document.getElementById('modalReabasto');
    if (mr && mr.style.display === 'flex') abrirReabasto();   // lista abierta: se mantiene al día
    Render.retiros(state.retiros, {
      brutas:     Retiros.ventasBrutas(_ventasHistoricas()),
      retirado:   Retiros.totalRetirado(state.retiros),
      disponible: Retiros.disponible(_ventasHistoricas(), state.retiros),
    });
    _renderCiclo();
    Render.historialCierres(state.cierres);
    _renderReporte();
  }

  function _guardarYRenderizar() {
    state.productos = Productos.asegurarIds(state.productos);
    DataManager.guardarTodo(
      state.productos,
      state.ventas,
      state.gastos,
      state.historialCodigos,
      state.retiros,
      state.cierres
    );
    if (Auth.getToken()) {
      ApiClient.syncState(state).catch(() => {});
    }
    _renderizarTodo();
  }

  // ── Exponer la API pública al HTML ─────────────────────────
  return {
    init,
    hacerLogin, hacerLogout, navegarA, toggleSidebar,
    agregarProducto, autocompletarDesdeCodigo, eliminarProd,
    procesarVenta, elegirColor, volverAColores, elegirTalla, cancelarTalla,
    abrirReabasto, cerrarReabasto, reabastecer,
    setModoReporte, moverSemanaReporte, aplicarFiltroReporte,
    cerrarMes, verCierre, cerrarModalCierre, anularVenta, imprimirTicket,
    agregarGasto, eliminarGasto,
    registrarRetiro, verTicketRetiro, cerrarTicketRetiro,
    agregarEmpleado, eliminarEmpleado,
    abrirScanner, cerrarScanner,
    mostrarCodigoBarras, cerrarModalBarcode,
    rellenarCodigoNuevoProducto,
    adminGenerarCodigoAsignar, adminCambiarCodigoManual, adminVerEtiqueta, adminImprimirEtiqueta,
    cerrarModalEtiqueta,
    exportarDatos, exportarExcel, importarDatos,
    toggleDarkMode, filtrarTabla, toggleVariantes, checkEnter, detectarEntradaManual
  };
})();

// ── Punto de entrada ────────────────────────────────────────
window.addEventListener('DOMContentLoaded', App.init);
