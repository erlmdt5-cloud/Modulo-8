/**
 * productos.js — Módulo de Lógica de Productos
 * Responsabilidad: SOLO reglas de negocio sobre productos.
 * Sin tablas. Sin gráficas. Sin localStorage.
 */

const Productos = (() => {
  const STOCK_MINIMO = 1;   // con 1 unidad o menos, la variante necesita reabastecimiento

  function _nuevoIdProducto() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'pf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
  }

  /** Talla libre (letras o números): sin espacios sobrantes y en mayúsculas para comparar. */
  function normalizarTalla(t) {
    return String(t == null ? '' : t).trim().replace(/\s+/g, ' ').toUpperCase();
  }

  /** Color libre: sin espacios sobrantes y con formato uniforme ("negro" → "Negro"). */
  function normalizarColor(c) {
    const t = String(c == null ? '' : c).trim().replace(/\s+/g, ' ').toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function _mismoCodigo(p, codigo) {
    return String(p.codigo).trim() === String(codigo || '').trim();
  }

  /** Todas las variantes (tallas) que comparten un código maestro. */
  function buscarVariantes(lista, codigo) {
    return lista.filter(p => _mismoCodigo(p, codigo));
  }

  /**
   * ¿Es esta la variante pedida? Una variante es código + color + talla.
   * Un color o talla `undefined` actúa como comodín.
   */
  function _esVariante(p, codigo, color, talla) {
    return _mismoCodigo(p, codigo) &&
      (color === undefined || normalizarColor(p.color) === normalizarColor(color)) &&
      (talla === undefined || normalizarTalla(p.talla) === normalizarTalla(talla));
  }

  /** Variante exacta: código maestro + color + talla. */
  function buscarVariante(lista, codigo, color, talla) {
    return lista.find(p => _esVariante(p, codigo, color, talla)) || null;
  }

  /** Colores distintos (en orden de aparición) de un grupo de variantes. */
  function coloresDe(variantes) {
    const vistos = [];
    variantes.forEach(v => {
      const c = normalizarColor(v.color);
      if (!vistos.includes(c)) vistos.push(c);
    });
    return vistos;
  }

  /** Códigos en uso (normalizados como string). */
  function codigosEnUso(lista) {
    return new Set(lista.map(p => String(p.codigo).trim()).filter(Boolean));
  }

  /**
   * Genera un código alfanumérico único (CODE128) que no está en `lista`.
   * Prefijo PF + base36 tiempo + sufijo aleatorio.
   */
  function generarCodigoUnico(lista) {
    const ocupados = codigosEnUso(lista);
    let codigo;
    let intentos = 0;
    do {
      const t = Date.now().toString(36).toUpperCase();
      const r = Math.random().toString(36).substring(2, 7).toUpperCase();
      codigo = 'PF' + t.slice(-6) + r;
      intentos++;
      if (intentos > 50) codigo = 'PF' + Date.now() + intentos;
    } while (ocupados.has(codigo));
    return codigo;
  }

  /**
   * Asigna `nuevoCodigo` al producto en `indice`. `excluirIndice` evita choque consigo mismo.
   * Devuelve { lista, error? }.
   */
  function asignarCodigoEnIndice(lista, indice, nuevoCodigo, meta) {
    const cod = String(nuevoCodigo || '').trim();
    if (!cod) return { lista, error: 'El código no puede estar vacío.' };
    if (indice < 0 || indice >= lista.length) return { lista, error: 'Producto no válido.' };
    const dup = lista.findIndex((p, i) => i !== indice && String(p.codigo) === cod);
    if (dup !== -1) return { lista, error: 'Ese código ya está asignado a otro producto.' };
    const copia = lista.map((p, i) => {
      if (i !== indice) return { ...p };
      const next = {
        ...p,
        codigo: cod,
        codigoRegistradoEn: meta?.registradoEn || p.codigoRegistradoEn || new Date().toISOString(),
      };
      return next;
    });
    return { lista: copia };
  }

  /**
   * Cambia el código maestro de TODAS las tallas que lo comparten.
   * Devuelve { lista, error? }. No permite fusionarse con el código de otro producto.
   */
  function reasignarCodigoGrupo(lista, codigoViejo, codigoNuevo, meta) {
    const nuevo = String(codigoNuevo || '').trim();
    if (!nuevo) return { lista, error: 'El código no puede estar vacío.' };
    if (!lista.some(p => _mismoCodigo(p, codigoViejo))) return { lista, error: 'Producto no válido.' };
    if (!_mismoCodigo({ codigo: nuevo }, codigoViejo) && lista.some(p => _mismoCodigo(p, nuevo))) {
      return { lista, error: 'Ese código ya está asignado a otro producto.' };
    }
    const registradoEn = meta?.registradoEn || new Date().toISOString();
    return {
      lista: lista.map(p =>
        _mismoCodigo(p, codigoViejo)
          ? { ...p, codigo: nuevo, codigoRegistradoEn: registradoEn }
          : { ...p }
      ),
    };
  }

  /** Asegura que cada producto tenga `id` interno estable (migración). */
  function asegurarIds(lista) {
    return lista.map(p =>
      p.id ? { ...p } : { ...p, id: _nuevoIdProducto() }
    );
  }

  // ── Validación ─────────────────────────────────────────────
  function validar(codigo, nombre, precio, cantidad, talla, color) {
    if (!codigo || !nombre)             return 'El código y el nombre son obligatorios.';
    if (color !== undefined && !normalizarColor(color)) return 'El color es obligatorio.';
    if (talla !== undefined && !normalizarTalla(talla)) return 'La talla es obligatoria (letras o números).';
    if (isNaN(precio)  || precio  < 0)  return 'El precio de costo debe ser un número positivo.';
    if (isNaN(cantidad) || cantidad < 1) return 'La cantidad debe ser al menos 1.';
    return null; // sin error
  }

  // ── CRUD ───────────────────────────────────────────────────
  /**
   * Agrega o incrementa stock. La variante es código + color + talla: un mismo
   * código puede tener varias combinaciones, cada una con su stock independiente.
   * Devuelve nueva lista (inmutable).
   */
  function agregar(lista, { codigo, nombre, color, talla, precio, cantidad }) {
    const copia = lista.map(p => ({ ...p }));
    const colorN = normalizarColor(color);
    const tallaN = normalizarTalla(talla);
    const existente = copia.find(p => _esVariante(p, codigo, colorN, tallaN));
    if (existente) {
      existente.cantidad += parseInt(cantidad);
    } else {
      copia.push({
        id: _nuevoIdProducto(),
        codigo,
        nombre,
        color: colorN,
        talla: tallaN,
        precio  : parseFloat(precio),
        cantidad: parseInt(cantidad),
        codigoRegistradoEn: new Date().toISOString(),
      });
    }
    return copia;
  }

  /** Elimina por índice. Devuelve nueva lista. */
  function eliminar(lista, indice) {
    return lista.filter((_, i) => i !== indice);
  }

  // ── Búsqueda ───────────────────────────────────────────────
  function buscarPorCodigo(lista, codigo) {
    const c = String(codigo || '').trim();
    return lista.find(p => String(p.codigo).trim() === c) || null;
  }

  // ── Stock ──────────────────────────────────────────────────
  /** Descuenta 1 unidad de la combinación color + talla indicada. Devuelve { lista, ok }. */
  function reducirStock(lista, codigo, color, talla) {
    const copia = lista.map(p => ({ ...p }));
    const prod  = copia.find(p => _esVariante(p, codigo, color, talla));
    if (!prod || prod.cantidad <= 0) return { lista: copia, ok: false };
    prod.cantidad--;
    return { lista: copia, ok: true };
  }

  /** Aumenta 1 unidad de la combinación color + talla (para anular venta). Devuelve nueva lista. */
  function aumentarStock(lista, codigo, color, talla) {
    const copia = lista.map(p => ({ ...p }));
    const prod  = copia.find(p => _esVariante(p, codigo, color, talla));
    if (prod) prod.cantidad++;
    return copia;
  }

  function tieneStockBajo(lista) {
    return lista.some(necesitaReabasto);
  }

  /** ¿Esta variante necesita reabastecerse? (stock de 1 o menos, incluye agotadas) */
  function necesitaReabasto(p) {
    return p.cantidad <= STOCK_MINIMO;
  }

  function obtenerStockBajo(lista) {
    return lista.filter(necesitaReabasto);
  }

  /** Dinero invertido: suma de costo × cantidad de todo el stock actual. */
  function calcularInversion(lista) {
    return lista.reduce(
      (acc, p) => acc + (parseFloat(p.precio) || 0) * (parseInt(p.cantidad) || 0),
      0
    );
  }

  return {
    STOCK_MINIMO,
    necesitaReabasto,
    validar,
    agregar,
    eliminar,
    buscarPorCodigo,
    buscarVariantes,
    buscarVariante,
    coloresDe,
    normalizarTalla,
    normalizarColor,
    reasignarCodigoGrupo,
    reducirStock,
    aumentarStock,
    tieneStockBajo,
    obtenerStockBajo,
    calcularInversion,
    generarCodigoUnico,
    codigosEnUso,
    asignarCodigoEnIndice,
    asegurarIds,
  };
})();
