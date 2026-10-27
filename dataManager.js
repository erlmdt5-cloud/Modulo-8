/**
 * dataManager.js — Módulo de Persistencia
 * Responsabilidad: SOLO leer y escribir en localStorage. Nada más.
 */

const DataManager = (() => {
  const KEYS = {
    productos         : 'pf_productos',
    ventas            : 'pf_ventas',
    gastos            : 'pf_gastos',
    historial_codigos : 'pf_historial_codigos',
    retiros           : 'pf_retiros',
    cierres           : 'pf_cierres',
  };

  function _get(key) {
    try { return JSON.parse(localStorage.getItem(KEYS[key])) || []; }
    catch { return []; }
  }
  function _set(key, data) {
    localStorage.setItem(KEYS[key], JSON.stringify(data));
  }

  // ── API pública ────────────────────────────────────────────
  function cargarTodo() {
    return {
      productos         : _get('productos'),
      ventas            : _get('ventas'),
      gastos            : _get('gastos'),
      historialCodigos  : _get('historial_codigos'),
      retiros           : _get('retiros'),
      cierres           : _get('cierres'),
    };
  }

  function guardarTodo(productos, ventas, gastos, historialCodigos, retiros, cierres) {
    _set('productos', productos);
    _set('ventas',    ventas);
    _set('gastos',    gastos);
    if (historialCodigos !== undefined) {
      _set('historial_codigos', historialCodigos);
    }
    if (retiros !== undefined) {
      _set('retiros', retiros);
    }
    if (cierres !== undefined) {
      _set('cierres', cierres);
    }
  }

  function exportarBackup(productos, ventas, gastos, historialCodigos, retiros, cierres) {
    const payload = {
      version          : '2.1',
      fecha            : new Date().toISOString(),
      productos,
      ventas,
      gastos_lista     : gastos,
      historial_codigos: historialCodigos || [],
      retiros          : retiros || [],
      cierres          : cierres || [],
    };
    const uri = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload));
    const a   = Object.assign(document.createElement('a'), {
      href    : uri,
      download: `PixelFit_Backup_${new Date().toISOString().slice(0, 10)}.json`
    });
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function importarBackup(jsonString) {
    const data = JSON.parse(jsonString);
    if (!data.productos || !data.ventas || !data.gastos_lista) {
      throw new Error('Formato de backup inválido.');
    }
    return {
      productos        : data.productos,
      ventas           : data.ventas,
      gastos           : data.gastos_lista,
      historialCodigos : Array.isArray(data.historial_codigos) ? data.historial_codigos : [],
      retiros          : Array.isArray(data.retiros) ? data.retiros : [],
      cierres          : Array.isArray(data.cierres) ? data.cierres : [],
    };
  }

  /**
   * Exporta un libro Excel (.xlsx) con tres hojas (misma información que el backup JSON).
   * Requiere la librería global XLSX cargada en index.html.
   */
  function exportarExcel(productos, ventas, gastos, historialCodigos, retiros, cierres) {
    if (typeof XLSX === 'undefined') {
      throw new Error('La librería Excel (XLSX) no está cargada.');
    }

    const wb = XLSX.utils.book_new();

    const hojaProductos = XLSX.utils.json_to_sheet(
      productos.map(p => ({
        codigo: p.codigo,
        nombre: p.nombre,
        color: p.color || '',
        talla: p.talla,
        precio_costo: p.precio,
        cantidad: p.cantidad,
        codigo_registrado: p.codigoRegistradoEn || '',
      }))
    );
    XLSX.utils.book_append_sheet(wb, hojaProductos, 'Productos');

    if (historialCodigos && historialCodigos.length) {
      const hHist = XLSX.utils.json_to_sheet(historialCodigos);
      XLSX.utils.book_append_sheet(wb, hHist, 'HistorialCodigos');
    }

    const hojaVentas = XLSX.utils.json_to_sheet(
      ventas.map(v => ({
        id: v.id,
        codigo: v.cod,
        producto: v.nombre,
        color: v.color || '',
        talla: v.talla,
        costo: v.costo,
        venta: v.venta,
        ganancia: v.ganancia,
        fecha: v.fecha,
        hora: v.hora,
      }))
    );
    XLSX.utils.book_append_sheet(wb, hojaVentas, 'Ventas');

    const hojaGastos = XLSX.utils.json_to_sheet(
      gastos.map(g => ({
        id: g.id,
        descripcion: g.nombre,
        monto: g.monto,
        fecha: g.fecha,
      }))
    );
    XLSX.utils.book_append_sheet(wb, hojaGastos, 'Gastos');

    if (retiros && retiros.length) {
      const hojaRetiros = XLSX.utils.json_to_sheet(
        retiros.map(r => ({
          folio: r.folio,
          fecha: r.fecha,
          hora: r.hora,
          autorizo: r.usuario,
          monto_retirado: r.monto,
          disponible_antes: r.disponibleAntes,
          disponible_despues: r.disponibleDespues,
          nota: r.nota || '',
        }))
      );
      XLSX.utils.book_append_sheet(wb, hojaRetiros, 'Retiros');
    }

    if (cierres && cierres.length) {
      const hojaCierres = XLSX.utils.json_to_sheet(
        cierres.map(c => ({
          folio: c.folio,
          mes: c.mes,
          periodo_desde: c.periodoDesde,
          periodo_hasta: c.periodoHasta,
          cerrado_el: `${c.fecha} ${c.hora}`,
          cerro: c.usuario,
          ventas_brutas: c.resumen.ventasBrutas,
          costo_mercancia: c.resumen.costo,
          gastos: c.resumen.gastos,
          ganancia_neta: c.resumen.gananciaNeta,
        }))
      );
      XLSX.utils.book_append_sheet(wb, hojaCierres, 'Cierres');

      const hojaCerradas = XLSX.utils.json_to_sheet(
        cierres.flatMap(c => (c.ventas || []).map(v => ({
          cierre: c.folio,
          codigo: v.cod,
          producto: v.nombre,
          color: v.color || '',
          talla: v.talla,
          costo: v.costo,
          venta: v.venta,
          ganancia: v.ganancia,
          fecha: v.fecha,
          hora: v.hora,
        })))
      );
      XLSX.utils.book_append_sheet(wb, hojaCerradas, 'VentasCerradas');
    }

    const nombre = `PixelFit_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, nombre);
  }

  return { cargarTodo, guardarTodo, exportarBackup, importarBackup, exportarExcel };
})();
