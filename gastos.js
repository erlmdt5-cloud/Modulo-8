/**
 * gastos.js — Módulo de Lógica de Gastos
 * Responsabilidad: SOLO reglas de negocio sobre gastos extra.
 * Sin tablas. Sin localStorage.
 */

const Gastos = (() => {

  /** Agrega un gasto a la lista. Devuelve nueva lista (inmutable). */
  function agregar(lista, descripcion, monto) {
    return [
      ...lista,
      {
        id    : Date.now(),
        nombre: descripcion.trim(),
        monto : parseFloat(parseFloat(monto).toFixed(2)),
        fecha : new Date().toLocaleDateString('es-GT'),
        ts    : new Date().toISOString()
      }
    ];
  }

  /** Elimina por id. Devuelve nueva lista. */
  function eliminar(lista, id) {
    return lista.filter(g => g.id !== id);
  }

  /** Suma total de gastos. */
  function calcularTotal(lista) {
    return lista.reduce((acc, g) => acc + g.monto, 0);
  }

  return { agregar, eliminar, calcularTotal };
})();
