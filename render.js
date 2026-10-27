/**
 * render.js — Módulo de Renderizado
 * Responsabilidad: SOLO dibujar en pantalla.
 * No calcula nada. No guarda datos.
 */

const Render = (() => {
  let _chartGanancias = null;
  let _chartGastos    = null;

  // ── Helpers ────────────────────────────────────────────────
  function _q(id)   { return document.getElementById(id); }
  function _fmt(n)  { return `$${parseFloat(n).toFixed(2)}`; }
  /** Escapa texto de usuario (la talla es libre) antes de usarlo en innerHTML. */
  function _esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /** Literal JS seguro para usar dentro de un atributo onclick="...". */
  function _attrJs(v) { return JSON.stringify(String(v)).replace(/"/g, '&quot;'); }

  // ── Muestras de color ──────────────────────────────────────
  const _COLORES_CSS = {
    negro: '#111827', blanco: '#f8fafc', rojo: '#ef4444', azul: '#3b82f6', 'azul marino': '#1e3a8a',
    'azul rey': '#2563eb', celeste: '#7dd3fc', verde: '#22c55e', 'verde oscuro': '#166534',
    amarillo: '#facc15', naranja: '#f97316', morado: '#8b5cf6', violeta: '#8b5cf6', lila: '#c4b5fd',
    rosa: '#f472b6', rosado: '#f472b6', fucsia: '#d946ef', coral: '#fb7185', gris: '#9ca3af',
    'café': '#78350f', cafe: '#78350f', 'marrón': '#78350f', marron: '#78350f', beige: '#e7d3b0',
    crema: '#fff1d6', turquesa: '#14b8a6', vino: '#7f1d1d', mostaza: '#ca8a04', dorado: '#d4a017',
    plateado: '#cbd5e1', caqui: '#bdb76b', khaki: '#bdb76b', 'salmón': '#fa8072', salmon: '#fa8072',
  };
  /** Círculo de color (colores conocidos) o inicial en gris (nombres libres). */
  function _swatch(nombre) {
    const n = String(nombre || '').trim();
    if (!n) return `<span class="swatch swatch--na">—</span>`;
    const css = _COLORES_CSS[n.toLowerCase()];
    return css
      ? `<span class="swatch" style="background:${css}"></span>`
      : `<span class="swatch swatch--na">${_esc(n.charAt(0).toUpperCase())}</span>`;
  }

  // ── Tabla de productos: una fila por código, con variantes desplegables ──
  const _expandidos = new Set();   // códigos con el desglose abierto

  function productos(lista, esAdmin, vendidosDe) {
    const vendidos = typeof vendidosDe === 'function' ? vendidosDe : () => 0;
    const tbody = _q('lista-productos');
    if (!tbody) return;

    if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-row">Sin productos registrados</td></tr>`;
      return;
    }

    // Agrupa por código conservando el índice real de cada variante (eliminarProd lo usa)
    const orden = [];
    const grupos = new Map();
    lista.forEach((p, i) => {
      const k = String(p.codigo).trim();
      if (!grupos.has(k)) { grupos.set(k, []); orden.push(k); }
      grupos.get(k).push(i);
    });

    tbody.innerHTML = orden.map(k => {
      const idxs  = grupos.get(k);
      const items = idxs.map(i => lista[i]);
      const stockTotal = items.reduce((a, p) => a + (parseInt(p.cantidad) || 0), 0);
      const vendTotal  = items.reduce((a, p) => a + vendidos(p), 0);
      const costos = items.map(p => parseFloat(p.precio) || 0);
      const cMin = Math.min(...costos), cMax = Math.max(...costos);
      const costoTxt = cMin === cMax ? _fmt(cMin) : `${_fmt(cMin)} – ${_fmt(cMax)}`;
      const nColores = new Set(items.map(p => String(p.color || '').trim().toLowerCase()).filter(Boolean)).size;
      const nTallas  = new Set(items.map(p => String(p.talla || '').trim().toUpperCase())).size;
      const bajos    = items.filter(Productos.necesitaReabasto).length;
      const abierto  = _expandidos.has(k);
      const busq     = items.map(p => [p.codigo, p.nombre, p.color, p.talla].join(' ')).join(' ');
      const kJs      = _attrJs(k);

      const resumenVar = [
        nColores ? `${nColores} ${nColores === 1 ? 'color' : 'colores'}` : '',
        `${nTallas} ${nTallas === 1 ? 'talla' : 'tallas'}`,
      ].filter(Boolean).join(' · ');

      const principal = `
      <tr class="fila-principal ${abierto ? 'abierta' : ''}" data-cod="${_esc(k)}" data-busq="${_esc(busq)}" onclick="App.toggleVariantes(${kJs})">
        <td class="cel-codigo">
          <button type="button" class="btn-expand" aria-expanded="${abierto}" aria-label="Mostrar u ocultar variantes" title="Mostrar / ocultar variantes" onclick="event.stopPropagation(); App.toggleVariantes(${kJs})"><span class="chev">▸</span></button>
          <code class="cod">${_esc(k)}</code>
        </td>
        <td>${_esc(items[0].nombre)}</td>
        <td>
          <span class="badge badge-talla">${items.length} ${items.length === 1 ? 'variante' : 'variantes'}</span>
          <small class="txt-muted">${resumenVar}</small>
          ${bajos ? `<span class="badge-reabasto">⚠ ${bajos} por reabastecer</span>` : ''}
        </td>
        <td class="mono">${costoTxt}</td>
        <td class="mono">${stockTotal}</td>
        <td class="mono" title="Unidades vendidas de este código">${vendTotal}</td>
        <td class="actions-cell">
          ${esAdmin
            ? `<button type="button" class="btn-icon btn-barcode" onclick="event.stopPropagation(); App.mostrarCodigoBarras(${kJs})" title="Ver / imprimir código de barras">▮</button>`
            : `<span class="txt-muted">—</span>`}
        </td>
      </tr>`;

      const detalleFilas = idxs.map(i => {
        const p = lista[i];
        const bajo = Productos.necesitaReabasto(p);
        return `
          <tr class="${bajo ? 'stock-bajo' : ''}">
            <td>${_swatch(p.color)} ${p.color ? _esc(p.color) : '<span class="txt-muted">Sin color</span>'}</td>
            <td><span class="badge badge-talla">${_esc(p.talla)}</span></td>
            <td class="mono">${_fmt(p.precio)}</td>
            <td class="mono ${bajo ? 'txt-danger' : ''}">${p.cantidad}</td>
            <td class="mono" title="Unidades vendidas de esta variante">${vendidos(p)}</td>
            <td class="actions-cell">
              ${esAdmin ? `<button class="btn-icon btn-danger" onclick="App.eliminarProd(${i})" title="Eliminar esta variante">✕</button>` : ''}
            </td>
          </tr>`;
      }).join('');

      const detalle = `
      <tr class="fila-detalle" data-cod="${_esc(k)}" style="${abierto ? '' : 'display:none;'}">
        <td colspan="7">
          <div class="detalle-wrap">
            <table class="tabla-detalle">
              <thead><tr><th>Color</th><th>Talla</th><th>Costo</th><th>Stock</th><th>Vendidos</th><th></th></tr></thead>
              <tbody>${detalleFilas}</tbody>
            </table>
          </div>
        </td>
      </tr>`;

      return principal + detalle;
    }).join('');

    const buscador = _q('buscador');
    if (buscador && buscador.value) filtrarProductos(buscador.value);   // mantiene la búsqueda activa
  }

  /** Abre o cierra el desglose de variantes de un código (sin volver a dibujar la tabla). */
  function toggleVariantes(codigo, forzar) {
    const k = String(codigo).trim();
    const abrir = forzar !== undefined ? forzar : !_expandidos.has(k);
    if (abrir) _expandidos.add(k); else _expandidos.delete(k);
    const tbody = _q('lista-productos');
    if (!tbody) return;
    tbody.querySelectorAll('tr.fila-principal, tr.fila-detalle').forEach(tr => {
      if (tr.dataset.cod !== k) return;
      if (tr.classList.contains('fila-principal')) {
        tr.classList.toggle('abierta', abrir);
        const b = tr.querySelector('.btn-expand');
        if (b) b.setAttribute('aria-expanded', String(abrir));
      } else {
        tr.style.display = abrir ? '' : 'none';
      }
    });
  }

  /** Busca por código, nombre, color o talla; el desglose solo se ve si está abierto y el código coincide. */
  function filtrarProductos(texto) {
    const f = String(texto || '').toUpperCase();
    const tbody = _q('lista-productos');
    if (!tbody) return;
    tbody.querySelectorAll('tr.fila-principal').forEach(tr => {
      const coincide = !f || (tr.dataset.busq + ' ' + tr.textContent).toUpperCase().includes(f);
      tr.style.display = coincide ? '' : 'none';
      const det = tr.nextElementSibling;
      if (det && det.classList.contains('fila-detalle')) {
        det.style.display = coincide && _expandidos.has(tr.dataset.cod) ? '' : 'none';
      }
    });
  }

  // ── Tabla de ventas (ventas + reportes comparten la misma fila renderizada) ──
  function ventas(lista, esAdmin) {
    const tbodies = [_q('tabla-ventas-solo')].filter(Boolean);
    if (!tbodies.length) return;

    const html = !lista.length
      ? `<tr><td colspan="5" class="empty-row">Sin ventas registradas</td></tr>`
      : lista.slice().reverse().map(v => `
      <tr>
        <td>${_esc(v.nombre)} <span class="badge badge-talla">${v.color ? _esc(v.color) + ' / ' : ''}${_esc(v.talla)}</span><br>
          <small class="txt-muted">${_esc(v.fecha)} ${_esc(v.hora)}</small></td>
        <td class="mono">${_fmt(v.costo)}</td>
        <td class="mono">${_fmt(v.venta)}</td>
        <td class="mono ${v.ganancia >= 0 ? 'txt-success' : 'txt-danger'}">${_fmt(v.ganancia)}</td>
        <td class="actions-cell">
          ${esAdmin
            ? `<button class="btn-sm btn-warn" onclick="App.anularVenta(${v.id})">Anular</button>`
            : ''}
          <button class="btn-sm btn-info" onclick="App.imprimirTicket(${v.id})">🎫 Ticket</button>
        </td>
      </tr>`).join('');

    tbodies.forEach(tbody => { tbody.innerHTML = html; });
  }

  // ── Tabla de gastos ────────────────────────────────────────
  function gastos(lista) {
    const tbody = _q('tabla-gastos-solo');
    if (!tbody) return;

    if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-row">Sin gastos registrados</td></tr>`;
      return;
    }

    tbody.innerHTML = lista.slice().reverse().map(g => `
      <tr>
        <td>${g.nombre}</td>
        <td class="mono txt-danger">${_fmt(g.monto)}</td>
        <td class="txt-muted">${g.fecha}</td>
        <td>
          <button class="btn-icon btn-danger" onclick="App.eliminarGasto(${g.id})" title="Eliminar">✕</button>
        </td>
      </tr>`).join('');
  }

  // ── Retiros de ventas brutas (solo admin) ──────────────────
  function retiros(lista, tot) {
    _setText('totalVentasBrutas', _fmt(tot.brutas));
    _setText('totalRetirado', _fmt(tot.retirado));
    _setText('disponibleRetiro', _fmt(tot.disponible));

    const tbody = _q('tabla-retiros');
    if (!tbody) return;
    if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-row">Sin retiros registrados</td></tr>`;
      return;
    }
    tbody.innerHTML = lista.slice().reverse().map(r => `
      <tr>
        <td><code class="cod">${_esc(r.folio)}</code></td>
        <td class="txt-muted">${_esc(r.fecha)} ${_esc(r.hora)}</td>
        <td>${_esc(r.usuario)}</td>
        <td class="mono txt-danger">${_fmt(r.monto)}</td>
        <td class="mono">${_fmt(r.disponibleDespues)}</td>
        <td class="txt-muted">${_esc(r.nota) || '—'}</td>
        <td><button class="btn-icon" onclick="App.verTicketRetiro(${Number(r.id)})" title="Ver / imprimir ticket">🧾</button></td>
      </tr>`).join('');
  }

  function modalTicketRetiro(texto) {
    const modal = _q('modalTicketRetiro');
    const pre   = _q('ticketRetiroTexto');
    if (!modal || !pre) return;
    pre.textContent = texto;
    modal.style.display = 'flex';
  }

  function cerrarModalTicketRetiro() {
    const modal = _q('modalTicketRetiro');
    if (modal) modal.style.display = 'none';
  }

  // ── Reportes por período, ciclo y cierres ──────────────────
  const _variante = r => `${r.color ? r.color + ' / ' : ''}${r.talla}`;

  /** Filas de "productos vendidos" + fila de totales. */
  function _filasProductos(rows, res) {
    if (!rows.length) {
      return `<tr><td colspan="6" class="empty-row">Sin productos vendidos en este período</td></tr>`;
    }
    const filas = rows.map(r => `
      <tr>
        <td>${_esc(r.nombre)}<br><code class="cod">${_esc(r.codigo)}</code></td>
        <td>${_esc(_variante(r))}</td>
        <td class="mono">${r.unidades}</td>
        <td class="mono">${_fmt(r.ventas)}</td>
        <td class="mono">${_fmt(r.costo)}</td>
        <td class="mono ${r.ganancia >= 0 ? 'txt-success' : 'txt-danger'}">${_fmt(r.ganancia)}</td>
      </tr>`).join('');
    const total = `
      <tr class="fila-total">
        <td colspan="2">Total</td>
        <td class="mono">${res.unidades}</td>
        <td class="mono">${_fmt(res.ventasBrutas)}</td>
        <td class="mono">${_fmt(res.costo)}</td>
        <td class="mono">${_fmt(res.gananciaBruta)}</td>
      </tr>`;
    return filas + total;
  }

  /** Líneas de resumen: ventas brutas, costo de mercancía, ganancia bruta, gastos y ganancia neta. */
  function _lineasResumen(r) {
    const linea = (t, v, cls = '') =>
      `<div class="resumen-linea"><span>${t}</span><strong class="mono ${cls}">${_fmt(v)}</strong></div>`;
    return linea('Ventas brutas', r.ventasBrutas) +
      linea('Costo de mercancía', r.costo) +
      linea('Ganancia bruta (ventas − costo)', r.gananciaBruta) +
      linea('Gastos extra', r.gastos) +
      linea('Ganancia neta', r.gananciaNeta, r.gananciaNeta >= 0 ? 'txt-success' : 'txt-danger');
  }

  function reporteControles(modo) {
    document.querySelectorAll('.filtro-tab').forEach(b =>
      b.classList.toggle('active', b.dataset.modo === modo));
    document.querySelectorAll('[data-ctl]').forEach(el => {
      el.style.display = el.dataset.ctl === modo ? 'flex' : 'none';
    });
  }

  function reporteAnios(anios, seleccionado) {
    const sel = _q('repAnio');
    if (!sel) return;
    sel.innerHTML = anios.map(a => `<option value="${a}">${a}</option>`).join('');
    sel.value = String(seleccionado);
  }

  /** Reporte del período filtrado. items: [{ v, archivada }] */
  function reporte({ periodoTexto, resumen: res, productos: prods, items, esAdmin }) {
    _setText('repPeriodoTexto', periodoTexto);
    _setText('totalVentas2', _fmt(res.ventasBrutas));
    _setText('totalCosto2', _fmt(res.costo));
    _setText('totalGastosExtra2', _fmt(res.gastos));
    _setText('totalGanancia2', _fmt(res.gananciaNeta));
    const elG = _q('totalGanancia2');
    if (elG) elG.className = res.gananciaNeta >= 0 ? 'stat-value txt-success' : 'stat-value txt-danger';
    _setText('repConteo', `${res.numVentas} ${res.numVentas === 1 ? 'venta' : 'ventas'} · ${res.unidades} ${res.unidades === 1 ? 'unidad' : 'unidades'}`);

    const tp = _q('tabla-reporte-productos');
    if (tp) tp.innerHTML = _filasProductos(prods, res);

    const tv = _q('tabla-ventas-solo2');
    if (tv) {
      tv.innerHTML = !items.length
        ? `<tr><td colspan="5" class="empty-row">Sin ventas en este período</td></tr>`
        : items.slice().reverse().map(({ v, archivada }) => `
        <tr>
          <td>${_esc(v.nombre)} <span class="badge badge-talla">${v.color ? _esc(v.color) + ' / ' : ''}${_esc(v.talla)}</span><br>
            <small class="txt-muted">${_esc(v.fecha)} ${_esc(v.hora)}${archivada ? ' · cerrada' : ''}</small></td>
          <td class="mono">${_fmt(v.costo)}</td>
          <td class="mono">${_fmt(v.venta)}</td>
          <td class="mono ${v.ganancia >= 0 ? 'txt-success' : 'txt-danger'}">${_fmt(v.ganancia)}</td>
          <td class="actions-cell">
            ${esAdmin && !archivada ? `<button class="btn-sm btn-warn" onclick="App.anularVenta(${v.id})">Anular</button>` : ''}
            <button class="btn-sm btn-info" onclick="App.imprimirTicket(${v.id})">🎫 Ticket</button>
          </td>
        </tr>`).join('');
    }
  }

  /** Reporte automático del ciclo en curso (Dashboard). */
  function cicloActual({ periodoTexto, resumen: res, productos: prods }) {
    _setText('cicloPeriodo', periodoTexto);
    const tp = _q('tabla-ciclo-productos');
    if (tp) tp.innerHTML = _filasProductos(prods, res);
    const rs = _q('cicloResumen');
    if (rs) rs.innerHTML = _lineasResumen(res);
  }

  function historialCierres(lista) {
    const tbody = _q('tabla-cierres');
    if (!tbody) return;
    if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="empty-row">Aún no hay cierres registrados</td></tr>`;
      return;
    }
    tbody.innerHTML = lista.slice().reverse().map(c => `
      <tr>
        <td><code class="cod">${_esc(c.folio)}</code></td>
        <td>${_esc(c.mes)}</td>
        <td class="txt-muted">${_esc(c.periodoDesde)} – ${_esc(c.periodoHasta)}</td>
        <td class="mono">${_fmt(c.resumen.ventasBrutas)}</td>
        <td class="mono">${_fmt(c.resumen.costo)}</td>
        <td class="mono ${c.resumen.gananciaNeta >= 0 ? 'txt-success' : 'txt-danger'}">${_fmt(c.resumen.gananciaNeta)}</td>
        <td><button class="btn-icon" onclick="App.verCierre(${Number(c.id)})" title="Ver reporte del cierre">📄</button></td>
      </tr>`).join('');
  }

  function modalCierre(c) {
    const modal = _q('modalCierre');
    if (!modal) return;
    _setText('cierreTitulo', `Reporte de cierre — ${c.mes}`);
    _setText('cierreInfo', `Folio ${c.folio} · Período ${c.periodoDesde} al ${c.periodoHasta} · Cerrado el ${c.fecha} ${c.hora} por ${c.usuario}`);
    const tp = _q('tabla-cierre-productos');
    if (tp) tp.innerHTML = _filasProductos(c.productos, c.resumen);
    const rs = _q('cierreResumen');
    if (rs) rs.innerHTML = _lineasResumen(c.resumen);
    modal.style.display = 'flex';
  }

  function cerrarModalCierre() {
    const modal = _q('modalCierre');
    if (modal) modal.style.display = 'none';
  }

  // ── Tabla de empleados ─────────────────────────────────────
  function empleados(lista) {
    const tbody = _q('tabla-empleados');
    if (!tbody) return;

    if (!lista.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-row">Sin empleados registrados</td></tr>`;
      return;
    }

    tbody.innerHTML = lista.map(e => `
      <tr>
        <td>${e.nombre}</td>
        <td><code class="cod">${e.usuario}</code></td>
        <td><span class="badge badge-rol">Empleado</span></td>
        <td>
          <button class="btn-icon btn-danger" onclick="App.eliminarEmpleado(${e.id})" title="Eliminar">✕</button>
        </td>
      </tr>`).join('');
  }

  // ── Resumen financiero ─────────────────────────────────────
  function resumen(totalesVentas, totalGastos) {
    const ganancia = totalesVentas.totalVentas - totalesVentas.totalCosto - totalGastos;

    const tv = _fmt(totalesVentas.totalVentas);
    const tc = _fmt(totalesVentas.totalCosto);
    const tg = _fmt(totalGastos);
    const gn = _fmt(ganancia);

    _setText('totalVentas', tv);
    _setText('totalCosto', tc);
    _setText('totalGastosExtra', tg);
    _setText('totalGanancia', gn);

    const clsG = ganancia >= 0 ? 'stat-value txt-success' : 'stat-value txt-danger';
    const elG  = _q('totalGanancia');
    if (elG) elG.className = clsG;
  }

  function _setText(id, text) {
    const el = _q(id);
    if (el) el.textContent = text;
  }

  // ── Dinero invertido en inventario ─────────────────────────
  function inversion(total) {
    _setText('totalInvertido', _fmt(total));
  }

  // ── Alerta de stock bajo ───────────────────────────────────
  function alertaStock(hayBajo, productosBajos) {
    const el = _q('alertaStock');
    if (!el) return;
    if (hayBajo) {
      const n = productosBajos.length;
      el.textContent = `⚠️ ${n} ${n === 1 ? 'producto necesita' : 'productos necesitan'} reabastecimiento — toca para ver la lista`;
      el.style.display = 'flex';
    } else {
      el.style.display = 'none';
    }
  }

  // ── Indicador numérico de reabastecimiento (barra superior) ─
  function reabastoContador(n) {
    const el = _q('reabastoContador');
    if (!el) return;
    el.textContent = String(n);
    el.className = 'reabasto-badge' + (n > 0 ? '' : ' reabasto-badge--ok');
    const btn = _q('btnReabasto');
    if (btn) btn.setAttribute('aria-label', `Productos por reabastecer: ${n}`);
  }

  // ── Lista de productos por reabastecer ─────────────────────
  // items: [{ p, i }] con i = índice real en state.productos
  function modalReabasto(items, esAdmin, umbral) {
    const modal = _q('modalReabasto');
    const tbody = _q('tabla-reabasto');
    const resumen = _q('reabastoResumen');
    if (!modal || !tbody) return;
    if (resumen) {
      resumen.textContent = items.length
        ? `${items.length} ${items.length === 1 ? 'variante tiene' : 'variantes tienen'} ${umbral} ${umbral === 1 ? 'unidad' : 'unidades'} o menos.`
        : `Todas las variantes tienen más de ${umbral} ${umbral === 1 ? 'unidad' : 'unidades'}.`;
    }
    tbody.innerHTML = items.length
      ? items.map(({ p, i }) => `
        <tr>
          <td>${_esc(p.nombre)}<br><code class="cod">${_esc(p.codigo)}</code></td>
          <td>${_swatch(p.color)} ${p.color ? _esc(p.color) : '<span class="txt-muted">—</span>'}</td>
          <td><span class="badge badge-talla">${_esc(p.talla)}</span></td>
          <td class="mono txt-danger">${p.cantidad}</td>
          <td>${esAdmin ? `<button type="button" class="btn-ghost" onclick="App.reabastecer(${i})">+ Reponer</button>` : ''}</td>
        </tr>`).join('')
      : `<tr><td colspan="5" class="empty-row">Nada por reabastecer ✔</td></tr>`;
    modal.style.display = 'flex';
  }

  function cerrarModalReabasto() {
    const modal = _q('modalReabasto');
    if (modal) modal.style.display = 'none';
  }

  // ── Gráficas Chart.js (alineado al panel clásico: últimas 5 ventas + línea de gastos) ──
  function graficas(ventasList, gastosList) {
    _renderGraficaVentas(ventasList.slice(-5));
    _renderGraficaGastos(gastosList.slice(-5));
  }

  function _renderGraficaVentas(datos) {
    const ctx = _q('graficaGanancias');
    if (!ctx) return;
    if (_chartGanancias) _chartGanancias.destroy();
    _chartGanancias = null;

    if (!datos.length) return;

    _chartGanancias = new Chart(ctx.getContext('2d'), {
      type: 'bar',
      data: {
        labels  : datos.map(v => v.nombre.slice(0, 12)),
        datasets: [{
          label          : 'Ganancia ($)',
          data           : datos.map(v => v.ganancia),
          backgroundColor: datos.map(v => v.ganancia >= 0 ? 'rgba(34,197,94,0.8)' : 'rgba(239,68,68,0.8)'),
          borderRadius   : 6,
          borderSkipped  : false
        }]
      },
      options: {
        responsive        : true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales : { y: { beginAtZero: true } }
      }
    });
  }

  function _renderGraficaGastos(datos) {
    const ctx = _q('graficaGastos');
    if (!ctx) return;
    if (_chartGastos) _chartGastos.destroy();
    _chartGastos = null;

    if (!datos.length) return;

    _chartGastos = new Chart(ctx.getContext('2d'), {
      type: 'line',
      data: {
        labels  : datos.map(g => g.nombre.slice(0, 14)),
        datasets: [{
          label          : 'Gastos ($)',
          data           : datos.map(g => g.monto),
          borderColor    : '#e53e3e',
          backgroundColor: 'rgba(229, 62, 62, 0.12)',
          fill           : true,
          tension        : 0.25,
          borderWidth    : 2,
        }]
      },
      options: {
        responsive         : true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true } },
        scales : { y: { beginAtZero: true } }
      }
    });
  }

  // ── Selector de producto (pestaña Etiquetas): una opción por variante ──
  function selectProductoEtiquetas(lista) {
    const sel = _q('selectProductoCodigo');
    if (!sel) return;
    const previo = sel.value;
    sel.innerHTML = '';
    lista.forEach((p, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = `${p.nombre} — ${p.color ? p.color + ' / ' : ''}talla ${p.talla} — ${p.codigo}`;
      sel.appendChild(o);
    });
    if (previo !== '' && Number(previo) < lista.length) sel.value = previo;
  }

  // ── Historial de cambios de código ─────────────────────────
  function historialCodigosTabla(lista) {
    const tbody = _q('tabla-historial-codigos');
    if (!tbody) return;
    if (!lista || !lista.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty-row">Sin cambios de código registrados</td></tr>`;
      return;
    }
    tbody.innerHTML = lista.slice().reverse().map(h => `
      <tr>
        <td class="txt-muted">${_esc(String(h.fecha || '').replace('T', ' ').slice(0, 16))}</td>
        <td>${_esc(h.tipo)}</td>
        <td>${_esc(h.nombre)}</td>
        <td><span class="badge badge-talla">${_esc(h.talla)}</span></td>
        <td><code class="cod">${_esc(h.codigoAnterior || '—')}</code></td>
        <td><code class="cod">${_esc(h.codigoNuevo)}</code></td>
      </tr>`).join('');
  }

  // ── Modal: elegir color y talla antes de vender (2 pasos) ──
  // Paso 1: solo colores con stock. Paso 2: solo las tallas (y stock) del color elegido;
  // los colores se ocultan. Solo recibe lo disponible (stock > 0).
  // colores: [{ color, stock }]; colorSel: color elegido (o undefined);
  // variantesColor: tallas del color elegido, con su stock.
  function modalTalla(nombre, colores, colorSel, variantesColor, opts = {}) {
    const modal = _q('modalTalla');
    const tit   = _q('tallaModalNombre');
    const cod   = _q('tallaModalCodigo');
    const pasos = _q('tallaModalPasos');
    const caja  = _q('tallaModalOpciones');
    if (!modal || !tit || !caja) return;
    tit.textContent = nombre;
    if (cod) cod.textContent = opts.codigo ? `Código ${opts.codigo}` : '';

    const hayColor = colorSel !== undefined && colorSel !== null;

    if (pasos) {
      pasos.innerHTML = `
        <div class="vm-step ${hayColor ? 'done' : 'active'}"><span class="vm-step-n">${hayColor ? '✓' : '1'}</span>Color</div>
        <div class="vm-step-line ${hayColor ? 'on' : ''}"></div>
        <div class="vm-step ${hayColor ? 'active' : ''}"><span class="vm-step-n">2</span>Talla</div>`;
    }

    if (!hayColor) {
      caja.innerHTML = `
        <p class="vm-hint">Elige un color</p>
        <div class="vm-grid">` +
        colores.map((c, i) => `
          <button type="button" class="talla-opt vm-card color-btn" onclick="App.elegirColor(${i})">
            ${_swatch(c.color)}
            <span class="vm-card-title">${_esc(c.color || 'Sin color')}</span>
            <span class="vm-card-sub">${c.stock} en stock</span>
          </button>`).join('') + `</div>`;
    } else {
      caja.innerHTML = `
        <div class="vm-chosen">
          <span class="vm-chip">${_swatch(colorSel)} ${_esc(colorSel || 'Sin color')}</span>
          ${opts.puedeVolver ? `<button type="button" class="vm-back" onclick="App.volverAColores()">← Cambiar color</button>` : ''}
        </div>
        <p class="vm-hint">Elige una talla</p>
        <div class="vm-grid vm-grid--tallas">` +
        variantesColor.map((v, i) => `
          <button type="button" class="talla-opt vm-card talla-btn" onclick="App.elegirTalla(${i})">
            <span class="vm-card-title vm-talla">${_esc(v.talla || '—')}</span>
            <span class="vm-card-sub">${v.cantidad} en stock</span>
            ${Productos.necesitaReabasto(v) ? '<span class="vm-tag">Última unidad</span>' : ''}
          </button>`).join('') + `</div>`;
    }
    modal.style.display = 'flex';
  }

  function cerrarModalTalla() {
    const modal = _q('modalTalla');
    if (modal) modal.style.display = 'none';
  }

  // ── Sesión en sidebar ──────────────────────────────────────
  function sesion(sesionData) {
    const elName = _q('sesion-nombre');
    const elRol  = _q('sesion-rol');
    if (elName) elName.textContent = sesionData.nombre;
    if (elRol)  elRol.textContent  = sesionData.rol === 'admin' ? '👑 Administrador' : '👤 Empleado';
  }

  // ── Visibilidad por rol ────────────────────────────────────
  // No usar inline display: borrarlo antes evita que quede pegado tras versiones viejas del código
  // y no pisa `.page.page--active { display:block }`.
  function aplicarRol(esAdmin) {
    document.querySelectorAll('.admin-only').forEach(el => el.style.removeProperty('display'));
    document.body.classList.toggle('staff-empleado', !esAdmin);
  }

  // ── Navegación de secciones ────────────────────────────────
  function navegarA(seccion) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('page--active'));
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

    const pagina = _q(`page-${seccion}`);
    const enlace = document.querySelector(`[data-sec="${seccion}"]`);
    if (pagina) pagina.classList.add('page--active');
    if (enlace) enlace.classList.add('active');
  }

  // ── Toast de notificación ──────────────────────────────────
  function toast(mensaje, tipo = 'success') {
    const el = _q('toast');
    if (!el) return;
    el.textContent = mensaje;
    el.className   = `toast toast--${tipo} toast--visible`;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('toast--visible'), 3500);
  }

  return {
    productos, ventas, gastos, empleados,
    resumen, inversion, alertaStock, graficas,
    selectProductoEtiquetas, historialCodigosTabla, modalTalla, cerrarModalTalla,
    retiros, modalTicketRetiro, cerrarModalTicketRetiro,
    reabastoContador, modalReabasto, cerrarModalReabasto,
    reporteControles, reporteAnios, reporte, cicloActual, historialCierres, modalCierre, cerrarModalCierre,
    toggleVariantes, filtrarProductos,
    sesion, aplicarRol, navegarA, toast
  };
})();
