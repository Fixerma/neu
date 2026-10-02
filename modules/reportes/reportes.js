/* ============================================
   NEURORA POS - REPORTES (ANEXO F)
   Módulo de solo lectura y cálculo
   Namespace: .rep-*
   ============================================ */

(function () {
  'use strict';

  // Estado local
  let vistaActiva = 'rentabilidad';
  let periodoActivo = 'hoy';
  let personalizadoDesde = null;
  let personalizadoHasta = null;
  let listenersAttached = false; // showTab() del NÚCLEO llama init() en cada visita;
                                  // este flag evita acumular listeners de keydown.
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
  // 1. INICIALIZACIÓN
  // ==========================================
  function init() {
    render();

    if (listenersAttached) return; // setup de una sola vez, ver comentario junto al flag
    listenersAttached = true;
    
    // Atajo ESC
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        NUCLEO.showTab('caja');
      }
    });
  }

  function onShow() {
    render();
  }

  // ==========================================
  // 2. RENDERIZADO PRINCIPAL
  // ==========================================
  function render() {
    const container = document.getElementById('moduleContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="rep-layout">
        ${renderSidebar()}
        <div class="rep-main">
          ${renderPanel()}
        </div>
      </div>
    `;

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
            </div>
          `).join('')}
        </div>
      </div>
    `;
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
  // 2.5 FILTRO DE PERÍODO
  // ==========================================
  function getRangoPeriodo(periodo) {
    const ahora = new Date();
    const hasta = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 23, 59, 59, 999);
    let desde;

    if (periodo === 'hoy') {
      desde = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate(), 0, 0, 0, 0);
    } else if (periodo === 'semana') {
      const diaSemana = ahora.getDay(); // 0 = domingo
      const offset = diaSemana === 0 ? 6 : diaSemana - 1; // semana empieza el lunes
      desde = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - offset, 0, 0, 0, 0);
    } else if (periodo === 'mes') {
      desde = new Date(ahora.getFullYear(), ahora.getMonth(), 1, 0, 0, 0, 0);
    } else if (periodo === 'anio') {
      desde = new Date(ahora.getFullYear(), 0, 1, 0, 0, 0, 0);
    } else if (periodo === 'personalizado') {
      return {
        desde: personalizadoDesde ? new Date(personalizadoDesde + 'T00:00:00') : new Date(0),
        hasta: personalizadoHasta ? new Date(personalizadoHasta + 'T23:59:59') : hasta
      };
    } else {
      desde = new Date(0);
    }
    return { desde: desde, hasta: hasta };
  }

  function filtrarPorFecha(items, campoFecha) {
    const rango = getRangoPeriodo(periodoActivo);
    return items.filter(function (item) {
      const f = new Date(item[campoFecha]);
      return f >= rango.desde && f <= rango.hasta;
    });
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
            <input type="date" class="input" id="rep-personalizado-desde" value="${personalizadoDesde || ''}">
          </div>
          <div class="flex-1">
            <label class="font-label-md text-on-surface-variant" style="display:block;margin-bottom:var(--space-xs);">Hasta</label>
            <input type="date" class="input" id="rep-personalizado-hasta" value="${personalizadoHasta || ''}">
          </div>
        </div>
      ` : ''}
    `;
  }

  function bindPeriodEvents() {
    document.querySelectorAll('.rep-period-btn[data-periodo]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        periodoActivo = this.getAttribute('data-periodo');
        render();
      });
    });
    const desdeInput = document.getElementById('rep-personalizado-desde');
    const hastaInput = document.getElementById('rep-personalizado-hasta');
    if (desdeInput) desdeInput.addEventListener('change', function () { personalizadoDesde = this.value; render(); });
    if (hastaInput) hastaInput.addEventListener('change', function () { personalizadoHasta = this.value; render(); });
  }

  // ==========================================
  // 3. VISTA: RENTABILIDAD
  // ==========================================
  function renderRentabilidad() {
    const ventas = filtrarPorFecha(NUCLEO.getData('pos_sales') || [], 'fecha');
    const gastos = filtrarPorFecha(NUCLEO.getData('pos_finanzas_gastos') || [], 'fecha');
    
    // Cálculos (usando costo histórico de la línea de venta)
    const ventasTotales = ventas.reduce((sum, v) => sum + (v.total || 0), 0);
    const cmv = ventas.reduce((sum, v) => {
      return sum + (v.items || []).reduce((itemSum, item) => {
        return itemSum + ((item.cost || 0) * (item.qty || 1));
      }, 0);
    }, 0);
    const margenBruto = ventasTotales - cmv;
    const gastosOperativos = gastos.reduce((sum, g) => sum + (g.monto || 0), 0);
    const gananciaNeta = margenBruto - gastosOperativos;

    return `
      <div class="rep-panel">
        <div class="rep-panel-header">
          <div class="rep-panel-title">Análisis de Rentabilidad</div>
          <div class="rep-panel-badge">
            <span class="material-symbols-outlined" style="font-size:16px;">verified</span>
            DATOS SINCRONIZADOS
          </div>
        </div>

        ${renderSelectorPeriodo()}

        <div class="rep-waterfall">
          <div class="rep-waterfall-title">Estado de Resultados</div>
          
          <div class="rep-waterfall-row">
            <div class="rep-waterfall-label">
              <span class="material-symbols-outlined" style="color: var(--color-tertiary-fixed-dim);">arrow_upward</span>
              (+) VENTAS TOTALES
            </div>
            <div class="rep-waterfall-value positive">${NUCLEO.money(ventasTotales)}</div>
          </div>
          
          <div class="rep-waterfall-row">
            <div class="rep-waterfall-label">
              <span class="material-symbols-outlined" style="color: var(--color-error);">arrow_downward</span>
              (-) CMV DIRECTO
            </div>
            <div class="rep-waterfall-value negative">-${NUCLEO.money(cmv)}</div>
          </div>
          
          <div class="rep-waterfall-row total">
            <div class="rep-waterfall-label">
              <span class="material-symbols-outlined">pie_chart</span>
              (=) MARGEN BRUTO
            </div>
            <div class="rep-waterfall-value">${NUCLEO.money(margenBruto)}</div>
          </div>
          
          <div class="rep-waterfall-row">
            <div class="rep-waterfall-label">
              <span class="material-symbols-outlined" style="color: var(--color-error);">arrow_downward</span>
              (-) GASTOS OPERATIVOS
            </div>
            <div class="rep-waterfall-value negative">-${NUCLEO.money(gastosOperativos)}</div>
          </div>
          
          <div class="rep-waterfall-row total">
            <div class="rep-waterfall-label">
              <span class="material-symbols-outlined" style="color: var(--color-primary);">check_circle</span>
              (=) GANANCIA NETA OPERATIVA
            </div>
            <div class="rep-waterfall-value ${gananciaNeta >= 0 ? 'positive' : 'negative'}">${NUCLEO.money(gananciaNeta)}</div>
          </div>
        </div>

        <div class="rep-info-box">
          <strong>Nota:</strong> El CMV utiliza el costo histórico guardado en la línea de venta al momento de vender, nunca el costo actual de pos_products.
        </div>
      </div>
    `;
  }

  // ==========================================
  // 4. VISTA: PATRIMONIO
  // ==========================================
  function renderPatrimonio() {
    const capital = NUCLEO.getData('pos_finanzas_capital') || [];
    const aportes = capital.filter(c => c.tipo === 'aporte').reduce((sum, c) => sum + (c.monto || 0), 0);
    const retiros = capital.filter(c => c.tipo === 'retiro').reduce((sum, c) => sum + (c.monto || 0), 0);
    
    // Ganancias Netas Acumuladas: histórico completo, mismo cálculo que
    // usa la Vista Rentabilidad (sin filtro de período — "acumuladas" es
    // siempre histórico completo por definición, ANEXO F §4).
    const gananciasNetas = NUCLEO.getGananciasNetasAcumuladas();
    const inversionNeta = aportes + gananciasNetas - retiros;

    return `
      <div class="rep-panel">
        <div class="rep-panel-header">
          <div class="rep-panel-title">Patrimonio</div>
        </div>

        <div class="rep-kpi-card" style="margin-bottom: var(--space-lg);">
          <div class="rep-kpi-label">INVERSIÓN NETA ACTUAL</div>
          <div class="rep-kpi-value">${NUCLEO.money(inversionNeta)}</div>
        </div>

        <div class="rep-kpi-grid">
          <div class="rep-kpi-card">
            <div class="rep-kpi-label">(+) APORTES DE CAPITAL</div>
            <div class="rep-kpi-value positive">${NUCLEO.money(aportes)}</div>
          </div>
          <div class="rep-kpi-card">
            <div class="rep-kpi-label">(+) GANANCIAS NETAS ACUMULADAS</div>
            <div class="rep-kpi-value">${NUCLEO.money(gananciasNetas)}</div>
          </div>
          <div class="rep-kpi-card">
            <div class="rep-kpi-label">(-) RETIROS DEL DUEÑO</div>
            <div class="rep-kpi-value negative">${NUCLEO.money(retiros)}</div>
          </div>
        </div>

        <div class="rep-info-box">
          <strong>Fórmula:</strong> Inversión Neta = Aportes + Ganancias Netas Acumuladas - Retiros
        </div>
      </div>
    `;
  }

  // ==========================================
  // 5. VISTA: INVENTARIO
  // ==========================================
  function renderInventario() {
    const products = (NUCLEO.getData('pos_products') || []).filter(p => p.active !== false);
    
    const valorCosto = products.reduce((sum, p) => sum + ((p.stock || 0) * (p.cost || 0)), 0);
    const valorVenta = products.reduce((sum, p) => sum + ((p.stock || 0) * (p.price || 0)), 0);
    const margenPotencial = valorVenta - valorCosto;

    // Top 5 productos con mayor valor inmovilizado
    const top5 = products
      .map(p => ({
        name: p.name,
        code: p.code,
        stock: p.stock || 0,
        cost: p.cost || 0,
        valorTotal: (p.stock || 0) * (p.cost || 0)
      }))
      .sort((a, b) => b.valorTotal - a.valorTotal)
      .slice(0, 5);

    return `
      <div class="rep-panel">
        <div class="rep-panel-header">
          <div class="rep-panel-title">Inventario</div>
        </div>

        <div class="rep-kpi-grid">
          <div class="rep-kpi-card">
            <div class="rep-kpi-label">VALOR DE INVENTARIO A COSTO</div>
            <div class="rep-kpi-value">${NUCLEO.money(valorCosto)}</div>
            <div class="rep-kpi-subtitle">¿Cuánto tengo congelado en la pared?</div>
          </div>
          <div class="rep-kpi-card">
            <div class="rep-kpi-label">VALOR DE INVENTARIO A PRECIO DE VENTA</div>
            <div class="rep-kpi-value">${NUCLEO.money(valorVenta)}</div>
            <div class="rep-kpi-subtitle">¿Cuánto vale si lo vendo todo hoy?</div>
          </div>
          <div class="rep-kpi-card">
            <div class="rep-kpi-label">MARGEN POTENCIAL</div>
            <div class="rep-kpi-value positive">${NUCLEO.money(margenPotencial)}</div>
            <div class="rep-kpi-subtitle">Ganancia bruta si se vende todo el stock</div>
          </div>
        </div>

        <div class="rep-table-container">
          <div class="rep-table-header">
            <div class="rep-table-title">Top 5 Productos con Mayor Valor Inmovilizado</div>
          </div>
          <table class="rep-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Código</th>
                <th>Stock</th>
                <th>Costo Unitario</th>
                <th>Valor Total a Costo</th>
              </tr>
            </thead>
            <tbody>
              ${top5.map(p => `
                <tr>
                  <td class="font-semibold">${NUCLEO.esc(p.name)}</td>
                  <td class="font-mono">${NUCLEO.esc(p.code)}</td>
                  <td>${p.stock}</td>
                  <td class="font-numeric-tape">${NUCLEO.money(p.cost)}</td>
                  <td class="font-numeric-tape font-semibold">${NUCLEO.money(p.valorTotal)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ==========================================
  // 6. EVENTOS Y BINDINGS
  // ==========================================
  function bindSidebarEvents() {
    document.querySelectorAll('.rep-sidebar-item[data-vista]').forEach(item => {
      item.addEventListener('click', function () {
        vistaActiva = this.getAttribute('data-vista');
        render();
      });
    });
  }

  // ==========================================
  // 7. API PÚBLICA
  // ==========================================
  window.REPORTES = {
    init: init,
    onShow: onShow
  };

  // Auto-inicializar
  if (document.getElementById('moduleContainer')) {
    init();
  }

})();