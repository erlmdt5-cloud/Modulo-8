/**
 * retiros.js — Retiros parciales de ventas brutas
 * Responsabilidad: lógica pura del libro de retiros (sin DOM ni localStorage).
 *
 * Ventas brutas = suma del precio de venta de todas las ventas vigentes.
 * Disponible    = ventas brutas − total ya retirado.
 * El libro es solo de alta (no se edita ni se borra): es el registro contable.
 */

const Retiros = (() => {

  const _r2 = n => Math.round((Number(n) || 0) * 100) / 100;

  function ventasBrutas(ventas) {
    return _r2(ventas.reduce((acc, v) => acc + (parseFloat(v.venta) || 0), 0));
  }

  function totalRetirado(retiros) {
    return _r2(retiros.reduce((acc, r) => acc + (parseFloat(r.monto) || 0), 0));
  }

  function disponible(ventas, retiros) {
    return _r2(ventasBrutas(ventas) - totalRetirado(retiros));
  }

  /** Devuelve un mensaje de error, o null si el monto es válido. */
  function validar(monto, disp) {
    if (typeof monto !== 'number' || !isFinite(monto) || monto <= 0) {
      return 'Ingresa un monto válido mayor a 0.';
    }
    if (_r2(monto) !== monto) return 'El monto admite máximo 2 decimales.';
    if (monto > disp) return `El monto excede las ventas brutas disponibles ($${disp.toFixed(2)}).`;
    return null;
  }

  /** Crea el asiento del retiro (no lo agrega a la lista). */
  function crear(lista, monto, { disponibleAntes, usuario, nota }) {
    const ahora = new Date();
    const ultimoId = lista.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0);
    return {
      id: Math.max(Date.now(), ultimoId + 1),
      folio: 'R-' + String(lista.length + 1).padStart(4, '0'),
      monto,
      nota: String(nota || '').trim(),
      usuario: usuario || '—',
      disponibleAntes: _r2(disponibleAntes),
      disponibleDespues: _r2(disponibleAntes - monto),
      fecha: ahora.toLocaleDateString('es-GT'),
      hora: ahora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
  }

  function generarTicketTexto(r) {
    const f = n => `$${Number(n).toFixed(2)}`;
    const lineas = [
      '╔══════════════════════════════╗',
      '║      TICKET DE RETIRO        ║',
      '╚══════════════════════════════╝',
      `  Folio    : ${r.folio}`,
      `  Fecha    : ${r.fecha}`,
      `  Hora     : ${r.hora}`,
      `  Autorizó : ${r.usuario}`,
      '  ──────────────────────────────',
      `  Disponible antes : ${f(r.disponibleAntes)}`,
      `  MONTO RETIRADO   : ${f(r.monto)}`,
      `  Disponible queda : ${f(r.disponibleDespues)}`,
    ];
    if (r.nota) lineas.push('  ──────────────────────────────', `  Nota: ${r.nota}`);
    lineas.push('  ──────────────────────────────', '', '  Firma: ______________________', '');
    return lineas.join('\n');
  }

  return { ventasBrutas, totalRetirado, disponible, validar, crear, generarTicketTexto };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = { Retiros };
