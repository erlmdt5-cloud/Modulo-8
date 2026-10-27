// ─────────────────────────────────────────────
// MÓDULO: PRODUCTOS
// ─────────────────────────────────────────────
const Productos = (() => {

  function validarDatos({ codigo, nombre, precio, cantidad }) {
    if (!codigo || !nombre)                  return false;
    if (isNaN(precio)   || precio   <= 0)    return false;
    if (isNaN(cantidad) || cantidad <  0)    return false;
    return true;
  }

  function agregarProducto(lista, datos) {
    if (!validarDatos(datos)) throw new Error('Datos inválidos');
    const existente = lista.find(p => p.codigo === datos.codigo);
    if (existente) {
      const add = Number(datos.cantidad);
      return lista.map(p =>
        p.codigo === datos.codigo ? { ...p, cantidad: p.cantidad + add } : p
      );
    }
    return [...lista, {
      ...datos,
      precio  : Number(datos.precio),
      cantidad: Number(datos.cantidad),
    }];
  }

  function eliminarProducto(lista, indice) {
    if (indice < 0 || indice >= lista.length)
      throw new Error('Índice fuera de rango');
    return lista.filter((_, i) => i !== indice);
  }

  function tieneStockBajo(producto, umbral = 5) {
    return producto.cantidad < umbral;
  }

  function hayAlertaStock(lista, umbral = 5) {
    return lista.some(p => p.cantidad < umbral);
  }

  return { validarDatos, agregarProducto, eliminarProducto, tieneStockBajo, hayAlertaStock };
})();

// ─────────────────────────────────────────────
// MÓDULO: VENTAS
// ─────────────────────────────────────────────
const Ventas = (() => {

  function registrarVenta(productos, codigo, precioVenta) {
    const idx = productos.findIndex(p => p.codigo === codigo);
    if (idx === -1)                              throw new Error('Producto no encontrado');
    if (productos[idx].cantidad <= 0)            throw new Error('Sin stock');
    if (isNaN(precioVenta) || precioVenta < 0)   throw new Error('Precio inválido');

    const prod = productos[idx];
    const venta = {
      id:       Date.now(),
      cod:      prod.codigo,
      nombre:   prod.nombre,
      talla:    prod.talla,
      costo:    prod.precio,
      venta:    precioVenta,
      ganancia: parseFloat((precioVenta - prod.precio).toFixed(2)),
    };

    const nuevosProductos = productos.map((p, i) =>
      i === idx ? { ...p, cantidad: p.cantidad - 1 } : p
    );

    return { venta, productos: nuevosProductos };
  }

  function anularVenta(ventas, productos, id) {
    const idx = ventas.findIndex(v => v.id === id);
    if (idx === -1) throw new Error('Venta no encontrada');

    const venta = ventas[idx];
    const pIdx  = productos.findIndex(p => p.codigo === venta.cod);

    const nuevosProductos = pIdx !== -1
      ? productos.map((p, i) => i === pIdx ? { ...p, cantidad: p.cantidad + 1 } : p)
      : [...productos];

    return {
      ventas:    ventas.filter(v => v.id !== id),
      productos: nuevosProductos,
    };
  }

  function calcularTotales(ventas) {
    return ventas.reduce(
      (acc, v) => ({
        bruto:    acc.bruto    + v.venta,
        costo:    acc.costo    + v.costo,
        ganancia: acc.ganancia + v.ganancia,
      }),
      { bruto: 0, costo: 0, ganancia: 0 }
    );
  }

  return { registrarVenta, anularVenta, calcularTotales };
})();

// ─────────────────────────────────────────────
// MÓDULO: GASTOS
// ─────────────────────────────────────────────
const Gastos = (() => {

  function agregarGasto(lista, { nombre, monto }) {
    if (!nombre || isNaN(monto) || monto <= 0)
      throw new Error('Datos inválidos');
    return [
      ...lista,
      { id: Date.now(), nombre, monto, fecha: new Date().toLocaleDateString() },
    ];
  }

  function eliminarGasto(lista, id) {
    if (!lista.some(g => g.id === id)) throw new Error('Gasto no encontrado');
    return lista.filter(g => g.id !== id);
  }

  function calcularTotal(lista) {
    return lista.reduce((acc, g) => acc + g.monto, 0);
  }

  return { agregarGasto, eliminarGasto, calcularTotal };
})();

module.exports = { Productos, Ventas, Gastos };
