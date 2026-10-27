'use strict';

const { describe, it, assert, assertEqual, assertThrows, printReport } = require('./runner');
const { Productos, Ventas, Gastos } = require('./modulos');
const { Retiros } = require('./retiros');
const { Reportes } = require('./reportes');

// ═══════════════════════════════════════════════════════════
// PRODUCTOS — agregarProducto
// ═══════════════════════════════════════════════════════════
describe('📦 Productos › agregarProducto', () => {

  it('Agrega un producto nuevo a lista vacía', () => {
    const r = Productos.agregarProducto([], {
      codigo: 'C001', nombre: 'Camisa', talla: 'M', precio: 50, cantidad: 10,
    });
    assertEqual(r.length, 1);
    assertEqual(r[0].nombre, 'Camisa');
    assertEqual(r[0].cantidad, 10);
  });

  it('Acumula stock si el código ya existe (sin mutar la lista de entrada)', () => {
    const antes = [{ codigo: 'C001', nombre: 'Camisa', talla: 'M', precio: 50, cantidad: 5 }];
    const despues = Productos.agregarProducto(antes, {
      codigo: 'C001', nombre: 'Camisa', talla: 'M', precio: 50, cantidad: 3,
    });
    assertEqual(antes[0].cantidad, 5);
    assertEqual(despues[0].cantidad, 8);
  });

  it('Agrega múltiples productos distintos', () => {
    let lista = [];
    lista = Productos.agregarProducto(lista, { codigo: 'A', nombre: 'Uno',  talla: 'S', precio: 10, cantidad: 5 });
    lista = Productos.agregarProducto(lista, { codigo: 'B', nombre: 'Dos',  talla: 'M', precio: 20, cantidad: 3 });
    assertEqual(lista.length, 2);
  });

  it('Acepta cantidad 0 (producto registrado sin stock)', () => {
    const r = Productos.agregarProducto([], {
      codigo: 'C002', nombre: 'Pantalón', talla: 'L', precio: 100, cantidad: 0,
    });
    assertEqual(r[0].cantidad, 0);
  });

  it('Lanza error si el código está vacío', () => {
    assertThrows(
      () => Productos.agregarProducto([], { codigo: '', nombre: 'X', precio: 10, cantidad: 1 }),
      'inválidos'
    );
  });

  it('Lanza error si el nombre está vacío', () => {
    assertThrows(
      () => Productos.agregarProducto([], { codigo: 'C003', nombre: '', precio: 10, cantidad: 1 }),
      'inválidos'
    );
  });

  it('Lanza error si el precio es 0', () => {
    assertThrows(
      () => Productos.agregarProducto([], { codigo: 'C004', nombre: 'X', precio: 0, cantidad: 1 }),
      'inválidos'
    );
  });

  it('Lanza error si el precio es negativo', () => {
    assertThrows(
      () => Productos.agregarProducto([], { codigo: 'C005', nombre: 'X', precio: -5, cantidad: 1 }),
      'inválidos'
    );
  });

  it('Lanza error si la cantidad es negativa', () => {
    assertThrows(
      () => Productos.agregarProducto([], { codigo: 'C006', nombre: 'X', precio: 10, cantidad: -1 }),
      'inválidos'
    );
  });

  it('No muta la lista original al agregar nuevo producto', () => {
    const original = [{ codigo: 'X', nombre: 'Orig', precio: 10, cantidad: 1 }];
    const copia = [...original];
    Productos.agregarProducto(original, { codigo: 'Y', nombre: 'Nuevo', talla: 'M', precio: 20, cantidad: 2 });
    // la lista original no cambia de longitud (solo cambia por referencia en el caso duplicado)
    assertEqual(original.length, copia.length);
  });

});

// ═══════════════════════════════════════════════════════════
// PRODUCTOS — eliminarProducto
// ═══════════════════════════════════════════════════════════
describe('📦 Productos › eliminarProducto', () => {

  it('Elimina el elemento en el índice correcto', () => {
    const lista = [
      { codigo: 'A', nombre: 'Uno' },
      { codigo: 'B', nombre: 'Dos' },
      { codigo: 'C', nombre: 'Tres' },
    ];
    const r = Productos.eliminarProducto(lista, 1);
    assertEqual(r.length, 2);
    assertEqual(r[0].codigo, 'A');
    assertEqual(r[1].codigo, 'C');
  });

  it('Elimina el único elemento de la lista', () => {
    const r = Productos.eliminarProducto([{ codigo: 'A' }], 0);
    assertEqual(r.length, 0);
  });

  it('Lanza error con índice igual al length', () => {
    assertThrows(
      () => Productos.eliminarProducto([{ codigo: 'A' }], 1),
      'fuera de rango'
    );
  });

  it('Lanza error con índice negativo', () => {
    assertThrows(
      () => Productos.eliminarProducto([{ codigo: 'A' }], -1),
      'fuera de rango'
    );
  });

  it('Lanza error sobre lista vacía', () => {
    assertThrows(
      () => Productos.eliminarProducto([], 0),
      'fuera de rango'
    );
  });

});

// ═══════════════════════════════════════════════════════════
// PRODUCTOS — stock bajo
// ═══════════════════════════════════════════════════════════
describe('📦 Productos › detección de stock bajo', () => {

  it('Detecta stock bajo cuando cantidad < 5 (umbral default)', () => {
    assert(Productos.tieneStockBajo({ cantidad: 4 }));
  });

  it('No alerta si cantidad es exactamente 5', () => {
    assert(!Productos.tieneStockBajo({ cantidad: 5 }));
  });

  it('No alerta si cantidad es mayor a 5', () => {
    assert(!Productos.tieneStockBajo({ cantidad: 20 }));
  });

  it('Detecta stock en 0 como bajo', () => {
    assert(Productos.tieneStockBajo({ cantidad: 0 }));
  });

  it('Respeta umbral personalizado', () => {
    assert(Productos.tieneStockBajo({ cantidad: 8 }, 10));
    assert(!Productos.tieneStockBajo({ cantidad: 10 }, 10));
  });

  it('hayAlertaStock → true si al menos uno está bajo', () => {
    assert(Productos.hayAlertaStock([{ cantidad: 10 }, { cantidad: 2 }]));
  });

  it('hayAlertaStock → false si todos tienen stock suficiente', () => {
    assert(!Productos.hayAlertaStock([{ cantidad: 10 }, { cantidad: 20 }]));
  });

  it('hayAlertaStock → false en lista vacía', () => {
    assert(!Productos.hayAlertaStock([]));
  });

});

// ═══════════════════════════════════════════════════════════
// VENTAS — registrarVenta
// ═══════════════════════════════════════════════════════════
describe('🛒 Ventas › registrarVenta', () => {

  const prodBase = () => [
    { codigo: 'C001', nombre: 'Camisa', talla: 'M', precio: 50, cantidad: 5 },
  ];

  it('Registra la venta y calcula ganancia correctamente', () => {
    const { venta } = Ventas.registrarVenta(prodBase(), 'C001', 80);
    assertEqual(venta.ganancia, 30);
    assertEqual(venta.costo,    50);
    assertEqual(venta.venta,    80);
  });

  it('Descuenta 1 unidad del stock', () => {
    const { productos } = Ventas.registrarVenta(prodBase(), 'C001', 80);
    assertEqual(productos[0].cantidad, 4);
  });

  it('No modifica otros productos al vender', () => {
    const prods = [
      { codigo: 'C001', nombre: 'Camisa',  precio: 50, cantidad: 5 },
      { codigo: 'C002', nombre: 'Pantalón', precio: 80, cantidad: 3 },
    ];
    const { productos } = Ventas.registrarVenta(prods, 'C001', 80);
    assertEqual(productos[1].cantidad, 3);
  });

  it('Permite ganancia 0 (precio venta = costo)', () => {
    const { venta } = Ventas.registrarVenta(prodBase(), 'C001', 50);
    assertEqual(venta.ganancia, 0);
  });

  it('Permite ganancia negativa (venta por debajo del costo)', () => {
    const { venta } = Ventas.registrarVenta(prodBase(), 'C001', 30);
    assert(venta.ganancia < 0);
    assertEqual(venta.ganancia, -20);
  });

  it('Lanza error si el código no existe', () => {
    assertThrows(
      () => Ventas.registrarVenta(prodBase(), 'XXXX', 80),
      'no encontrado'
    );
  });

  it('Lanza error si el producto tiene cantidad 0', () => {
    const sinStock = [{ codigo: 'C001', nombre: 'Camisa', precio: 50, cantidad: 0 }];
    assertThrows(
      () => Ventas.registrarVenta(sinStock, 'C001', 80),
      'Sin stock'
    );
  });

  it('Lanza error si el precio de venta es negativo', () => {
    assertThrows(
      () => Ventas.registrarVenta(prodBase(), 'C001', -1),
      'inválido'
    );
  });

  it('Permite precio de venta 0 (regalo/muestra)', () => {
    const { venta } = Ventas.registrarVenta(prodBase(), 'C001', 0);
    assertEqual(venta.venta, 0);
    assertEqual(venta.ganancia, -50);
  });

  it('Redondea ganancia a 2 decimales (evita flotantes binarios)', () => {
    const prods = [{ codigo: 'C001', nombre: 'Camisa', talla: 'M', precio: 10.03, cantidad: 5 }];
    const { venta } = Ventas.registrarVenta(prods, 'C001', 20);
    assertEqual(venta.ganancia, 9.97);
  });

});

// ═══════════════════════════════════════════════════════════
// VENTAS — anularVenta
// ═══════════════════════════════════════════════════════════
describe('🛒 Ventas › anularVenta', () => {

  it('Devuelve +1 unidad al inventario', () => {
    const ventas   = [{ id: 1, cod: 'C001', nombre: 'Camisa', costo: 50, venta: 80, ganancia: 30 }];
    const prods    = [{ codigo: 'C001', nombre: 'Camisa', cantidad: 4 }];
    const { productos } = Ventas.anularVenta(ventas, prods, 1);
    assertEqual(productos[0].cantidad, 5);
  });

  it('Elimina la venta de la lista', () => {
    const ventas = [{ id: 1, cod: 'C001', costo: 50, venta: 80, ganancia: 30 }];
    const { ventas: v } = Ventas.anularVenta(ventas, [], 1);
    assertEqual(v.length, 0);
  });

  it('No elimina otras ventas al anular una', () => {
    const ventas = [
      { id: 1, cod: 'C001', costo: 50, venta: 80, ganancia: 30 },
      { id: 2, cod: 'C002', costo: 60, venta: 90, ganancia: 30 },
    ];
    const { ventas: v } = Ventas.anularVenta(ventas, [], 1);
    assertEqual(v.length, 1);
    assertEqual(v[0].id, 2);
  });

  it('Lanza error si el id de venta no existe', () => {
    assertThrows(
      () => Ventas.anularVenta([], [], 999),
      'no encontrada'
    );
  });

  it('Funciona aunque el producto ya no exista en inventario', () => {
    const ventas = [{ id: 1, cod: 'BORRADO', costo: 10, venta: 20, ganancia: 10 }];
    const { ventas: v, productos: p } = Ventas.anularVenta(ventas, [], 1);
    assertEqual(v.length, 0);
    assertEqual(p.length, 0);
  });

});

// ═══════════════════════════════════════════════════════════
// VENTAS — calcularTotales
// ═══════════════════════════════════════════════════════════
describe('🛒 Ventas › calcularTotales', () => {

  it('Suma correctamente con múltiples ventas', () => {
    const ventas = [
      { venta: 100, costo: 60, ganancia: 40 },
      { venta: 200, costo: 120, ganancia: 80 },
    ];
    const t = Ventas.calcularTotales(ventas);
    assertEqual(t.bruto,    300);
    assertEqual(t.costo,    180);
    assertEqual(t.ganancia, 120);
  });

  it('Devuelve ceros con lista vacía', () => {
    const t = Ventas.calcularTotales([]);
    assertEqual(t.bruto,    0);
    assertEqual(t.costo,    0);
    assertEqual(t.ganancia, 0);
  });

  it('Funciona con una sola venta', () => {
    const t = Ventas.calcularTotales([{ venta: 150, costo: 90, ganancia: 60 }]);
    assertEqual(t.bruto, 150);
    assertEqual(t.ganancia, 60);
  });

  it('Acumula ganancia negativa correctamente', () => {
    const ventas = [
      { venta: 50, costo: 80, ganancia: -30 },
      { venta: 90, costo: 40, ganancia:  50 },
    ];
    const t = Ventas.calcularTotales(ventas);
    assertEqual(t.ganancia, 20);
  });

});

// ═══════════════════════════════════════════════════════════
// GASTOS — agregarGasto
// ═══════════════════════════════════════════════════════════
describe('💸 Gastos › agregarGasto', () => {

  it('Agrega un gasto válido', () => {
    const r = Gastos.agregarGasto([], { nombre: 'Electricidad', monto: 150 });
    assertEqual(r.length, 1);
    assertEqual(r[0].nombre, 'Electricidad');
    assertEqual(r[0].monto, 150);
  });

  it('Conserva gastos anteriores al agregar', () => {
    const lista = [{ id: 1, nombre: 'Renta', monto: 500, fecha: '1/1/2026' }];
    const r = Gastos.agregarGasto(lista, { nombre: 'Luz', monto: 120 });
    assertEqual(r.length, 2);
  });

  it('El gasto nuevo tiene id y fecha', () => {
    const r = Gastos.agregarGasto([], { nombre: 'Agua', monto: 80 });
    assert(r[0].id !== undefined);
    assert(r[0].fecha !== undefined);
  });

  it('Lanza error si el nombre está vacío', () => {
    assertThrows(
      () => Gastos.agregarGasto([], { nombre: '', monto: 100 }),
      'inválidos'
    );
  });

  it('Lanza error si el monto es 0', () => {
    assertThrows(
      () => Gastos.agregarGasto([], { nombre: 'Renta', monto: 0 }),
      'inválidos'
    );
  });

  it('Lanza error si el monto es negativo', () => {
    assertThrows(
      () => Gastos.agregarGasto([], { nombre: 'Renta', monto: -50 }),
      'inválidos'
    );
  });

  it('Lanza error si el monto no es número', () => {
    assertThrows(
      () => Gastos.agregarGasto([], { nombre: 'Renta', monto: 'abc' }),
      'inválidos'
    );
  });

});

// ═══════════════════════════════════════════════════════════
// GASTOS — eliminarGasto
// ═══════════════════════════════════════════════════════════
describe('💸 Gastos › eliminarGasto', () => {

  it('Elimina el gasto por id', () => {
    const lista = [{ id: 42, nombre: 'Luz', monto: 200, fecha: '10/5/2026' }];
    const r = Gastos.eliminarGasto(lista, 42);
    assertEqual(r.length, 0);
  });

  it('No elimina otros gastos', () => {
    const lista = [
      { id: 1, nombre: 'Luz',   monto: 100, fecha: '1/5/2026' },
      { id: 2, nombre: 'Agua',  monto: 80,  fecha: '2/5/2026' },
    ];
    const r = Gastos.eliminarGasto(lista, 1);
    assertEqual(r.length, 1);
    assertEqual(r[0].id, 2);
  });

  it('Lanza error si el id no existe', () => {
    assertThrows(
      () => Gastos.eliminarGasto([], 999),
      'no encontrado'
    );
  });

  it('Lanza error sobre lista vacía', () => {
    assertThrows(
      () => Gastos.eliminarGasto([], 1),
      'no encontrado'
    );
  });

});

// ═══════════════════════════════════════════════════════════
// GASTOS — calcularTotal
// ═══════════════════════════════════════════════════════════
describe('💸 Gastos › calcularTotal', () => {

  it('Suma todos los montos', () => {
    const lista = [
      { id: 1, monto: 100 },
      { id: 2, monto: 250 },
      { id: 3, monto: 50  },
    ];
    assertEqual(Gastos.calcularTotal(lista), 400);
  });

  it('Devuelve 0 con lista vacía', () => {
    assertEqual(Gastos.calcularTotal([]), 0);
  });

  it('Devuelve el monto exacto con un solo gasto', () => {
    assertEqual(Gastos.calcularTotal([{ id: 1, monto: 75 }]), 75);
  });

  it('Funciona con montos decimales', () => {
    const lista = [{ id: 1, monto: 10.5 }, { id: 2, monto: 4.5 }];
    assertEqual(Gastos.calcularTotal(lista), 15);
  });

});

// ═══════════════════════════════════════════════════════════
// RETIROS — retiros parciales de ventas brutas
// ═══════════════════════════════════════════════════════════
describe('🏦 Retiros', () => {
  const ventas = [{ id: 1, venta: 100 }, { id: 2, venta: 50.5 }];

  it('Ventas brutas = suma del precio de venta', () => {
    assertEqual(Retiros.ventasBrutas(ventas), 150.5);
  });

  it('Disponible = ventas brutas − retiros previos', () => {
    assertEqual(Retiros.disponible(ventas, [{ monto: 40 }, { monto: 10.25 }]), 100.25);
  });

  it('Valida monto: vacío, cero, negativo y NaN se rechazan', () => {
    ['x', 0, -5, NaN, undefined].forEach(m => assert(Retiros.validar(m, 100) !== null));
  });

  it('Rechaza más de 2 decimales y montos mayores al disponible', () => {
    assert(Retiros.validar(1.234, 100) !== null);
    assert(Retiros.validar(100.01, 100) !== null);
  });

  it('Acepta un retiro parcial y el total disponible', () => {
    assertEqual(Retiros.validar(30, 100), null);
    assertEqual(Retiros.validar(100, 100), null);
  });

  it('crear() arma el asiento con folio, saldos y no muta la lista', () => {
    const lista = [{ id: 5, monto: 10 }];
    const r = Retiros.crear(lista, 25, { disponibleAntes: 140.5, usuario: 'admin', nota: ' caja ' });
    assertEqual(r.folio, 'R-0002');
    assertEqual(r.monto, 25);
    assertEqual(r.disponibleAntes, 140.5);
    assertEqual(r.disponibleDespues, 115.5);
    assertEqual(r.nota, 'caja');
    assertEqual(lista.length, 1);
  });

  it('El ticket incluye folio, monto y saldos', () => {
    const r = Retiros.crear([], 25, { disponibleAntes: 100, usuario: 'admin' });
    const t = Retiros.generarTicketTexto(r);
    assert(t.includes('R-0001') && t.includes('$25.00') && t.includes('$75.00') && t.includes('admin'));
  });
});

// ═══════════════════════════════════════════════════════════
// REPORTES — fechas, filtros y cierre mensual
// ═══════════════════════════════════════════════════════════
describe('📈 Reportes', () => {
  const V = (id, fecha, nombre, color, talla, costo, venta, extra = {}) =>
    ({ id, cod: nombre.slice(0, 3), nombre, color, talla, costo, venta, ganancia: venta - costo, fecha, hora: '10:00', ...extra });
  const ventas = [
    V(1, '5/3/2026', 'Camisa', 'Negro', 'M', 10, 25),
    V(2, '05/03/2026', 'Camisa', 'Negro', 'M', 10, 25),
    V(3, '12/03/2026', 'Zapato', 'Rojo', '10', 50, 90),
    V(4, '02/04/2026', 'Gorra', 'Verde', 'S', 5, 12, { ts: '2026-04-02T15:00:00.000Z' }),
  ];

  it('fechaDe lee fecha es-GT (d/m/aaaa), ts ISO e id en milisegundos', () => {
    const f = Reportes.fechaDe({ fecha: '5/3/2026' });
    assertEqual([f.getDate(), f.getMonth(), f.getFullYear()].join('-'), '5-2-2026');
    assertEqual(Reportes.fechaDe({ ts: '2026-04-02T15:00:00.000Z' }).getUTCFullYear(), 2026);
    assertEqual(Reportes.fechaDe({ id: 1767225600000 }).getUTCFullYear(), 2026);
    assertEqual(Reportes.fechaDe({ fecha: 'xx', id: 7 }), null);
  });

  it('rangoSemana va de lunes a domingo (también si el día es domingo)', () => {
    const r = Reportes.rangoSemana(new Date(2026, 2, 5));      // jueves
    assertEqual(Reportes.fmtFecha(r.desde), '02/03/2026');
    assertEqual(Reportes.fmtFecha(r.hasta), '08/03/2026');
    const d = Reportes.rangoSemana(new Date(2026, 2, 8));      // domingo
    assertEqual(Reportes.fmtFecha(d.desde), '02/03/2026');
  });

  it('rangoMes cubre del 1 al último día (febrero bisiesto incluido)', () => {
    assertEqual(Reportes.fmtFecha(Reportes.rangoMes(2028, 1).hasta), '29/02/2028');
    assertEqual(Reportes.fmtFecha(Reportes.rangoMes(2026, 11).hasta), '31/12/2026');
  });

  it('filtrarPorRango incluye ambos extremos y admite límites abiertos', () => {
    const r = Reportes.filtrarPorRango(ventas, new Date(2026, 2, 5), new Date(2026, 2, 12));
    assertEqual(r.length, 3);
    assertEqual(Reportes.filtrarPorRango(ventas, null, new Date(2026, 2, 5)).length, 2);
    assertEqual(Reportes.filtrarPorRango(ventas, new Date(2026, 3, 1), null).length, 1);
  });

  it('agruparProductos suma por código + color + talla, de mayor a menor', () => {
    const g = Reportes.agruparProductos(ventas);
    assertEqual(g.length, 3);
    assertEqual(g[0].nombre, 'Camisa');
    assertEqual(g[0].unidades, 2);
    assertEqual(g[0].ventas, 50);
    assertEqual(g[0].costo, 20);
    assertEqual(g[0].ganancia, 30);
  });

  it('resumen: ventas brutas, costo, gastos, ganancia bruta y neta', () => {
    const r = Reportes.resumen(ventas, [{ monto: 20 }, { monto: 7.5 }]);
    assertEqual(r.ventasBrutas, 152);
    assertEqual(r.costo, 75);
    assertEqual(r.gananciaBruta, 77);
    assertEqual(r.gastos, 27.5);
    assertEqual(r.gananciaNeta, 49.5);
  });

  it('unirSinRepetidos no cuenta dos veces un mismo id', () => {
    assertEqual(Reportes.unirSinRepetidos([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }]).length, 3);
  });

  it('crearCierre arma folio, período, mes y copia (sin mutar) ventas y gastos', () => {
    const antes = JSON.stringify(ventas);
    const c = Reportes.crearCierre([{ id: 1 }], { ventas, gastos: [{ id: 9, monto: 5 }], usuario: 'admin' });
    assertEqual(c.folio, 'C-0002');
    assertEqual(c.periodoDesde, '05/03/2026');
    assertEqual(c.mes.split(' ')[1], String(Reportes.fechaDe(ventas[3]).getFullYear()));
    assertEqual(c.resumen.gananciaNeta, 72);
    assertEqual(c.ventas.length, 4);
    assertEqual(c.productos.length, 3);
    assertEqual(JSON.stringify(ventas), antes);
  });
});

// ─────────────────────────────────────────────
printReport();
