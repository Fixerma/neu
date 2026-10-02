/* ============================================
   NEURORA POS - FINANZAS (ANEXO E)
   Módulo de control de flujo de dinero
   ============================================ */

(function () {
  'use strict';

  // Estado local
  let vistaActiva = 'dashboard';
  let listenersAttached = false; // showTab() del NÚCLEO llama init() en cada visita a la
                                  // pestaña; sin este flag, cada visita agregaba un nuevo
                                  // listener de 'pos:facturaRecibida', duplicando reservas
                                  // automáticas por cada factura recibida.
  const vistas = [
    { id: 'dashboard', nombre: 'Dashboard', icono: 'pie_chart' },
    { id: 'reservas', nombre: 'Reservas', icono: 'savings' },
    { id: 'gastos', nombre: 'Gastos', icono: 'credit_card' },
    { id: 'patrimonio', nombre: 'Patrimonio', icono: 'account_balance' }
  ];

  // ==========================================
  // 1. INICIALIZACIÓN
  // ==========================================
  function init() {
    render();

    if (listenersAttached) return; // setup de una sola vez, ver comentario junto al flag
    listenersAttached = true;
    
    // Escuchar evento de factura recibida
    NUCLEO.on('pos:facturaRecibida', function (payload) {
      if (payload.diasCredito > 0) {
        crearReservaAutomatica(payload);
      }
    });

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
      <div class="fin-layout">
        ${renderSidebar()}
        <div class="fin-main">
          ${renderPanel()}
        </div>
      </div>
    `;

    bindSidebarEvents();
  }

  function renderSidebar() {
    return `
      <div class="fin-sidebar">
        <div class="fin-sidebar-header">
          <div class="fin-sidebar-title">FINANZAS</div>
          <div class="fin-sidebar-subtitle">Control de fondos y reservas</div>
        </div>
        <div class="fin-sidebar-section">
          ${vistas.map(v => `
            <div class="fin-sidebar-item ${vistaActiva === v.id ? 'active' : ''}" data-vista="${v.id}">
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
      case 'dashboard': return renderDashboard();
      case 'reservas': return renderReservas();
      case 'gastos': return renderGastos();
      case 'patrimonio': return renderPatrimonio();
      default: return '<div class="fin-panel">Vista no encontrada</div>';
    }
  }

  // ==========================================
  // 3. VISTA: DASHBOARD
  // ==========================================
  function renderDashboard() {
    const ciclo = NUCLEO.getCicloAbierto();
    const reservas = NUCLEO.getData('pos_finanzas_reservas');
    
    // Calcular Efectivo Total
    let efectivoTotal = 0;
    if (ciclo) {
      const ventasEfectivo = NUCLEO.getVentasPorMetodo(ciclo.id)['cash'] || 0;
      const subcaja = NUCLEO.getVentasSubCajaDelCiclo(ciclo.id);
      efectivoTotal = (ciclo.montoApertura || 0) + ventasEfectivo - subcaja;
    }
    
    // Calcular Efectivo Reservado
    const efectivoReservado = reservas
      .filter(r => r.estado === 'activa')
      .reduce((sum, r) => sum + (r.monto || 0), 0);
    
    // Calcular Efectivo Disponible
    const efectivoDisponible = efectivoTotal - efectivoReservado;
    
    // Próximos Vencimientos (≤3 días)
    const hoy = new Date();
    const tresDias = new Date(hoy.getTime() + 3 * 24 * 60 * 60 * 1000);
    const proximosVencimientos = reservas
      .filter(r => {
        if (r.estado !== 'activa') return false;
        const vencimiento = new Date(r.fechaVencimiento);
        return vencimiento >= hoy && vencimiento <= tresDias;
      })
      .sort((a, b) => new Date(a.fechaVencimiento) - new Date(b.fechaVencimiento));

    return `
      <div class="fin-panel">
        <div class="fin-panel-header">
          <div class="fin-panel-title">Flujo de Caja en Tiempo Real</div>
          <div class="fin-panel-subtitle">Auditoría consolidada de activos monetarios, custodia en bóveda y asignación de fondos.</div>
        </div>

        <div class="fin-kpi-grid">
          <div class="fin-kpi-card">
            <div class="fin-kpi-label">EFECTIVO TOTAL</div>
            <div class="fin-kpi-value">${NUCLEO.money(efectivoTotal)}</div>
          </div>
          <div class="fin-kpi-card">
            <div class="fin-kpi-label">EFECTIVO RESERVADO</div>
            <div class="fin-kpi-value">${NUCLEO.money(efectivoReservado)}</div>
          </div>
          <div class="fin-kpi-card">
            <div class="fin-kpi-label">EFECTIVO DISPONIBLE</div>
            <div class="fin-kpi-value ${efectivoDisponible >= 0 ? 'positive' : 'negative'}">${NUCLEO.money(efectivoDisponible)}</div>
          </div>
        </div>

        <div class="fin-vencimientos-section">
          <div class="fin-vencimientos-header">
            <div class="fin-vencimientos-title">PRÓXIMOS VENCIMIENTOS</div>
            <div class="fin-vencimientos-count">${proximosVencimientos.length} Registros</div>
          </div>
          ${proximosVencimientos.length === 0 ? '<p class="font-body-md text-on-surface-variant">No hay vencimientos próximos</p>' : ''}
          <table class="fin-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Monto</th>
                <th>Fecha Vencimiento</th>
                <th>Categoría</th>
              </tr>
            </thead>
            <tbody>
              ${proximosVencimientos.map(r => `
                <tr>
                  <td>${NUCLEO.esc(r.nombre)}</td>
                  <td class="font-numeric-tape font-semibold">${NUCLEO.money(r.monto)}</td>
                  <td>${formatDate(r.fechaVencimiento)}</td>
                  <td>${NUCLEO.esc(r.categoria)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ==========================================
  // 4. VISTA: RESERVAS
  // ==========================================
  function renderReservas() {
    const reservas = NUCLEO.getData('pos_finanzas_reservas');
    const reservasActivas = reservas.filter(r => r.estado !== 'cancelada');

    return `
      <div class="fin-panel">
        <div class="fin-panel-header">
          <div class="fin-panel-title">Reservas</div>
        </div>

        <div class="fin-form">
          <div class="fin-form-title">Nueva Reserva</div>
          <div class="fin-form-row">
            <div class="fin-form-group">
              <label class="fin-form-label">Nombre <span class="required">*</span></label>
              <input type="text" class="fin-form-input" id="reserva-nombre" placeholder="Proveedor Aza, Alquiler Enero...">
            </div>
            <div class="fin-form-group">
              <label class="fin-form-label">Monto <span class="required">*</span></label>
              <input type="number" class="fin-form-input" id="reserva-monto" placeholder="0">
            </div>
          </div>
          <div class="fin-form-row">
            <div class="fin-form-group">
              <label class="fin-form-label">Fecha Vencimiento <span class="required">*</span></label>
              <input type="date" class="fin-form-input" id="reserva-fecha">
            </div>
            <div class="fin-form-group">
              <label class="fin-form-label">Categoría <span class="required">*</span></label>
              <select class="fin-form-select" id="reserva-categoria">
                <option value="Proveedor">Proveedor</option>
                <option value="Sueldo">Sueldo</option>
                <option value="Alquiler">Alquiler</option>
                <option value="Impuesto">Impuesto</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Detalle (opcional)</label>
            <input type="text" class="fin-form-input" id="reserva-detalle" placeholder="Detalle adicional...">
          </div>
          <div class="fin-form-actions">
            <button class="btn btn-secondary" onclick="window.FINANZAS.cancelarReserva()">CANCELAR</button>
            <button class="btn btn-primary" onclick="window.FINANZAS.guardarReserva()">GUARDAR RESERVA</button>
          </div>
        </div>

        <div class="fin-table-container">
          <div class="fin-table-header">
            <div class="fin-table-title">Reservas Activas</div>
          </div>
          <table class="fin-table">
            <thead>
              <tr>
                <th>NOMBRE</th>
                <th>MONTO</th>
                <th>VENCIMIENTO</th>
                <th>CATEGORÍA</th>
                <th>ESTADO</th>
                <th>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              ${reservasActivas.map(r => `
                <tr>
                  <td class="font-semibold">${NUCLEO.esc(r.nombre)}</td>
                  <td class="font-numeric-tape font-semibold">${NUCLEO.money(r.monto)}</td>
                  <td>${formatDate(r.fechaVencimiento)}</td>
                  <td>${NUCLEO.esc(r.categoria)}</td>
                  <td>
                    <span class="fin-badge fin-badge-${r.estado}">● ${capitalize(r.estado)}</span>
                  </td>
                  <td>
                    <div class="fin-table-actions">
                      <button class="fin-table-btn" onclick="window.FINANZAS.editarReserva('${r.id}')">EDITAR</button>
                      ${r.estado === 'activa' ? `
                        <button class="fin-table-btn" onclick="window.FINANZAS.pagarAhora('${r.id}')">PAGAR AHORA</button>
                        <button class="fin-table-btn danger" onclick="window.FINANZAS.cancelarReservaItem('${r.id}')">CANCELAR</button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ==========================================
  // 5. VISTA: GASTOS
  // ==========================================
  function renderGastos() {
    const gastos = NUCLEO.getData('pos_finanzas_gastos');
    const reservas = NUCLEO.getData('pos_finanzas_reservas');
    const reservasActivas = reservas.filter(r => r.estado === 'activa');

    return `
      <div class="fin-panel">
        <div class="fin-panel-header">
          <div class="fin-panel-title">Gastos</div>
        </div>

        <div class="fin-form">
          <div class="fin-form-title">Nuevo Gasto</div>
          <div class="fin-form-row">
            <div class="fin-form-group">
              <label class="fin-form-label">Categoría <span class="required">*</span></label>
              <select class="fin-form-select" id="gasto-categoria">
                <option value="Luz">Luz</option>
                <option value="Agua">Agua</option>
                <option value="Alquiler">Alquiler</option>
                <option value="Sueldo">Sueldo</option>
                <option value="AFIP">AFIP</option>
                <option value="Proveedor">Proveedor</option>
                <option value="Internet">Internet</option>
                <option value="Rentas">Rentas</option>
                <option value="Otro">Otro</option>
              </select>
            </div>
            <div class="fin-form-group">
              <label class="fin-form-label">Monto <span class="required">*</span></label>
              <input type="number" class="fin-form-input" id="gasto-monto" placeholder="0">
            </div>
          </div>
          <div class="fin-form-row">
            <div class="fin-form-group">
              <label class="fin-form-label">Fecha <span class="required">*</span></label>
              <input type="date" class="fin-form-input" id="gasto-fecha" value="${NUCLEO.today()}">
            </div>
            <div class="fin-form-group">
              <label class="fin-form-label">Vincular a Reserva (opcional)</label>
              <select class="fin-form-select" id="gasto-reserva">
                <option value="">Sin vincular</option>
                ${reservasActivas.map(r => `<option value="${r.id}">${NUCLEO.esc(r.nombre)} (${NUCLEO.money(r.monto)})</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="fin-form-group">
            <label class="fin-form-label">Detalle (opcional)</label>
            <input type="text" class="fin-form-input" id="gasto-detalle" placeholder="Factura Luz Diciembre...">
          </div>
          <div class="fin-info-box">
            Si se selecciona una reserva, la reserva pasa a estado pagada
          </div>
          <div class="fin-form-actions">
            <button class="btn btn-secondary" onclick="window.FINANZAS.cancelarGasto()">CANCELAR</button>
            <button class="btn btn-primary" onclick="window.FINANZAS.guardarGasto()">GUARDAR GASTO</button>
          </div>
        </div>

        <div class="fin-table-container">
          <div class="fin-table-header">
            <div class="fin-table-title">Gastos Registrados</div>
          </div>
          <table class="fin-table">
            <thead>
              <tr>
                <th>FECHA</th>
                <th>CATEGORÍA</th>
                <th>DETALLE</th>
                <th>MONTO</th>
                <th>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              ${gastos.map(g => `
                <tr>
                  <td>${formatDate(g.fecha)}</td>
                  <td>${NUCLEO.esc(g.categoria)}</td>
                  <td>${NUCLEO.esc(g.detalle || '—')}</td>
                  <td class="font-numeric-tape font-semibold">${NUCLEO.money(g.monto)}</td>
                  <td>
                    <div class="fin-table-actions">
                      <button class="fin-table-btn" onclick="window.FINANZAS.editarGasto('${g.id}')">EDITAR</button>
                      <button class="fin-table-btn danger" onclick="window.FINANZAS.eliminarGasto('${g.id}')">ELIMINAR</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ==========================================
  // 6. VISTA: PATRIMONIO
  // ==========================================
  function renderPatrimonio() {
    const capital = NUCLEO.getData('pos_finanzas_capital');
    const aportes = capital.filter(c => c.tipo === 'aporte').reduce((sum, c) => sum + (c.monto || 0), 0);
    const retiros = capital.filter(c => c.tipo === 'retiro').reduce((sum, c) => sum + (c.monto || 0), 0);
    
    // Ganancias Netas Acumuladas: FINANZAS no tiene permiso de leer pos_sales
    // directamente (su contrato de datos solo lee pos_cierres, pos_ciclo_actual,
    // pos_products, pos_suppliers), así que se pide el número ya calculado al
    // servicio compartido de NÚCLEO (mismo cálculo, histórico completo, que usa
    // REPORTES en su Vista Rentabilidad).
    const gananciasNetas = NUCLEO.getGananciasNetasAcumuladas();
    const inversionNeta = aportes + gananciasNetas - retiros;

    return `
      <div class="fin-panel">
        <div class="fin-panel-header">
          <div class="fin-panel-title">Patrimonio</div>
        </div>

        <div class="fin-patrimonio-kpi">
          <div class="fin-patrimonio-kpi-label">INVERSIÓN NETA ACTUAL</div>
          <div class="fin-patrimonio-kpi-value">${NUCLEO.money(inversionNeta)}</div>
          <div class="fin-patrimonio-desglose">
            <div class="fin-desglose-item">
              <div class="fin-desglose-label">(+) APORTES DE CAPITAL</div>
              <div class="fin-desglose-value">${NUCLEO.money(aportes)}</div>
            </div>
            <div class="fin-desglose-item">
              <div class="fin-desglose-label">(+) GANANCIAS NETAS ACUMULADAS</div>
              <div class="fin-desglose-value">${NUCLEO.money(gananciasNetas)}</div>
            </div>
            <div class="fin-desglose-item">
              <div class="fin-desglose-label">(-) RETIROS DEL DUEÑO</div>
              <div class="fin-desglose-value">${NUCLEO.money(retiros)}</div>
            </div>
          </div>
        </div>

        <div class="fin-form">
          <div class="fin-form-title">Nuevo Movimiento de Capital</div>
          <div class="fin-form-row">
            <div class="fin-form-group">
              <label class="fin-form-label">Tipo <span class="required">*</span></label>
              <select class="fin-form-select" id="capital-tipo">
                <option value="aporte">APORTE DE CAPITAL</option>
                <option value="retiro">RETIRO DEL DUEÑO</option>
              </select>
            </div>
            <div class="fin-form-group">
              <label class="fin-form-label">Monto <span class="required">*</span></label>
              <input type="number" class="fin-form-input" id="capital-monto" placeholder="0">
            </div>
          </div>
          <div class="fin-form-row">
            <div class="fin-form-group">
              <label class="fin-form-label">Fecha <span class="required">*</span></label>
              <input type="date" class="fin-form-input" id="capital-fecha" value="${NUCLEO.today()}">
            </div>
            <div class="fin-form-group">
              <label class="fin-form-label">Detalle (opcional)</label>
              <input type="text" class="fin-form-input" id="capital-detalle" placeholder="Aporte inicial, Retiro para gastos personales...">
            </div>
          </div>
          <div class="fin-form-actions">
            <button class="btn btn-secondary" onclick="window.FINANZAS.cancelarCapital()">CANCELAR</button>
            <button class="btn btn-primary" onclick="window.FINANZAS.guardarCapital()">GUARDAR MOVIMIENTO</button>
          </div>
        </div>

        <div class="fin-table-container">
          <div class="fin-table-header">
            <div class="fin-table-title">Movimientos de Capital</div>
          </div>
          <table class="fin-table">
            <thead>
              <tr>
                <th>FECHA</th>
                <th>TIPO</th>
                <th>MONTO</th>
                <th>DETALLE</th>
                <th>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              ${capital.map(c => `
                <tr>
                  <td>${formatDate(c.fecha)}</td>
                  <td>${c.tipo === 'aporte' ? 'Aporte de Capital' : 'Retiro del Dueño'}</td>
                  <td class="font-numeric-tape font-semibold ${c.tipo === 'aporte' ? 'text-tertiary-fixed-dim' : 'text-error'}">
                    ${c.tipo === 'aporte' ? '+' : '-'}${NUCLEO.money(c.monto)}
                  </td>
                  <td>${NUCLEO.esc(c.detalle || '—')}</td>
                  <td>
                    <div class="fin-table-actions">
                      <button class="fin-table-btn" onclick="window.FINANZAS.editarCapital('${c.id}')">EDITAR</button>
                      <button class="fin-table-btn danger" onclick="window.FINANZAS.eliminarCapital('${c.id}')">ELIMINAR</button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ==========================================
  // 7. EVENTOS Y BINDINGS
  // ==========================================
  function bindSidebarEvents() {
    document.querySelectorAll('.fin-sidebar-item[data-vista]').forEach(item => {
      item.addEventListener('click', function () {
        vistaActiva = this.getAttribute('data-vista');
        render();
      });
    });
  }

  // ==========================================
  // 8. ACCIONES: RESERVAS
  // ==========================================
  // Modal de edición genérico (reemplaza los prompt() nativos por un modal
  // propio .fin-modal-*, consistente con el resto de la estética del sistema).
  function abrirModalEditar(titulo, bodyHtml, onGuardar) {
    cerrarModalEditar();
    const overlay = document.createElement('div');
    overlay.className = 'fin-modal-overlay';
    overlay.id = 'fin-modal-overlay';
    overlay.innerHTML = `
      <div class="fin-modal">
        <div class="fin-modal-header">
          <div class="fin-modal-title">${titulo}</div>
          <div class="fin-modal-close" id="fin-modal-close">&times;</div>
        </div>
        <div class="fin-modal-body">${bodyHtml}</div>
        <div class="fin-modal-footer">
          <button class="btn btn-secondary" id="fin-modal-cancelar">CANCELAR</button>
          <button class="btn btn-primary" id="fin-modal-guardar">GUARDAR</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('fin-modal-close').addEventListener('click', cerrarModalEditar);
    document.getElementById('fin-modal-cancelar').addEventListener('click', cerrarModalEditar);
    document.getElementById('fin-modal-guardar').addEventListener('click', function () {
      if (onGuardar() !== false) cerrarModalEditar();
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) cerrarModalEditar();
    });
  }

  function cerrarModalEditar() {
    const overlay = document.getElementById('fin-modal-overlay');
    if (overlay) overlay.remove();
  }

  function guardarReserva() {
    const nombre = document.getElementById('reserva-nombre').value.trim();
    const monto = parseFloat(document.getElementById('reserva-monto').value);
    const fechaVencimiento = document.getElementById('reserva-fecha').value;
    const categoria = document.getElementById('reserva-categoria').value;
    const detalle = document.getElementById('reserva-detalle').value.trim();

    if (!nombre || isNaN(monto) || !fechaVencimiento) {
      NUCLEO.toast('Complete los campos obligatorios', 'error');
      return;
    }

    const reservas = NUCLEO.getData('pos_finanzas_reservas');
    const userId = (NUCLEO.getUsuarioActivo() || {}).id || null;

    const nuevaReserva = {
      id: NUCLEO.uid(),
      nombre: nombre,
      monto: monto,
      fechaVencimiento: fechaVencimiento,
      categoria: categoria,
      detalle: detalle,
      estado: 'activa',
      fecha: NUCLEO.nowISO(),
      userId: userId
    };

    reservas.push(nuevaReserva);
    NUCLEO.setData('pos_finanzas_reservas', reservas);
    NUCLEO.toast('Reserva guardada', 'success');
    render();
  }

  function editarReserva(id) {
    const reservas = NUCLEO.getData('pos_finanzas_reservas');
    const r = reservas.find(x => x.id === id);
    if (!r) return;

    const categoriasOpts = ['Proveedor', 'Sueldo', 'Alquiler', 'Impuesto', 'Otro'];
    abrirModalEditar('Editar Reserva', `
      <div class="fin-form-group">
        <label class="fin-form-label">Nombre <span class="required">*</span></label>
        <input type="text" class="fin-form-input" id="edit-reserva-nombre" value="${NUCLEO.esc(r.nombre)}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Monto <span class="required">*</span></label>
        <input type="number" class="fin-form-input" id="edit-reserva-monto" value="${r.monto}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Fecha Vencimiento <span class="required">*</span></label>
        <input type="date" class="fin-form-input" id="edit-reserva-fecha" value="${r.fechaVencimiento}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Categoría <span class="required">*</span></label>
        <select class="fin-form-select" id="edit-reserva-categoria">
          ${categoriasOpts.map(c => `<option value="${c}" ${c === r.categoria ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Detalle</label>
        <input type="text" class="fin-form-input" id="edit-reserva-detalle" value="${NUCLEO.esc(r.detalle || '')}">
      </div>
    `, function () {
      const nombre = document.getElementById('edit-reserva-nombre').value.trim();
      const monto = parseFloat(document.getElementById('edit-reserva-monto').value);
      const fechaVencimiento = document.getElementById('edit-reserva-fecha').value;
      const categoria = document.getElementById('edit-reserva-categoria').value;
      const detalle = document.getElementById('edit-reserva-detalle').value.trim();

      if (!nombre || isNaN(monto) || !fechaVencimiento) {
        NUCLEO.toast('Complete los campos obligatorios', 'error');
        return false;
      }

      r.nombre = nombre;
      r.monto = monto;
      r.fechaVencimiento = fechaVencimiento;
      r.categoria = categoria;
      r.detalle = detalle;
      NUCLEO.setData('pos_finanzas_reservas', reservas);
      NUCLEO.toast('Reserva actualizada', 'success');
      render();
    });
  }

  function pagarAhora(id) {
    const reservas = NUCLEO.getData('pos_finanzas_reservas');
    const r = reservas.find(x => x.id === id);
    if (!r) return;

    const gastos = NUCLEO.getData('pos_finanzas_gastos');
    const userId = (NUCLEO.getUsuarioActivo() || {}).id || null;

    const nuevoGasto = {
      id: NUCLEO.uid(),
      categoria: r.categoria,
      monto: r.monto,
      fecha: NUCLEO.today(),
      detalle: r.detalle || `Pago de reserva: ${r.nombre}`,
      reservaId: r.id,
      userId: userId
    };

    gastos.push(nuevoGasto);
    NUCLEO.setData('pos_finanzas_gastos', gastos);

    r.estado = 'pagada';
    NUCLEO.setData('pos_finanzas_reservas', reservas);

    NUCLEO.toast('Reserva pagada y gasto registrado', 'success');
    render();
  }

  function cancelarReservaItem(id) {
    const reservas = NUCLEO.getData('pos_finanzas_reservas');
    const r = reservas.find(x => x.id === id);
    if (!r) return;

    r.estado = 'cancelada';
    NUCLEO.setData('pos_finanzas_reservas', reservas);
    NUCLEO.toast('Reserva cancelada', 'success');
    render();
  }

  function cancelarReserva() {
    document.getElementById('reserva-nombre').value = '';
    document.getElementById('reserva-monto').value = '';
    document.getElementById('reserva-fecha').value = '';
    document.getElementById('reserva-detalle').value = '';
  }

  // ==========================================
  // 9. ACCIONES: GASTOS
  // ==========================================
  function guardarGasto() {
    const categoria = document.getElementById('gasto-categoria').value;
    const monto = parseFloat(document.getElementById('gasto-monto').value);
    const fecha = document.getElementById('gasto-fecha').value;
    const detalle = document.getElementById('gasto-detalle').value.trim();
    const reservaId = document.getElementById('gasto-reserva').value;

    if (isNaN(monto) || !fecha) {
      NUCLEO.toast('Complete los campos obligatorios', 'error');
      return;
    }

    const gastos = NUCLEO.getData('pos_finanzas_gastos');
    const userId = (NUCLEO.getUsuarioActivo() || {}).id || null;

    const nuevoGasto = {
      id: NUCLEO.uid(),
      categoria: categoria,
      monto: monto,
      fecha: fecha,
      detalle: detalle,
      reservaId: reservaId || null,
      userId: userId
    };

    gastos.push(nuevoGasto);
    NUCLEO.setData('pos_finanzas_gastos', gastos);

    // Si está vinculado a una reserva, marcarla como pagada
    if (reservaId) {
      const reservas = NUCLEO.getData('pos_finanzas_reservas');
      const r = reservas.find(x => x.id === reservaId);
      if (r) {
        r.estado = 'pagada';
        NUCLEO.setData('pos_finanzas_reservas', reservas);
      }
    }

    NUCLEO.toast('Gasto registrado', 'success');
    render();
  }

  function editarGasto(id) {
    const gastos = NUCLEO.getData('pos_finanzas_gastos');
    const g = gastos.find(x => x.id === id);
    if (!g) return;

    const categoriasOpts = ['Luz', 'Agua', 'Alquiler', 'Sueldo', 'AFIP', 'Proveedor', 'Internet', 'Rentas', 'Otro'];
    abrirModalEditar('Editar Gasto', `
      <div class="fin-form-group">
        <label class="fin-form-label">Categoría <span class="required">*</span></label>
        <select class="fin-form-select" id="edit-gasto-categoria">
          ${categoriasOpts.map(c => `<option value="${c}" ${c === g.categoria ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Monto <span class="required">*</span></label>
        <input type="number" class="fin-form-input" id="edit-gasto-monto" value="${g.monto}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Fecha <span class="required">*</span></label>
        <input type="date" class="fin-form-input" id="edit-gasto-fecha" value="${(g.fecha || '').slice(0, 10)}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Detalle</label>
        <input type="text" class="fin-form-input" id="edit-gasto-detalle" value="${NUCLEO.esc(g.detalle || '')}">
      </div>
    `, function () {
      const categoria = document.getElementById('edit-gasto-categoria').value;
      const monto = parseFloat(document.getElementById('edit-gasto-monto').value);
      const fecha = document.getElementById('edit-gasto-fecha').value;
      const detalle = document.getElementById('edit-gasto-detalle').value.trim();

      if (isNaN(monto) || !fecha) {
        NUCLEO.toast('Complete los campos obligatorios', 'error');
        return false;
      }

      g.categoria = categoria;
      g.monto = monto;
      g.fecha = fecha;
      g.detalle = detalle;
      NUCLEO.setData('pos_finanzas_gastos', gastos);
      NUCLEO.toast('Gasto actualizado', 'success');
      render();
    });
  }

  function eliminarGasto(id) {
    const gastos = NUCLEO.getData('pos_finanzas_gastos');
    const g = gastos.find(x => x.id === id);
    if (!g) return;

    // Si estaba vinculado a una reserva, devolverla a activa
    if (g.reservaId) {
      const reservas = NUCLEO.getData('pos_finanzas_reservas');
      const r = reservas.find(x => x.id === g.reservaId);
      if (r) {
        r.estado = 'activa';
        NUCLEO.setData('pos_finanzas_reservas', reservas);
      }
    }

    const filtered = gastos.filter(x => x.id !== id);
    NUCLEO.setData('pos_finanzas_gastos', filtered);
    NUCLEO.toast('Gasto eliminado', 'success');
    render();
  }

  function cancelarGasto() {
    document.getElementById('gasto-monto').value = '';
    document.getElementById('gasto-detalle').value = '';
    document.getElementById('gasto-reserva').value = '';
  }

  // ==========================================
  // 10. ACCIONES: PATRIMONIO
  // ==========================================
  function guardarCapital() {
    const tipo = document.getElementById('capital-tipo').value;
    const monto = parseFloat(document.getElementById('capital-monto').value);
    const fecha = document.getElementById('capital-fecha').value;
    const detalle = document.getElementById('capital-detalle').value.trim();

    if (isNaN(monto) || !fecha) {
      NUCLEO.toast('Complete los campos obligatorios', 'error');
      return;
    }

    const capital = NUCLEO.getData('pos_finanzas_capital');
    const userId = (NUCLEO.getUsuarioActivo() || {}).id || null;

    const nuevoMovimiento = {
      id: NUCLEO.uid(),
      tipo: tipo,
      monto: monto,
      fecha: fecha,
      detalle: detalle,
      userId: userId
    };

    capital.push(nuevoMovimiento);
    NUCLEO.setData('pos_finanzas_capital', capital);
    NUCLEO.toast('Movimiento de capital registrado', 'success');
    render();
  }

  function editarCapital(id) {
    const capital = NUCLEO.getData('pos_finanzas_capital');
    const c = capital.find(x => x.id === id);
    if (!c) return;

    abrirModalEditar('Editar Movimiento de Capital', `
      <div class="fin-form-group">
        <label class="fin-form-label">Tipo <span class="required">*</span></label>
        <select class="fin-form-select" id="edit-capital-tipo">
          <option value="aporte" ${c.tipo === 'aporte' ? 'selected' : ''}>APORTE DE CAPITAL</option>
          <option value="retiro" ${c.tipo === 'retiro' ? 'selected' : ''}>RETIRO DEL DUEÑO</option>
        </select>
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Monto <span class="required">*</span></label>
        <input type="number" class="fin-form-input" id="edit-capital-monto" value="${c.monto}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Fecha <span class="required">*</span></label>
        <input type="date" class="fin-form-input" id="edit-capital-fecha" value="${(c.fecha || '').slice(0, 10)}">
      </div>
      <div class="fin-form-group">
        <label class="fin-form-label">Detalle</label>
        <input type="text" class="fin-form-input" id="edit-capital-detalle" value="${NUCLEO.esc(c.detalle || '')}">
      </div>
    `, function () {
      const tipo = document.getElementById('edit-capital-tipo').value;
      const monto = parseFloat(document.getElementById('edit-capital-monto').value);
      const fecha = document.getElementById('edit-capital-fecha').value;
      const detalle = document.getElementById('edit-capital-detalle').value.trim();

      if (isNaN(monto) || !fecha) {
        NUCLEO.toast('Complete los campos obligatorios', 'error');
        return false;
      }

      c.tipo = tipo;
      c.monto = monto;
      c.fecha = fecha;
      c.detalle = detalle;
      NUCLEO.setData('pos_finanzas_capital', capital);
      NUCLEO.toast('Movimiento actualizado', 'success');
      render();
    });
  }

  function eliminarCapital(id) {
    const capital = NUCLEO.getData('pos_finanzas_capital');
    const filtered = capital.filter(x => x.id !== id);
    NUCLEO.setData('pos_finanzas_capital', filtered);
    NUCLEO.toast('Movimiento eliminado', 'success');
    render();
  }

  function cancelarCapital() {
    document.getElementById('capital-monto').value = '';
    document.getElementById('capital-detalle').value = '';
  }

  // ==========================================
  // 11. RESERVA AUTOMÁTICA (evento pos:facturaRecibida)
  // ==========================================
  function crearReservaAutomatica(payload) {
    const reservas = NUCLEO.getData('pos_finanzas_reservas');
    const fechaVencimiento = new Date(payload.fecha);
    fechaVencimiento.setDate(fechaVencimiento.getDate() + payload.diasCredito);

    const nuevaReserva = {
      id: NUCLEO.uid(),
      nombre: `Proveedor ${payload.proveedorId}`,
      monto: payload.monto,
      fechaVencimiento: fechaVencimiento.toISOString().split('T')[0],
      categoria: 'Proveedor',
      detalle: `Factura ${payload.tipoFactura} - Crédito ${payload.diasCredito} días`,
      estado: 'activa',
      fecha: NUCLEO.nowISO(),
      userId: 'sistema'
    };

    reservas.push(nuevaReserva);
    NUCLEO.setData('pos_finanzas_reservas', reservas);
    NUCLEO.toast('Reserva automática creada por factura con crédito', 'success');
  }

  // ==========================================
  // 12. UTILIDADES
  // ==========================================
  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // ==========================================
  // 13. API PÚBLICA
  // ==========================================
  window.FINANZAS = {
    init: init,
    onShow: onShow,
    // Reservas
    guardarReserva: guardarReserva,
    editarReserva: editarReserva,
    pagarAhora: pagarAhora,
    cancelarReservaItem: cancelarReservaItem,
    cancelarReserva: cancelarReserva,
    // Gastos
    guardarGasto: guardarGasto,
    editarGasto: editarGasto,
    eliminarGasto: eliminarGasto,
    cancelarGasto: cancelarGasto,
    // Patrimonio
    guardarCapital: guardarCapital,
    editarCapital: editarCapital,
    eliminarCapital: eliminarCapital,
    cancelarCapital: cancelarCapital
  };

  // Auto-inicializar
  if (document.getElementById('moduleContainer')) {
    init();
  }

})();