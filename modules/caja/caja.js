/* ============================================
NEURORA POS — CAJA + CIERRE (ANEXO A)
Namespace: .caja-, .modal-charge-
============================================ */
(function () {
'use strict';

let carrito = [];
let cajaAbierta = false;
let metodoPagoSeleccionado = 'cash';
let lastVenta = null;
let modalPostCobroActivo = null;
let listenersAttached = false;

function esc(str) { return NUCLEO.esc(str); }
function $id(id) { return document.getElementById(id); }

function init() {
  cajaAbierta = NUCLEO.getEstadoCaja() === 'ABIERTA';
  const draft = NUCLEO.getTicketDraft();
  carrito = draft && Array.isArray(draft) ? draft : [];
  if (listenersAttached) return;
  listenersAttached = true;
  NUCLEO.on('pos:estadoCaja', function () {
    cajaAbierta = NUCLEO.getEstadoCaja() === 'ABIERTA';
    if (document.querySelector('.caja-layout')) render();
  });
  NUCLEO.on('pos:solicitudAperturaCierre', function (data) {
    asegurarVistaCaja();
    if (data.estado === 'CERRADA') {
      abrirModalApertura();
    } else {
      abrirModalCierre();
    }
  });
  NUCLEO.on('pos:solicitudVerCierres', function () {
    asegurarVistaCaja();
    abrirModalVerCierres();
  });
  document.addEventListener('keydown', handleKeydown);
}

function asegurarVistaCaja() {
  if (!document.querySelector('.caja-layout')) NUCLEO.showTab('caja');
}

function onShow() {
  render();
}

function handleKeydown(e) {
  if (modalPostCobroActivo) {
    if (e.key === 'F1') { e.preventDefault(); imprimirPostCobro(); }
    else if (e.key === 'Escape') { e.preventDefault(); nuevaVentaPostCobro(); }
    return;
  }
  if (e.key === 'F2') {
    e.preventDefault();
    const input = $id('caja-scanner-input');
    if (input) input.focus();
  } else if (e.key === 'F4') {
    e.preventDefault();
    handleCobrarClick();
  } else if (e.key === 'F8') {
    e.preventDefault();
    if (cajaAbierta) abrirModalSueltos();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    NUCLEO.showTab('caja');
    cerrarModales();
  }
}

function render() {
  const container = $id('moduleContainer');
  if (!container) return;
  container.innerHTML = renderCaja();
  bindEvents();
}

function renderCaja() {
  const quickButtons = NUCLEO.getData('pos_quick_buttons') || [];
  const subtotal = carrito.reduce(function (sum, item) { return sum + (item.price * item.qty); }, 0);
  const disabledSiCerrada = cajaAbierta ? '' : 'disabled';
  return (
    '<div class="caja-layout">' +
      '<div class="caja-col-left">' +
        '<div class="caja-scanner-bar">' +
          '<div class="caja-scanner-input-wrapper">' +
            '<span class="material-symbols-outlined text-outline" style="margin-right:0.5rem;">barcode_scanner</span>' +
            '<input type="text" id="caja-scanner-input" class="caja-scanner-input" placeholder="Escanear código de barras...">' +
            '<span class="badge badge-neutral">F2</span>' +
          '</div>' +
          '<button class="btn btn-primary" id="btn-buscar">' +
            '<span class="material-symbols-outlined">search</span> BUSCAR' +
          '</button>' +
          (!cajaAbierta ? '<span class="badge badge-error" style="margin-left:var(--space-sm);white-space:nowrap;">CAJA CERRADA — SOLO CARGA</span>' : '') +
        '</div>' +
        '<div class="caja-ticket-table-container">' +
          '<table class="caja-ticket-table">' +
            '<thead><tr><th>PRODUCTO</th><th>CANT.</th><th>PRECIO</th><th>SUBTOTAL</th><th></th></tr></thead>' +
            '<tbody id="caja-ticket-body">' + renderFilasCarrito() + '</tbody>' +
          '</table>' +
        '</div>' +
        '<div class="caja-table-footer">' +
          '<div class="caja-table-footer-row"><span>Ítems: ' + carrito.length + '</span><span>Subtotal: ' + NUCLEO.money(subtotal) + '</span></div>' +
          '<div class="caja-shortcuts-bar">' +
            '<span><kbd>F2</kbd> Escáner</span>' +
            '<span><kbd>F4</kbd> Cobrar</span>' +
            '<span><kbd>F8</kbd> Suelto</span>' +
            '<span><kbd>ESC</kbd> Cancelar/Volver</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="caja-col-right">' +
        '<div class="caja-quick-sales-header">' +
          '<span class="font-label-lg">VENTA RÁPIDA</span>' +
        '</div>' +
        '<div class="caja-quick-grid' + (quickButtons.length > 8 ? ' caja-quick-grid--3' : '') + '">' +
          (quickButtons.length === 0
            ? '<p class="font-body-sm text-on-surface-variant" style="padding:var(--space-sm);">Sin botones configurados (CONFIG · Botones Rápidos)</p>'
            : quickButtons.map(function (btn, idx) {
                return (
                  '<button class="caja-quick-btn" onclick="window.CAJA.addQuickButton(' + idx + ')">' +
                    '<span class="caja-quick-btn-name">' + esc(btn.nombre || btn.name || '') + '</span>' +
                    '<span class="caja-quick-btn-price">' + NUCLEO.money(btn.precio || btn.price || 0) + '</span>' +
                  '</button>'
                );
              }).join(''))
        + '</div>' +
        '<button class="caja-suelto-btn" ' + disabledSiCerrada + ' onclick="window.CAJA.abrirModalSueltos()">' +
          '<span class="caja-suelto-left">' +
            '<span class="caja-suelto-icon"><span class="material-symbols-outlined">smoking_rooms</span></span>' +
            '<span class="caja-suelto-label">CIGARRILLOS SUELTO</span>' +
          '</span>' +
          '<span class="caja-suelto-key">F8</span>' +
        '</button>' +
        '<div class="caja-checkout-panel">' +
          '<div class="caja-total-display">' +
            '<span class="font-label-md text-on-surface-variant">TOTAL</span>' +
            '<span class="font-numeric-display">' + NUCLEO.money(subtotal) + '</span>' +
          '</div>' +
          '<button class="caja-cobrar-btn" ' + (carrito.length === 0 ? 'disabled' : '') + ' onclick="window.CAJA.handleCobrarClick()">' +
            'COBRAR <span style="font-size:12px;font-weight:500;">F4</span>' +
          '</button>' +
          '<div class="grid grid-2x2">' +
            '<button class="btn btn-secondary" onclick="window.CAJA.abrirModalReimprimir()">' +
              '<span class="material-symbols-outlined">print</span> REIMPRIMIR' +
            '</button>' +
            '<button class="btn btn-secondary" ' + disabledSiCerrada + ' onclick="window.CAJA.abrirModalPaquetes()">' +
              '<span class="material-symbols-outlined">inventory_2</span> PAQUETE' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div id="caja-modales-container"></div>' +
    '</div>'
  );
}

function renderFilasCarrito() {
  if (carrito.length === 0) {
    return '<tr><td colspan="5" class="text-center text-on-surface-variant" style="padding:var(--space-xl);">Sin ítems cargados. Escaneá o buscá un producto.</td></tr>';
  }
  return carrito.map(function (item, idx) {
    const marca = item.esCigarrillo
      ? '<span class="badge badge-neutral" title="No se imprime en el ticket del cliente">SUB-CAJA</span>'
      : (item.noFiscal ? '<span class="badge badge-neutral" title="No se imprime en el ticket del cliente">NO FISCAL</span>' : '');
    return (
      '<tr>' +
      '<td>' + esc(item.name) + marca + '</td>' +
      '<td>' +
        '<div class="qty-control">' +
          '<button class="qty-btn" onclick="window.CAJA.updateQty(' + idx + ', -1)">-</button>' +
          '<span class="qty-value">' + item.qty + '</span>' +
          '<button class="qty-btn" onclick="window.CAJA.updateQty(' + idx + ', 1)">+</button>' +
        '</div>' +
      '</td>' +
      '<td>' + NUCLEO.money(item.price) + '</td>' +
      '<td>' + NUCLEO.money(item.price * item.qty) + '</td>' +
      '<td><button class="btn-icon" onclick="window.CAJA.removeItem(' + idx + ')"><span class="material-symbols-outlined">close</span></button></td>' +
      '</tr>'
    );
  }).join('');
}

function bindEvents() {
  const scannerInput = $id('caja-scanner-input');
  if (scannerInput) {
    scannerInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        buscarProducto(scannerInput.value.trim());
        scannerInput.value = '';
      }
    });
    scannerInput.focus();
  }
  const btnBuscar = $id('btn-buscar');
  if (btnBuscar) {
    btnBuscar.addEventListener('click', function () {
      const input = $id('caja-scanner-input');
      buscarProducto(input ? input.value.trim() : '');
      if (input) input.value = '';
    });
  }
}

function cigEnCarrito(code, tipo) {
  return carrito
    .filter(function (i) { return i.esCigarrillo && i.code === code && i.tipo === tipo; })
    .reduce(function (s, i) { return s + i.qty; }, 0);
}

function cigDisponible(product, tipo) {
  if (tipo === 'paquete') return (product.stock || 0) - cigEnCarrito(product.code, 'paquete');
  return (product['sueltos_' + product.code] || 0) - cigEnCarrito(product.code, 'suelto');
}

function agregarCigarrillo(product, tipo) {
  if (cigDisponible(product, tipo) <= 0) {
    NUCLEO.toast(tipo === 'paquete' ? 'Sin stock de paquetes de ' + product.name : 'Sin sueltos de ' + product.name, 'error');
    return false;
  }
  const esPaquete = tipo === 'paquete';
  agregarAlCarrito({
    code: product.code,
    name: esPaquete ? product.name : product.name + ' (suelto)',
    price: esPaquete ? product.price : (product.priceLoose || NUCLEO.roundCurrency(product.price / 20)),
    cost: esPaquete ? (product.cost || 0) : (product.cost || 0) / 20,
    esCigarrillo: true,
    tipo: tipo,
    noFiscal: true
  }, 1);
  return true;
}

function buscarProducto(query) {
  if (!query) return;
  const products = NUCLEO.getData('pos_products');
  const product = products.find(function (p) {
    return p.active !== false && (p.code === query || (p.barcode && p.barcode === query));
  });
  if (!product) {
    NUCLEO.toast('Producto no encontrado: ' + query, 'error');
    return;
  }
  if (product.category === 'Cigarrillos') {
    agregarCigarrillo(product, 'paquete');
    return;
  }
  agregarAlCarrito({ code: product.code, name: product.name, price: product.price, cost: product.cost || 0, isDummy: false, noFiscal: !!product.noFiscal }, 1);
}

function addQuickButton(idx) {
  const quickButtons = NUCLEO.getData('pos_quick_buttons') || [];
  const btn = quickButtons[idx];
  if (!btn) return;
  if (btn.linkedProductCode) {
    const products = NUCLEO.getData('pos_products');
    const product = products.find(function (p) { return p.code === btn.linkedProductCode && p.active !== false; });
    if (!product) { NUCLEO.toast('Producto vinculado no encontrado', 'error'); return; }
    if (product.category === 'Cigarrillos') { agregarCigarrillo(product, 'paquete'); return; }
    const precio = (btn.precio || btn.price) || product.price;
    agregarAlCarrito({ code: product.code, name: product.name, price: precio, cost: product.cost || 0, isDummy: false, noFiscal: !!product.noFiscal }, 1);
  } else {
    const nombre = btn.nombre || btn.name || 'Ítem';
    agregarAlCarrito({ code: 'RAP-' + nombre, name: nombre, price: btn.precio || btn.price || 0, cost: 0, isDummy: true }, 1);
  }
}

function agregarAlCarrito(item, qty) {
  const existing = carrito.find(function (i) { return i.code === item.code && (i.tipo || '') === (item.tipo || ''); });
  if (existing) {
    existing.qty += qty;
  } else {
    carrito.push({
      code: item.code, name: item.name, price: item.price, cost: item.cost || 0, qty: qty,
      isDummy: !!item.isDummy, esCigarrillo: !!item.esCigarrillo, tipo: item.tipo || null, noFiscal: !!item.noFiscal
    });
  }
  autoguardarCarrito();
  render();
}

function updateQty(idx, delta) {
  const item = carrito[idx];
  if (!item) return;
  if (delta > 0 && item.esCigarrillo) {
    const p = NUCLEO.getData('pos_products').find(function (x) { return x.code === item.code; });
    if (!p || cigDisponible(p, item.tipo) <= 0) { NUCLEO.toast('Sin stock suficiente de ' + item.name, 'error'); return; }
  }
  item.qty += delta;
  if (item.qty <= 0) carrito.splice(idx, 1);
  autoguardarCarrito();
  render();
}

function removeItem(idx) {
  carrito.splice(idx, 1);
  autoguardarCarrito();
  render();
}

function autoguardarCarrito() {
  NUCLEO.guardarTicketDraft(carrito);
}

function handleCobrarClick() {
  if (carrito.length === 0) return;
  if (!cajaAbierta) { abrirModalAvisoCajaCerrada(); return; }
  abrirModalCobro();
}

function abrirModalAvisoCajaCerrada() {
  const container = $id('caja-modales-container');
  if (!container) return;
  container.innerHTML =
    '<div class="modal-charge-overlay" onclick="if(event.target===this)window.CAJA.cerrarModales()">' +
    '<div class="modal-charge-content" style="max-width:380px;text-align:center;">' +
    '<span class="material-symbols-outlined" style="font-size:40px;color:var(--color-error);">lock</span>' +
    '<h3 class="font-headline-md mb-2">Caja Cerrada</h3>' +
    '<p class="font-body-md mb-4">No se puede cobrar con la caja cerrada. Abrí la caja desde la barra superior para continuar.</p>' +
    '<button class="btn btn-primary w-full" onclick="window.CAJA.cerrarModales()">Entendido</button>' +
    '</div></div>';
}

function abrirModalCobro() {
  metodoPagoSeleccionado = 'cash';
  const subtotal = carrito.reduce(function (sum, item) { return sum + (item.price * item.qty); }, 0);
  const container = $id('caja-modales-container');
  if (!container) return;
  container.innerHTML =
    '<div class="modal-charge-overlay" onclick="if(event.target===this)window.CAJA.cerrarModales()">' +
    '<div class="modal-charge-content">' +
    '<h3 class="font-headline-md mb-2">Confirmar Cobro</h3>' +
    '<div class="modal-charge-total">' + NUCLEO.money(subtotal) + '</div>' +
    infoTicketCliente() +
    '<div class="modal-charge-methods" id="caja-metodos-pago">' +
    renderMetodosPago() +
    '</div>' +
    '<div class="flex gap-space-sm justify-end">' +
    '<button class="btn btn-secondary" onclick="window.CAJA.cerrarModales()">Cancelar</button>' +
    '<button class="btn btn-primary" onclick="window.CAJA.confirmarCobro()">' +
    '<span class="material-symbols-outlined">check</span> CONFIRMAR COBRO' +
    '</button>' +
    '</div>' +
    '</div></div>';
}

function infoTicketCliente() {
  const total = carrito.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
  const imp = carrito.filter(function (i) { return !i.esCigarrillo && !i.noFiscal; }).reduce(function (s, i) { return s + i.price * i.qty; }, 0);
  if (total === imp) return '';
  return '<p class="font-body-sm text-on-surface-variant" style="text-align:center;margin-bottom:var(--space-md);">Ticket del cliente: ' + NUCLEO.money(imp) + ' — no se imprimen ' + NUCLEO.money(total - imp) + ' (sub-caja / no fiscal)</p>';
}

function renderMetodosPago() {
  const metodos = [
    { id: 'cash', label: 'Efectivo' },
    { id: 'card', label: 'Tarjeta' },
    { id: 'transfer', label: 'Transferencia' },
    { id: 'other', label: 'Otro' }
  ];
  return metodos.map(function (m) {
    return '<button type="button" class="modal-charge-method-btn ' + (metodoPagoSeleccionado === m.id ? 'selected' : '') + '" onclick="window.CAJA.setMetodoPago(\'' + m.id + '\')">' + m.label + '</button>';
  }).join('');
}

function setMetodoPago(id) {
  metodoPagoSeleccionado = id;
  const el = $id('caja-metodos-pago');
  if (el) el.innerHTML = renderMetodosPago();
}

function itemsImprimibles(venta) {
  return (venta.items || []).filter(function (i) { return !i.esCigarrillo && !i.noFiscal; });
}

function confirmarCobro() {
  if (carrito.length === 0) return;
  const ciclo = NUCLEO.getCicloAbierto();
  if (!ciclo) { NUCLEO.toast('La caja está cerrada', 'error'); return; }
  const userId = (NUCLEO.getUsuarioActivo() || {}).id || null;
  const products = NUCLEO.getData('pos_products');
  for (let i = 0; i < carrito.length; i++) {
    const it = carrito[i];
    if (!it.esCigarrillo) continue;
    const p = products.find(function (x) { return x.code === it.code; });
    const disp = !p ? 0 : (it.tipo === 'paquete' ? (p.stock || 0) : (p['sueltos_' + p.code] || 0));
    if (disp < it.qty) {
      NUCLEO.toast('Stock insuficiente de ' + it.name + ' (disponible: ' + disp + ')', 'error');
      return;
    }
  }
  const fecha = NUCLEO.nowISO();
  const subtotal = carrito.reduce(function (sum, item) { return sum + (item.price * item.qty); }, 0);
  const itemsRegulares = carrito.filter(function (i) { return !i.esCigarrillo; });
  const itemsCig = carrito.filter(function (i) { return i.esCigarrillo; });
  const venta = {
    id: NUCLEO.uid(),
    items: carrito.slice(),
    total: subtotal,
    method: metodoPagoSeleccionado,
    cicloId: ciclo.id,
    fecha: fecha,
    userId: userId
  };
  if (itemsRegulares.length > 0) {
    const sales = NUCLEO.getData('pos_sales');
    sales.push({
      id: NUCLEO.uid(),
      ticketId: venta.id,
      items: itemsRegulares,
      total: itemsRegulares.reduce(function (s, i) { return s + i.price * i.qty; }, 0),
      method: metodoPagoSeleccionado,
      cicloId: ciclo.id,
      fecha: fecha,
      userId: userId
    });
    if (!NUCLEO.setData('pos_sales', sales)) return;
  }
  NUCLEO.guardarTicket(venta);
  itemsRegulares.forEach(function (item) {
    if (!item.isDummy) NUCLEO.actualizarStock(item.code, -item.qty, 'venta', userId);
  });
  itemsCig.forEach(function (item) {
    const p = products.find(function (x) { return x.code === item.code; });
    const linea = { code: item.code, name: item.name, price: item.price, cost: item.cost || 0, qty: item.qty };
    if (item.tipo === 'paquete') {
      NUCLEO.actualizarStock(item.code, -item.qty, 'venta', userId);
      NUCLEO.registrarVentaPaqueteCigarrillos(linea, ciclo.id, metodoPagoSeleccionado);
    } else {
      for (let n = 0; n < item.qty; n++) NUCLEO.venderSuelto(p.name);
      NUCLEO.registrarVentaSueltoCigarrillos(linea, ciclo.id, metodoPagoSeleccionado);
    }
  });
  lastVenta = venta;
  carrito = [];
  NUCLEO.guardarTicketDraft(null);
  render();
  if (itemsImprimibles(venta).length === 0) {
    NUCLEO.toast('Venta cobrada: ' + NUCLEO.money(subtotal) + '. No hay ítems para el ticket del cliente.', 'success');
    return;
  }
  const config = NUCLEO.getData('pos_config');
  if (config && config.autoPrintTicket) {
    NUCLEO.printTicket(venta);
    NUCLEO.toast('Venta cobrada: ' + NUCLEO.money(subtotal), 'success');
  } else {
    abrirModalPostCobro(venta);
  }
}

function abrirModalPostCobro(venta) {
  modalPostCobroActivo = venta;
  const container = $id('caja-modales-container');
  if (!container) return;
  container.innerHTML =
    '<div class="modal-charge-overlay">' +
    '<div class="modal-charge-content">' +
    '<h3 class="font-headline-md mb-2">Venta Confirmada</h3>' +
    '<div class="modal-charge-total">' + NUCLEO.money(venta.total) + '</div>' +
    '<div class="overflow-y-auto" style="max-height:240px;border:1px solid var(--color-outline-variant);border-radius:var(--radius-lg);margin-bottom:var(--space-lg);">' +
    NUCLEO.getTicketHTML(venta) +
    '</div>' +
    '<div class="flex gap-space-sm justify-end">' +
    '<button class="btn btn-secondary" onclick="window.CAJA.nuevaVentaPostCobro()">' +
    '<span class="material-symbols-outlined">add</span> NUEVA VENTA <span style="font-size:11px;">(ESC)</span>' +
    '</button>' +
    '<button class="btn btn-primary" onclick="window.CAJA.imprimirPostCobro()">' +
    '<span class="material-symbols-outlined">print</span> IMPRIMIR <span style="font-size:11px;">(F1)</span>' +
    '</button>' +
    '</div>' +
    '</div></div>';
}

function imprimirPostCobro() {
  if (modalPostCobroActivo) NUCLEO.printTicket(modalPostCobroActivo);
}

function nuevaVentaPostCobro() {
  modalPostCobroActivo = null;
  cerrarModales();
  render();
}

function fechaLocal(iso) { return iso ? new Date(iso).toLocaleDateString('en-CA') : ''; }
function fechaLocalHoy() { return new Date().toLocaleDateString('en-CA'); }
function nombreUsuario(id) {
  const u = (NUCLEO.getData('pos_users') || []).find(function (x) { return x.id === id; });
  return u ? u.nombre : '—';
}

function abrirModalReimprimir(fecha) {
  if (typeof fecha !== 'string') fecha = fechaLocalHoy();
  const container = $id('caja-modales-container');
  if (!container) return;
  const log = NUCLEO.getData('pos_tickets_log') || [];
  const lista = log.filter(function (t) { return !fecha || fechaLocal(t.fecha) === fecha; }).slice().reverse().slice(0, 100);
  container.innerHTML =
    '<div class="modal-charge-overlay" onclick="if(event.target===this)window.CAJA.cerrarModales()">' +
    '<div class="modal-charge-content" style="max-width:700px;">' +
    '<h3 class="font-headline-md mb-2">Reimprimir Ticket</h3>' +
    '<div class="flex gap-space-sm items-center" style="margin-bottom:var(--space-md);">' +
    '<label class="font-label-md text-on-surface-variant">FECHA</label>' +
    '<input type="date" class="input" style="max-width:180px;" value="' + fecha + '" onchange="window.CAJA.abrirModalReimprimir(this.value)">' +
    '<button class="btn btn-secondary" onclick="window.CAJA.abrirModalReimprimir(\'\')">VER TODOS</button>' +
    '</div>' +
    (lista.length === 0
      ? '<p class="font-body-md text-on-surface-variant">No hay tickets en esa fecha.</p>'
      : '<div class="overflow-y-auto" style="max-height:340px;"><table class="table"><thead class="table-header"><tr><th>FECHA / HORA</th><th>ÍTEMS</th><th>TOTAL TICKET</th><th></th></tr></thead><tbody>' +
        lista.map(function (t) {
          const imp = itemsImprimibles(t);
          const total = imp.reduce(function (s, i) { return s + i.price * (i.qty || 1); }, 0);
          return (
            '<tr class="table-row">' +
            '<td>' + new Date(t.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + '</td>' +
            '<td>' + imp.length + '</td>' +
            '<td>' + NUCLEO.money(total) + '</td>' +
            '<td>' + (imp.length > 0
              ? '<button class="btn btn-primary" onclick="window.CAJA.reimprimirTicket(\'' + t.id + '\')"><span class="material-symbols-outlined">print</span> IMPRIMIR</button>'
              : '<span class="font-body-sm text-on-surface-variant">Solo sub-caja / no fiscal</span>') + '</td>' +
            '</tr>'
          );
        }).join('') +
        '</tbody></table></div>') +
    '<div class="flex justify-end" style="margin-top:var(--space-md);">' +
    '<button class="btn btn-secondary" onclick="window.CAJA.cerrarModales()">Cerrar</button>' +
    '</div></div></div>';
}

function reimprimirTicket(id) {
  const t = (NUCLEO.getData('pos_tickets_log') || []).find(function (x) { return x.id === id; });
  if (!t) { NUCLEO.toast('Ticket no encontrado', 'error'); return; }
  if (itemsImprimibles(t).length === 0) { NUCLEO.toast('Este ticket no tiene ítems imprimibles', 'warning'); return; }
  NUCLEO.printTicket(t);
}

function abrirModalPaquetes() {
  if (!cajaAbierta) return;
  const products = NUCLEO.getData('pos_products');
  const marcas = products.filter(function (p) { return p.category === 'Cigarrillos' && p.active !== false; });
  const container = $id('caja-modales-container');
  if (!container) return;
  container.innerHTML =
    '<div class="modal-charge-overlay" onclick="if(event.target===this)window.CAJA.cerrarModales()">' +
    '<div class="modal-charge-content" style="max-width:600px;">' +
    '<h3 class="font-headline-md mb-2">Agregar Paquete de Cigarrillos</h3>' +
    (marcas.length === 0
      ? '<p class="font-body-md text-on-surface-variant">No hay productos de categoría "Cigarrillos" en INVENTARIO.</p>'
      : '<table class="table"><thead class="table-header"><tr><th>MARCA</th><th>DISPONIBLES</th><th>PRECIO</th><th></th></tr></thead><tbody>' +
        marcas.map(function (m) {
          const disp = cigDisponible(m, 'paquete');
          return (
            '<tr class="table-row">' +
            '<td>' + esc(m.name) + '</td>' +
            '<td>' + disp + '</td>' +
            '<td>' + NUCLEO.money(m.price) + '</td>' +
            '<td><button class="btn btn-primary" ' + (disp <= 0 ? 'disabled' : '') + ' onclick="window.CAJA.agregarPaquete(\'' + m.code + '\')">AGREGAR</button></td>' +
            '</tr>'
          );
        }).join('') +
        '</tbody></table>') +
    '<div class="flex justify-end" style="margin-top:var(--space-md);">' +
    '<button class="btn btn-secondary" onclick="window.CAJA.cerrarModales()">Cerrar</button>' +
    '</div></div></div>';
}

function agregarPaquete(code) {
  const product = NUCLEO.getData('pos_products').find(function (p) { return p.code === code; });
  if (!product) return;
  agregarCigarrillo(product, 'paquete');
  abrirModalPaquetes();
}

function abrirModalSueltos() {
  if (!cajaAbierta) return;
  const products = NUCLEO.getData('pos_products');
  const marcas = products.filter(function (p) { return p.category === 'Cigarrillos' && p.active !== false && p.ventaSuelta; });
  const container = $id('caja-modales-container');
  if (!container) return;
  container.innerHTML =
    '<div class="modal-charge-overlay" onclick="if(event.target===this)window.CAJA.cerrarModales()">' +
    '<div class="modal-charge-content" style="max-width:600px;">' +
    '<h3 class="font-headline-md mb-2">Agregar Cigarrillos Sueltos</h3>' +
    (marcas.length === 0
      ? '<p class="font-body-md text-on-surface-variant">No hay marcas habilitadas para venta suelta. Configurá en CONFIG · Sub-Cajas.</p>'
      : '<table class="table"><thead class="table-header"><tr><th>MARCA</th><th>SUELTOS DISP.</th><th>PRECIO SUELTO</th><th></th></tr></thead><tbody>' +
        marcas.map(function (m) {
          const sueltos = cigDisponible(m, 'suelto');
          const precioSuelto = m.priceLoose || NUCLEO.roundCurrency(m.price / 20);
          const puedeAbrir = cigDisponible(m, 'paquete') > 0;
          return (
            '<tr class="table-row">' +
            '<td>' + esc(m.name) + '</td>' +
            '<td>' + sueltos + '</td>' +
            '<td>' + NUCLEO.money(precioSuelto) + '</td>' +
            '<td>' +
            (sueltos > 0
              ? '<button class="btn btn-primary" onclick="window.CAJA.agregarSuelto(\'' + m.code + '\')">AGREGAR</button>'
              : '<button class="btn btn-secondary" ' + (puedeAbrir ? '' : 'disabled') + ' onclick="window.CAJA.abrirPaqueteParaSueltos(\'' + m.code + '\')">ABRIR PAQUETE</button>') +
            '</td>' +
            '</tr>'
          );
        }).join('') +
        '</tbody></table>') +
    '<div class="flex justify-end" style="margin-top:var(--space-md);">' +
    '<button class="btn btn-secondary" onclick="window.CAJA.cerrarModales()">Cerrar</button>' +
    '</div></div></div>';
}

function abrirPaqueteParaSueltos(code) {
  const product = NUCLEO.getData('pos_products').find(function (p) { return p.code === code; });
  if (!product) return;
  NUCLEO.abrirPaquete(product.name);
  abrirModalSueltos();
}

function agregarSuelto(code) {
  const product = NUCLEO.getData('pos_products').find(function (p) { return p.code === code; });
  if (!product) return;
  agregarCigarrillo(product, 'suelto');
  abrirModalSueltos();
}

function abrirModalApertura() {
  const container = $id('caja-modales-container');
  if (!container) return;
  container.innerHTML =
    '<div class="modal-charge-overlay" onclick="if(event.target===this)window.CAJA.cerrarModales()">' +
    '<div class="modal-charge-content">' +
    '<h3 class="font-headline-md mb-2">Apertura de Caja</h3>' +
    '<div style="margin-bottom:var(--space-lg);">' +
    '<label class="font-label-md text-on-surface-variant" style="display:block;margin-bottom:var(--space-xs);">MONTO DE APERTURA</label>' +
    '<input type="number" class="input" id="caja-monto-apertura" step="0.01" placeholder="0.00">' +
    '</div>' +
    '<div class="flex gap-space-sm justify-end">' +
    '<button class="btn btn-secondary" onclick="window.CAJA.cerrarModales()">Cancelar</button>' +
    '<button class="btn btn-primary" onclick="window.CAJA.confirmarApertura()">' +
    '<span class="material-symbols-outlined">lock_open</span> ABRIR CAJA' +
    '</button>' +
    '</div>' +
    '</div></div>';
  setTimeout(function () {
    const el = $id('caja-monto-apertura');
    if (el) el.focus();
  }, 50);
}

function confirmarApertura() {
  const input = $id('caja-monto-apertura');
  const monto = parseFloat(input ? input.value : '');
  if (isNaN(monto) || monto < 0) { NUCLEO.toast('Ingresá un monto de apertura válido', 'error'); return; }
  const userId = (NUCLEO.getUsuarioActivo() || {}).id || null;
  NUCLEO.iniciarCiclo(monto, userId);
  cerrarModales();
  NUCLEO.toast('Caja abierta', 'success');
}

function abrirModalCierre() {
  const ciclo = NUCLEO.getCicloAbierto();
  if (!ciclo) { NUCLEO.toast('No hay ciclo abierto', 'error'); return; }
  if (carrito.length > 0) {
    NUCLEO.toast('Hay ' + carrito.length + ' ítem(s) cargados en el ticket. Quedan en el carrito al cerrar.', 'warning');
  }
  const container = $id('caja-modales-container');
  if (!container) return;
  container.innerHTML =
    '<div class="modal-charge-overlay" onclick="if(event.target===this)window.CAJA.cerrarModales()">' +
    '<div class="modal-charge-content">' +
    '<h3 class="font-headline-md mb-2">Cierre de Caja — Arqueo a Ciegas</h3>' +
    '<p class="font-body-sm text-on-surface-variant mb-4">Contá el efectivo del cajón principal e ingresá el monto. El sistema no muestra el esperado hasta que lo confirmes.</p>' +
    '<div style="margin-bottom:var(--space-md);">' +
    '<label class="font-label-md text-on-surface-variant" style="display:block;margin-bottom:var(--space-xs);">EFECTIVO CONTADO (CAJÓN PRINCIPAL)</label>' +
    '<input type="number" class="input" id="caja-monto-contado" step="0.01" placeholder="0.00">' +
    '</div>' +
    '<div id="caja-cuadre-resultado"></div>' +
    '<div class="flex gap-space-sm justify-end" style="margin-top:var(--space-lg);" id="caja-cierre-acciones">' +
    '<button class="btn btn-secondary" onclick="window.CAJA.cerrarModales()">Cancelar</button>' +
    '<button class="btn btn-primary" onclick="window.CAJA.verCuadreCierre()">VER CUADRE</button>' +
    '</div>' +
    '</div></div>';
}

function verCuadreCierre() {
  const ciclo = NUCLEO.getCicloAbierto();
  if (!ciclo) return;
  const input = $id('caja-monto-contado');
  const contado = parseFloat(input ? input.value : '');
  if (isNaN(contado)) { NUCLEO.toast('Ingresá el efectivo contado', 'error'); return; }
  const ventasPorMetodo = NUCLEO.getVentasPorMetodo(ciclo.id);
  const ventasEnPerdida = NUCLEO.getVentasEnPerdida(ciclo.id);
  const subCajaTotal = NUCLEO.getVentasSubCajaDelCiclo(ciclo.id);
  const efectivoVentas = ventasPorMetodo.cash || 0;
  const esperado = (ciclo.montoApertura || 0) + efectivoVentas - subCajaTotal;
  const diferencia = contado - esperado;
  const resultado = $id('caja-cuadre-resultado');
  if (resultado) {
    resultado.innerHTML =
      '<div class="caja-total-display">' +
      '<span class="font-body-sm text-on-surface-variant">Esperado: ' + NUCLEO.money(esperado) + '</span>' +
      '<span class="font-body-sm text-on-surface-variant">Contado: ' + NUCLEO.money(contado) + '</span>' +
      '<span class="font-headline-sm ' + (diferencia < 0 ? 'text-error' : '') + '">' +
      'Diferencia: ' + NUCLEO.money(diferencia) + (diferencia < 0 ? ' (FALTANTE)' : diferencia > 0 ? ' (SOBRANTE)' : ' (EXACTO)') +
      '</span>' +
      (ventasEnPerdida.length > 0 ? '<span class="font-body-sm text-error" style="margin-top:var(--space-xs);">⚠ ' + ventasEnPerdida.length + ' venta(s) en pérdida este ciclo</span>' : '') +
      '</div>';
  }
  const acciones = $id('caja-cierre-acciones');
  if (acciones) {
    acciones.innerHTML =
      '<button class="btn btn-secondary" onclick="window.CAJA.cerrarModales()">Cancelar</button>' +
      '<button class="btn btn-primary" onclick="window.CAJA.confirmarCierre(' + contado + ', ' + esperado + ', ' + diferencia + ')">' +
      '<span class="material-symbols-outlined">lock</span> CONFIRMAR CIERRE' +
      '</button>';
  }
}

function confirmarCierre(contado, esperado, diferencia) {
  const ciclo = NUCLEO.getCicloAbierto();
  if (!ciclo) return;
  const userId = (NUCLEO.getUsuarioActivo() || {}).id || null;
  const ventas = NUCLEO.getVentasDelCiclo(ciclo.id);
  const ventasPorMetodo = NUCLEO.getVentasPorMetodo(ciclo.id);
  const subCajaTotal = NUCLEO.getVentasSubCajaDelCiclo(ciclo.id);
  const ventasTotal = ventas
    .filter(function (v) { return !v.esCigarrillo; })
    .reduce(function (s, v) { return s + (v.total || 0); }, 0);
  const detalleMap = {};
  let cigOtrosMedios = 0;
  ventas.filter(function (v) { return v.esCigarrillo; }).forEach(function (v) {
    if (v.method !== 'cash') { cigOtrosMedios += v.total || 0; return; }
    const it = (v.items || [])[0] || {};
    const key = (it.name || '?') + '|' + (v.tipo || '');
    if (!detalleMap[key]) detalleMap[key] = { name: it.name || '?', tipo: v.tipo || '', qty: 0, total: 0 };
    detalleMap[key].qty += it.qty || 1;
    detalleMap[key].total += v.total || 0;
  });
  const datosArqueo = {
    montoContado: contado,
    montoEsperado: esperado,
    diferencia: diferencia,
    ventasPorMetodo: ventasPorMetodo,
    ventasTotal: ventasTotal,
    subCajaTotal: subCajaTotal,
    subCajaDetalle: Object.keys(detalleMap).map(function (k) { return detalleMap[k]; }),
    subCajaOtrosMedios: cigOtrosMedios,
    userId: userId
  };
  NUCLEO.finalizarCiclo(datosArqueo);
  const cicloId = ciclo.id;
  cerrarModales();
  NUCLEO.toast('Caja cerrada', 'success');
  abrirModalImprimirCierre(cicloId);
}

function abrirModalImprimirCierre(cierreId) {
  const container = $id('caja-modales-container');
  if (!container) return;
  const subcajas = NUCLEO.getData('pos_subcajas') || {};
  container.innerHTML =
    '<div class="modal-charge-overlay">' +
    '<div class="modal-charge-content" style="max-width:440px;">' +
    '<h3 class="font-headline-md mb-2">Caja cerrada</h3>' +
    '<p class="font-body-sm text-on-surface-variant mb-4">¿Qué tickets querés imprimir? Si falla la impresión o lo necesitás otro día, podés reimprimirlos desde el estado de caja (arriba a la derecha).</p>' +
    '<label style="display:flex;align-items:center;gap:var(--space-sm);margin-bottom:var(--space-sm);cursor:pointer;">' +
    '<input type="checkbox" id="caja-print-general" checked> <span>Ticket General (total de ventas + arqueo)</span>' +
    '</label>' +
    '<label style="display:flex;align-items:center;gap:var(--space-sm);margin-bottom:var(--space-lg);cursor:pointer;">' +
    '<input type="checkbox" id="caja-print-subcaja" ' + (subcajas.printSubCajaTicketOnClose ? 'checked' : '') + '> <span>Ticket Sub-Caja Cigarrillos</span>' +
    '</label>' +
    '<div class="flex gap-space-sm justify-end">' +
    '<button class="btn btn-secondary" onclick="window.CAJA.cerrarModales()">NO IMPRIMIR</button>' +
    '<button class="btn btn-primary" onclick="window.CAJA.imprimirCierreSeleccion(\'' + cierreId + '\')">' +
    '<span class="material-symbols-outlined">print</span> IMPRIMIR' +
    '</button>' +
    '</div>' +
    '</div></div>';
}

function imprimirCierreSeleccion(cierreId) {
  const g = $id('caja-print-general');
  const s = $id('caja-print-subcaja');
  const cierre = (NUCLEO.getData('pos_cierres') || []).find(function (c) { return c.id === cierreId; });
  if (!cierre) { NUCLEO.toast('Cierre no encontrado', 'error'); return; }
  const imprimirG = g && g.checked;
  const imprimirS = s && s.checked;
  cerrarModales();
  if (imprimirG) imprimirTicketCierreGeneral(cierre);
  if (imprimirS) imprimirTicketSubCaja(cierre);
}

function abrirModalVerCierres(fecha) {
  if (typeof fecha !== 'string') fecha = fechaLocalHoy();
  const container = $id('caja-modales-container');
  if (!container) return;
  const todos = NUCLEO.getData('pos_cierres') || [];
  const cierres = todos.filter(function (c) { return !fecha || fechaLocal(c.fechaCierre) === fecha; }).slice().reverse().slice(0, 100);
  container.innerHTML =
    '<div class="modal-charge-overlay" onclick="if(event.target===this)window.CAJA.cerrarModales()">' +
    '<div class="modal-charge-content" style="max-width:760px;">' +
    '<h3 class="font-headline-md mb-2">Cierres de Caja</h3>' +
    '<div class="flex gap-space-sm items-center" style="margin-bottom:var(--space-md);">' +
    '<label class="font-label-md text-on-surface-variant">FECHA</label>' +
    '<input type="date" class="input" style="max-width:180px;" value="' + fecha + '" onchange="window.CAJA.abrirModalVerCierres(this.value)">' +
    '<button class="btn btn-secondary" onclick="window.CAJA.abrirModalVerCierres(\'\')">VER TODOS</button>' +
    '</div>' +
    (cierres.length === 0
      ? '<p class="font-body-md text-on-surface-variant">No hay cierres en esa fecha.</p>'
      : '<div class="overflow-y-auto" style="max-height:340px;"><table class="table"><thead class="table-header"><tr><th>FECHA / HORA</th><th>CONTADO</th><th>DIFERENCIA</th><th>REIMPRIMIR</th></tr></thead><tbody>' +
        cierres.map(function (c) {
          const diferencia = c.diferencia || 0;
          return (
            '<tr class="table-row">' +
            '<td>' + new Date(c.fechaCierre).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + '</td>' +
            '<td>' + NUCLEO.money(c.montoContado || 0) + '</td>' +
            '<td class="' + (diferencia < 0 ? 'text-error' : '') + '">' + NUCLEO.money(diferencia) + '</td>' +
            '<td>' +
            '<button class="btn btn-secondary" onclick="window.CAJA.reimprimirCierreGeneral(\'' + c.id + '\')">GENERAL</button> ' +
            '<button class="btn btn-secondary" onclick="window.CAJA.reimprimirCierreSubCaja(\'' + c.id + '\')">SUB-CAJA</button>' +
            '</td>' +
            '</tr>'
          );
        }).join('') +
        '</tbody></table></div>') +
    '<div class="flex justify-end" style="margin-top:var(--space-md);">' +
    '<button class="btn btn-secondary" onclick="window.CAJA.cerrarModales()">Cerrar</button>' +
    '</div></div></div>';
}

function buscarCierre(id) {
  const c = (NUCLEO.getData('pos_cierres') || []).find(function (x) { return x.id === id; });
  if (!c) NUCLEO.toast('Cierre no encontrado', 'error');
  return c;
}

function reimprimirCierreGeneral(id) { const c = buscarCierre(id); if (c) imprimirTicketCierreGeneral(c); }
function reimprimirCierreSubCaja(id) { const c = buscarCierre(id); if (c) imprimirTicketSubCaja(c); }

function fmtFecha(iso) { return iso ? new Date(iso).toLocaleString('es-AR') : '—'; }

function imprimirTicketCierreGeneral(cierre) {
  const business = NUCLEO.getData('pos_business') || {};
  const totalVentas = cierre.ventasTotal != null
    ? cierre.ventasTotal
    : Math.max(0, Object.keys(cierre.ventasPorMetodo || {}).reduce(function (s, k) { return s + cierre.ventasPorMetodo[k]; }, 0) - (cierre.subCajaTotal || 0));
  let html = '<div style="font-family:monospace;font-size:12px;padding:10px;">';
  html += '<h3>' + esc(business.razonSocial || 'NEURORA POS') + '</h3>';
  html += '<p><strong>CIERRE DE CAJA</strong></p><hr>';
  html += '<p>Apertura: ' + esc(fmtFecha(cierre.fechaApertura)) + '</p>';
  html += '<p>Cierre: ' + esc(fmtFecha(cierre.fechaCierre)) + '</p>';
  html += '<p>Cajero: ' + esc(nombreUsuario(cierre.userId)) + '</p><hr>';
  html += '<p><strong>TOTAL VENTAS: ' + NUCLEO.money(totalVentas) + '</strong></p><hr>';
  html += '<p>Monto Apertura: ' + NUCLEO.money(cierre.montoApertura || 0) + '</p>';
  html += '<p>Efectivo Contado: ' + NUCLEO.money(cierre.montoContado || 0) + '</p>';
  html += '<p><strong>Diferencia: ' + NUCLEO.money(cierre.diferencia || 0) + '</strong></p>';
  html += '</div>';
  imprimirHTML(html);
}

function imprimirTicketSubCaja(cierre) {
  let html = '<div style="font-family:monospace;font-size:12px;padding:10px;">';
  html += '<h3>SUB-CAJA CIGARRILLOS</h3>';
  html += '<p>Cierre: ' + esc(fmtFecha(cierre.fechaCierre)) + '</p>';
  html += '<p>Cajero: ' + esc(nombreUsuario(cierre.userId)) + '</p><hr>';
  const det = cierre.subCajaDetalle || [];
  if (det.length === 0) html += '<p>Sin ventas de cigarrillos en efectivo.</p>';
  det.forEach(function (d) {
    html += '<p>' + esc(d.name) + ' x' + d.qty + ' = ' + NUCLEO.money(d.total) + '</p>';
  });
  html += '<hr><p><strong>TOTAL SUB-CAJA (efectivo): ' + NUCLEO.money(cierre.subCajaTotal || 0) + '</strong></p>';
  if (cierre.subCajaOtrosMedios) html += '<p>Cigarrillos cobrados por otros medios: ' + NUCLEO.money(cierre.subCajaOtrosMedios) + '</p>';
  html += '</div>';
  imprimirHTML(html);
}

function imprimirHTML(html) {
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);
  iframe.contentDocument.write(html);
  iframe.contentDocument.close();
  iframe.contentWindow.print();
  setTimeout(function () { iframe.remove(); }, 1000);
}

function cerrarModales() {
  const container = $id('caja-modales-container');
  if (container) container.innerHTML = '';
}

window.CAJA = {
  init: init,
  onShow: onShow,
  addQuickButton: addQuickButton,
  updateQty: updateQty,
  removeItem: removeItem,
  handleCobrarClick: handleCobrarClick,
  setMetodoPago: setMetodoPago,
  confirmarCobro: confirmarCobro,
  imprimirPostCobro: imprimirPostCobro,
  nuevaVentaPostCobro: nuevaVentaPostCobro,
  abrirModalReimprimir: abrirModalReimprimir,
  reimprimirTicket: reimprimirTicket,
  abrirModalPaquetes: abrirModalPaquetes,
  agregarPaquete: agregarPaquete,
  abrirModalSueltos: abrirModalSueltos,
  abrirPaqueteParaSueltos: abrirPaqueteParaSueltos,
  agregarSuelto: agregarSuelto,
  confirmarApertura: confirmarApertura,
  verCuadreCierre: verCuadreCierre,
  confirmarCierre: confirmarCierre,
  imprimirCierreSeleccion: imprimirCierreSeleccion,
  abrirModalVerCierres: abrirModalVerCierres,
  reimprimirCierreGeneral: reimprimirCierreGeneral,
  reimprimirCierreSubCaja: reimprimirCierreSubCaja,
  cerrarModales: cerrarModales
};
})();