/* ============================================
   NEURORA POS - REPORTES (ANEXO F)
   Módulo de solo lectura y cálculo
   Namespace: .rep-*
   ============================================ */

(function () {
  'use strict';

  let vistaActiva = 'rentabilidad';
  let periodoActivo = 'hoy';
  let personalizadoDesde = null;
  let personalizadoHasta = null;
  let visible = false;

  const vistas = [
    { id: 'rentabilidad', nombre: 'Rentabilidad', icono: 'trending_up' },
    { id: 'patrimonio', nombre: 'Patrimonio', icono: 'account_balance' },
    { id: 'inventario', nombre: 'Inventario', icono: 'inventory_2' }
  ];
  const periodos = [
    { id: 'hoy', label: 'HOY' },
    { id: 'semana', label: 'ESTA SEMANA' },
    { id: 'mes', label: 'ESTE MES' },
    { id: 'anio', label: 'ESTE AÑO' },
    { id: 'personalizado', label: 'PERSONALIZADO' }
  ];

  // ==========================================
  // 1. CICLO DE VIDA (hooks del NÚCLEO)
  // ==========================================
  function init() {}
  function onShow() { visible = true; render(); }
  function onHide() { visible = false; }
  // ESC: nada propio que cerrar → el NÚCLEO vuelve a CAJA
  function onEscape() { return false; }

  // ==========================================
  // 2. RENDER
  // ==========================================
  function render() {
    if (!visible) return;
    const container = document.getElementById('moduleContainer');
    if (!container) return;
    container.innerHTML = `
      <div class="rep-layout">
        ${renderSidebar()}
        <div class="rep-main">${renderPanel()}</div>
      </div>`;
    bindSidebarEvents();
    bindPeriodEvents();
  }

  function renderSidebar() {
    return `
      <div class="rep-sidebar">
        <div class="rep-sidebar-header">
          <div class="rep-sidebar-title">REPORTES</div>
          <div class="rep-sidebar-subtitle">Tablero del dueño</div>
        </div>
        <div class="rep-sidebar-section">
          ${vistas.map(v => `
            <div class="rep-sidebar-item ${vistaActiva === v.id ? 'active' : ''}" data-vista="${v.id}">
              <span class="material-symbols-outlined">${v.icono}</span>
              <span>${v.nombre}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  function renderPanel() {
    switch (vistaActiva) {
      case 'rentabilidad': return renderRentabilidad();
      case 'patrimonio': return renderPatrimonio();
      case 'inventario': return renderInventario();
      default: return '<div class="rep-panel">Vista no encontrada</div>';
    }
  }

  // ==========================================
  // 3. PERÍODOS (siempre hora local)
  // ==========================================
  function finDeDia(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999); }

  function getRangoPeriodo(periodo) {
    const ahora = new Date();
    const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    const hasta = finDeDia(hoy);
    let desde;
    if (periodo === 'hoy') {
      desde = hoy;
    } else if (periodo === 'semana') {
      const offset = hoy.getDay() === 0 ? 6 : hoy.getDay() - 1; // la semana empieza el lunes
      desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - offset);
    } else if (periodo === 'mes') {
      desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    } else if (periodo === 'anio') {
      desde = new Date(hoy.getFullYear(), 0, 1);
    } else if (periodo === 'personalizado') {
      return {
        desde: personalizadoDesde ? NUCLEO.parseLocalDate(personalizadoDesde) : new Date(0),
        hasta: personalizadoHasta ? finDeDia(NUCLEO.parseLocalDate(personalizadoHasta)) : hasta
      };
    } else {
      desde = new Date(0);
    }
    return { desde: desde, hasta: hasta };
  }

  function renderSelectorPeriodo() {
    return `
      <div class="rep-period-selector">
        ${periodos.map(p => `<button class="rep-period-btn ${periodoActivo === p.id ? 'active' : ''}" data-periodo="${p.id}">${p.label}</button>`).join('')}
      </div>
      ${periodoActivo === 'personalizado' ? `
        <div class="flex gap-space-md" style="max-width:420px;margin-bottom:var(--space-lg);">
          <div class="flex-1">
            <label class="font-label-md text-on-surface-variant" style="display:block;margin-bottom:var(--space-xs);">Desde</label>
            <input type="date" class="input" id="rep-personalizado-desde" value="${NUCLEO.esc(personalizadoDesde || '')}">
          </div>
          <div class="flex-1">
            <label class="font-label-md text-on-surface-variant" style="display:block;margin-bottom:var(--space-xs);">Hasta</label>
            <input type="date" class="input" id="rep-personalizado-hasta" value="${NUCLEO.esc(personalizadoHasta || '')}">
          </div>
        </div>` : ''}`;
  }

  function bindPeriodEvents() {
    document.querySelectorAll('.rep-period-btn[data-periodo]').forEach(function (btn) {
      btn.addEventListener('click', function () { periodoActivo = this.getAttribute('data-periodo'); render(); });
    });
    const d = document.getElementById('rep-personalizado-desde');
    const h = document.getElementById('rep-personalizado-hasta');
    if (d) d.addEventListener('change', function () { personalizadoDesde = this.value; render(); });
    if (h) h.addEventListener('change', function () { personalizadoHasta = this.value; render(); });
  }

  // ==========================================
  // 4. VISTA: RENTABILIDAD (el cálculo vive en el NÚCLEO, única fuente)
  // ==========================================
  function renderRentabilidad() {
    const rango = getRangoPeriodo(periodoActivo);
    const r = NUCLEO.calcularResultado(rango.desde, rango.hasta);
    return `
      <div class="rep-panel">
        <div class="rep-panel-header">
          <div class="rep-panel-title">Análisis de Rentabilidad</div>
          <div class="rep-panel-badge"><span class="material-symbols-outlined" style="font-size:16px;">verified</span> DATOS SINCRONIZADOS</div>
        </div>
        ${renderSelectorPeriodo()}
        <div class="rep-waterfall">
          <div class="rep-waterfall-title">Estado de Resultados</div>
          <div class="rep-waterfall-row">
            <div class="rep-waterfall-label"><span class="material-symbols-outlined" style="color: var(--color-tertiary-fixed-dim);">arrow_upward</span> (+) VENTAS TOTALES</div>
            <div class="rep-waterfall-value positive" id="rep-ventas">${NUCLEO.money(r.ventasTotales)}</div>
          </div>
          <div class="rep-waterfall-row">
            <div class="rep-waterfall-label"><span class="material-symbols-outlined" style="color: var(--color-error);">arrow_downward</span> (-) CMV DIRECTO</div>
            <div class="rep-waterfall-value negative" id="rep-cmv">-${NUCLEO.money(r.cmv)}</div>
          </div>
          <div class="rep-waterfall-row total">
            <div class="rep-waterfall-label"><span class="material-symbols-outlined">pie_chart</span> (=) MARGEN BRUTO</div>
            <div class="rep-waterfall-value" id="rep-bruto">${NUCLEO.money(r.margenBruto)}</div>
          </div>
          <div class="rep-waterfall-row">
            <div class="rep-waterfall-label"><span class="material-symbols-outlined" style="color: var(--color-error);">arrow_downward</span> (-) GASTOS OPERATIVOS</div>
            <div class="rep-waterfall-value negative" id="rep-gastos">-${NUCLEO.money(r.gastosOperativos)}</div>
          </div>
          <div class="rep-waterfall-row total">
            <div class="rep-waterfall-label"><span class="material-symbols-outlined" style="color: var(--color-primary);">check_circle</span> (=) GANANCIA NETA OPERATIVA</div>
            <div class="rep-waterfall-value ${r.gananciaNeta >= 0 ? 'positive' : 'negative'}" id="rep-neta">${NUCLEO.money(r.gananciaNeta)}</div>
          </div>
        </div>
        <div class="rep-info-box" id="rep-proveedores">
          <strong>Pagado a proveedores en el período:</strong> ${NUCLEO.money(r.pagosProveedores)}. Es plata que salió para reponer mercadería y figura como gasto en FINANZAS, pero no se resta de nuevo acá porque esa mercadería ya está en el CMV (si no, se contaría dos veces).
        </div>
        <div class="rep-info-box">
          <strong>Nota:</strong> El CMV utiliza el costo histórico guardado en la línea de venta al momento de vender, nunca el costo actual de pos_products.
        </div>
      </div>`;
  }

  // ==========================================
  // 5. VISTA: PATRIMONIO (KPI + histórico mes a mes)
  // ==========================================
  function sumaCapital(tipo) {
    return (NUCLEO.getData('pos_finanzas_capital') || []).filter(c => c.tipo === tipo).reduce((s, c) => s + (c.monto || 0), 0);
  }

  // Evolución mensual del saldo de Inversión Neta: aportes + ganancia neta − retiros, acumulado.
  function historialPatrimonio() {
    const ventas = NUCLEO.getData('pos_sales') || [];
    const gastos = NUCLEO.getData('pos_finanzas_gastos') || [];
    const capital = NUCLEO.getData('pos_finanzas_capital') || [];
    const fechas = [];
    ventas.concat(gastos, capital).forEach(function (x) { const f = NUCLEO.localDateOf(x.fecha); if (f) fechas.push(f); });
    if (fechas.length === 0) return [];
    fechas.sort();
    const ini = NUCLEO.parseLocalDate(fechas[0]);
    const hoy = new Date();
    const filas = [];
    let saldo = 0;
    let y = ini.getFullYear();
    let m = ini.getMonth();
    while (y < hoy.getFullYear() || (y === hoy.getFullYear() && m <= hoy.getMonth())) {
      const desde = new Date(y, m, 1);
      const hasta = new Date(y, m + 1, 0, 23, 59, 59, 999);
      const res = NUCLEO.calcularResultado(desde, hasta);
      const enMes = function (c) { const d = NUCLEO.parseLocalDate(c.fecha); return d >= desde && d <= hasta; };
      const aportes = capital.filter(c => c.tipo === 'aporte' && enMes(c)).reduce((s, c) => s + (c.monto || 0), 0);
      const retiros = capital.filter(c => c.tipo === 'retiro' && enMes(c)).reduce((s, c) => s + (c.monto || 0), 0);
      saldo = NUCLEO.roundCents(saldo + aportes + res.gananciaNeta - retiros);
      filas.push({ mes: y + '-' + String(m + 1).padStart(2, '0'), aportes: aportes, ganancia: res.gananciaNeta, retiros: retiros, saldo: saldo });
      m++; if (m > 11) { m = 0; y++; }
    }
    return filas;
  }

  function nombreMes(ym) {
    const p = ym.split('-');
    return ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][parseInt(p[1], 10) - 1] + ' ' + p[0];
  }

  function renderPatrimonio() {
    const aportes = sumaCapital('aporte');
    const retiros = sumaCapital('retiro');
    const ganancias = NUCLEO.getGananciasNetasAcumuladas();
    const inversionNeta = NUCLEO.roundCents(aportes + ganancias - retiros);
    const hist = historialPatrimonio().reverse();
    return `
      <div class="rep-panel">
        <div class="rep-panel-header"><div class="rep-panel-title">Patrimonio</div></div>
        <div class="rep-kpi-card" style="margin-bottom: var(--space-lg);">
          <div class="rep-kpi-label">INVERSIÓN NETA ACTUAL</div>
          <div class="rep-kpi-value" id="rep-inversion">${NUCLEO.money(inversionNeta)}</div>
        </div>
        <div class="rep-kpi-grid">
          <div class="rep-kpi-card"><div class="rep-kpi-label">(+) APORTES DE CAPITAL</div><div class="rep-kpi-value positive">${NUCLEO.money(aportes)}</div></div>
          <div class="rep-kpi-card"><div class="rep-kpi-label">(+) GANANCIAS NETAS ACUMULADAS</div><div class="rep-kpi-value">${NUCLEO.money(ganancias)}</div></div>
          <div class="rep-kpi-card"><div class="rep-kpi-label">(-) RETIROS DEL DUEÑO</div><div class="rep-kpi-value negative">${NUCLEO.money(retiros)}</div></div>
        </div>
        <div class="rep-table-container" style="margin-bottom: var(--space-lg);">
          <div class="rep-table-header"><div class="rep-table-title">Evolución mes a mes</div></div>
          <table class="rep-table">
            <thead><tr><th>Mes</th><th>Aportes</th><th>Ganancia neta</th><th>Retiros</th><th>Saldo acumulado</th></tr></thead>
            <tbody id="rep-historial">
              ${hist.length === 0 ? '<tr><td colspan="5" class="text-on-surface-variant">Todavía no hay movimientos.</td></tr>' : hist.map(f => `
                <tr>
                  <td class="font-semibold">${nombreMes(f.mes)}</td>
                  <td class="font-numeric-tape">${NUCLEO.money(f.aportes)}</td>
                  <td class="font-numeric-tape ${f.ganancia < 0 ? 'text-error' : ''}">${NUCLEO.money(f.ganancia)}</td>
                  <td class="font-numeric-tape">${NUCLEO.money(f.retiros)}</td>
                  <td class="font-numeric-tape font-semibold">${NUCLEO.money(f.saldo)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="rep-info-box"><strong>Fórmula:</strong> Inversión Neta = Aportes + Ganancias Netas Acumuladas - Retiros</div>
      </div>`;
  }

  // ==========================================
  // 6. VISTA: INVENTARIO (valorización)
  // ==========================================
  function renderInventario() {
    const products = (NUCLEO.getData('pos_products') || []).filter(p => p.active !== false);
    const valorCosto = NUCLEO.roundCents(products.reduce((s, p) => s + ((p.stock || 0) * (p.cost || 0)), 0));
    const valorVenta = NUCLEO.roundCents(products.reduce((s, p) => s + ((p.stock || 0) * (p.price || 0)), 0));
    const top5 = products
      .map(p => ({ name: p.name, code: p.code, stock: p.stock || 0, cost: p.cost || 0, valorTotal: (p.stock || 0) * (p.cost || 0) }))
      .sort((a, b) => b.valorTotal - a.valorTotal)
      .slice(0, 5);
    return `
      <div class="rep-panel">
        <div class="rep-panel-header"><div class="rep-panel-title">Inventario</div></div>
        <div class="rep-kpi-grid">
          <div class="rep-kpi-card"><div class="rep-kpi-label">VALOR DE INVENTARIO A COSTO</div><div class="rep-kpi-value" id="rep-inv-costo">${NUCLEO.money(valorCosto)}</div><div class="rep-kpi-subtitle">¿Cuánto tengo congelado en la pared?</div></div>
          <div class="rep-kpi-card"><div class="rep-kpi-label">VALOR DE INVENTARIO A PRECIO DE VENTA</div><div class="rep-kpi-value" id="rep-inv-venta">${NUCLEO.money(valorVenta)}</div><div class="rep-kpi-subtitle">¿Cuánto vale si lo vendo todo hoy?</div></div>
          <div class="rep-kpi-card"><div class="rep-kpi-label">MARGEN POTENCIAL</div><div class="rep-kpi-value positive" id="rep-inv-margen">${NUCLEO.money(NUCLEO.roundCents(valorVenta - valorCosto))}</div><div class="rep-kpi-subtitle">Ganancia bruta si se vende todo el stock</div></div>
        </div>
        <div class="rep-table-container">
          <div class="rep-table-header"><div class="rep-table-title">Top 5 Productos con Mayor Valor Inmovilizado</div></div>
          <table class="rep-table">
            <thead><tr><th>Nombre</th><th>Código</th><th>Stock</th><th>Costo Unitario</th><th>Valor Total a Costo</th></tr></thead>
            <tbody>
              ${top5.length === 0 ? '<tr><td colspan="5" class="text-on-surface-variant">Sin productos activos.</td></tr>' : top5.map(p => `
                <tr>
                  <td class="font-semibold">${NUCLEO.esc(p.name)}</td>
                  <td class="font-mono">${NUCLEO.esc(p.code)}</td>
                  <td>${p.stock}</td>
                  <td class="font-numeric-tape">${NUCLEO.money(p.cost)}</td>
                  <td class="font-numeric-tape font-semibold">${NUCLEO.money(p.valorTotal)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function bindSidebarEvents() {
    document.querySelectorAll('.rep-sidebar-item[data-vista]').forEach(function (item) {
      item.addEventListener('click', function () { vistaActiva = this.getAttribute('data-vista'); render(); });
    });
  }

  window.REPORTES = {
    init: init, onShow: onShow, onHide: onHide, onEscape: onEscape,
    _rango: getRangoPeriodo, _historialPatrimonio: historialPatrimonio // expuestos para los tests
  };
})();
