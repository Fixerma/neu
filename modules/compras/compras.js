/* ============================================
NEURORA POS - COMPRAS (ANEXO G)
Versión: Paso 2 de corrección de la maqueta
============================================ */
const ComprasModule = {
  id: 'compras',
  name: 'COMPRAS',
  icon: 'shopping_cart',
  state: { currentView: 'proveedores', procesando: false, visible: false },

  // Regla de costo real (recomendación de la contadora): A/B = 70%, X = 50% del precio de factura
  FACTOR: { A: 0.70, B: 0.70, X: 0.50 },

  // ---------- Hooks del NÚCLEO ----------
  init: function () {},
  onShow: function () { this.state.visible = true; this.render(); },
  onHide: function () { this.state.visible = false; this.cerrarModales(); },
  onEscape: function () {
    const modal = document.querySelector('.compras-modal-overlay');
    if (modal) { modal.remove(); return true; }
    return false;
  },
  cerrarModales: function () {
    document.querySelectorAll('.compras-modal-overlay').forEach(function (m) { m.remove(); });
  },

  // ---------- Helpers ----------
  usuarioId: function () { return (NUCLEO.getUsuarioActivo() || {}).id || null; },
  getProveedor: function (id) { return (NUCLEO.getData('pos_suppliers') || []).find(function (s) { return s.id === id; }) || null; },
  badgeFactura: function (t) { return t === 'A' ? 'compras-badge-a' : (t === 'B' ? 'compras-badge-b' : 'compras-badge-x'); },

  // Siguiente número correlativo robusto (no depende de length)
  siguienteId: function (prefijo, lista) {
    const max = lista.reduce(function (m, x) {
      const n = parseInt(String(x.id || '').replace(/\D/g, ''), 10);
      return n > m ? n : m;
    }, 0);
    return prefijo + String(max + 1).padStart(3, '0');
  },

  // Último precio NOMINAL de factura de un producto. Nunca el costo real (evita el doble 70%).
  ultimoPrecioFactura: function (code) {
    const invs = (NUCLEO.getData('pos_invoices') || []).slice().reverse();
    invs.sort(function (a, b) { return NUCLEO.parseLocalDate(b.fecha) - NUCLEO.parseLocalDate(a.fecha); });
    for (let i = 0; i < invs.length; i++) {
      const it = (invs[i].items || []).find(function (x) { return x.code === code; });
      if (it && it.price > 0) return { precio: it.price, estimado: false };
    }
    const p = (NUCLEO.getData('pos_products') || []).find(function (x) { return x.code === code; });
    if (p && p.cost > 0) return { precio: NUCLEO.roundCents(p.cost / (NUCLEO.getFactorCosto(p, 'A').pct / 100)), estimado: true };
    return { precio: 0, estimado: true };
  },

  render: function () {
    if (!this.state.visible) return;
    const container = document.getElementById('moduleContainer');
    container.innerHTML = `
      <div class="compras-layout">
        <div class="compras-sidebar" id="comprasSidebar"></div>
        <div class="compras-main">
          <div class="compras-header" id="comprasHeader"></div>
          <div class="compras-content" id="comprasContent"></div>
        </div>
      </div>`;
    this.renderSidebar();
    this.showView(this.state.currentView);
  },

  renderSidebar: function () {
    const self = this;
    const sidebar = document.getElementById('comprasSidebar');
    const views = [
      { id: 'proveedores', label: 'Proveedores', icon: 'storefront' },
      { id: 'pedidos', label: 'Pedidos', icon: 'assignment' },
      { id: 'facturas', label: 'Facturas', icon: 'receipt_long' }
    ];
    sidebar.innerHTML = views.map(function (v) {
      return `<div class="compras-sidebar-item ${self.state.currentView === v.id ? 'active' : ''}" data-view="${v.id}">
        <span class="material-symbols-outlined">${v.icon}</span>${v.label}</div>`;
    }).join('');
    sidebar.querySelectorAll('.compras-sidebar-item').forEach(function (item) {
      item.addEventListener('click', function () {
        self.state.currentView = item.dataset.view;
        self.renderSidebar();
        self.showView(self.state.currentView);
      });
    });
  },

  showView: function (view) {
    const header = document.getElementById('comprasHeader');
    const content = document.getElementById('comprasContent');
    if (!header || !content) return;
    if (view === 'proveedores') {
      header.innerHTML = `<h2>Proveedores</h2><p>Gestión de proveedores y condiciones comerciales.</p>`;
      this.renderProveedores(content);
    } else if (view === 'pedidos') {
      header.innerHTML = `<h2>Pedidos de Compra</h2><p>Generar pedidos manuales o sugeridos para reposición de stock.</p>`;
      this.renderPedidos(content);
    } else if (view === 'facturas') {
      header.innerHTML = `<h2>Facturas Registradas</h2><p>Carga directa de facturas o recepción de mercadería desde pedidos.</p>`;
      this.renderFacturas(content);
    }
  },

  // ==========================================
  // PROVEEDORES (solo lectura; el ABM es de CONFIG)
  // ==========================================
  renderProveedores: function (container) {
    const self = this;
    const activos = (NUCLEO.getData('pos_suppliers') || []).filter(function (s) { return s.activo !== false; });
    container.innerHTML = `
      <div class="compras-toolbar">
        <div class="font-label-md text-on-surface-variant">${activos.length} Proveedores Activos</div>
      </div>
      <div class="compras-table-container">
        <table class="table">
          <thead class="table-header">
            <tr><th>Nombre y Razón Social</th><th>Rubro</th><th>Contacto</th><th>Condición / Crédito</th><th>Factura</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            ${activos.length === 0 ? `<tr><td colspan="6" class="compras-empty-state">No hay proveedores registrados.</td></tr>` : activos.map(function (s) {
              return `
              <tr class="table-row">
                <td><div class="font-body-md font-semibold">${NUCLEO.esc(s.nombre)}</div><div class="font-label-sm text-on-surface-variant">CUIT: ${NUCLEO.esc(s.cuit || '-')}</div></td>
                <td><span class="badge badge-neutral">${NUCLEO.esc(s.rubro || '-')}</span></td>
                <td class="font-body-sm">${NUCLEO.esc(s.telefono || '-')}<br>${NUCLEO.esc(s.email || '-')}</td>
                <td class="font-body-sm">${Number(s.diasCredito) || 0} Días Crédito</td>
                <td><span class="badge ${self.badgeFactura(s.tipoFactura)}">Tipo ${NUCLEO.esc(s.tipoFactura || 'X')}</span></td>
                <td>
                  <button class="btn btn-ghost btn-icon" title="Historial de Precios" data-action="history" data-id="${NUCLEO.esc(s.id)}">
                    <span class="material-symbols-outlined">history</span>
                  </button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="compras-footer-info" style="margin-top: 1.5rem;">
        <span class="material-symbols-outlined" style="color: var(--color-primary);">lightbulb</span>
        <div>
          <strong>El alta y edición de proveedores se realiza en CONFIG.</strong><br>
          Si el proveedor no existe o deseas modificar sus datos fiscales, dirígete al panel central.
          <br><a href="#" id="goToConfigSuppliers" class="text-primary font-semibold" style="text-decoration: underline;">IR A CONFIG · PROVEEDORES</a>
        </div>
      </div>`;
    container.querySelectorAll('[data-action="history"]').forEach(function (btn) {
      btn.addEventListener('click', function () { self.showPriceHistory(btn.dataset.id); });
    });
    const goToConfig = document.getElementById('goToConfigSuppliers');
    if (goToConfig) goToConfig.addEventListener('click', function (e) { e.preventDefault(); NUCLEO.showTab('config'); });
  },

  abrirModal: function (html, maxWidth) {
    const modal = document.createElement('div');
    modal.className = 'compras-modal-overlay';
    modal.innerHTML = `<div class="compras-modal-content" style="max-width:${maxWidth || 640}px;">${html}</div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('.compras-modal-close').forEach(function (b) { b.addEventListener('click', function () { modal.remove(); }); });
    return modal;
  },

  showPriceHistory: function (supplierId) {
    const self = this;
    const supplier = this.getProveedor(supplierId);
    if (!supplier) return;
    const history = [];
    (NUCLEO.getData('pos_invoices') || []).forEach(function (inv) {
      if (inv.proveedorId !== supplierId) return;
      (inv.items || []).forEach(function (item) {
        history.push({ fecha: inv.fecha, producto: item.name, precio: item.price, tipo: inv.tipoFactura });
      });
    });
    history.sort(function (a, b) { return NUCLEO.parseLocalDate(b.fecha) - NUCLEO.parseLocalDate(a.fecha); });
    this.abrirModal(`
        <div class="compras-modal-header">
          <h3>Historial de Precios - ${NUCLEO.esc(supplier.nombre)}</h3>
          <button class="btn btn-ghost btn-icon compras-modal-close"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="compras-modal-body">
          <p class="font-body-sm text-on-surface-variant" style="margin-bottom: 1rem;">Evolución de precios de factura (nominales) registrados con este proveedor</p>
          <table class="table">
            <thead class="table-header"><tr><th>Fecha</th><th>Producto</th><th>Precio</th><th>Tipo Factura</th></tr></thead>
            <tbody>
              ${history.length === 0 ? `<tr><td colspan="4" class="compras-empty-state">Sin registros de facturación.</td></tr>` :
              history.map(function (h) {
                return `<tr class="table-row"><td>${NUCLEO.formatDate(h.fecha)}</td><td>${NUCLEO.esc(h.producto)}</td><td>${NUCLEO.money(h.precio)}</td>
                  <td><span class="badge ${self.badgeFactura(h.tipo)}">Tipo ${NUCLEO.esc(h.tipo)}</span></td></tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="compras-modal-footer"><button class="btn btn-secondary compras-modal-close">Cerrar</button></div>`, 600);
  },

  // ==========================================
  // PEDIDOS
  // ==========================================
  renderPedidos: function (container) {
    const self = this;
    const orders = (NUCLEO.getData('pos_purchase_orders') || []).slice().reverse();
    container.innerHTML = `
      <div class="compras-toolbar">
        <div class="font-label-md text-on-surface-variant">${orders.length} Registrados</div>
        <div class="flex gap-space-sm">
          <button class="btn btn-secondary" id="btnSuggestOrder"><span class="material-symbols-outlined">auto_awesome</span> Sugerir Pedido</button>
          <button class="btn btn-primary" id="btnNewOrder"><span class="material-symbols-outlined">add_shopping_cart</span> Nuevo Pedido</button>
        </div>
      </div>
      <div class="compras-table-container">
        <table class="table">
          <thead class="table-header">
            <tr><th>N° OC</th><th>Proveedor</th><th>Entrega estimada</th><th>Estado</th><th>Total</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            ${orders.length === 0 ? `<tr><td colspan="6" class="compras-empty-state">No hay pedidos registrados.</td></tr>` : orders.map(function (o) {
              const sup = self.getProveedor(o.proveedorId);
              return `
                <tr class="table-row">
                  <td class="font-mono font-semibold">${NUCLEO.esc(o.id)}</td>
                  <td>${NUCLEO.esc(sup ? sup.nombre : 'Desconocido')}</td>
                  <td>${NUCLEO.formatDate(o.fecha)}</td>
                  <td><span class="badge ${o.estado === 'Recibido' ? 'compras-badge-recibido' : 'compras-badge-pendiente'}">${NUCLEO.esc(o.estado)}</span></td>
                  <td class="font-numeric-tape">${NUCLEO.money(o.total)}</td>
                  <td>
                    ${o.estado === 'Pendiente' ? `<button class="btn btn-ghost" data-action="receive" data-id="${NUCLEO.esc(o.id)}">Recibir</button>` : ''}
                    <button class="btn btn-ghost" data-action="view" data-id="${NUCLEO.esc(o.id)}">Ver</button>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
    document.getElementById('btnNewOrder').addEventListener('click', function () { self.openNewOrderModal(); });
    document.getElementById('btnSuggestOrder').addEventListener('click', function () { self.openSuggestOrderModal(); });
    container.querySelectorAll('[data-action="receive"]').forEach(function (btn) { btn.addEventListener('click', function () { self.receiveOrder(btn.dataset.id); }); });
    container.querySelectorAll('[data-action="view"]').forEach(function (btn) { btn.addEventListener('click', function () { self.showOrderDetail(btn.dataset.id); }); });
  },

  showOrderDetail: function (orderId) {
    const o = (NUCLEO.getData('pos_purchase_orders') || []).find(function (x) { return x.id === orderId; });
    if (!o) return;
    const sup = this.getProveedor(o.proveedorId);
    this.abrirModal(`
        <div class="compras-modal-header">
          <h3>Detalle de Pedido - ${NUCLEO.esc(o.id)}</h3>
          <button class="btn btn-ghost btn-icon compras-modal-close"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="compras-modal-body">
          <div class="compras-modal-grid" style="margin-bottom: 1rem;">
            <div><span class="font-label-sm text-on-surface-variant">Proveedor</span><div class="font-body-md font-semibold">${NUCLEO.esc(sup ? sup.nombre : 'Desconocido')}</div></div>
            <div><span class="font-label-sm text-on-surface-variant">Fecha estimada de entrega</span><div class="font-body-md">${NUCLEO.formatDate(o.fecha)}</div></div>
            <div><span class="font-label-sm text-on-surface-variant">Estado</span><div><span class="badge ${o.estado === 'Recibido' ? 'compras-badge-recibido' : 'compras-badge-pendiente'}">${NUCLEO.esc(o.estado)}</span></div></div>
            <div><span class="font-label-sm text-on-surface-variant">Total</span><div class="font-numeric-display">${NUCLEO.money(o.total)}</div></div>
          </div>
          <table class="table">
            <thead class="table-header"><tr><th>Producto</th><th>Cantidad</th><th>Precio Unit.</th><th>Subtotal</th></tr></thead>
            <tbody>
              ${(o.items || []).length === 0 ? '<tr><td colspan="4" class="compras-empty-state">Sin ítems.</td></tr>' : o.items.map(function (i) {
                return `<tr class="table-row"><td>${NUCLEO.esc(i.name)}</td><td>${i.qty}</td><td>${NUCLEO.money(i.price)}</td><td class="font-numeric-tape">${NUCLEO.money(i.qty * i.price)}</td></tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="compras-modal-footer"><button class="btn btn-secondary compras-modal-close">Cerrar</button></div>`, 640);
  },

  // ---------- Editor de ítems compartido (pedidos y facturas) ----------
  // Cada ítem: { code, name, qty, price }. Vinculado = su code existe en INVENTARIO (productos activos).
  crearEditorItems: function (modal, state, cfg) {
    const self = this;
    const products = (NUCLEO.getData('pos_products') || []).filter(function (p) { return p.active !== false; });
    const etiqueta = function (p) { return p.name + ' [' + p.code + ']'; };
    const porEtiqueta = {};
    const porCode = {};
    products.forEach(function (p) { porEtiqueta[etiqueta(p)] = p; porCode[p.code] = p; });

    const dl = document.createElement('datalist');
    dl.id = cfg.bodyId + '-dl';
    dl.innerHTML = products.map(function (p) { return '<option value="' + NUCLEO.esc(etiqueta(p)) + '"></option>'; }).join('');
    modal.appendChild(dl);

    const body = modal.querySelector('#' + cfg.bodyId);
    const totalEl = modal.querySelector('#' + cfg.totalId);

    const costoRealHTML = function (item) {
      const p = porCode[item.code];
      if (!cfg.getTipo || !p || !(item.price > 0)) return '—';
      const c = NUCLEO.calcularCostoReal(p, item.price, cfg.getTipo());
      return NUCLEO.money(c.costo) + ' <span class="font-body-sm text-on-surface-variant" title="' + (c.origen === 'producto' ? 'porcentaje propio del producto' : c.origen === 'categoria' ? 'porcentaje de la categoría' : 'porcentaje del tipo de factura') + '">(' + c.pct + '%)</span>';
    };
    const refrescarCosto = function (tr, item) {
      const c = tr.querySelector('.item-costoreal');
      if (c) c.innerHTML = costoRealHTML(item);
    };
    const actualizarTotal = function () {
      const total = state.items.reduce(function (s, i) { return s + (Number(i.qty) || 0) * (Number(i.price) || 0); }, 0);
      totalEl.textContent = NUCLEO.money(NUCLEO.roundCents(total));
    };
    const iconoVinculo = function (item) {
      const vinc = !!porCode[item.code];
      return '<span class="material-symbols-outlined compras-link ' + (vinc ? 'compras-link-ok' : 'compras-link-warn') + '" title="' +
        (vinc ? 'Vinculado a INVENTARIO' : 'No está en INVENTARIO: dalo de alta primero') + '">' + (vinc ? 'link' : 'link_off') + '</span>';
    };
    const filaHTML = function (item, idx) {
      const p = porCode[item.code];
      return '<tr data-idx="' + idx + '"><td><div class="compras-item-cell"><span class="compras-link-slot">' + iconoVinculo(item) + '</span>' +
        '<input type="text" class="item-name" list="' + dl.id + '" placeholder="Buscar producto..." value="' + NUCLEO.esc(p ? etiqueta(p) : item.name) + '"></div></td>' +
        '<td><input type="number" class="item-qty" min="0" step="any" value="' + NUCLEO.esc(item.qty) + '"></td>' +
        '<td><input type="number" class="item-price" min="0" step="0.01" value="' + NUCLEO.esc(item.price) + '"></td>' +
        '<td class="font-numeric-tape item-subtotal">' + NUCLEO.money(NUCLEO.roundCents(item.qty * item.price)) + '</td>' +
        (cfg.getTipo ? '<td class="font-numeric-tape item-costoreal">' + costoRealHTML(item) + '</td>' : '') +
        '<td><button type="button" class="btn btn-ghost btn-icon item-remove"><span class="material-symbols-outlined">delete</span></button></td></tr>';
    };
    const renderTodo = function () {
      body.innerHTML = state.items.map(filaHTML).join('') ||
        '<tr><td colspan="5" class="compras-empty-state">Sin ítems. Usá "Agregar Ítem".</td></tr>';
      actualizarTotal();
    };

    // Delegación: se actualiza solo lo que cambia, sin re-render (no se pierde el foco)
    body.addEventListener('input', function (e) {
      const tr = e.target.closest('tr[data-idx]');
      if (!tr) return;
      const item = state.items[parseInt(tr.dataset.idx, 10)];
      if (!item) return;
      if (e.target.classList.contains('item-qty')) item.qty = parseFloat(e.target.value) || 0;
      else if (e.target.classList.contains('item-price')) item.price = parseFloat(e.target.value) || 0;
      else return;
      tr.querySelector('.item-subtotal').textContent = NUCLEO.money(NUCLEO.roundCents(item.qty * item.price));
      refrescarCosto(tr, item);
      actualizarTotal();
    });
    body.addEventListener('change', function (e) {
      if (!e.target.classList.contains('item-name')) return;
      const tr = e.target.closest('tr[data-idx]');
      const item = state.items[parseInt(tr.dataset.idx, 10)];
      const valor = e.target.value;
      const p = porEtiqueta[valor];
      if (p) {
        item.code = p.code;
        item.name = p.name;
        if (!(item.price > 0)) {
          const up = self.ultimoPrecioFactura(p.code);
          item.price = up.precio;
          tr.querySelector('.item-price').value = up.precio;
          tr.querySelector('.item-price').title = up.estimado ? 'Precio estimado (sin facturas previas). Verificalo.' : 'Último precio de factura';
        }
      } else {
        item.name = valor;
        if (porCode[item.code] || !String(item.code).startsWith('MANUAL-')) item.code = 'MANUAL-' + Date.now();
      }
      tr.querySelector('.compras-link-slot').innerHTML = iconoVinculo(item);
      tr.querySelector('.item-subtotal').textContent = NUCLEO.money(NUCLEO.roundCents(item.qty * item.price));
      refrescarCosto(tr, item);
      actualizarTotal();
    });
    body.addEventListener('click', function (e) {
      const btn = e.target.closest('.item-remove');
      if (!btn) return;
      state.items.splice(parseInt(btn.closest('tr').dataset.idx, 10), 1);
      renderTodo();
    });
    modal.querySelector('#' + cfg.addId).addEventListener('click', function () {
      state.items.push({ code: 'MANUAL-' + Date.now(), name: '', qty: 1, price: 0 });
      renderTodo();
    });
    renderTodo();
    return { porCode: porCode, refrescarTodo: function () { body.querySelectorAll('tr[data-idx]').forEach(function (tr) { refrescarCosto(tr, state.items[parseInt(tr.dataset.idx, 10)]); }); } };
  },

  itemsTableHTML: function (bodyId, totalId, addId, titulo, totalLabel, conCosto) {
    return `
      <h4 style="margin-top: 1.5rem; margin-bottom: 0.5rem;">${titulo}</h4>
      <table class="compras-items-table">
        <thead><tr><th>Producto</th><th style="width: 100px;">Cantidad</th><th style="width: 120px;">Precio Unit.</th><th style="width: 120px;">Subtotal</th>${conCosto ? '<th style="width: 140px;">Costo real</th>' : ''}<th style="width: 50px;"></th></tr></thead>
        <tbody id="${bodyId}"></tbody>
      </table>
      <button type="button" class="btn btn-ghost" id="${addId}" style="margin-top: 0.5rem;"><span class="material-symbols-outlined">add_circle</span> Agregar Ítem</button>
      <div class="flex justify-between items-center" style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--color-outline-variant);">
        <span class="font-headline-md">${totalLabel}</span>
        <span class="font-numeric-display" id="${totalId}">$ 0</span>
      </div>`;
  },

  openNewOrderModal: function (suggestedItems) {
    const self = this;
    const suppliers = (NUCLEO.getData('pos_suppliers') || []).filter(function (s) { return s.activo !== false; });
    const previewId = this.siguienteId('OC-', NUCLEO.getData('pos_purchase_orders') || []);
    const modal = this.abrirModal(`
        <div class="compras-modal-header">
          <h3>Nuevo Pedido de Reposición</h3>
          <button class="btn btn-ghost btn-icon compras-modal-close"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="compras-modal-body">
          <div class="compras-modal-grid">
            <div><label class="font-label-sm">Orden de Compra</label><input type="text" class="input" value="${previewId}" disabled></div>
            <div><label class="font-label-sm">Proveedor *</label><select class="input" id="orderSupplier"><option value="">Seleccionar...</option>${suppliers.map(function (s) { return `<option value="${NUCLEO.esc(s.id)}">${NUCLEO.esc(s.nombre)}</option>`; }).join('')}</select></div>
            <div><label class="font-label-sm">Fecha Estimada de Entrega</label><input type="date" class="input" id="orderDate" value="${NUCLEO.today()}"></div>
          </div>
          ${this.itemsTableHTML('orderItemsBody', 'orderTotal', 'btnAddItem', 'Artículos del Pedido', 'Total del pedido:')}
        </div>
        <div class="compras-modal-footer">
          <button class="btn btn-secondary compras-modal-close">Cancelar</button>
          <button class="btn btn-primary" id="btnSaveOrder"><span class="material-symbols-outlined">check_circle</span> Guardar Pedido</button>
        </div>`, 860);
    const state = { items: (suggestedItems || []).map(function (i) { return Object.assign({}, i); }) };
    const editor = this.crearEditorItems(modal, state, { bodyId: 'orderItemsBody', totalId: 'orderTotal', addId: 'btnAddItem' });

    modal.querySelector('#btnSaveOrder').addEventListener('click', function () {
      const supplierId = modal.querySelector('#orderSupplier').value;
      if (!supplierId) { NUCLEO.toast('Selecciona un proveedor', 'error'); return; }
      if (state.items.length === 0 || state.items.some(function (i) { return !NUCLEO.normText(i.name) || !(i.qty > 0) || i.price < 0; })) {
        NUCLEO.toast('Completá nombre y cantidad de todos los ítems', 'error'); return;
      }
      const orders = NUCLEO.getData('pos_purchase_orders') || [];
      const total = NUCLEO.roundCents(state.items.reduce(function (s, i) { return s + i.qty * i.price; }, 0));
      const sinVincular = state.items.filter(function (i) { return !editor.porCode[i.code]; }).length;
      orders.push({
        id: self.siguienteId('OC-', orders), proveedorId: supplierId, fecha: modal.querySelector('#orderDate').value,
        estado: 'Pendiente', items: state.items.map(function (i) { return { code: i.code, name: NUCLEO.normText(i.name), qty: i.qty, price: i.price }; }),
        total: total, userId: self.usuarioId()
      });
      if (!NUCLEO.setData('pos_purchase_orders', orders)) return;
      modal.remove();
      NUCLEO.toast(sinVincular ? 'Pedido guardado. ' + sinVincular + ' ítem(s) no están en INVENTARIO: hay que darlos de alta antes de recibir.' : 'Pedido guardado correctamente', sinVincular ? 'warning' : 'success');
      self.renderPedidos(document.getElementById('comprasContent'));
    });
  },

  // Sugerencias calculadas (separado de la UI para poder probarlo)
  calcularSugerencias: function () {
    const self = this;
    const products = NUCLEO.getData('pos_products') || [];
    const sales = NUCLEO.getData('pos_sales') || [];
    const orders = NUCLEO.getData('pos_purchase_orders') || [];
    const desde = new Date();
    desde.setDate(desde.getDate() - 30);

    const vendido = {};
    sales.forEach(function (sale) {
      if (new Date(sale.fecha) < desde) return;
      (sale.items || []).forEach(function (it) {
        let q = Number(it.qty) || 0;
        if (it.esCigarrillo && it.tipo === 'suelto') q = q / 20; // sueltos → equivalente en paquetes
        vendido[it.code] = (vendido[it.code] || 0) + q;
      });
    });
    const enCamino = {};
    orders.filter(function (o) { return o.estado === 'Pendiente'; }).forEach(function (o) {
      (o.items || []).forEach(function (it) { enCamino[it.code] = (enCamino[it.code] || 0) + (Number(it.qty) || 0); });
    });

    const out = [];
    products.forEach(function (p) {
      if (p.active === false) return;
      const stock = Number(p.stock) || 0;
      const min = Number(p.minStock) || 0;
      const vtas30d = vendido[p.code] || 0;
      const diario = vtas30d / 30;
      const camino = enCamino[p.code] || 0;
      // Objetivo: lo que se vende en 30 días, y como mínimo el doble del stock mínimo
      const objetivo = Math.max(Math.ceil(diario * 30), min * 2);
      const necesita = Math.ceil(objetivo - stock - camino);
      const critico = (min > 0 && stock <= min) || (diario > 0 && stock / diario < 15);
      if (critico && necesita > 0) {
        const up = self.ultimoPrecioFactura(p.code);
        out.push({ code: p.code, name: p.name, stock: stock, min: min, vtas30d: Math.round(vtas30d * 10) / 10, camino: camino, sugerido: necesita, price: up.precio });
      }
    });
    return out;
  },

  openSuggestOrderModal: function () {
    const self = this;
    const suggestions = this.calcularSugerencias();
    const modal = this.abrirModal(`
        <div class="compras-modal-header">
          <h3>Sugerencia de Pedido</h3>
          <button class="btn btn-ghost btn-icon compras-modal-close"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="compras-modal-body">
          <p class="font-body-sm text-on-surface-variant" style="margin-bottom: 1rem;">Basado en ventas de los últimos 30 días, stock actual, mínimo y pedidos en camino. Los precios son el último precio de factura.</p>
          <table class="table">
            <thead class="table-header">
              <tr><th>Producto</th><th>Stock</th><th>Mín.</th><th>Vtas 30D</th><th>En camino</th><th style="width: 110px;">Sugerido</th><th style="width: 70px;">Agregar</th></tr>
            </thead>
            <tbody>
              ${suggestions.length === 0 ? `<tr><td colspan="7" class="compras-empty-state">No hay productos que necesiten reposición.</td></tr>` :
              suggestions.map(function (s, idx) {
                return `<tr class="table-row"><td>${NUCLEO.esc(s.name)}</td><td>${s.stock}</td><td>${s.min}</td><td>${s.vtas30d}</td><td>${s.camino}</td>
                  <td><input type="number" class="input sug-qty" data-idx="${idx}" value="${s.sugerido}" min="0"></td>
                  <td><input type="checkbox" class="sug-check" data-idx="${idx}" checked></td></tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="compras-modal-footer">
          <button class="btn btn-secondary compras-modal-close">Cancelar</button>
          <button class="btn btn-primary" id="btnAddSuggested"><span class="material-symbols-outlined">playlist_add</span> Agregar Seleccionados al Pedido</button>
        </div>`, 940);
    modal.querySelector('#btnAddSuggested').addEventListener('click', function () {
      const selected = [];
      modal.querySelectorAll('.sug-check').forEach(function (chk) {
        if (!chk.checked) return;
        const idx = parseInt(chk.dataset.idx, 10);
        const qty = parseFloat(modal.querySelector('.sug-qty[data-idx="' + idx + '"]').value) || 0;
        if (qty > 0) selected.push({ code: suggestions[idx].code, name: suggestions[idx].name, qty: qty, price: suggestions[idx].price });
      });
      modal.remove();
      if (selected.length > 0) self.openNewOrderModal(selected);
      else NUCLEO.toast('No seleccionaste ningún ítem', 'warning');
    });
  },

  receiveOrder: function (orderId) {
    const order = (NUCLEO.getData('pos_purchase_orders') || []).find(function (o) { return o.id === orderId; });
    if (!order) return;
    if (order.estado !== 'Pendiente') { NUCLEO.toast('Ese pedido ya fue recibido', 'warning'); return; }
    this.openNewInvoiceModal(order);
  },

  // ==========================================
  // FACTURAS
  // ==========================================
  renderFacturas: function (container) {
    const self = this;
    const invoices = (NUCLEO.getData('pos_invoices') || []).slice().reverse();
    container.innerHTML = `
      <div class="compras-toolbar">
        <div class="font-label-md text-on-surface-variant">${invoices.length} Procesadas</div>
        <button class="btn btn-primary" id="btnNewInvoice"><span class="material-symbols-outlined">add</span> Cargar Factura</button>
      </div>
      <div class="compras-table-container">
        <table class="table">
          <thead class="table-header">
            <tr><th>N° Factura</th><th>Proveedor</th><th>Fecha</th><th>Tipo</th><th>Total</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            ${invoices.length === 0 ? `<tr><td colspan="6" class="compras-empty-state">No hay facturas registradas.</td></tr>` : invoices.map(function (inv) {
              const sup = self.getProveedor(inv.proveedorId);
              return `
                <tr class="table-row">
                  <td class="font-mono font-semibold">${NUCLEO.esc(inv.numero || inv.id)}${inv.numero ? '<div class="font-label-sm text-on-surface-variant">' + NUCLEO.esc(inv.id) + '</div>' : ''}</td>
                  <td>${NUCLEO.esc(sup ? sup.nombre : 'Desconocido')}</td>
                  <td>${NUCLEO.formatDate(inv.fecha)}</td>
                  <td><span class="badge ${self.badgeFactura(inv.tipoFactura)}">Tipo ${NUCLEO.esc(inv.tipoFactura)}</span></td>
                  <td class="font-numeric-tape">${NUCLEO.money(inv.total)}</td>
                  <td><button class="btn btn-ghost" data-action="view-inv" data-id="${NUCLEO.esc(inv.id)}">Ver Detalle</button></td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="compras-footer-info" style="margin-top: 1.5rem;">
        <span class="material-symbols-outlined" style="color: var(--color-primary);">lightbulb</span>
        <div>
          <strong>Costo real:</strong> es un porcentaje del precio de factura. Se usa el % propio del producto (INVENTARIO), si no tiene el de su categoría (CONFIG · Costos) y si tampoco, el del tipo de factura (por defecto A/B 70%, X 50%).
        </div>
      </div>`;
    document.getElementById('btnNewInvoice').addEventListener('click', function () { self.openNewInvoiceModal(); });
    container.querySelectorAll('[data-action="view-inv"]').forEach(function (btn) {
      btn.addEventListener('click', function () { self.showInvoiceDetail(btn.dataset.id); });
    });
  },

  openNewInvoiceModal: function (fromOrder) {
    const self = this;
    let suppliers = (NUCLEO.getData('pos_suppliers') || []).filter(function (s) { return s.activo !== false; });
    if (fromOrder && !suppliers.some(function (s) { return s.id === fromOrder.proveedorId; })) {
      const inact = this.getProveedor(fromOrder.proveedorId);
      if (inact) suppliers = suppliers.concat([inact]); // el pedido pertenece a un proveedor dado de baja
    }
    const invoiceId = this.siguienteId('FAC-', NUCLEO.getData('pos_invoices') || []);
    const state = { items: fromOrder ? fromOrder.items.map(function (i) { return Object.assign({}, i); }) : [] };
    const tipoInicial = fromOrder ? ((this.getProveedor(fromOrder.proveedorId) || {}).tipoFactura || 'A') : 'A';

    const modal = this.abrirModal(`
        <div class="compras-modal-header">
          <h3>${fromOrder ? 'Recepcionar Pedido ' + NUCLEO.esc(fromOrder.id) : 'Cargar Factura'}</h3>
          <button class="btn btn-ghost btn-icon compras-modal-close"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="compras-modal-body">
          <div class="compras-modal-grid">
            <div><label class="font-label-sm">Registro interno</label><input type="text" class="input" value="${invoiceId}" disabled></div>
            <div><label class="font-label-sm">N° de comprobante del proveedor</label><input type="text" class="input" id="invNumero" placeholder="Ej: 0001-00012345"></div>
            <div><label class="font-label-sm">Proveedor *</label><select class="input" id="invSupplier" ${fromOrder ? 'disabled' : ''}><option value="">Seleccionar...</option>${suppliers.map(function (s) { return `<option value="${NUCLEO.esc(s.id)}" ${fromOrder && fromOrder.proveedorId === s.id ? 'selected' : ''}>${NUCLEO.esc(s.nombre)}${s.activo === false ? ' (baja)' : ''}</option>`; }).join('')}</select></div>
            <div><label class="font-label-sm">Fecha *</label><input type="date" class="input" id="invDate" value="${NUCLEO.today()}"></div>
            <div><label class="font-label-sm">Tipo Factura * <span class="text-on-surface-variant">(hereda del proveedor)</span></label><select class="input" id="invType">
              <option value="A" ${tipoInicial === 'A' ? 'selected' : ''}>Tipo A (Responsable Inscripto)</option>
              <option value="B" ${tipoInicial === 'B' ? 'selected' : ''}>Tipo B (Monotributo)</option>
              <option value="X" ${tipoInicial === 'X' ? 'selected' : ''}>Tipo X (No Fiscal)</option></select></div>
          </div>
          ${this.itemsTableHTML('invItemsBody', 'invTotal', 'btnAddInvItem', 'Artículos Incluidos (precio de factura, nominal)', 'Total de la factura:', true)}
        </div>
        <div class="compras-modal-footer">
          <button class="btn btn-secondary compras-modal-close">Cancelar</button>
          <button class="btn btn-primary" id="btnConfirmInvoice"><span class="material-symbols-outlined">check_circle</span> Confirmar Factura</button>
        </div>`, 900);

    const editor = this.crearEditorItems(modal, state, { bodyId: 'invItemsBody', totalId: 'invTotal', addId: 'btnAddInvItem', getTipo: function () { return modal.querySelector('#invType').value; } });
    modal.querySelector('#invType').addEventListener('change', function () { editor.refrescarTodo(); });

    // El tipo de factura hereda del proveedor elegido (se puede cambiar por factura)
    modal.querySelector('#invSupplier').addEventListener('change', function (e) {
      const s = self.getProveedor(e.target.value);
      if (s && s.tipoFactura) modal.querySelector('#invType').value = s.tipoFactura;
      editor.refrescarTodo();
    });

    modal.querySelector('#btnConfirmInvoice').addEventListener('click', function () {
      const ok = self.confirmInvoice({
        invoiceId: invoiceId,
        numero: NUCLEO.normText(modal.querySelector('#invNumero').value),
        supplierId: modal.querySelector('#invSupplier').value,
        fecha: modal.querySelector('#invDate').value,
        tipoFactura: modal.querySelector('#invType').value,
        items: state.items,
        orderId: fromOrder ? fromOrder.id : null
      });
      if (ok) modal.remove();
    });
  },

  // Confirma una factura TODO O NADA: stock + costo + factura + pedido, o nada. Devuelve true si se procesó.
  confirmInvoice: function (d) {
    if (this.state.procesando) return false;
    const self = this;
    const supplier = this.getProveedor(d.supplierId);
    if (!supplier) { NUCLEO.toast('Selecciona un proveedor', 'error'); return false; }
    if (!d.fecha) { NUCLEO.toast('La fecha es obligatoria', 'error'); return false; }
    if (!d.items.length) { NUCLEO.toast('La factura no tiene ítems', 'error'); return false; }

    const productos = NUCLEO.getData('pos_products') || [];
    const porCode = {};
    productos.forEach(function (p) { porCode[p.code] = p; });

    // Validaciones por ítem: todos deben existir en INVENTARIO
    for (let i = 0; i < d.items.length; i++) {
      const it = d.items[i];
      const p = porCode[it.code];
      if (!p || p.active === false) { NUCLEO.toast('"' + (it.name || 'ítem ' + (i + 1)) + '" no está en INVENTARIO (o está dado de baja). Dalo de alta primero.', 'error'); return false; }
      if (!(it.qty > 0)) { NUCLEO.toast('Cantidad inválida en "' + p.name + '"', 'error'); return false; }
      if (!(it.price > 0)) { NUCLEO.toast('Falta el precio de factura de "' + p.name + '"', 'error'); return false; }
    }
    // Factura repetida (mismo proveedor y mismo N° de comprobante)
    const invoices = NUCLEO.getData('pos_invoices') || [];
    if (d.numero && invoices.some(function (inv) { return inv.proveedorId === d.supplierId && NUCLEO.normText(inv.numero).toLowerCase() === d.numero.toLowerCase(); })) {
      NUCLEO.toast('Ese comprobante ya fue cargado para este proveedor', 'error'); return false;
    }
    if (d.orderId) {
      const o = (NUCLEO.getData('pos_purchase_orders') || []).find(function (x) { return x.id === d.orderId; });
      if (!o || o.estado !== 'Pendiente') { NUCLEO.toast('El pedido ya fue recibido o no existe', 'error'); return false; }
    }

    const userId = this.usuarioId();
    const itemsLimpios = d.items.map(function (i) { return { code: i.code, name: porCode[i.code].name, qty: i.qty, price: i.price }; });
    const total = NUCLEO.roundCents(itemsLimpios.reduce(function (s, i) { return s + i.qty * i.price; }, 0));
    const erosionados = [];

    this.state.procesando = true;
    const ok = NUCLEO.transaccion(['pos_products', 'pos_stock_movements', 'pos_cost_history', 'pos_invoices', 'pos_purchase_orders'], function () {
      for (let i = 0; i < itemsLimpios.length; i++) {
        const it = itemsLimpios[i];
        const p = porCode[it.code];
        // % de costo real: producto > categoría > tipo de factura (configurable por el dueño)
        const calc = NUCLEO.calcularCostoReal(p, it.price, d.tipoFactura);
        const costoReal = calc.costo;
        it.factor = calc.pct; it.origenFactor = calc.origen; it.costoReal = costoReal;
        if (!NUCLEO.actualizarStock(it.code, it.qty, 'recepcion', userId, 'Factura ' + (d.numero || d.invoiceId))) return false;
        if (!NUCLEO.actualizarCostoProducto(it.code, costoReal, userId)) return false;

        // Margen erosionado (única fuente de verdad). Margen SOBRE COSTO, igual que INVENTARIO.
        const minimo = NUCLEO.getMargenMinimo(p.category); // null = Cigarrillos (excluido)
        const margenActual = NUCLEO.margenSobreCosto(p.price, costoReal);
        if (minimo !== null && p.price > 0 && margenActual !== null && margenActual < minimo) {
          erosionados.push({ code: p.code, name: p.name, costoAnterior: Number(p.cost) || 0, costoNuevo: costoReal, margenActual: Math.round(margenActual * 100) / 100, margenMinimoRequerido: minimo });
        }
      }
      const invs = NUCLEO.getData('pos_invoices') || [];
      invs.push({ id: d.invoiceId, numero: d.numero || '', proveedorId: d.supplierId, fecha: d.fecha, tipoFactura: d.tipoFactura, items: itemsLimpios, total: total, orderId: d.orderId, userId: userId, estado: 'Procesada' });
      NUCLEO.setDataStrict('pos_invoices', invs);
      if (d.orderId) {
        const orders = NUCLEO.getData('pos_purchase_orders') || [];
        const order = orders.find(function (o) { return o.id === d.orderId; });
        if (order) { order.estado = 'Recibido'; NUCLEO.setDataStrict('pos_purchase_orders', orders); }
      }
      return true;
    });
    this.state.procesando = false;

    if (!ok) { NUCLEO.toast('No se pudo procesar la factura. No se modificó ningún dato (stock, costos ni facturas).', 'error'); return false; }

    NUCLEO.emit('pos:facturaRecibida', {
      proveedorId: d.supplierId, proveedorNombre: supplier.nombre, facturaId: d.invoiceId, numero: d.numero || '',
      diasCredito: Number(supplier.diasCredito) || 0, monto: total, fecha: d.fecha, tipoFactura: d.tipoFactura,
      itemsConMargenErosionado: erosionados
    });
    NUCLEO.toast('Factura procesada. Stock y costos actualizados.' + (erosionados.length ? ' ' + erosionados.length + ' producto(s) con margen erosionado.' : ''), erosionados.length ? 'warning' : 'success');
    self.showView(self.state.currentView);
    return true;
  },

  showInvoiceDetail: function (invoiceId) {
    const inv = (NUCLEO.getData('pos_invoices') || []).find(function (i) { return i.id === invoiceId; });
    if (!inv) return;
    const sup = this.getProveedor(inv.proveedorId);
    this.abrirModal(`
        <div class="compras-modal-header">
          <h3>Detalle de Factura - ${NUCLEO.esc(inv.numero || inv.id)}</h3>
          <button class="btn btn-ghost btn-icon compras-modal-close"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="compras-modal-body">
          <div class="compras-modal-grid" style="margin-bottom: 1rem;">
            <div><span class="font-label-sm text-on-surface-variant">Proveedor</span><div class="font-body-md font-semibold">${NUCLEO.esc(sup ? sup.nombre : 'Desconocido')}</div></div>
            <div><span class="font-label-sm text-on-surface-variant">Fecha Emisión</span><div class="font-body-md">${NUCLEO.formatDate(inv.fecha)}</div></div>
            <div><span class="font-label-sm text-on-surface-variant">Tipo Factura</span><div><span class="badge ${this.badgeFactura(inv.tipoFactura)}">Tipo ${NUCLEO.esc(inv.tipoFactura)}</span></div></div>
            <div><span class="font-label-sm text-on-surface-variant">Total Facturado</span><div class="font-numeric-display">${NUCLEO.money(inv.total)}</div></div>
          </div>
          <table class="table">
            <thead class="table-header"><tr><th>Producto</th><th>Cantidad</th><th>Precio Unit.</th><th>Subtotal</th></tr></thead>
            <tbody>
              ${(inv.items || []).map(function (item) {
                return `<tr class="table-row"><td>${NUCLEO.esc(item.name)}</td><td>${item.qty}</td><td>${NUCLEO.money(item.price)}</td><td class="font-numeric-tape">${NUCLEO.money(item.qty * item.price)}</td></tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="compras-modal-footer"><button class="btn btn-secondary compras-modal-close">Cerrar</button></div>`, 640);
  }
};
