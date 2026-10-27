/**
 * reportes.js — Reportes por período y cierre mensual
 * Responsabilidad: lógica pura (fechas, filtros, agrupación y cierre). Sin DOM ni localStorage.
 *
 * Fecha de cada registro: `ts` (ISO, registros nuevos) → `fecha` "d/m/aaaa" (es-GT)
 * → `id` si es una marca de tiempo en milisegundos.
 */

const Reportes = (() => {

  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
                 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const _r2 = n => Math.round((Number(n) || 0) * 100) / 100;

  // ── Fechas ─────────────────────────────────────────────────
  function fechaDe(item) {
    if (!item) return null;
    if (item.ts) {
      const d = new Date(item.ts);
      if (!isNaN(d)) return d;
    }
    const m = String(item.fecha || '').match(/(\d{1,2})\D+(\d{1,2})\D+(\d{4})/);
    if (m) {
      const d = new Date(+m[3], +m[2] - 1, +m[1]);
      if (!isNaN(d) && d.getMonth() === +m[2] - 1) return d;
    }
    if (Number(item.id) > 1e12) {
      const d = new Date(Number(item.id));
      if (!isNaN(d)) return d;
    }
    return null;
  }

  const inicioDia = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const finDia    = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  /** Semana de lunes a domingo que contiene a `ref`. */
  function rangoSemana(ref) {
    const d = inicioDia(ref);
    const dow = (d.getDay() + 6) % 7;                 // lunes = 0
    const lunes = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow);
    const domingo = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow + 6);
    return { desde: lunes, hasta: finDia(domingo) };
  }

  function rangoMes(anio, mes0) {
    return { desde: new Date(anio, mes0, 1), hasta: finDia(new Date(anio, mes0 + 1, 0)) };
  }

  /** Registros dentro del rango (inclusive, por día). `desde`/`hasta` null = sin límite. */
  function filtrarPorRango(lista, desde, hasta) {
    const d0 = desde ? inicioDia(desde) : null;
    const d1 = hasta ? finDia(hasta) : null;
    return lista.filter(it => {
      const f = fechaDe(it);
      if (!f) return false;
      return (!d0 || f >= d0) && (!d1 || f <= d1);
    });
  }

  function fmtFecha(d) {
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  function nombreMes(mes0) { return MESES[mes0] || ''; }

  // ── Agrupación y totales ───────────────────────────────────
  /** Productos vendidos: una fila por código + color + talla. */
  function agruparProductos(ventas) {
    const mapa = new Map();
    ventas.forEach(v => {
      const color = String(v.color || '').trim();
      const clave = [String(v.cod).trim(), color.toLowerCase(), String(v.talla || '').trim().toUpperCase()].join('|');
      let r = mapa.get(clave);
      if (!r) {
        r = { codigo: v.cod, nombre: v.nombre, color, talla: v.talla || '', unidades: 0, ventas: 0, costo: 0, ganancia: 0 };
        mapa.set(clave, r);
      }
      r.unidades += 1;
      r.ventas   += parseFloat(v.venta) || 0;
      r.costo    += parseFloat(v.costo) || 0;
    });
    return [...mapa.values()]
      .map(r => ({ ...r, ventas: _r2(r.ventas), costo: _r2(r.costo), ganancia: _r2(r.ventas - r.costo) }))
      .sort((a, b) => b.unidades - a.unidades || String(a.nombre).localeCompare(String(b.nombre)));
  }

  /** Totales: ventas brutas, costo de mercancía, gastos y ganancias. */
  function resumen(ventas, gastos) {
    const ventasBrutas = _r2(ventas.reduce((a, v) => a + (parseFloat(v.venta) || 0), 0));
    const costo        = _r2(ventas.reduce((a, v) => a + (parseFloat(v.costo) || 0), 0));
    const totalGastos  = _r2(gastos.reduce((a, g) => a + (parseFloat(g.monto) || 0), 0));
    const gananciaBruta = _r2(ventasBrutas - costo);
    return {
      numVentas: ventas.length,
      unidades: ventas.length,
      ventasBrutas,
      costo,
      gastos: totalGastos,
      gananciaBruta,
      gananciaNeta: _r2(gananciaBruta - totalGastos),
    };
  }

  /** Une listas quitando ids repetidos (por si un registro llegó dos veces). */
  function unirSinRepetidos(...listas) {
    const vistos = new Set();
    const out = [];
    listas.forEach(l => (l || []).forEach(x => {
      if (x && x.id !== undefined) {
        if (vistos.has(x.id)) return;
        vistos.add(x.id);
      }
      out.push(x);
    }));
    return out;
  }

  /** Primer y último día con ventas: { desde, hasta } (Date) o null si no hay fechas. */
  function periodoDe(ventas) {
    const fechas = ventas.map(fechaDe).filter(Boolean).sort((a, b) => a - b);
    return fechas.length ? { desde: fechas[0], hasta: fechas[fechas.length - 1] } : null;
  }

  // ── Cierre mensual ─────────────────────────────────────────
  /** Arma el asiento de cierre con el reporte del ciclo (no modifica listas). */
  function crearCierre(cierres, { ventas, gastos, usuario }) {
    const ahora = new Date();
    const per = periodoDe(ventas);
    const desde = per ? per.desde : ahora;
    const hasta = per ? per.hasta : ahora;
    const ultimoId = cierres.reduce((m, c) => Math.max(m, Number(c.id) || 0), 0);
    return {
      id: Math.max(Date.now(), ultimoId + 1),
      folio: 'C-' + String(cierres.length + 1).padStart(4, '0'),
      ts: ahora.toISOString(),
      fecha: ahora.toLocaleDateString('es-GT'),
      hora: ahora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      usuario: usuario || '—',
      periodoDesde: fmtFecha(desde),
      periodoHasta: fmtFecha(hasta),
      mes: `${nombreMes(hasta.getMonth())} ${hasta.getFullYear()}`,
      resumen: resumen(ventas, gastos),
      productos: agruparProductos(ventas),
      ventas: ventas.map(v => ({ ...v })),
      gastos: gastos.map(g => ({ ...g })),
    };
  }

  return {
    MESES, fechaDe, rangoSemana, rangoMes, filtrarPorRango, fmtFecha, nombreMes,
    agruparProductos, resumen, periodoDe, unirSinRepetidos, crearCierre,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Reportes };
