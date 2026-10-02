const ComprasModule = {
  id: 'compras',
  name: 'COMPRAS',
  icon: 'shopping_cart',
  state: { currentView: 'proveedores', listenersAttached: false },
  init: function() {
    this.render();
    if (this.state.listenersAttached) return;
    this.state.listenersAttached = true;
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const modal = document.querySelector('.compras-modal-overlay');
      if (modal) { e.preventDefault(); e.stopPropagation(); modal.remove(); return; }
      const activo = document.querySelector('.topbar-tab.active');
      if (activo && activo.getAttribute('data-module') === 'compras') { e.preventDefault(); NUCLEO.showTab('caja'); }
    }, true);
  },
  onShow: function() { this.render(); },
  render: function() {
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
  renderSidebar: function() {
    const sidebar = document.getElementById('comprasSidebar');
    const views = [
      { id: 'proveedores', label: 'Proveedores', icon: 'storefront' },
      { id: 'pedidos', label: 'Pedidos', icon: 'assignment' },
      { id: 'facturas', label: 'Facturas', icon: 'receipt_long' }
    ];
    sidebar.innerHTML = views.map(v => `
      <div class="compras-sidebar-item ${this.state.currentView === v.id ? 'active' : ''}" data-view="${v.id}">
        <span class="material-symbols-outlined">${v.icon}</span>${v.label}
      </div>`).join('');
    sidebar.querySelectorAll('.compras-sidebar-item').forEach(item => {
      item.addEventListener('click', () => {
        this.state.currentView = item.dataset.view;
        this.renderSidebar();
        this.showView(this.state.currentView);
      });
    });
  },
  showView: function(view) {
    const header = document.getElementById('comprasHeader');
    const content = document.getElementById('comprasContent');
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
  renderProveedores: function(container) {
    const suppliers = NUCLEO.getData('pos_suppliers') || [];
    const activeSuppliers = suppliers.filter(s => s.activo !== false);
    container.innerHTML = `
      <div class="compras-toolbar">
        <div class="font-label-md text-on-surface-variant">${activeSuppliers.length} Proveedores Activos</div>
      </div>
      <div class="compras-table-container">
        <table class="table">
          <thead class="table-header">
            <tr><th>Nombre y Razón Social</th><th>Rubro</th><th>Contacto</th><th>Condición / Crédito</th><th>Factura</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            ${activeSuppliers.length === 0 ? `<tr><td colspan="6" class="compras-empty-state">No hay proveedores registrados.</td></tr>` : activeSuppliers.map(s => `
              <tr class="table-row">
                <td><div class="font-body-md font-semibold">${NUCLEO.esc(s.nombre)}</div><div class="font-label-sm text-on-surface-variant">CUIT: ${NUCLEO.esc(s.cuit || '-')}</div></td>
                <td><span class="badge badge-neutral">${NUCLEO.esc(s.rubro || '-')}</span></td>
                <td class="font-body-sm">${NUCLEO.esc(s.telefono || '-')}<br>${NUCLEO.esc(s.email || '-')}</td>
                <td class="font-body-sm">${s.diasCredito || 0} Días Crédito</td>
                <td><span class="badge ${s.tipoFactura === 'A' ? 'compras-badge-a' : s.tipoFactura === 'B' ? 'compras-badge-b' : 'compras-badge-x'}">Tipo ${s.tipoFactura || 'X'}</span></td>
                <td>
                  <button class="btn btn-ghost btn-icon" title="Historial de Precios" data-action="history" data-id="${s.id}">
                    <span class="material-symbols-outlined">history</span>
                  </button>
                </td>
              </tr>`).join('')}
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
    container.querySelectorAll('[data-action="history"]').forEach(btn => {
      btn.addEventListener('click', () => this.showPriceHistory(btn.dataset.id));
    });
    const goToConfig = document.getElementById('goToConfigSuppliers');
    if(goToConfig) {
      goToConfig.addEventListener('click', (e) => { e.preventDefault(); NUCLEO.showTab('config'); });
    }
  },
  showPriceHistory: function(supplierId) {
    const suppliers = NUCLEO.getData('pos_suppliers') || [];
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return;
    const invoices = NUCLEO.getData('pos_invoices') || [];
    const history = [];
    invoices.forEach(inv => {
      if (inv.proveedorId === supplierId) {
        inv.items.forEach(item => {
          history.push({ fecha: inv.fecha, producto: item.name, precio: item.price, tipo: inv.tipoFactura });
        });
      }
    });
    history.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const modal = document.createElement('div');
    modal.className = 'compras-modal-overlay';
    modal.innerHTML = `
      <div class="compras-modal-content" style="max-width: 600px;">
        <div class="compras-modal-header">
          <h3>Historial de Precios - ${NUCLEO.esc(supplier.nombre)}</h3>
          <button class="btn btn-ghost btn-icon compras-modal-close"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="compras-modal-body">
          <p class="font-body-sm text-on-surface-variant" style="margin-bottom: 1rem;">Evolución de costos registrados en facturas de compras</p>
          <table class="table">
            <thead class="table-header"><tr><th>Fecha</th><th>Producto</th><th>Precio</th><th>Tipo Factura</th></tr></thead>
            <tbody>
              ${history.length === 0 ? `<tr><td colspan="4" class="compras-empty-state">Sin registros de facturación.</td></tr>` : 
              history.map(h => `
                <tr class="table-row">
                  <td>${h.fecha}</td>
                  <td>${NUCLEO.esc(h.producto)}</td>
                  <td>${NUCLEO.money(h.precio)}</td>
                  <td><span class="badge ${h.tipo === 'A' ? 'compras-badge-a' : h.tipo === 'B' ? 'compras-badge-b' : 'compras-badge-x'}">Tipo ${h.tipo}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="compras-modal-footer">
          <button class="btn btn-secondary compras-modal-close">Cerrar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('.compras-modal-close').forEach(btn => btn.addEventListener('click', () => modal.remove()));
  },
  renderPedidos: function(container) {
    const orders = NUCLEO.getData('pos_purchase_orders') || [];
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
            <tr><th>N° OC</th><th>Proveedor</th><th>Fecha</th><th>Estado</th><th>Total</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            ${orders.length === 0 ? `<tr><td colspan="6" class="compras-empty-state">No hay pedidos registrados.</td></tr>` : orders.map(o => {
              const sup = (NUCLEO.getData('pos_suppliers') || []).find(s => s.id === o.proveedorId);
              return `
                <tr class="table-row">
                  <td class="font-mono font-semibold">${NUCLEO.esc(o.id)}</td>
                  <td>${NUCLEO.esc(sup ? sup.nombre : 'Desconocido')}</td>
                  <td>${o.fecha}</td>
                  <td><span class="badge ${o.estado === 'Recibido' ? 'compras-badge-recibido' : 'compras-badge-pendiente'}">${o.estado}</span></td>
                  <td class="font-numeric-tape">${NUCLEO.money(o.total)}</td>
                  <td>
                    ${o.estado === 'Pendiente' ? `<button class="btn btn-ghost" data-action="receive" data-id="${o.id}">Recibir</button>` : ''}
                    <button class="btn btn-ghost" data-action="view" data-id="${o.id}">Ver</button>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
    document.getElementById('btnNewOrder').addEventListener('click', () => this.openNewOrderModal());
    document.getElementById('btnSuggestOrder').addEventListener('click', () => this.openSuggestOrderModal());
    container.querySelectorAll('[data-action="receive"]').forEach(btn => {
      btn.addEventListener('click', () => this.receiveOrder(btn.dataset.id));
    });
    // <-- NUEVO: Handler para el botón "Ver"
    container.querySelectorAll('[data-action="view"]').forEach(btn => {
      btn.addEventListener('click', () => this.showOrderDetail(btn.dataset.id));
    });
  },
  // <-- NUEVO: Método showOrderDetail
  showOrderDetail: function(orderId) {
    const orders = NUCLEO.getData('pos_purchase_orders') || [];
    const o = orders.find(x => x.id === orderId);
    if (!o) return;
    const sup = (NUCLEO.getData('pos_suppliers') || []).find(s => s.id === o.proveedorId);

    const modal = document.createElement('div');
    modal.className = 'compras-modal-overlay';
    modal.innerHTML = `
      <div class="compras-modal-content" style="max-width: 640px;">
        <div class="compras-modal-header">
          <h3>Detalle de Pedido - ${NUCLEO.esc(o.id)}</h3>
          <button class="btn btn-ghost btn-icon compras-modal-close"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="compras-modal-body">
          <div class="compras-modal-grid" style="margin-bottom: 1rem;">
            <div><span class="font-label-sm text-on-surface-variant">Proveedor</span><div class="font-body-md font-semibold">${NUCLEO.esc(sup ? sup.nombre : 'Desconocido')}</div></div>
            <div><span class="font-label-sm text-on-surface-variant">Fecha estimada de entrega</span><div class="font-body-md">${NUCLEO.esc(o.fecha || '-')}</div></div>
            <div><span class="font-label-sm text-on-surface-variant">Estado</span><div><span class="badge ${o.estado === 'Recibido' ? 'compras-badge-recibido' : 'compras-badge-pendiente'}">${NUCLEO.esc(o.estado)}</span></div></div>
            <div><span class="font-label-sm text-on-surface-variant">Total</span><div class="font-numeric-display">${NUCLEO.money(o.total)}</div></div>
          </div>
          <table class="table">
            <thead class="table-header">
              <tr><th>Producto</th><th>Cantidad</th><th>Precio Unit.</th><th>Subtotal</th></tr>
            </thead>
            <tbody>
              ${(o.items || []).length === 0
                ? '<tr><td colspan="4" class="compras-empty-state">Sin ítems.</td></tr>'
                : o.items.map(i => `
                  <tr class="table-row">
                    <td>${NUCLEO.esc(i.name)}</td>
                    <td>${i.qty}</td>
                    <td>${NUCLEO.money(i.price)}</td>
                    <td class="font-numeric-tape">${NUCLEO.money(i.qty * i.price)}</td>
                  </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="compras-modal-footer">
          <button class="btn btn-secondary compras-modal-close">Cerrar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('.compras-modal-close').forEach(b => b.addEventListener('click', () => modal.remove()));
  },
  openNewOrderModal: function(suggestedItems = []) {
    const suppliers = (NUCLEO.getData('pos_suppliers') || []).filter(s => s.activo !== false);
    const modal = document.createElement('div');
    modal.className = 'compras-modal-overlay';
    const orderId = 'OC-' + String((NUCLEO.getData('pos_purchase_orders') || []).length + 1).padStart(3, '0');
    modal.innerHTML = `
      <div class="compras-modal-content" style="max-width: 800px;">
        <div class="compras-modal-header">
          <h3>Nuevo Pedido de Reposición</h3>
          <button class="btn btn-ghost btn-icon compras-modal-close"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="compras-modal-body">
          <div class="compras-modal-grid">
            <div><label class="font-label-sm">Orden de Compra</label><input type="text" class="input" value="${orderId}" disabled></div>
            <div><label class="font-label-sm">Proveedor *</label><select class="input" id="orderSupplier"><option value="">Seleccionar...</option>${suppliers.map(s => `<option value="${s.id}">${NUCLEO.esc(s.nombre)}</option>`).join('')}</select></div>
            <div><label class="font-label-sm">Fecha Estimada de Entrega</label><input type="date" class="input" id="orderDate" value="${NUCLEO.today()}"></div>
          </div>
          <h4 style="margin-top: 1.5rem; margin-bottom: 0.5rem;">Artículos del Pedido</h4>
          <table class="compras-items-table" id="orderItemsTable">
            <thead><tr><th>Producto</th><th style="width: 100px;">Cantidad</th><th style="width: 120px;">Precio Unit.</th><th style="width: 120px;">Subtotal</th><th style="width: 50px;"></th></tr></thead>
            <tbody id="orderItemsBody"></tbody>
          </table>
          <button class="btn btn-ghost" id="btnAddItem" style="margin-top: 0.5rem;"><span class="material-symbols-outlined">add_circle</span> Agregar Ítem</button>
          <div class="flex justify-between items-center" style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--color-outline-variant);">
            <span class="font-headline-md">Total del pedido:</span>
            <span class="font-numeric-display" id="orderTotal">$ 0</span>
          </div>
        </div>
        <div class="compras-modal-footer">
          <button class="btn btn-secondary compras-modal-close">Cancelar</button>
          <button class="btn btn-primary" id="btnSaveOrder"><span class="material-symbols-outlined">check_circle</span> Guardar Pedido</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const state = { items: suggestedItems.length > 0 ? suggestedItems : [] };
    const renderItems = () => {
      const tbody = document.getElementById('orderItemsBody');
      tbody.innerHTML = state.items.map((item, idx) => `
        <tr>
          <td><input type="text" class="item-name" value="${NUCLEO.esc(item.name)}" data-idx="${idx}"></td>
          <td><input type="number" class="item-qty" value="${item.qty}" min="1" data-idx="${idx}"></td>
          <td><input type="number" class="item-price" value="${item.price}" min="0" step="0.01" data-idx="${idx}"></td>
          <td class="font-numeric-tape item-subtotal">${NUCLEO.money(item.qty * item.price)}</td>
          <td><button class="btn btn-ghost btn-icon item-remove" data-idx="${idx}"><span class="material-symbols-outlined">delete</span></button></td>
        </tr>`).join('');
      let total = 0;
      state.items.forEach(i => total += i.qty * i.price);
      document.getElementById('orderTotal').textContent = NUCLEO.money(total);
      tbody.querySelectorAll('.item-name, .item-qty, .item-price').forEach(inp => {
        inp.addEventListener('change', (e) => {
          const i = parseInt(e.target.dataset.idx);
          if(e.target.classList.contains('item-name')) state.items[i].name = e.target.value;
          if(e.target.classList.contains('item-qty')) state.items[i].qty = parseFloat(e.target.value) || 0;
          if(e.target.classList.contains('item-price')) state.items[i].price = parseFloat(e.target.value) || 0;
          renderItems();
        });
      });
      tbody.querySelectorAll('.item-remove').forEach(btn => {
        btn.addEventListener('click', () => { state.items.splice(parseInt(btn.dataset.idx), 1); renderItems(); });
      });
    };
    document.getElementById('btnAddItem').addEventListener('click', () => { state.items.push({ code: 'MANUAL-' + Date.now(), name: '', qty: 1, price: 0 }); renderItems(); });
    renderItems();
    modal.querySelectorAll('.compras-modal-close').forEach(btn => btn.addEventListener('click', () => modal.remove()));
    document.getElementById('btnSaveOrder').addEventListener('click', () => {
      const supplierId = document.getElementById('orderSupplier').value;
      if (!supplierId) { NUCLEO.toast('Selecciona un proveedor', 'error'); return; }
      if (state.items.length === 0 || state.items.some(i => !i.name || i.qty <= 0)) { NUCLEO.toast('Completa los datos de los ítems', 'error'); return; }
      const orders = NUCLEO.getData('pos_purchase_orders') || [];
      let total = 0;
      state.items.forEach(i => total += i.qty * i.price);
      orders.push({ id: orderId, proveedorId: supplierId, fecha: document.getElementById('orderDate').value, estado: 'Pendiente', items: state.items, total: total, userId: NUCLEO.getUsuarioActivo()?.id || null });
      NUCLEO.setData('pos_purchase_orders', orders);
      NUCLEO.toast('Pedido guardado correctamente', 'success');
      modal.remove();
      this.renderPedidos(document.getElementById('comprasContent'));
    });
  },
  openSuggestOrderModal: function() {
    const products = NUCLEO.getData('pos_products') || [];
    const sales = NUCLEO.getData('pos_sales') || [];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const salesByProduct = {};
    sales.forEach(sale => {
      if (new Date(sale.fecha) >= thirtyDaysAgo) {
        sale.items.forEach(item => {
          if (!salesByProduct[item.code]) salesByProduct[item.code] = 0;
          salesByProduct[item.code] += item.qty;
        });
      }
    });
    const suggestions = [];
    products.forEach(p => {
      if (p.active === false) return;
      const vtas30d = salesByProduct[p.code] || 0;
      const dailyAvg = vtas30d / 30;
      const daysOfStock = p.stock / (dailyAvg || 1);
      if (p.stock <= (p.minStock || 0) || daysOfStock < 15) {
        const needed = Math.ceil((dailyAvg * 30) - p.stock);
        if (needed > 0) {
          suggestions.push({ code: p.code, name: p.name, stock: p.stock, min: p.minStock || 0, vtas30d: vtas30d, sugerido: needed, qty: needed, price: p.cost || 0 });
        }
      }
    });
    const modal = document.createElement('div');
    modal.className = 'compras-modal-overlay';
    modal.innerHTML = `
      <div class="compras-modal-content" style="max-width: 900px;">
        <div class="compras-modal-header">
          <h3>Sugerencia de Pedido</h3>
          <button class="btn btn-ghost btn-icon compras-modal-close"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="compras-modal-body">
          <p class="font-body-sm text-on-surface-variant" style="margin-bottom: 1rem;">Basado en ventas de los últimos 30 días y stock actual</p>
          <table class="table">
            <thead class="table-header">
              <tr><th>Producto</th><th>Stock Act.</th><th>Mín.</th><th>Vtas 30D</th><th style="width: 120px;">Sugerido</th><th style="width: 80px;">Agregar</th></tr>
            </thead>
            <tbody>
              ${suggestions.length === 0 ? `<tr><td colspan="6" class="compras-empty-state">No hay productos que necesiten reposición.</td></tr>` :
              suggestions.map((s, idx) => `
                <tr class="table-row">
                  <td>${NUCLEO.esc(s.name)}</td>
                  <td>${s.stock}</td>
                  <td>${s.min}</td>
                  <td>${s.vtas30d}</td>
                  <td><input type="number" class="input sug-qty" data-idx="${idx}" value="${s.sugerido}" min="0"></td>
                  <td><input type="checkbox" class="sug-check" data-idx="${idx}" checked></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="compras-modal-footer">
          <button class="btn btn-secondary compras-modal-close">Cancelar</button>
          <button class="btn btn-primary" id="btnAddSuggested"><span class="material-symbols-outlined">playlist_add</span> Agregar Seleccionados al Pedido</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('.compras-modal-close').forEach(btn => btn.addEventListener('click', () => modal.remove()));
    document.getElementById('btnAddSuggested').addEventListener('click', () => {
      const selected = [];
      modal.querySelectorAll('.sug-check').forEach((chk, idx) => {
        if (chk.checked) {
          const qty = parseInt(modal.querySelector(`.sug-qty[data-idx="${idx}"]`).value) || 0;
          if (qty > 0) { selected.push({ code: suggestions[idx].code, name: suggestions[idx].name, qty: qty, price: suggestions[idx].price }); }
        }
      });
      modal.remove();
      if (selected.length > 0) { this.openNewOrderModal(selected); } 
      else { NUCLEO.toast('No seleccionaste ningún ítem', 'warning'); }
    });
  },
  receiveOrder: function(orderId) {
    const orders = NUCLEO.getData('pos_purchase_orders') || [];
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    this.openNewInvoiceModal(order);
  },
  renderFacturas: function(container) {
    const invoices = NUCLEO.getData('pos_invoices') || [];
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
            ${invoices.length === 0 ? `<tr><td colspan="6" class="compras-empty-state">No hay facturas registradas.</td></tr>` : invoices.map(inv => {
              const sup = (NUCLEO.getData('pos_suppliers') || []).find(s => s.id === inv.proveedorId);
              return `
                <tr class="table-row">
                  <td class="font-mono font-semibold">${NUCLEO.esc(inv.id)}</td>
                  <td>${NUCLEO.esc(sup ? sup.nombre : 'Desconocido')}</td>
                  <td>${inv.fecha}</td>
                  <td><span class="badge ${inv.tipoFactura === 'A' ? 'compras-badge-a' : inv.tipoFactura === 'B' ? 'compras-badge-b' : 'compras-badge-x'}">Tipo ${inv.tipoFactura}</span></td>
                  <td class="font-numeric-tape">${NUCLEO.money(inv.total)}</td>
                  <td><button class="btn btn-ghost" data-action="view-inv" data-id="${inv.id}">Ver Detalle</button></td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <div class="compras-footer-info" style="margin-top: 1.5rem;">
        <span class="material-symbols-outlined" style="color: var(--color-primary);">lightbulb</span>
        <div>
          <strong>Regla de Imputación de Costo Real:</strong> Las facturas Tipo A y B aplican un factor del 70% para el cálculo del costo real. Los comprobantes Tipo X computan el 50% del valor nominal.
        </div>
      </div>`;
    document.getElementById('btnNewInvoice').addEventListener('click', () => this.openNewInvoiceModal());
    container.querySelectorAll('[data-action="view-inv"]').forEach(btn => {
      btn.addEventListener('click', () => this.showInvoiceDetail(btn.dataset.id));
    });
  },
  openNewInvoiceModal: function(fromOrder = null) {
    const suppliers = (NUCLEO.getData('pos_suppliers') || []).filter(s => s.activo !== false);
    const modal = document.createElement('div');
    modal.className = 'compras-modal-overlay';
    const invoiceId = 'FAC-' + String((NUCLEO.getData('pos_invoices') || []).length + 1).padStart(3, '0');
    const state = { items: fromOrder ? [...fromOrder.items] : [] };
    modal.innerHTML = `
      <div class="compras-modal-content" style="max-width: 800px;">
        <div class="compras-modal-header">
          <h3>${fromOrder ? 'Recepcionar Pedido' : 'Cargar Factura'}</h3>
          <button class="btn btn-ghost btn-icon compras-modal-close"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="compras-modal-body">
          <div class="compras-modal-grid">
            <div><label class="font-label-sm">N° Factura</label><input type="text" class="input" value="${invoiceId}" disabled></div>
            <div><label class="font-label-sm">Proveedor *</label><select class="input" id="invSupplier" ${fromOrder ? 'disabled' : ''}><option value="">Seleccionar...</option>${suppliers.map(s => `<option value="${s.id}" ${fromOrder && fromOrder.proveedorId === s.id ? 'selected' : ''}>${NUCLEO.esc(s.nombre)}</option>`).join('')}</select></div>
            <div><label class="font-label-sm">Fecha *</label><input type="date" class="input" id="invDate" value="${NUCLEO.today()}"></div>
            <div><label class="font-label-sm">Tipo Factura *</label><select class="input" id="invType"><option value="A">Tipo A (Responsable Inscripto) - 70% costo real</option><option value="B">Tipo B (Monotributo) - 70% costo real</option><option value="X">Tipo X (No Fiscal) - 50% costo real</option></select></div>
          </div>
          <h4 style="margin-top: 1.5rem; margin-bottom: 0.5rem;">Artículos Incluidos</h4>
          <table class="compras-items-table" id="invItemsTable">
            <thead><tr><th>Producto</th><th style="width: 100px;">Cantidad</th><th style="width: 120px;">Precio Unit.</th><th style="width: 120px;">Subtotal</th><th style="width: 50px;"></th></tr></thead>
            <tbody id="invItemsBody"></tbody>
          </table>
          <button class="btn btn-ghost" id="btnAddInvItem" style="margin-top: 0.5rem;"><span class="material-symbols-outlined">add_circle</span> Agregar Ítem</button>
          <div class="flex justify-between items-center" style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--color-outline-variant);">
            <span class="font-headline-md">Total de la factura:</span>
            <span class="font-numeric-display" id="invTotal">$ 0</span>
          </div>
        </div>
        <div class="compras-modal-footer">
          <button class="btn btn-secondary compras-modal-close">Cancelar</button>
          <button class="btn btn-primary" id="btnConfirmInvoice"><span class="material-symbols-outlined">check_circle</span> Confirmar Factura</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const renderItems = () => {
      const tbody = document.getElementById('invItemsBody');
      tbody.innerHTML = state.items.map((item, idx) => `
        <tr>
          <td><input type="text" class="item-name" value="${NUCLEO.esc(item.name)}" data-idx="${idx}"></td>
          <td><input type="number" class="item-qty" value="${item.qty}" min="1" data-idx="${idx}"></td>
          <td><input type="number" class="item-price" value="${item.price}" min="0" step="0.01" data-idx="${idx}"></td>
          <td class="font-numeric-tape item-subtotal">${NUCLEO.money(item.qty * item.price)}</td>
          <td><button class="btn btn-ghost btn-icon item-remove" data-idx="${idx}"><span class="material-symbols-outlined">delete</span></button></td>
        </tr>`).join('');
      let total = 0;
      state.items.forEach(i => total += i.qty * i.price);
      document.getElementById('invTotal').textContent = NUCLEO.money(total);
      tbody.querySelectorAll('.item-name, .item-qty, .item-price').forEach(inp => {
        inp.addEventListener('change', (e) => {
          const i = parseInt(e.target.dataset.idx);
          if(e.target.classList.contains('item-name')) state.items[i].name = e.target.value;
          if(e.target.classList.contains('item-qty')) state.items[i].qty = parseFloat(e.target.value) || 0;
          if(e.target.classList.contains('item-price')) state.items[i].price = parseFloat(e.target.value) || 0;
          renderItems();
        });
      });
      tbody.querySelectorAll('.item-remove').forEach(btn => {
        btn.addEventListener('click', () => { state.items.splice(parseInt(btn.dataset.idx), 1); renderItems(); });
      });
    };
    document.getElementById('btnAddInvItem').addEventListener('click', () => { state.items.push({ code: 'MANUAL-' + Date.now(), name: '', qty: 1, price: 0 }); renderItems(); });
    renderItems();
    modal.querySelectorAll('.compras-modal-close').forEach(btn => btn.addEventListener('click', () => modal.remove()));
    document.getElementById('btnConfirmInvoice').addEventListener('click', () => {
      const supplierId = document.getElementById('invSupplier').value;
      const tipoFactura = document.getElementById('invType').value;
      const fecha = document.getElementById('invDate').value;
      if (!supplierId) { NUCLEO.toast('Selecciona un proveedor', 'error'); return; }
      if (state.items.length === 0 || state.items.some(i => !i.name || i.qty <= 0)) { NUCLEO.toast('Completa los datos de los ítems', 'error'); return; }
      this.confirmInvoice(invoiceId, supplierId, fecha, tipoFactura, state.items, fromOrder ? fromOrder.id : null);
      modal.remove();
    });
  },
  confirmInvoice: function(invoiceId, supplierId, fecha, tipoFactura, items, orderId) {
    const suppliers = NUCLEO.getData('pos_suppliers') || [];
    const supplier = suppliers.find(s => s.id === supplierId);
    const products = NUCLEO.getData('pos_products') || [];
    const minMargins = NUCLEO.getData('pos_min_margins') || {};
    const userId = NUCLEO.getUsuarioActivo()?.id || null;
    const factor = (tipoFactura === 'A' || tipoFactura === 'B') ? 0.70 : 0.50;
    let total = 0;
    const itemsConMargenErosionado = [];
    const diasCredito = supplier ? (supplier.diasCredito || 0) : 0;
    items.forEach(item => {
      total += item.qty * item.price;
      const costoReal = item.price * factor;
      let product = products.find(p => p.code === item.code);
      if (!product && item.code && item.code.startsWith('MANUAL-')) { product = products.find(p => p.name.toLowerCase() === item.name.toLowerCase()); }
      if (product) {
        const costoAnterior = product.cost || 0;
        NUCLEO.actualizarStock(product.code, item.qty, 'recepcion', userId);
        NUCLEO.actualizarCostoProducto(product.code, costoReal, userId);
        const category = product.category || 'General';
        const minMarginReq = minMargins[category] !== undefined ? minMargins[category] : 35;
        const margenActual = product.price > 0 ? ((product.price - costoReal) / product.price) * 100 : 0;
        if (margenActual < minMarginReq && category !== 'Cigarrillos') {
          itemsConMargenErosionado.push({ code: product.code, name: product.name, costoAnterior: costoAnterior, costoNuevo: costoReal, margenActual: Math.round(margenActual * 100) / 100, margenMinimoRequerido: minMarginReq });
        }
      }
    });
    const invoices = NUCLEO.getData('pos_invoices') || [];
    invoices.push({ id: invoiceId, proveedorId: supplierId, fecha: fecha, tipoFactura: tipoFactura, items: items, total: total, orderId: orderId, userId: userId });
    NUCLEO.setData('pos_invoices', invoices);
    if (orderId) {
      const orders = NUCLEO.getData('pos_purchase_orders') || [];
      const order = orders.find(o => o.id === orderId);
      if (order) { order.estado = 'Recibido'; NUCLEO.setData('pos_purchase_orders', orders); }
    }
    NUCLEO.emit('pos:facturaRecibida', { proveedorId: supplierId, diasCredito: diasCredito, monto: total, fecha: fecha, tipoFactura: tipoFactura, itemsConMargenErosionado: itemsConMargenErosionado });
    NUCLEO.toast('Factura procesada correctamente. Stock y costos actualizados.', 'success');
    this.renderFacturas(document.getElementById('comprasContent'));
  },
  showInvoiceDetail: function(invoiceId) {
    const invoices = NUCLEO.getData('pos_invoices') || [];
    const inv = invoices.find(i => i.id === invoiceId);
    if (!inv) return;
    const sup = (NUCLEO.getData('pos_suppliers') || []).find(s => s.id === inv.proveedorId);
    const modal = document.createElement('div');
    modal.className = 'compras-modal-overlay';
    modal.innerHTML = `
      <div class="compras-modal-content" style="max-width: 600px;">
        <div class="compras-modal-header">
          <h3>Detalle de Factura - ${NUCLEO.esc(inv.id)}</h3>
          <button class="btn btn-ghost btn-icon compras-modal-close"><span class="material-symbols-outlined">close</span></button>
        </div>
        <div class="compras-modal-body">
          <div class="compras-modal-grid" style="margin-bottom: 1rem;">
            <div><span class="font-label-sm text-on-surface-variant">Proveedor</span><div class="font-body-md font-semibold">${NUCLEO.esc(sup ? sup.nombre : 'Desconocido')}</div></div>
            <div><span class="font-label-sm text-on-surface-variant">Fecha Emisión</span><div class="font-body-md">${inv.fecha}</div></div>
            <div><span class="font-label-sm text-on-surface-variant">Tipo Factura</span><div><span class="badge ${inv.tipoFactura === 'A' ? 'compras-badge-a' : inv.tipoFactura === 'B' ? 'compras-badge-b' : 'compras-badge-x'}">Tipo ${inv.tipoFactura}</span></div></div>
            <div><span class="font-label-sm text-on-surface-variant">Total Facturado</span><div class="font-numeric-display">${NUCLEO.money(inv.total)}</div></div>
          </div>
          <table class="table">
            <thead class="table-header"><tr><th>Producto</th><th>Cantidad</th><th>Precio Unit.</th><th>Subtotal</th></tr></thead>
            <tbody>
              ${inv.items.map(item => `
                <tr class="table-row">
                  <td>${NUCLEO.esc(item.name)}</td>
                  <td>${item.qty}</td>
                  <td>${NUCLEO.money(item.price)}</td>
                  <td class="font-numeric-tape">${NUCLEO.money(item.qty * item.price)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="compras-modal-footer">
          <button class="btn btn-secondary compras-modal-close">Cerrar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelectorAll('.compras-modal-close').forEach(btn => btn.addEventListener('click', () => modal.remove()));
  }
};
NUCLEO.registerModule('compras', ComprasModule);