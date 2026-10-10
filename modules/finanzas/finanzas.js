/* ============================================
   NEURORA POS - FINANZAS (ANEXO E)
   Módulo de control de flujo de dinero
   ============================================ */

(function () {
  'use strict';

  let vistaActiva = 'dashboard';
  let visible = false;
  const vistas = [
    { id: 'dashboard', nombre: 'Dashboard', icono: 'pie_chart' },
    { id: 'reservas', nombre: 'Reservas', icono: 'savings' },
    { id: 'gastos', nombre: 'Gastos', icono: 'credit_card' },
    { id: 'patrimonio', nombre: 'Patrimonio', icono: 'account_balance' }
  ];
  const CAT_RESERVAS = ['Proveedor', 'Sueldo', 'Alquiler', 'Impuesto', 'Otro'];
  const CAT_GASTOS = ['Luz', 'Agua', 'Alquiler', 'Sueldo', 'AFIP', 'Proveedor', 'Internet', 'Rentas', 'Otro'];

  function $id(id) { return document.getElementById(id); }
  function userId_() { return (NUCLEO.getUsuarioActivo() || {}).id || null; }
  function sello() { return { modificadoPor: userId_(), fechaModif: NUCLEO.nowISO() }; }

  // ==========================================
  // 1. CICLO DE VIDA (hooks del NÚCLEO)
  // ==========================================
  // boot: una sola vez al registrar el módulo. La reserva automática NO depende de haber visitado la solapa.
  function boot() {
    NUCLEO.on('pos:facturaRecibida', function (payload) {
      if (payload && payload.diasCredito > 0) crearReservaAutomatica(payload);
    });
  }

  function init() {}
  function onShow() { visible = true; render(); }
  function onHide() { visible = false; cerrarModalEditar(); }

  function onEscape() {
    if ($id('fin-modal-overlay')) { cerrarModalEditar(); return true; }
    return false;
  }

  // ==========================================
  // 2. RENDER
  // ==========================================
  function render() {
    if (!visible) return;
    const container = $id('moduleContainer');
    if (!container) return;
    container.innerHTML = `
      <div class="fin-layout">
        ${renderSidebar()}
        <div class="fin-main">${renderPanel()}</div>
      </div>`;
    document.querySelectorAll('.fin-sidebar-item[data-vista]').forEach(function (item) {
      item.addEventListener('click', function () { vistaActiva = this.getAttribute('data-vista'); render(); });
    });
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
              <span class="material-symbols-outlined">${v.icono}</span><span>${v.nombre}</span>
            </div>`).join('')}
        </div>
      </div>`;
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

  function opciones(lista, actual) {
    return lista.map(c => `<option value="${NUCLEO.esc(c)}" ${c === actual ? 'selected' : ''}>${NUCLEO.esc(c)}</option>`).join('');
  }

  // ==========================================
  // 3. DASHBOARD
  // ==========================================
  // Reservas activas que vencen en ≤3 días, INCLUIDAS las ya vencidas (lo más urgente)
  function proximosVencimientos() {
    const limite = NUCLEO.parseLocalDate(NUCLEO.addDays(NUCLEO.today(), 3));
    return NUCLEO.getData('pos_finanzas_reservas')
      .filter(r => r.estado === 'activa' && NUCLEO.parseLocalDate(r.fechaVencimiento) <= limite)
      .sort((a, b) => NUCLEO.parseLocalDate(a.fechaVencimiento) - NUCLEO.parseLocalDate(b.fechaVencimiento));
  }

  function renderDashboard() {
    const reservas = NUCLEO.getData('pos_finanzas_reservas');
    // Misma fórmula que el arqueo de CAJA (incluye egresos, retiros e ingresos del cajón)
    const efectivoTotal = NUCLEO.getEfectivoTotalCaja();
    const efectivoReservado = NUCLEO.roundCents(reservas.filter(r => r.estado === 'activa').reduce((s, r) => s + (r.monto || 0), 0));
    const efectivoDisponible = NUCLEO.roundCents(efectivoTotal - efectivoReservado);
    const proximos = proximosVencimientos();
    const hoy = NUCLEO.parseLocalDate(NUCLEO.today());

    return `
      <div class="fin-panel">
        <div class="fin-panel-header">
          <div class="fin-panel-title">Flujo de Caja en Tiempo Real</div>
          <div class="fin-panel-subtitle">Auditoría consolidada de activos monetarios, custodia en bóveda y asignación de fondos.</div>
        </div>
        <div class="fin-kpi-grid">
          <div class="fin-kpi-card"><div class="fin-kpi-label">EFECTIVO TOTAL</div><div class="fin-kpi-value" id="fin-efectivo-total">${NUCLEO.money(efectivoTotal)}</div></div>
          <div class="fin-kpi-card"><div class="fin-kpi-label">EFECTIVO RESERVADO</div><div class="fin-kpi-value" id="fin-efectivo-reservado">${NUCLEO.money(efectivoReservado)}</div></div>
          <div class="fin-kpi-card"><div class="fin-kpi-label">EFECTIVO DISPONIBLE</div><div class="fin-kpi-value ${efectivoDisponible >= 0 ? 'positive' : 'negative'}" id="fin-efectivo-disponible">${NUCLEO.money(efectivoDisponible)}</div></div>
        </div>
        <div class="fin-vencimientos-section">
          <div class="fin-vencimientos-header">
            <div class="fin-vencimientos-title">PRÓXIMOS VENCIMIENTOS</div>
            <div class="fin-vencimientos-count">${proximos.length} Registros</div>
          </div>
          ${proximos.length === 0 ? '<p class="font-body-md text-on-surface-variant">No hay vencimientos próximos</p>' : `
          <table class="fin-table">
            <thead><tr><th>Nombre</th><th>Monto</th><th>Fecha Vencimiento</th><th>Categoría</th></tr></thead>
            <tbody id="fin-proximos">
              ${proximos.map(r => {
                const vencida = NUCLEO.parseLocalDate(r.fechaVencimiento) < hoy;
                return `<tr>
                  <td>${NUCLEO.esc(r.nombre)}</td>
                  <td class="font-numeric-tape font-semibold">${NUCLEO.money(r.monto)}</td>
                  <td>${NUCLEO.formatDate(r.fechaVencimiento)} ${vencida ? '<span class="fin-badge fin-badge-cancelada" style="color:var(--color-error);">VENCIDA</span>' : ''}</td>
                  <td>${NUCLEO.esc(r.categoria)}</td></tr>`;
              }).join('')}
            </tbody>
          </table>`}
        </div>
      </div>`;
  }

  // ==========================================
  // 4. RESERVAS
  // ==========================================
  function renderReservas() {
    const lista = NUCLEO.getData('pos_finanzas_reservas').filter(r => r.estado !== 'cancelada').slice().reverse();
    return `
      <div class="fin-panel">
        <div class="fin-panel-header"><div class="fin-panel-title">Reservas</div></div>
        <div class="fin-form">
          <div class="fin-form-title">Nueva Reserva</div>
          <div class="fin-form-row">
            <div class="fin-form-group"><label class="fin-form-label">Nombre <span class="required">*</span></label><input type="text" class="fin-form-input" id="reserva-nombre" placeholder="Proveedor Aza, Alquiler Enero..."></div>
            <div class="fin-form-group"><label class="fin-form-label">Monto <span class="required">*</span></label><input type="number" min="0" step="0.01" class="fin-form-input" id="reserva-monto" placeholder="0"></div>
          </div>
          <div class="fin-form-row">
            <div class="fin-form-group"><label class="fin-form-label">Fecha Vencimiento <span class="required">*</span></label><input type="date" class="fin-form-input" id="reserva-fecha"></div>
            <div class="fin-form-group"><label class="fin-form-label">Categoría <span class="required">*</span></label><select class="fin-form-select" id="reserva-categoria">${opciones(CAT_RESERVAS)}</select></div>
          </div>
          <div class="fin-form-group"><label class="fin-form-label">Detalle (opcional)</label><input type="text" class="fin-form-input" id="reserva-detalle" placeholder="Detalle adicional..."></div>
          <div class="fin-form-actions">
            <button class="btn btn-secondary" onclick="window.FINANZAS.cancelarReserva()">CANCELAR</button>
            <button class="btn btn-primary" onclick="window.FINANZAS.guardarReserva()">GUARDAR RESERVA</button>
          </div>
        </div>
        <div class="fin-table-container">
          <div class="fin-table-header"><div class="fin-table-title">Reservas Activas</div></div>
          <table class="fin-table">
            <thead><tr><th>NOMBRE</th><th>MONTO</th><th>VENCIMIENTO</th><th>CATEGORÍA</th><th>ESTADO</th><th>ACCIONES</th></tr></thead>
            <tbody id="fin-reservas-body">
              ${lista.map(r => `
                <tr>
                  <td class="font-semibold">${NUCLEO.esc(r.nombre)}</td>
                  <td class="font-numeric-tape font-semibold">${NUCLEO.money(r.monto)}</td>
                  <td>${NUCLEO.formatDate(r.fechaVencimiento)}</td>
                  <td>${NUCLEO.esc(r.categoria)}</td>
                  <td><span class="fin-badge fin-badge-${NUCLEO.esc(r.estado)}">● ${NUCLEO.esc(capitalize(r.estado))}</span></td>
                  <td><div class="fin-table-actions">
                    ${r.estado === 'activa' ? `
                      <button class="fin-table-btn" onclick="window.FINANZAS.editarReserva(${NUCLEO.jsArg(r.id)})">EDITAR</button>
                      <button class="fin-table-btn" onclick="window.FINANZAS.pagarAhora(${NUCLEO.jsArg(r.id)})">PAGAR AHORA</button>
                      <button class="fin-table-btn danger" onclick="window.FINANZAS.cancelarReservaItem(${NUCLEO.jsArg(r.id)})">CANCELAR</button>` : ''}
                  </div></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function guardarReserva() {
    const nombre = NUCLEO.normText($id('reserva-nombre').value);
    const monto = parseFloat($id('reserva-monto').value);
    const fechaVencimiento = $id('reserva-fecha').value;
    if (!nombre || !(monto > 0) || !fechaVencimiento) { NUCLEO.toast('Completá nombre, un monto mayor a 0 y la fecha', 'error'); return; }
    const reservas = NUCLEO.getData('pos_finanzas_reservas');
    reservas.push({
      id: NUCLEO.uid(), nombre: nombre, monto: NUCLEO.roundCents(monto), fechaVencimiento: fechaVencimiento,
      categoria: $id('reserva-categoria').value, detalle: NUCLEO.normText($id('reserva-detalle').value),
      estado: 'activa', fecha: NUCLEO.nowISO(), userId: userId_()
    });
    if (!NUCLEO.setData('pos_finanzas_reservas', reservas)) return;
    NUCLEO.toast('Reserva guardada', 'success');
    render();
  }

  function editarReserva(id) {
    const reservas = NUCLEO.getData('pos_finanzas_reservas');
    const r = reservas.find(x => x.id === id);
    if (!r) return;
    if (r.estado !== 'activa') { NUCLEO.toast('Solo se pueden editar reservas activas', 'warning'); return; }
    abrirModalEditar('Editar Reserva', `
      <div class="fin-form-group"><label class="fin-form-label">Nombre <span class="required">*</span></label><input type="text" class="fin-form-input" id="edit-reserva-nombre" value="${NUCLEO.esc(r.nombre)}"></div>
      <div class="fin-form-group"><label class="fin-form-label">Monto <span class="required">*</span></label><input type="number" min="0" step="0.01" class="fin-form-input" id="edit-reserva-monto" value="${NUCLEO.esc(r.monto)}"></div>
      <div class="fin-form-group"><label class="fin-form-label">Fecha Vencimiento <span class="required">*</span></label><input type="date" class="fin-form-input" id="edit-reserva-fecha" value="${NUCLEO.esc(r.fechaVencimiento)}"></div>
      <div class="fin-form-group"><label class="fin-form-label">Categoría <span class="required">*</span></label><select class="fin-form-select" id="edit-reserva-categoria">${opciones(CAT_RESERVAS, r.categoria)}</select></div>
      <div class="fin-form-group"><label class="fin-form-label">Detalle</label><input type="text" class="fin-form-input" id="edit-reserva-detalle" value="${NUCLEO.esc(r.detalle || '')}"></div>
    `, function () {
      const nombre = NUCLEO.normText($id('edit-reserva-nombre').value);
      const monto = parseFloat($id('edit-reserva-monto').value);
      const fecha = $id('edit-reserva-fecha').value;
      if (!nombre || !(monto > 0) || !fecha) { NUCLEO.toast('Completá nombre, un monto mayor a 0 y la fecha', 'error'); return false; }
      Object.assign(r, { nombre: nombre, monto: NUCLEO.roundCents(monto), fechaVencimiento: fecha, categoria: $id('edit-reserva-categoria').value, detalle: NUCLEO.normText($id('edit-reserva-detalle').value) }, sello());
      if (!NUCLEO.setData('pos_finanzas_reservas', reservas)) return false;
      NUCLEO.toast('Reserva actualizada', 'success');
      render();
    });
  }

  // Convierte la reserva en gasto real (esto SÍ afecta la ganancia)
  function pagarAhora(id) {
    const r = NUCLEO.getData('pos_finanzas_reservas').find(x => x.id === id);
    if (!r || r.estado !== 'activa') return;
    NUCLEO.confirmar('Pagar ahora', 'Se registrará un gasto de ' + NUCLEO.money(r.monto) + ' (' + r.nombre + ') y la reserva pasará a pagada. Esto afecta la ganancia.', 'PAGAR').then(function (ok) {
      if (!ok) return;
      const reservas = NUCLEO.getData('pos_finanzas_reservas');
      const res = reservas.find(x => x.id === id);
      if (!res || res.estado !== 'activa') return;
      const done = NUCLEO.transaccion(['pos_finanzas_gastos', 'pos_finanzas_reservas'], function () {
        const gastos = NUCLEO.getData('pos_finanzas_gastos');
        gastos.push({ id: NUCLEO.uid(), categoria: res.categoria, monto: res.monto, fecha: NUCLEO.today(), detalle: res.detalle || 'Pago de reserva: ' + res.nombre, reservaId: res.id, userId: userId_() });
        NUCLEO.setDataStrict('pos_finanzas_gastos', gastos);
        res.estado = 'pagada';
        NUCLEO.setDataStrict('pos_finanzas_reservas', reservas);
        return true;
      });
      if (!done) { NUCLEO.toast('No se pudo registrar el pago. No se modificó nada.', 'error'); return; }
      NUCLEO.toast('Reserva pagada y gasto registrado', 'success');
      render();
    });
  }

  function cancelarReservaItem(id) {
    const r = NUCLEO.getData('pos_finanzas_reservas').find(x => x.id === id);
    if (!r || r.estado !== 'activa') return;
    NUCLEO.confirmar('Cancelar reserva', '¿Cancelar la reserva "' + r.nombre + '" por ' + NUCLEO.money(r.monto) + '? No afecta la ganancia.', 'CANCELAR RESERVA').then(function (ok) {
      if (!ok) return;
      const reservas = NUCLEO.getData('pos_finanzas_reservas');
      const x = reservas.find(q => q.id === id);
      if (!x || x.estado !== 'activa') return;
      x.estado = 'cancelada';
      Object.assign(x, sello());
      if (!NUCLEO.setData('pos_finanzas_reservas', reservas)) return;
      NUCLEO.toast('Reserva cancelada', 'success');
      render();
    });
  }

  function cancelarReserva() {
    ['reserva-nombre', 'reserva-monto', 'reserva-fecha', 'reserva-detalle'].forEach(i => { $id(i).value = ''; });
  }

  // ==========================================
  // 5. GASTOS
  // ==========================================
  function renderGastos() {
    const gastos = NUCLEO.getData('pos_finanzas_gastos').slice().reverse();
    const activas = NUCLEO.getData('pos_finanzas_reservas').filter(r => r.estado === 'activa');
    return `
      <div class="fin-panel">
        <div class="fin-panel-header"><div class="fin-panel-title">Gastos</div></div>
        <div class="fin-form">
          <div class="fin-form-title">Nuevo Gasto</div>
          <div class="fin-form-row">
            <div class="fin-form-group"><label class="fin-form-label">Categoría <span class="required">*</span></label><select class="fin-form-select" id="gasto-categoria">${opciones(CAT_GASTOS)}</select></div>
            <div class="fin-form-group"><label class="fin-form-label">Monto <span class="required">*</span></label><input type="number" min="0" step="0.01" class="fin-form-input" id="gasto-monto" placeholder="0"></div>
          </div>
          <div class="fin-form-row">
            <div class="fin-form-group"><label class="fin-form-label">Fecha <span class="required">*</span></label><input type="date" class="fin-form-input" id="gasto-fecha" value="${NUCLEO.today()}"></div>
            <div class="fin-form-group"><label class="fin-form-label">Vincular a Reserva (opcional)</label>
              <select class="fin-form-select" id="gasto-reserva"><option value="">Sin vincular</option>
                ${activas.map(r => `<option value="${NUCLEO.esc(r.id)}">${NUCLEO.esc(r.nombre)} (${NUCLEO.money(r.monto)})</option>`).join('')}</select></div>
          </div>
          <div class="fin-form-group"><label class="fin-form-label">Detalle (opcional)</label><input type="text" class="fin-form-input" id="gasto-detalle" placeholder="Factura Luz Diciembre..."></div>
          <div class="fin-info-box">Si se selecciona una reserva, la reserva pasa a estado pagada</div>
          <div class="fin-form-actions">
            <button class="btn btn-secondary" onclick="window.FINANZAS.cancelarGasto()">CANCELAR</button>
            <button class="btn btn-primary" onclick="window.FINANZAS.guardarGasto()">GUARDAR GASTO</button>
          </div>
        </div>
        <div class="fin-table-container">
          <div class="fin-table-header"><div class="fin-table-title">Gastos Registrados</div></div>
          <table class="fin-table">
            <thead><tr><th>FECHA</th><th>CATEGORÍA</th><th>DETALLE</th><th>MONTO</th><th>ACCIONES</th></tr></thead>
            <tbody id="fin-gastos-body">
              ${gastos.map(g => `
                <tr>
                  <td>${NUCLEO.formatDate(g.fecha)}</td><td>${NUCLEO.esc(g.categoria)}</td><td>${NUCLEO.esc(g.detalle || '—')}</td>
                  <td class="font-numeric-tape font-semibold">${NUCLEO.money(g.monto)}</td>
                  <td><div class="fin-table-actions">
                    <button class="fin-table-btn" onclick="window.FINANZAS.editarGasto(${NUCLEO.jsArg(g.id)})">EDITAR</button>
                    <button class="fin-table-btn danger" onclick="window.FINANZAS.eliminarGasto(${NUCLEO.jsArg(g.id)})">ELIMINAR</button>
                  </div></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function guardarGasto() {
    const monto = parseFloat($id('gasto-monto').value);
    const fecha = $id('gasto-fecha').value;
    const reservaId = $id('gasto-reserva').value;
    if (!(monto > 0) || !fecha) { NUCLEO.toast('Ingresá un monto mayor a 0 y la fecha', 'error'); return; }
    const ok = NUCLEO.transaccion(['pos_finanzas_gastos', 'pos_finanzas_reservas'], function () {
      const gastos = NUCLEO.getData('pos_finanzas_gastos');
      gastos.push({ id: NUCLEO.uid(), categoria: $id('gasto-categoria').value, monto: NUCLEO.roundCents(monto), fecha: fecha, detalle: NUCLEO.normText($id('gasto-detalle').value), reservaId: reservaId || null, userId: userId_() });
      NUCLEO.setDataStrict('pos_finanzas_gastos', gastos);
      if (reservaId) {
        const reservas = NUCLEO.getData('pos_finanzas_reservas');
        const r = reservas.find(x => x.id === reservaId);
        if (r && r.estado === 'activa') { r.estado = 'pagada'; NUCLEO.setDataStrict('pos_finanzas_reservas', reservas); }
      }
      return true;
    });
    if (!ok) { NUCLEO.toast('No se pudo guardar el gasto', 'error'); return; }
    NUCLEO.toast('Gasto registrado', 'success');
    render();
  }

  function editarGasto(id) {
    const gastos = NUCLEO.getData('pos_finanzas_gastos');
    const g = gastos.find(x => x.id === id);
    if (!g) return;
    abrirModalEditar('Editar Gasto', `
      <div class="fin-form-group"><label class="fin-form-label">Categoría <span class="required">*</span></label><select class="fin-form-select" id="edit-gasto-categoria">${opciones(CAT_GASTOS, g.categoria)}</select></div>
      <div class="fin-form-group"><label class="fin-form-label">Monto <span class="required">*</span></label><input type="number" min="0" step="0.01" class="fin-form-input" id="edit-gasto-monto" value="${NUCLEO.esc(g.monto)}"></div>
      <div class="fin-form-group"><label class="fin-form-label">Fecha <span class="required">*</span></label><input type="date" class="fin-form-input" id="edit-gasto-fecha" value="${NUCLEO.esc(NUCLEO.localDateOf(g.fecha))}"></div>
      <div class="fin-form-group"><label class="fin-form-label">Detalle</label><input type="text" class="fin-form-input" id="edit-gasto-detalle" value="${NUCLEO.esc(g.detalle || '')}"></div>
    `, function () {
      const monto = parseFloat($id('edit-gasto-monto').value);
      const fecha = $id('edit-gasto-fecha').value;
      if (!(monto > 0) || !fecha) { NUCLEO.toast('Ingresá un monto mayor a 0 y la fecha', 'error'); return false; }
      Object.assign(g, { categoria: $id('edit-gasto-categoria').value, monto: NUCLEO.roundCents(monto), fecha: fecha, detalle: NUCLEO.normText($id('edit-gasto-detalle').value) }, sello());
      if (!NUCLEO.setData('pos_finanzas_gastos', gastos)) return false;
      NUCLEO.toast('Gasto actualizado', 'success');
      render();
    });
  }

  function eliminarGasto(id) {
    const g = NUCLEO.getData('pos_finanzas_gastos').find(x => x.id === id);
    if (!g) return;
    NUCLEO.confirmar('Eliminar gasto', '¿Eliminar el gasto de ' + NUCLEO.money(g.monto) + ' (' + g.categoria + ')? Esto cambia la ganancia.' + (g.reservaId ? '\nLa reserva vinculada volverá a estar activa.' : ''), 'ELIMINAR').then(function (ok) {
      if (!ok) return;
      const hecho = NUCLEO.transaccion(['pos_finanzas_gastos', 'pos_finanzas_reservas'], function () {
        const gastos = NUCLEO.getData('pos_finanzas_gastos');
        if (g.reservaId) {
          const reservas = NUCLEO.getData('pos_finanzas_reservas');
          const r = reservas.find(x => x.id === g.reservaId);
          if (r && r.estado === 'pagada') { r.estado = 'activa'; NUCLEO.setDataStrict('pos_finanzas_reservas', reservas); }
        }
        NUCLEO.setDataStrict('pos_finanzas_gastos', gastos.filter(x => x.id !== id));
        return true;
      });
      if (!hecho) { NUCLEO.toast('No se pudo eliminar', 'error'); return; }
      NUCLEO.toast('Gasto eliminado', 'success');
      render();
    });
  }

  function cancelarGasto() {
    ['gasto-monto', 'gasto-detalle', 'gasto-reserva'].forEach(i => { $id(i).value = ''; });
  }

  // ==========================================
  // 6. PATRIMONIO
  // ==========================================
  function renderPatrimonio() {
    const capital = NUCLEO.getData('pos_finanzas_capital').slice().reverse();
    const todos = NUCLEO.getData('pos_finanzas_capital');
    const aportes = todos.filter(c => c.tipo === 'aporte').reduce((s, c) => s + (c.monto || 0), 0);
    const retiros = todos.filter(c => c.tipo === 'retiro').reduce((s, c) => s + (c.monto || 0), 0);
    // FINANZAS no lee pos_sales: la ganancia acumulada es el cálculo único del NÚCLEO (el mismo que usa REPORTES)
    const ganancias = NUCLEO.getGananciasNetasAcumuladas();
    const inversionNeta = NUCLEO.roundCents(aportes + ganancias - retiros);
    return `
      <div class="fin-panel">
        <div class="fin-panel-header"><div class="fin-panel-title">Patrimonio</div></div>
        <div class="fin-patrimonio-kpi">
          <div class="fin-patrimonio-kpi-label">INVERSIÓN NETA ACTUAL</div>
          <div class="fin-patrimonio-kpi-value" id="fin-inversion">${NUCLEO.money(inversionNeta)}</div>
          <div class="fin-patrimonio-desglose">
            <div class="fin-desglose-item"><div class="fin-desglose-label">(+) APORTES DE CAPITAL</div><div class="fin-desglose-value">${NUCLEO.money(aportes)}</div></div>
            <div class="fin-desglose-item"><div class="fin-desglose-label">(+) GANANCIAS NETAS ACUMULADAS</div><div class="fin-desglose-value">${NUCLEO.money(ganancias)}</div></div>
            <div class="fin-desglose-item"><div class="fin-desglose-label">(-) RETIROS DEL DUEÑO</div><div class="fin-desglose-value">${NUCLEO.money(retiros)}</div></div>
          </div>
        </div>
        <div class="fin-form">
          <div class="fin-form-title">Nuevo Movimiento de Capital</div>
          <div class="fin-form-row">
            <div class="fin-form-group"><label class="fin-form-label">Tipo <span class="required">*</span></label>
              <select class="fin-form-select" id="capital-tipo"><option value="aporte">APORTE DE CAPITAL</option><option value="retiro">RETIRO DEL DUEÑO</option></select></div>
            <div class="fin-form-group"><label class="fin-form-label">Monto <span class="required">*</span></label><input type="number" min="0" step="0.01" class="fin-form-input" id="capital-monto" placeholder="0"></div>
          </div>
          <div class="fin-form-row">
            <div class="fin-form-group"><label class="fin-form-label">Fecha <span class="required">*</span></label><input type="date" class="fin-form-input" id="capital-fecha" value="${NUCLEO.today()}"></div>
            <div class="fin-form-group"><label class="fin-form-label">Detalle (opcional)</label><input type="text" class="fin-form-input" id="capital-detalle" placeholder="Aporte inicial, Retiro para gastos personales..."></div>
          </div>
          <div class="fin-form-actions">
            <button class="btn btn-secondary" onclick="window.FINANZAS.cancelarCapital()">CANCELAR</button>
            <button class="btn btn-primary" onclick="window.FINANZAS.guardarCapital()">GUARDAR MOVIMIENTO</button>
          </div>
        </div>
        <div class="fin-table-container">
          <div class="fin-table-header"><div class="fin-table-title">Movimientos de Capital</div></div>
          <table class="fin-table">
            <thead><tr><th>FECHA</th><th>TIPO</th><th>MONTO</th><th>DETALLE</th><th>ACCIONES</th></tr></thead>
            <tbody>
              ${capital.map(c => `
                <tr>
                  <td>${NUCLEO.formatDate(c.fecha)}</td>
                  <td>${c.tipo === 'aporte' ? 'Aporte de Capital' : 'Retiro del Dueño'}</td>
                  <td class="font-numeric-tape font-semibold ${c.tipo === 'aporte' ? 'text-tertiary-fixed-dim' : 'text-error'}">${c.tipo === 'aporte' ? '+' : '-'}${NUCLEO.money(c.monto)}</td>
                  <td>${NUCLEO.esc(c.detalle || '—')}</td>
                  <td><div class="fin-table-actions">
                    <button class="fin-table-btn" onclick="window.FINANZAS.editarCapital(${NUCLEO.jsArg(c.id)})">EDITAR</button>
                    <button class="fin-table-btn danger" onclick="window.FINANZAS.eliminarCapital(${NUCLEO.jsArg(c.id)})">ELIMINAR</button>
                  </div></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function guardarCapital() {
    const monto = parseFloat($id('capital-monto').value);
    const fecha = $id('capital-fecha').value;
    if (!(monto > 0) || !fecha) { NUCLEO.toast('Ingresá un monto mayor a 0 y la fecha', 'error'); return; }
    const capital = NUCLEO.getData('pos_finanzas_capital');
    capital.push({ id: NUCLEO.uid(), tipo: $id('capital-tipo').value, monto: NUCLEO.roundCents(monto), fecha: fecha, detalle: NUCLEO.normText($id('capital-detalle').value), userId: userId_() });
    if (!NUCLEO.setData('pos_finanzas_capital', capital)) return;
    NUCLEO.toast('Movimiento de capital registrado', 'success');
    render();
  }

  function editarCapital(id) {
    const capital = NUCLEO.getData('pos_finanzas_capital');
    const c = capital.find(x => x.id === id);
    if (!c) return;
    abrirModalEditar('Editar Movimiento de Capital', `
      <div class="fin-form-group"><label class="fin-form-label">Tipo <span class="required">*</span></label>
        <select class="fin-form-select" id="edit-capital-tipo"><option value="aporte" ${c.tipo === 'aporte' ? 'selected' : ''}>APORTE DE CAPITAL</option><option value="retiro" ${c.tipo === 'retiro' ? 'selected' : ''}>RETIRO DEL DUEÑO</option></select></div>
      <div class="fin-form-group"><label class="fin-form-label">Monto <span class="required">*</span></label><input type="number" min="0" step="0.01" class="fin-form-input" id="edit-capital-monto" value="${NUCLEO.esc(c.monto)}"></div>
      <div class="fin-form-group"><label class="fin-form-label">Fecha <span class="required">*</span></label><input type="date" class="fin-form-input" id="edit-capital-fecha" value="${NUCLEO.esc(NUCLEO.localDateOf(c.fecha))}"></div>
      <div class="fin-form-group"><label class="fin-form-label">Detalle</label><input type="text" class="fin-form-input" id="edit-capital-detalle" value="${NUCLEO.esc(c.detalle || '')}"></div>
    `, function () {
      const monto = parseFloat($id('edit-capital-monto').value);
      const fecha = $id('edit-capital-fecha').value;
      if (!(monto > 0) || !fecha) { NUCLEO.toast('Ingresá un monto mayor a 0 y la fecha', 'error'); return false; }
      Object.assign(c, { tipo: $id('edit-capital-tipo').value, monto: NUCLEO.roundCents(monto), fecha: fecha, detalle: NUCLEO.normText($id('edit-capital-detalle').value) }, sello());
      if (!NUCLEO.setData('pos_finanzas_capital', capital)) return false;
      NUCLEO.toast('Movimiento actualizado', 'success');
      render();
    });
  }

  function eliminarCapital(id) {
    const c = NUCLEO.getData('pos_finanzas_capital').find(x => x.id === id);
    if (!c) return;
    NUCLEO.confirmar('Eliminar movimiento', '¿Eliminar este ' + (c.tipo === 'aporte' ? 'aporte' : 'retiro') + ' de ' + NUCLEO.money(c.monto) + '? Cambia la Inversión Neta.', 'ELIMINAR').then(function (ok) {
      if (!ok) return;
      if (!NUCLEO.setData('pos_finanzas_capital', NUCLEO.getData('pos_finanzas_capital').filter(x => x.id !== id))) return;
      NUCLEO.toast('Movimiento eliminado', 'success');
      render();
    });
  }

  function cancelarCapital() { $id('capital-monto').value = ''; $id('capital-detalle').value = ''; }

  // ==========================================
  // 7. RESERVA AUTOMÁTICA (evento pos:facturaRecibida)
  // ==========================================
  function crearReservaAutomatica(payload) {
    const reservas = NUCLEO.getData('pos_finanzas_reservas');
    // Idempotente: una factura genera una sola reserva
    if (payload.facturaId && reservas.some(r => r.facturaId === payload.facturaId)) return;
    const ref = payload.numero || payload.facturaId || '';
    reservas.push({
      id: NUCLEO.uid(),
      nombre: 'Proveedor ' + (payload.proveedorNombre || payload.proveedorId) + (ref ? ' — Fac. ' + ref : ''),
      monto: payload.monto,
      fechaVencimiento: NUCLEO.addDays(NUCLEO.localDateOf(payload.fecha), payload.diasCredito),
      categoria: 'Proveedor',
      detalle: 'Factura ' + payload.tipoFactura + ' - Crédito ' + payload.diasCredito + ' días',
      estado: 'activa',
      fecha: NUCLEO.nowISO(),
      facturaId: payload.facturaId || null,
      userId: 'sistema'
    });
    if (NUCLEO.setData('pos_finanzas_reservas', reservas)) NUCLEO.toast('Reserva automática creada por factura con crédito', 'success');
  }

  // ==========================================
  // 8. MODAL DE EDICIÓN Y UTILIDADES
  // ==========================================
  function abrirModalEditar(titulo, bodyHtml, onGuardar) {
    cerrarModalEditar();
    const overlay = document.createElement('div');
    overlay.className = 'fin-modal-overlay';
    overlay.id = 'fin-modal-overlay';
    overlay.innerHTML = `
      <div class="fin-modal">
        <div class="fin-modal-header"><div class="fin-modal-title">${NUCLEO.esc(titulo)}</div><div class="fin-modal-close" id="fin-modal-close">&times;</div></div>
        <div class="fin-modal-body">${bodyHtml}</div>
        <div class="fin-modal-footer"><button class="btn btn-secondary" id="fin-modal-cancelar">CANCELAR</button><button class="btn btn-primary" id="fin-modal-guardar">GUARDAR</button></div>
      </div>`;
    document.body.appendChild(overlay);
    $id('fin-modal-close').addEventListener('click', cerrarModalEditar);
    $id('fin-modal-cancelar').addEventListener('click', cerrarModalEditar);
    $id('fin-modal-guardar').addEventListener('click', function () { if (onGuardar() !== false) cerrarModalEditar(); });
    overlay.addEventListener('click', function (e) { if (e.target === overlay) cerrarModalEditar(); });
  }

  function cerrarModalEditar() { const o = $id('fin-modal-overlay'); if (o) o.remove(); }
  function capitalize(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

  window.FINANZAS = {
    boot: boot, init: init, onShow: onShow, onHide: onHide, onEscape: onEscape,
    guardarReserva: guardarReserva, editarReserva: editarReserva, pagarAhora: pagarAhora, cancelarReservaItem: cancelarReservaItem, cancelarReserva: cancelarReserva,
    guardarGasto: guardarGasto, editarGasto: editarGasto, eliminarGasto: eliminarGasto, cancelarGasto: cancelarGasto,
    guardarCapital: guardarCapital, editarCapital: editarCapital, eliminarCapital: eliminarCapital, cancelarCapital: cancelarCapital
  };
})();
