/* ============================================
NEURORA POS — CAJA + CIERRE (ANEXO A)
Namespace: .caja-, .modal-charge-
Versión: Paso 3 de corrección de la maqueta
============================================ */
(function () {
'use strict';

let carrito = [];
let cajaAbierta = false;
let metodoPagoSeleccionado = 'cash';
let lastVenta = null;
let modalPostCobroActivo = null;
let visible = false;
let cobrando = false;
let conteoCierre = null; // conteo a ciegas ya visto: queda bloqueado para no poder "recontar" hasta cuadrar

function esc(str) { return NUCLEO.esc(str); }
function $id(id) { return document.getElementById(id); }
function userId_() { return (NUCLEO.getUsuarioActivo() || {}).id || null; }
function subtotalCarrito() { return NUCLEO.roundCents(carrito.reduce(function (s, i) { return s + i.price * i.qty; }, 0)); }

// ==========================================
// 1. CICLO DE VIDA (hooks del NÚCLEO)
// ==========================================
// boot: se ejecuta UNA vez al registrar el módulo (suscripciones al bus, independientes de la UI)
function boot() {
  NUCLEO.on('pos:estadoCaja', function () {
    cajaAbierta = NUCLEO.getEstadoCaja() === 'ABIERTA';
    if (visible) render();
  });
  NUCLEO.on('pos:solicitudAperturaCierre', function (data) {
    asegurarVistaCaja();
    if (data.estado === 'CERRADA') abrirModalApertura(); else abrirModalCierre();
  });
  NUCLEO.on('pos:solicitudVerCierres', function () {
    asegurarVistaCaja();
    abrirModalVerCierres();
  });
}

function asegurarVistaCaja() { if (!visible) NUCLEO.showTab('caja'); }

function init() {
  cajaAbierta = NUCLEO.getEstadoCaja() === 'ABIERTA';
  const draft = NUCLEO.getTicketDraft();
  carrito = Array.isArray(draft) ? draft.filter(function (i) { return i && i.code && isFinite(i.price) && i.qty > 0; }) : [];
}

function onShow() { visible = true; cajaAbierta = NUCLEO.getEstadoCaja() === 'ABIERTA'; render(); }
function onHide() { visible = false; modalPostCobroActivo = null; cerrarModales(); }

function onEscape() {
  if (modalPostCobroActivo) { nuevaVentaPostCobro(); return true; }
  const c = $id('caja-modales-container');
  if (c && c.innerHTML.trim() !== '') { cerrarModales(); return true; }
  return false;
}

// Solo se invoca cuando CAJA es la solapa activa
function onKey(e) {
  if (modalPostCobroActivo) {
    if (e.key === 'F1') { imprimirPostCobro(); return true; }
    return false;
  }
  if (e.key === 'F2') { const input = $id('caja-scanner-input'); if (input) input.focus(); return true; }
  if (e.key === 'F4') { handleCobrarClick(); return true; }
  if (e.key === 'F8') { if (cajaAbierta) abrirModalSueltos(); return true; }
  return false;
}

// ==========================================
// 2. RENDER
// ==========================================
function render() {
  if (!visible) return;
  const container = $id('moduleContainer');
  if (!container) return;
  container.innerHTML = renderCaja();
  bindEvents();
}

function renderCaja() {
  const quickButtons = NUCLEO.getData('pos_quick_buttons') || [];
  const subtotal = subtotalCarrito();
  const off = cajaAbierta ? '' : 'disabled';
  return (
    '<div class="caja-layout">' +
      '<div class="caja-col-left">' +
        '<div class="caja-scanner-bar">' +
          '<div class="caja-scanner-input-wrapper">' +
            '<span class="material-symbols-outlined text-outline" style="margin-right:0.5rem;">barcode_scanner</span>' +
            '<input type="text" id="caja-scanner-input" class="caja-scanner-input" placeholder="Escanear código de barras o escribir nombre...">' +
            '<span class="badge badge-neutral">F2</span>' +
          '</div>' +
          '<button class="btn btn-primary" id="btn-buscar"><span class="material-symbols-outlined">search</span> BUSCAR</button>' +
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
            '<span><kbd>F2</kbd> Escáner</span><span><kbd>F4</kbd> Cobrar</span><span><kbd>F8</kbd> Suelto</span><span><kbd>ESC</kbd> Cancelar/Volver</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="caja-col-right">' +
        '<div class="caja-quick-sales-header"><span class="font-label-lg">VENTA RÁPIDA</span></div>' +
        '<div class="caja-quick-grid' + (quickButtons.length > 8 ? ' caja-quick-grid--3' : '') + '">' +
          (quickButtons.length === 0
            ? '<p class="font-body-sm text-on-surface-variant" style="padding:var(--space-sm);">Sin botones configurados (CONFIG · Botones Rápidos)</p>'
            : quickButtons.map(function (btn, idx) {
                return '<button class="caja-quick-btn" onclick="window.CAJA.addQuickButton(' + idx + ')">' +
                  '<span class="caja-quick-btn-name">' + esc(btn.nombre || btn.name || '') + '</span>' +
                  '<span class="caja-quick-btn-price">' + NUCLEO.money(btn.precio || btn.price || 0) + '</span></button>';
              }).join('')) +
        '</div>' +
        '<button class="caja-suelto-btn" ' + off + ' onclick="window.CAJA.abrirModalSueltos()">' +
          '<span class="caja-suelto-left"><span class="caja-suelto-icon"><span class="material-symbols-outlined">smoking_rooms</span></span>' +
          '<span class="caja-suelto-label">CIGARRILLOS SUELTO</span></span><span class="caja-suelto-key">F8</span></button>' +
        '<div class="caja-checkout-panel">' +
          '<div class="caja-total-display"><span class="font-label-md text-on-surface-variant">TOTAL</span><span class="font-numeric-display">' + NUCLEO.money(subtotal) + '</span></div>' +
          '<button class="caja-cobrar-btn" ' + (carrito.length === 0 ? 'disabled' : '') + ' onclick="window.CAJA.handleCobrarClick()">COBRAR <span style="font-size:12px;font-weight:500;">F4</span></button>' +
          '<div class="grid grid-2x2">' +
            '<button class="btn btn-secondary" onclick="window.CAJA.abrirModalReimprimir()"><span class="material-symbols-outlined">print</span> REIMPRIMIR</button>' +
            '<button class="btn btn-secondary" ' + off + ' onclick="window.CAJA.abrirModalPaquetes()"><span class="material-symbols-outlined">inventory_2</span> PAQUETE</button>' +
            '<button class="btn btn-secondary" ' + off + ' onclick="window.CAJA.abrirModalMovimiento()"><span class="material-symbols-outlined">swap_vert</span> EGRESO / RETIRO</button>' +
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
    return '<tr><td>' + esc(item.name) + marca + '</td>' +
      '<td><div class="qty-control"><button class="qty-btn" onclick="window.CAJA.updateQty(' + idx + ', -1)">-</button>' +
      '<span class="qty-value">' + item.qty + '</span><button class="qty-btn" onclick="window.CAJA.updateQty(' + idx + ', 1)">+</button></div></td>' +
      '<td>' + NUCLEO.money(item.price) + '</td><td>' + NUCLEO.money(NUCLEO.roundCents(item.price * item.qty)) + '</td>' +
      '<td><button class="btn-icon" onclick="window.CAJA.removeItem(' + idx + ')"><span class="material-symbols-outlined">close</span></button></td></tr>';
  }).join('');
}

function bindEvents() {
  const scannerInput = $id('caja-scanner-input');
  if (scannerInput) {
    scannerInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); const q = scannerInput.value.trim(); scannerInput.value = ''; buscarProducto(q); }
    });
    scannerInput.focus();
  }
  const btnBuscar = $id('btn-buscar');
  if (btnBuscar) btnBuscar.addEventListener('click', function () {
    const input = $id('caja-scanner-input');
    const q = input ? input.value.trim() : '';
    if (input) input.value = '';
    abrirModalBusqueda(q);
  });
}

function mostrarModal(html, opts) {
  const container = $id('caja-modales-container');
  if (!container) return false;
  const cerrable = !(opts && opts.fijo);
  container.innerHTML =
    '<div class="modal-charge-overlay"' + (cerrable ? ' onclick="if(event.target===this)window.CAJA.cerrarModales()"' : '') + '>' +
    '<div class="modal-charge-content"' + (opts && opts.ancho ? ' style="max-width:' + opts.ancho + 'px;"' : '') + '>' + html + '</div></div>';
  return true;
}

function cerrarModales() {
  const container = $id('caja-modales-container');
  if (container) container.innerHTML = '';
}

// ==========================================
// 3. CARRITO (con control de stock: no se vende lo que no está cargado)
// ==========================================
function enCarrito(code, tipo) {
  return carrito.filter(function (i) { return i.code === code && (i.tipo || '') === (tipo || ''); })
    .reduce(function (s, i) { return s + i.qty; }, 0);
}

function productoPorCode(code) {
  return NUCLEO.getData('pos_products').find(function (p) { return p.code === code; }) || null;
}

// unidades todavía agregables al carrito
function disponible(product, tipo) {
  if (tipo === 'suelto') return (Number(product['sueltos_' + product.code]) || 0) - enCarrito(product.code, 'suelto');
  return (Number(product.stock) || 0) - enCarrito(product.code, tipo === 'paquete' ? 'paquete' : '');
}

function avisoSinStock(nombre) {
  NUCLEO.toast('Sin stock de "' + nombre + '". Ingresalo primero en INVENTARIO para poder venderlo.', 'error');
}

function agregarCigarrillo(product, tipo) {
  if (disponible(product, tipo) <= 0) {
    if (tipo === 'paquete') avisoSinStock(product.name); else NUCLEO.toast('Sin sueltos de ' + product.name + '. Abrí un paquete primero.', 'error');
    return false;
  }
  const esPaquete = tipo === 'paquete';
  agregarAlCarrito({
    code: product.code,
    name: esPaquete ? product.name : product.name + ' (suelto)',
    price: esPaquete ? product.price : (product.priceLoose || NUCLEO.roundCurrency(product.price / 20)),
    cost: esPaquete ? (product.cost || 0) : (product.cost || 0) / 20,
    esCigarrillo: true, tipo: tipo, noFiscal: true
  }, 1);
  return true;
}

function agregarProducto(product, precio) {
  if (NUCLEO.esCategoriaCigarrillos(product.category)) return agregarCigarrillo(product, 'paquete');
  if (disponible(product, '') <= 0) { avisoSinStock(product.name); return false; }
  agregarAlCarrito({ code: product.code, name: product.name, price: precio !== undefined ? precio : product.price, cost: product.cost || 0, isDummy: false, noFiscal: !!product.noFiscal }, 1);
  return true;
}

function buscarProducto(query) {
  if (!query) return;
  const product = NUCLEO.getData('pos_products').find(function (p) {
    return p.active !== false && (p.code === query || (p.barcode && p.barcode === query));
  });
  if (product) { agregarProducto(product); return; }
  abrirModalBusqueda(query); // no es un código exacto: se trata como búsqueda por nombre
}

function addQuickButton(idx) {
  const btn = (NUCLEO.getData('pos_quick_buttons') || [])[idx];
  if (!btn) return;
  if (btn.linkedProductCode) {
    const product = NUCLEO.getData('pos_products').find(function (p) { return p.code === btn.linkedProductCode && p.active !== false; });
    if (!product) { NUCLEO.toast('Producto vinculado no encontrado en INVENTARIO', 'error'); return; }
    agregarProducto(product, (btn.precio || btn.price) || product.price);
  } else {
    // Sin vínculo: ítem temporal en el ticket. NO se persiste en pos_products ni descuenta stock.
    const nombre = btn.nombre || btn.name || 'Ítem';
    agregarAlCarrito({ code: 'RAP-' + nombre, name: nombre, price: btn.precio || btn.price || 0, cost: 0, isDummy: true }, 1);
  }
}

function agregarAlCarrito(item, qty) {
  const existing = carrito.find(function (i) { return i.code === item.code && (i.tipo || '') === (item.tipo || '') && i.price === item.price; });
  if (existing) existing.qty += qty;
  else carrito.push({ code: item.code, name: item.name, price: item.price, cost: item.cost || 0, qty: qty, isDummy: !!item.isDummy, esCigarrillo: !!item.esCigarrillo, tipo: item.tipo || null, noFiscal: !!item.noFiscal });
  autoguardarCarrito();
  render();
}

function updateQty(idx, delta) {
  const item = carrito[idx];
  if (!item) return;
  if (delta > 0 && !item.isDummy) {
    const p = productoPorCode(item.code);
    if (!p || disponible(p, item.esCigarrillo ? item.tipo : '') <= 0) { avisoSinStock(item.name.replace(' (suelto)', '')); return; }
  }
  item.qty += delta;
  if (item.qty <= 0) carrito.splice(idx, 1);
  autoguardarCarrito();
  render();
}

function removeItem(idx) { carrito.splice(idx, 1); autoguardarCarrito(); render(); }
function autoguardarCarrito() { NUCLEO.guardarTicketDraft(carrito); }

// ==========================================
// 4. BÚSQUEDA POR NOMBRE
// ==========================================
function normBusq(s) { return NUCLEO.normText(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

function abrirModalBusqueda(q) {
  mostrarModal(
    '<h3 class="font-headline-md mb-2">Buscar producto</h3>' +
    '<input type="text" class="input" id="caja-busq-input" placeholder="Nombre, código o categoría..." value="' + esc(q || '') + '" oninput="window.CAJA.filtrarBusqueda(this.value)">' +
    '<div id="caja-busq-resultados" class="overflow-y-auto" style="max-height:320px;margin-top:var(--space-md);"></div>' +
    '<div class="flex justify-end" style="margin-top:var(--space-md);"><button class="btn btn-secondary" onclick="window.CAJA.cerrarModales()">Cerrar</button></div>',
    { ancho: 640 });
  filtrarBusqueda(q || '');
  const input = $id('caja-busq-input');
  if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
}

function filtrarBusqueda(q) {
  const cont = $id('caja-busq-resultados');
  if (!cont) return;
  const n = normBusq(q);
  const lista = NUCLEO.getData('pos_products').filter(function (p) {
    return p.active !== false && (!n || normBusq((p.code || '') + ' ' + (p.name || '') + ' ' + (p.category || '')).indexOf(n) !== -1);
  }).slice(0, 30);
  if (lista.length === 0) { cont.innerHTML = '<p class="font-body-md text-on-surface-variant">Sin resultados.</p>'; return; }
  cont.innerHTML = '<table class="table"><thead class="table-header"><tr><th>PRODUCTO</th><th>PRECIO</th><th>STOCK</th><th></th></tr></thead><tbody>' +
    lista.map(function (p) {
      const disp = disponible(p, NUCLEO.esCategoriaCigarrillos(p.category) ? 'paquete' : '');
      return '<tr class="table-row"><td>' + esc(p.name) + '<div class="font-body-sm text-on-surface-variant">' + esc(p.code) + '</div></td><td>' + NUCLEO.money(p.price) + '</td><td>' + (Number(p.stock) || 0) + '</td>' +
        '<td>' + (disp > 0
          ? '<button class="btn btn-primary" onclick="window.CAJA.agregarDesdeBusqueda(' + NUCLEO.jsArg(p.code) + ')">AGREGAR</button>'
          : '<span class="badge badge-error">SIN STOCK</span>') + '</td></tr>';
    }).join('') + '</tbody></table>';
}

function agregarDesdeBusqueda(code) {
  const p = productoPorCode(code);
  const q = ($id('caja-busq-input') || {}).value || '';
  if (!p) return;
  if (agregarProducto(p)) abrirModalBusqueda(q); // se mantiene abierta para seguir cargando
}

// ==========================================
// 5. COBRO (vuelto + transacción todo-o-nada)
// ==========================================
function handleCobrarClick() {
  if (carrito.length === 0) return;
  if (!cajaAbierta) { abrirModalAvisoCajaCerrada(); return; }
  abrirModalCobro();
}

function abrirModalAvisoCajaCerrada() {
  mostrarModal('<div style="text-align:center;"><span class="material-symbols-outlined" style="font-size:40px;color:var(--color-error);">lock</span>' +
    '<h3 class="font-headline-md mb-2">Caja Cerrada</h3>' +
    '<p class="font-body-md mb-4">No se puede cobrar con la caja cerrada. Abrí la caja desde la barra superior para continuar.</p>' +
    '<button class="btn btn-primary w-full" onclick="window.CAJA.cerrarModales()">Entendido</button></div>', { ancho: 380 });
}

function infoTicketCliente() {
  const total = carrito.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
  const imp = carrito.filter(function (i) { return !i.esCigarrillo && !i.noFiscal; }).reduce(function (s, i) { return s + i.price * i.qty; }, 0);
  if (Math.abs(total - imp) < 0.005) return '';
  return '<p class="font-body-sm text-on-surface-variant" style="text-align:center;margin-bottom:var(--space-md);">Ticket del cliente: ' + NUCLEO.money(imp) + ' — no se imprimen ' + NUCLEO.money(total - imp) + ' (sub-caja / no fiscal)</p>';
}

function abrirModalCobro() {
  metodoPagoSeleccionado = 'cash';
  const total = subtotalCarrito();
  const dens = ((NUCLEO.getData('pos_moneda') || {}).denominations || []).slice().sort(function (a, b) { return a - b; });
  const sugeridos = dens.filter(function (d) { return d >= total; }).slice(0, 4);
  mostrarModal(
    '<h3 class="font-headline-md mb-2">Confirmar Cobro</h3>' +
    '<div class="modal-charge-total">' + NUCLEO.money(total) + '</div>' + infoTicketCliente() +
    '<div class="modal-charge-methods" id="caja-metodos-pago">' + renderMetodosPago() + '</div>' +
    '<div id="caja-efectivo-panel" style="margin-bottom:var(--space-lg);">' +
      '<label class="font-label-md text-on-surface-variant" style="display:block;margin-bottom:var(--space-xs);">RECIBIDO</label>' +
      '<input type="number" class="input" id="caja-recibido" step="0.01" min="0" placeholder="' + total + '" oninput="window.CAJA.actualizarVuelto()">' +
      '<div class="flex gap-space-sm" style="margin:var(--space-sm) 0;flex-wrap:wrap;">' +
        '<button type="button" class="btn btn-secondary" onclick="window.CAJA.setRecibido(' + total + ')">EXACTO</button>' +
        sugeridos.map(function (d) { return '<button type="button" class="btn btn-secondary" onclick="window.CAJA.setRecibido(' + d + ')">' + NUCLEO.money(d) + '</button>'; }).join('') +
      '</div>' +
      '<label class="font-label-md text-on-surface-variant" style="display:block;margin:var(--space-sm) 0 var(--space-xs);">SI EL EFECTIVO NO ALCANZA, EL RESTO CON</label>' +
      '<select class="input" id="caja-resto-metodo" onchange="window.CAJA.actualizarVuelto()">' +
        '<option value="">— (pago solo en efectivo)</option><option value="transfer">Transferencia</option><option value="card">Tarjeta</option><option value="other">Otro</option></select>' +
      '<div id="caja-subcaja-panel" style="display:none;margin-top:var(--space-sm);">' +
        '<label class="font-label-md text-on-surface-variant" style="display:block;margin-bottom:var(--space-xs);">EFECTIVO QUE VA A LA SUB-CAJA (CIGARRILLOS)</label>' +
        '<input type="number" class="input" id="caja-cash-subcaja" step="0.01" min="0" oninput="this.dataset.manual=\'1\'; window.CAJA.actualizarVuelto()"></div>' +
      '<div id="caja-vuelto" class="font-headline-sm" style="text-align:center;min-height:24px;margin-top:var(--space-sm);"></div>' +
    '</div>' +
    '<div class="flex gap-space-sm justify-end">' +
      '<button class="btn btn-secondary" onclick="window.CAJA.cerrarModales()">Cancelar</button>' +
      '<button class="btn btn-primary" id="caja-btn-confirmar-cobro" onclick="window.CAJA.confirmarCobro()"><span class="material-symbols-outlined">check</span> CONFIRMAR COBRO</button>' +
    '</div>');
  const r = $id('caja-recibido');
  if (r) {
    r.focus();
    r.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); confirmarCobro(); } });
  }
}

function renderMetodosPago() {
  const metodos = [{ id: 'cash', label: 'Efectivo' }, { id: 'card', label: 'Tarjeta' }, { id: 'transfer', label: 'Transferencia' }, { id: 'other', label: 'Otro' }];
  return metodos.map(function (m) {
    return '<button type="button" class="modal-charge-method-btn ' + (metodoPagoSeleccionado === m.id ? 'selected' : '') + '" onclick="window.CAJA.setMetodoPago(\'' + m.id + '\')">' + m.label + '</button>';
  }).join('');
}

function setMetodoPago(id) {
  metodoPagoSeleccionado = id;
  const el = $id('caja-metodos-pago');
  if (el) el.innerHTML = renderMetodosPago();
  const panel = $id('caja-efectivo-panel');
  if (panel) panel.style.display = id === 'cash' ? '' : 'none';
}

function setRecibido(monto) {
  const r = $id('caja-recibido');
  if (r) { r.value = monto; actualizarVuelto(); }
}

function actualizarVuelto() {
  const el = $id('caja-vuelto');
  const r = $id('caja-recibido');
  if (!el || !r) return;
  const total = subtotalCarrito();
  const recibido = parseFloat(r.value);
  const resto = ($id('caja-resto-metodo') || {}).value || '';
  const sub = $id('caja-subcaja-panel');
  if (sub) sub.style.display = 'none';
  if (isNaN(recibido)) { el.textContent = ''; return; }
  const dif = NUCLEO.roundCents(recibido - total);
  if (dif >= 0) {
    el.textContent = 'VUELTO: ' + NUCLEO.money(dif);
    el.style.color = 'var(--color-primary)';
  } else if (resto) {
    el.textContent = 'RESTO ' + NUCLEO.money(-dif) + ' con ' + ETIQUETAS_MEDIO[resto];
    el.style.color = 'var(--color-primary)';
    const tc = totalCigarrillos();
    const inp = $id('caja-cash-subcaja');
    if (sub && inp && tc > 0 && recibido > 0) {
      sub.style.display = '';
      // Por defecto el efectivo cubre primero los cigarrillos; el cajero puede cambiarlo
      if (inp.dataset.manual !== '1') inp.value = Math.min(recibido, tc);
    }
  } else {
    el.textContent = 'FALTAN: ' + NUCLEO.money(-dif);
    el.style.color = 'var(--color-error)';
  }
}

const ETIQUETAS_MEDIO = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', other: 'Otro' };

function totalCigarrillos() {
  return NUCLEO.roundCents(carrito.filter(function (i) { return i.esCigarrillo; }).reduce(function (s, i) { return s + i.price * i.qty; }, 0));
}

// Reparte un pago mixto (C en efectivo + O con el medio M) entre las ventas normales (Tr) y los cigarrillos (Tc).
// El efectivo que va a la sub-caja (cashSub) es el único grado de libertad: por defecto el efectivo cubre primero los cigarrillos.
function repartirPago(C, M, Tr, Tc, cashSubRaw, lineasCig) {
  const min = Math.max(0, NUCLEO.roundCents(C - Tr));
  const max = Math.min(C, Tc);
  const cs = isNaN(cashSubRaw) ? max : NUCLEO.roundCents(cashSubRaw);
  if (cs < min - 0.004 || cs > max + 0.004) {
    return { ok: false, error: 'El efectivo para la sub-caja debe estar entre ' + NUCLEO.money(min) + ' y ' + NUCLEO.money(max) };
  }
  const cm = NUCLEO.roundCents(C - cs);
  const armar = function (c, o) {
    return [c > 0.004 ? { method: 'cash', monto: NUCLEO.roundCents(c) } : null, o > 0.004 ? { method: M, monto: NUCLEO.roundCents(o) } : null].filter(Boolean);
  };
  const regular = armar(cm, NUCLEO.roundCents(Tr - cm));
  const cig = [];
  let cashResto = cs;
  let otroResto = NUCLEO.roundCents(Tc - cs);
  lineasCig.forEach(function (t, i) {
    const ultima = i === lineasCig.length - 1;
    const c = ultima ? cashResto : NUCLEO.roundCents(cs * t / Tc);
    const o = ultima ? otroResto : NUCLEO.roundCents(t - c);
    cashResto = NUCLEO.roundCents(cashResto - c);
    otroResto = NUCLEO.roundCents(otroResto - o);
    cig.push(armar(c, o));
  });
  return { ok: true, regular: regular, cig: cig };
}

function itemsImprimibles(venta) {
  return (venta.items || []).filter(function (i) { return !i.esCigarrillo && !i.noFiscal; });
}

function errorCobro(titulo, mensaje) {
  cerrarModales();
  NUCLEO.mostrarModal({ titulo: titulo, mensaje: mensaje, tono: 'error' });
}

function confirmarCobro() {
  if (cobrando || carrito.length === 0) return;
  const ciclo = NUCLEO.getCicloAbierto();
  if (!ciclo) { NUCLEO.toast('La caja está cerrada', 'error'); return; }

  // 1) Regla de negocio: no se cobra lo que no está en stock
  const val = NUCLEO.validarStockVenta(carrito);
  if (!val.ok) { errorCobro('Falta stock', NUCLEO.mensajeStockInsuficiente(val.faltantes)); return; }

  // 2) Pago: un solo medio, efectivo con vuelto, o mixto (efectivo + otro medio)
  const total = subtotalCarrito();
  const userId = userId_();
  const fecha = NUCLEO.nowISO();
  const items = carrito.map(function (i) { return Object.assign({}, i); });
  const regulares = items.filter(function (i) { return !i.esCigarrillo; });
  const cigs = items.filter(function (i) { return i.esCigarrillo; });
  const totRegulares = NUCLEO.roundCents(regulares.reduce(function (s, i) { return s + i.price * i.qty; }, 0));
  const totCigs = NUCLEO.roundCents(cigs.reduce(function (s, i) { return s + i.price * i.qty; }, 0));

  let recibido = null;
  let vuelto = 0;
  let metodoVenta = metodoPagoSeleccionado;
  let pagosTicket = null;
  let pagosRegular = null;
  let pagosCig = [];
  if (metodoPagoSeleccionado === 'cash') {
    const campo = parseFloat(($id('caja-recibido') || {}).value);
    recibido = isNaN(campo) ? total : campo;
    const resto = ($id('caja-resto-metodo') || {}).value || '';
    if (recibido < total) {
      if (!resto) { NUCLEO.toast('El monto recibido es menor al total. Elegí con qué se paga el resto.', 'error'); return; }
      if (!(recibido > 0)) { NUCLEO.toast('Ingresá el efectivo recibido', 'error'); return; }
      const subRaw = parseFloat(($id('caja-cash-subcaja') || {}).value);
      const plan = repartirPago(recibido, resto, totRegulares, totCigs, subRaw, cigs.map(function (i) { return NUCLEO.roundCents(i.price * i.qty); }));
      if (!plan.ok) { NUCLEO.toast(plan.error, 'error'); return; }
      metodoVenta = 'mixed';
      pagosTicket = [{ method: 'cash', monto: NUCLEO.roundCents(recibido) }, { method: resto, monto: NUCLEO.roundCents(total - recibido) }];
      pagosRegular = plan.regular;
      pagosCig = plan.cig;
    } else {
      vuelto = NUCLEO.roundCents(recibido - total);
    }
  }
  const metodoDe = function (pg) { return pg && pg.length > 1 ? 'mixed' : (pg && pg.length === 1 ? pg[0].method : metodoPagoSeleccionado); };
  const venta = { id: NUCLEO.uid(), items: items, total: total, method: metodoVenta, cicloId: ciclo.id, fecha: fecha, userId: userId };
  if (pagosTicket) venta.pagos = pagosTicket;
  if (recibido !== null) { venta.recibido = recibido; venta.vuelto = vuelto; }

  // 3) TODO O NADA: venta, ticket, stock y sub-caja se guardan juntos o no se guarda nada
  cobrando = true;
  const ok = NUCLEO.transaccion(NUCLEO.CLAVES_TX_VENTA, function () {
    if (regulares.length > 0) {
      const sales = NUCLEO.getData('pos_sales');
      sales.push({
        id: NUCLEO.uid(), ticketId: venta.id, items: regulares,
        total: NUCLEO.roundCents(regulares.reduce(function (s, i) { return s + i.price * i.qty; }, 0)),
        method: metodoDe(pagosRegular), pagos: pagosRegular || undefined, cicloId: ciclo.id, fecha: fecha, userId: userId
      });
      NUCLEO.setDataStrict('pos_sales', sales);
    }
    if (!NUCLEO.guardarTicket(venta)) return false;
    for (let i = 0; i < regulares.length; i++) {
      const it = regulares[i];
      if (!it.isDummy && !NUCLEO.actualizarStock(it.code, -it.qty, 'venta', userId, 'Venta')) return false;
    }
    for (let j = 0; j < cigs.length; j++) {
      const it = cigs[j];
      const linea = { code: it.code, name: it.name, price: it.price, cost: it.cost || 0, qty: it.qty, ticketId: venta.id };
      if (it.tipo === 'paquete') {
        if (!NUCLEO.actualizarStock(it.code, -it.qty, 'venta', userId, 'Venta paquete')) return false;
        if (!NUCLEO.registrarVentaPaqueteCigarrillos(linea, ciclo.id, metodoDe(pagosCig[j]), pagosCig[j])) return false;
      } else {
        if (!NUCLEO.venderSuelto(it.code, it.qty, ciclo.id, userId)) return false;
        if (!NUCLEO.registrarVentaSueltoCigarrillos(linea, ciclo.id, metodoDe(pagosCig[j]), pagosCig[j])) return false;
      }
    }
    NUCLEO.setDataStrict('pos_ticket_draft', null);
    return true;
  });
  cobrando = false;

  if (!ok) { errorCobro('No se registró la venta', 'Ocurrió un error al guardar y no se modificó nada (ni stock ni caja). Revisá el stock e intentá de nuevo.'); return; }

  lastVenta = venta;
  carrito = [];
  cerrarModales();
  render();
  if (itemsImprimibles(venta).length === 0) {
    NUCLEO.toast('Venta cobrada: ' + NUCLEO.money(total) + (vuelto > 0 ? ' · Vuelto ' + NUCLEO.money(vuelto) : '') + '. No hay ítems para el ticket del cliente.', 'success');
    return;
  }
  const config = NUCLEO.getData('pos_config');
  if (config && config.autoPrintTicket) {
    NUCLEO.printTicket(venta);
    NUCLEO.toast('Venta cobrada: ' + NUCLEO.money(total) + (vuelto > 0 ? ' · Vuelto ' + NUCLEO.money(vuelto) : ''), 'success');
  } else {
    abrirModalPostCobro(venta);
  }
}

function abrirModalPostCobro(venta) {
  modalPostCobroActivo = venta;
  mostrarModal(
    '<h3 class="font-headline-md mb-2">Venta Confirmada</h3>' +
    '<div class="modal-charge-total">' + NUCLEO.money(venta.total) + '</div>' +
    (venta.pagos ? '<div class="font-body-md" style="text-align:center;margin-bottom:var(--space-sm);">Pago mixto: ' + venta.pagos.map(function (p) { return ETIQUETAS_MEDIO[p.method] + ' ' + NUCLEO.money(p.monto); }).join(' + ') + '</div>' : '') +
    (venta.vuelto > 0 ? '<div class="font-headline-md" style="text-align:center;color:var(--color-primary);margin-bottom:var(--space-md);">VUELTO: ' + NUCLEO.money(venta.vuelto) + '</div>' : '') +
    '<div class="overflow-y-auto" style="max-height:240px;border:1px solid var(--color-outline-variant);border-radius:var(--radius-lg);margin-bottom:var(--space-lg);">' + NUCLEO.getTicketHTML(venta) + '</div>' +
    '<div class="flex gap-space-sm justify-end">' +
    '<button class="btn btn-secondary" onclick="window.CAJA.nuevaVentaPostCobro()"><span class="material-symbols-outlined">add</span> NUEVA VENTA <span style="font-size:11px;">(ESC)</span></button>' +
    '<button class="btn btn-primary" onclick="window.CAJA.imprimirPostCobro()"><span class="material-symbols-outlined">print</span> IMPRIMIR <span style="font-size:11px;">(F1)</span></button>' +
    '</div>', { fijo: true });
}

function imprimirPostCobro() { if (modalPostCobroActivo) NUCLEO.printTicket(modalPostCobroActivo); }

function nuevaVentaPostCobro() {
  modalPostCobroActivo = null;
  cerrarModales();
  render();
}

// ==========================================
// 6. REIMPRESIÓN
// ==========================================
function nombreUsuario(id) {
  const u = (NUCLEO.getData('pos_users') || []).find(function (x) { return x.id === id; });
  return u ? u.nombre : '—';
}

function abrirModalReimprimir(fecha) {
  if (typeof fecha !== 'string') fecha = NUCLEO.today();
  const log = NUCLEO.getData('pos_tickets_log') || [];
  const lista = log.filter(function (t) { return !fecha || NUCLEO.localDateOf(t.fecha) === fecha; }).slice().reverse().slice(0, 100);
  mostrarModal(
    '<h3 class="font-headline-md mb-2">Reimprimir Ticket</h3>' +
    '<div class="flex gap-space-sm items-center" style="margin-bottom:var(--space-md);">' +
    '<label class="font-label-md text-on-surface-variant">FECHA</label>' +
    '<input type="date" class="input" style="max-width:180px;" value="' + esc(fecha) + '" onchange="window.CAJA.abrirModalReimprimir(this.value)">' +
    '<button class="btn btn-secondary" onclick="window.CAJA.abrirModalReimprimir(\'\')">VER TODOS</button></div>' +
    (lista.length === 0 ? '<p class="font-body-md text-on-surface-variant">No hay tickets en esa fecha.</p>'
      : '<div class="overflow-y-auto" style="max-height:340px;"><table class="table"><thead class="table-header"><tr><th>FECHA / HORA</th><th>ÍTEMS</th><th>TOTAL TICKET</th><th></th></tr></thead><tbody>' +
        lista.map(function (t) {
          const imp = itemsImprimibles(t);
          const total = imp.reduce(function (s, i) { return s + i.price * (i.qty || 1); }, 0);
          return '<tr class="table-row"><td>' + NUCLEO.formatDateTime(t.fecha) + '</td><td>' + imp.length + '</td><td>' + NUCLEO.money(total) + '</td><td>' +
            (imp.length > 0 ? '<button class="btn btn-primary" onclick="window.CAJA.reimprimirTicket(' + NUCLEO.jsArg(t.id) + ')"><span class="material-symbols-outlined">print</span> IMPRIMIR</button>'
              : '<span class="font-body-sm text-on-surface-variant">Solo sub-caja / no fiscal</span>') + '</td></tr>';
        }).join('') + '</tbody></table></div>') +
    '<div class="flex justify-end" style="margin-top:var(--space-md);"><button class="btn btn-secondary" onclick="window.CAJA.cerrarModales()">Cerrar</button></div>',
    { ancho: 700 });
}

function reimprimirTicket(id) {
  const t = (NUCLEO.getData('pos_tickets_log') || []).find(function (x) { return x.id === id; });
  if (!t) { NUCLEO.toast('Ticket no encontrado', 'error'); return; }
  if (itemsImprimibles(t).length === 0) { NUCLEO.toast('Este ticket no tiene ítems imprimibles', 'warning'); return; }
  NUCLEO.printTicket(t);
}

// ==========================================
// 7. CIGARRILLOS: PAQUETES Y SUELTOS
// ==========================================
function marcasCig(soloSueltas) {
  return NUCLEO.getData('pos_products').filter(function (p) {
    return NUCLEO.esCategoriaCigarrillos(p.category) && p.active !== false && (!soloSueltas || p.ventaSuelta);
  });
}

function abrirModalPaquetes() {
  if (!cajaAbierta) return;
  const marcas = marcasCig(false);
  mostrarModal('<h3 class="font-headline-md mb-2">Agregar Paquete de Cigarrillos</h3>' +
    (marcas.length === 0 ? '<p class="font-body-md text-on-surface-variant">No hay productos de categoría "Cigarrillos" en INVENTARIO.</p>'
      : '<table class="table"><thead class="table-header"><tr><th>MARCA</th><th>DISPONIBLES</th><th>PRECIO</th><th></th></tr></thead><tbody>' +
        marcas.map(function (m) {
          const disp = disponible(m, 'paquete');
          return '<tr class="table-row"><td>' + esc(m.name) + '</td><td>' + disp + '</td><td>' + NUCLEO.money(m.price) + '</td>' +
            '<td><button class="btn btn-primary" ' + (disp <= 0 ? 'disabled' : '') + ' onclick="window.CAJA.agregarPaquete(' + NUCLEO.jsArg(m.code) + ')">AGREGAR</button></td></tr>';
        }).join('') + '</tbody></table>') +
    '<div class="flex justify-end" style="margin-top:var(--space-md);"><button class="btn btn-secondary" onclick="window.CAJA.cerrarModales()">Cerrar</button></div>', { ancho: 600 });
}

function agregarPaquete(code) {
  const p = productoPorCode(code);
  if (!p) return;
  agregarCigarrillo(p, 'paquete');
  abrirModalPaquetes();
}

function abrirModalSueltos() {
  if (!cajaAbierta) return;
  const marcas = marcasCig(true);
  mostrarModal('<h3 class="font-headline-md mb-2">Agregar Cigarrillos Sueltos</h3>' +
    (marcas.length === 0 ? '<p class="font-body-md text-on-surface-variant">No hay marcas habilitadas para venta suelta. Configurá en CONFIG · Sub-Cajas.</p>'
      : '<table class="table"><thead class="table-header"><tr><th>MARCA</th><th>SUELTOS DISP.</th><th>PRECIO SUELTO</th><th></th></tr></thead><tbody>' +
        marcas.map(function (m) {
          const sueltos = disponible(m, 'suelto');
          const precio = m.priceLoose || NUCLEO.roundCurrency(m.price / 20);
          const puedeAbrir = disponible(m, 'paquete') > 0;
          return '<tr class="table-row"><td>' + esc(m.name) + '</td><td>' + sueltos + '</td><td>' + NUCLEO.money(precio) + '</td><td>' +
            (sueltos > 0 ? '<button class="btn btn-primary" onclick="window.CAJA.agregarSuelto(' + NUCLEO.jsArg(m.code) + ')">AGREGAR</button>'
              : '<button class="btn btn-secondary" ' + (puedeAbrir ? '' : 'disabled') + ' onclick="window.CAJA.abrirPaqueteParaSueltos(' + NUCLEO.jsArg(m.code) + ')">ABRIR PAQUETE</button>') +
            '</td></tr>';
        }).join('') + '</tbody></table>') +
    '<div class="flex justify-end" style="margin-top:var(--space-md);"><button class="btn btn-secondary" onclick="window.CAJA.cerrarModales()">Cerrar</button></div>', { ancho: 600 });
}

function abrirPaqueteParaSueltos(code) {
  NUCLEO.abrirPaquete(code, null, userId_());
  abrirModalSueltos();
}

function agregarSuelto(code) {
  const p = productoPorCode(code);
  if (!p) return;
  agregarCigarrillo(p, 'suelto');
  abrirModalSueltos();
}

// ==========================================
// 8. EGRESOS / RETIROS DE CAJA
// ==========================================
function abrirModalMovimiento() {
  if (!cajaAbierta) return;
  mostrarModal(
    '<h3 class="font-headline-md mb-2">Egreso / Retiro de caja</h3>' +
    '<p class="font-body-sm text-on-surface-variant mb-4">Todo efectivo que entra o sale del cajón fuera de una venta debe registrarse acá para que el arqueo cuadre.</p>' +
    '<label class="font-label-md text-on-surface-variant" style="display:block;margin-bottom:var(--space-xs);">TIPO</label>' +
    '<select class="input" id="caja-mov-tipo" style="margin-bottom:var(--space-md);">' +
    '<option value="egreso">Egreso (pago a proveedor, repartidor, gasto)</option>' +
    '<option value="retiro">Retiro de excedente (se lleva el dueño)</option>' +
    '<option value="ingreso">Ingreso (cambio / aporte al cajón)</option></select>' +
    '<label class="font-label-md text-on-surface-variant" style="display:block;margin-bottom:var(--space-xs);">MONTO</label>' +
    '<input type="number" class="input" id="caja-mov-monto" step="0.01" min="0" style="margin-bottom:var(--space-md);">' +
    '<label class="font-label-md text-on-surface-variant" style="display:block;margin-bottom:var(--space-xs);">MOTIVO *</label>' +
    '<input type="text" class="input" id="caja-mov-motivo" placeholder="Ej: pago repartidor Coca-Cola">' +
    '<div class="flex gap-space-sm justify-end" style="margin-top:var(--space-lg);">' +
    '<button class="btn btn-secondary" onclick="window.CAJA.cerrarModales()">Cancelar</button>' +
    '<button class="btn btn-primary" onclick="window.CAJA.confirmarMovimiento()">REGISTRAR</button></div>', { ancho: 460 });
  const m = $id('caja-mov-monto');
  if (m) m.focus();
}

function confirmarMovimiento() {
  const ok = NUCLEO.registrarMovimientoCaja({
    tipo: $id('caja-mov-tipo').value,
    monto: parseFloat($id('caja-mov-monto').value),
    motivo: $id('caja-mov-motivo').value,
    userId: userId_()
  });
  if (ok) { cerrarModales(); NUCLEO.toast('Movimiento registrado', 'success'); }
}

// ==========================================
// 9. APERTURA Y CIERRE (arqueo doble, a ciegas)
// ==========================================
function abrirModalApertura() {
  mostrarModal(
    '<h3 class="font-headline-md mb-2">Apertura de Caja</h3>' +
    '<div style="margin-bottom:var(--space-lg);"><label class="font-label-md text-on-surface-variant" style="display:block;margin-bottom:var(--space-xs);">MONTO DE APERTURA</label>' +
    '<input type="number" class="input" id="caja-monto-apertura" step="0.01" placeholder="0.00"></div>' +
    '<div class="flex gap-space-sm justify-end"><button class="btn btn-secondary" onclick="window.CAJA.cerrarModales()">Cancelar</button>' +
    '<button class="btn btn-primary" onclick="window.CAJA.confirmarApertura()"><span class="material-symbols-outlined">lock_open</span> ABRIR CAJA</button></div>');
  const el = $id('caja-monto-apertura');
  if (el) {
    el.focus();
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); confirmarApertura(); } });
  }
}

function confirmarApertura() {
  const monto = parseFloat(($id('caja-monto-apertura') || {}).value);
  if (isNaN(monto) || monto < 0) { NUCLEO.toast('Ingresá un monto de apertura válido', 'error'); return; }
  if (!NUCLEO.iniciarCiclo(monto, userId_())) return;
  cerrarModales();
  NUCLEO.toast('Caja abierta', 'success');
}

function hayActividadSubCaja(ciclo) {
  return NUCLEO.getVentasDelCiclo(ciclo.id).some(function (v) { return v.esCigarrillo; }) || NUCLEO.cuadreSubCajaCiclo(ciclo.id).length > 0;
}

function calcularCuadre(ciclo, conteo) {
  const porMetodo = NUCLEO.getVentasPorMetodo(ciclo.id);
  const subTotal = NUCLEO.getVentasSubCajaDelCiclo(ciclo.id);
  const mov = NUCLEO.getResumenMovimientosCaja(ciclo.id);
  const esperado = NUCLEO.roundCents((ciclo.montoApertura || 0) + (porMetodo.cash || 0) - subTotal + mov.ingreso - mov.egreso - mov.retiro);
  const r = {
    montoContado: conteo.contado, montoEsperado: esperado, diferencia: NUCLEO.roundCents(conteo.contado - esperado),
    ventasPorMetodo: porMetodo, subCajaTotal: subTotal, movimientos: mov, subCaja: null, sueltos: []
  };
  if (conteo.subContado !== null) {
    r.subCaja = { contado: conteo.subContado, esperado: subTotal, diferencia: NUCLEO.roundCents(conteo.subContado - subTotal) };
  }
  NUCLEO.cuadreSubCajaCiclo(ciclo.id).forEach(function (c) {
    const cont = conteo.sueltos[c.code];
    if (cont === undefined || cont === null) return;
    r.sueltos.push({ code: c.code, marca: c.marca, esperados: c.esperados, contados: cont, diferencia: cont - c.esperados });
  });
  return r;
}

function abrirModalCierre() {
  const ciclo = NUCLEO.getCicloAbierto();
  if (!ciclo) { NUCLEO.toast('No hay ciclo abierto', 'error'); return; }
  if (carrito.length > 0) NUCLEO.toast('Hay ' + carrito.length + ' ítem(s) cargados en el ticket. Quedan en el carrito al cerrar.', 'warning');
  const conSub = hayActividadSubCaja(ciclo);
  const marcas = conSub ? NUCLEO.cuadreSubCajaCiclo(ciclo.id) : [];
  const bloqueado = conteoCierre && conteoCierre.cicloId === ciclo.id ? conteoCierre : null;
  const ro = bloqueado ? ' readonly' : '';
  const val = function (x) { return bloqueado && x !== null && x !== undefined ? ' value="' + esc(x) + '"' : ''; };

  mostrarModal(
    '<h3 class="font-headline-md mb-2">Cierre de Caja — Arqueo a Ciegas</h3>' +
    '<p class="font-body-sm text-on-surface-variant mb-4">Contá el efectivo e ingresá los montos. El sistema no muestra lo esperado hasta que confirmes el conteo' +
    (bloqueado ? ' (el conteo ya fue visto y quedó bloqueado).' : ', y una vez visto no se puede cambiar.') + '</p>' +
    '<div style="margin-bottom:var(--space-md);"><label class="font-label-md text-on-surface-variant" style="display:block;margin-bottom:var(--space-xs);">EFECTIVO CONTADO (CAJÓN PRINCIPAL)</label>' +
    '<input type="number" class="input" id="caja-monto-contado" step="0.01" placeholder="0.00"' + ro + val(bloqueado && bloqueado.contado) + '></div>' +
    (conSub ?
      '<div style="margin-bottom:var(--space-md);padding-top:var(--space-md);border-top:1px solid var(--color-outline-variant);">' +
      '<label class="font-label-md text-on-surface-variant" style="display:block;margin-bottom:var(--space-xs);">EFECTIVO CONTADO (SUB-CAJA CIGARRILLOS)</label>' +
      '<input type="number" class="input" id="caja-monto-subcaja" step="0.01" placeholder="0.00"' + ro + val(bloqueado && bloqueado.subContado) + '></div>' +
      (marcas.length ? '<p class="font-label-md text-on-surface-variant" style="margin-bottom:var(--space-xs);">CIGARRILLOS SUELTOS FÍSICOS (unidades)</p>' +
        marcas.map(function (m, i) {
          return '<div class="flex items-center gap-space-sm" style="margin-bottom:var(--space-xs);"><span style="flex:1;">' + esc(m.marca) + '</span>' +
            '<input type="number" class="input" style="max-width:110px;" min="0" id="caja-suelto-' + i + '" data-code="' + esc(m.code) + '"' + ro + val(bloqueado && bloqueado.sueltos[m.code]) + '></div>';
        }).join('') : '') : '') +
    '<div id="caja-cuadre-resultado"></div>' +
    '<div class="flex gap-space-sm justify-end" style="margin-top:var(--space-lg);" id="caja-cierre-acciones">' +
    '<button class="btn btn-secondary" onclick="window.CAJA.cerrarModales()">Cancelar</button>' +
    '<button class="btn btn-primary" onclick="window.CAJA.verCuadreCierre()">VER CUADRE</button></div>', { ancho: 520 });
  if (bloqueado) verCuadreCierre();
  else { const el = $id('caja-monto-contado'); if (el) el.focus(); }
}

function leerConteoCierre(ciclo) {
  const contado = parseFloat(($id('caja-monto-contado') || {}).value);
  if (isNaN(contado) || contado < 0) { NUCLEO.toast('Ingresá el efectivo contado del cajón principal', 'error'); return null; }
  const conteo = { cicloId: ciclo.id, contado: contado, subContado: null, sueltos: {} };
  const sub = $id('caja-monto-subcaja');
  if (sub) {
    const n = parseFloat(sub.value);
    if (isNaN(n) || n < 0) { NUCLEO.toast('Ingresá el efectivo contado de la sub-caja (0 si no hay)', 'error'); return null; }
    conteo.subContado = n;
  }
  const inputs = document.querySelectorAll('[id^="caja-suelto-"]');
  for (let i = 0; i < inputs.length; i++) {
    const n = parseFloat(inputs[i].value);
    if (isNaN(n) || n < 0) { NUCLEO.toast('Ingresá los sueltos físicos de cada marca (0 si no hay)', 'error'); return null; }
    conteo.sueltos[inputs[i].getAttribute('data-code')] = n;
  }
  return conteo;
}

function verCuadreCierre() {
  const ciclo = NUCLEO.getCicloAbierto();
  if (!ciclo) return;
  const conteo = (conteoCierre && conteoCierre.cicloId === ciclo.id) ? conteoCierre : leerConteoCierre(ciclo);
  if (!conteo) return;
  conteoCierre = conteo; // desde acá el conteo queda comprometido
  const c = calcularCuadre(ciclo, conteo);
  const perdida = NUCLEO.getVentasEnPerdida(ciclo.id);
  const signo = function (d) { return d < 0 ? ' (FALTANTE)' : (d > 0 ? ' (SOBRANTE)' : ' (EXACTO)'); };
  const fila = function (txt, d) { return '<span class="font-headline-sm ' + (d < 0 ? 'text-error' : '') + '">' + txt + ': ' + NUCLEO.money(d) + signo(d) + '</span>'; };
  let html = '<div class="caja-total-display">' +
    '<span class="font-label-md text-on-surface-variant">CAJÓN PRINCIPAL</span>' +
    '<span class="font-body-sm text-on-surface-variant">Esperado: ' + NUCLEO.money(c.montoEsperado) + ' · Contado: ' + NUCLEO.money(c.montoContado) + '</span>' +
    fila('Diferencia', c.diferencia);
  if (c.movimientos.egreso || c.movimientos.retiro || c.movimientos.ingreso) {
    html += '<span class="font-body-sm text-on-surface-variant">Movimientos: +' + NUCLEO.money(c.movimientos.ingreso) + ' / −' + NUCLEO.money(c.movimientos.egreso) + ' egresos / −' + NUCLEO.money(c.movimientos.retiro) + ' retiros</span>';
  }
  if (c.subCaja) {
    html += '<span class="font-label-md text-on-surface-variant" style="margin-top:var(--space-sm);">SUB-CAJA CIGARRILLOS</span>' +
      '<span class="font-body-sm text-on-surface-variant">Esperado: ' + NUCLEO.money(c.subCaja.esperado) + ' · Contado: ' + NUCLEO.money(c.subCaja.contado) + '</span>' + fila('Diferencia', c.subCaja.diferencia);
  }
  c.sueltos.forEach(function (s) {
    html += '<span class="font-body-sm ' + (s.diferencia ? 'text-error' : 'text-on-surface-variant') + '">' + esc(s.marca) + ' sueltos: esperados ' + s.esperados + ' · contados ' + s.contados + (s.diferencia ? ' (' + (s.diferencia > 0 ? '+' : '') + s.diferencia + ')' : '') + '</span>';
  });
  if (perdida.length > 0) html += '<span class="font-body-sm text-error" style="margin-top:var(--space-xs);">⚠ ' + perdida.length + ' venta(s) en pérdida este ciclo</span>';
  html += '</div>';

  const res = $id('caja-cuadre-resultado');
  if (res) res.innerHTML = html;
  document.querySelectorAll('#caja-monto-contado, #caja-monto-subcaja, [id^="caja-suelto-"]').forEach(function (i) { i.readOnly = true; });
  const acc = $id('caja-cierre-acciones');
  if (acc) acc.innerHTML = '<button class="btn btn-secondary" onclick="window.CAJA.cerrarModales()">Cancelar</button>' +
    '<button class="btn btn-primary" onclick="window.CAJA.confirmarCierre()"><span class="material-symbols-outlined">lock</span> CONFIRMAR CIERRE</button>';
}

function confirmarCierre() {
  const ciclo = NUCLEO.getCicloAbierto();
  if (!ciclo || !conteoCierre || conteoCierre.cicloId !== ciclo.id) return;
  const c = calcularCuadre(ciclo, conteoCierre);
  const ventas = NUCLEO.getVentasDelCiclo(ciclo.id);
  const ventasTotal = ventas.filter(function (v) { return !v.esCigarrillo; }).reduce(function (s, v) { return s + (v.total || 0); }, 0);
  const detalleMap = {};
  let otrosMedios = 0;
  ventas.filter(function (v) { return v.esCigarrillo; }).forEach(function (v) {
    const cash = NUCLEO.pagosDeVenta(v).filter(function (p) { return p.method === 'cash'; }).reduce(function (s, p) { return s + (p.monto || 0); }, 0);
    otrosMedios += (v.total || 0) - cash;
    if (cash <= 0) return;
    const it = (v.items || [])[0] || {};
    const key = (it.name || '?') + '|' + (v.tipo || '');
    if (!detalleMap[key]) detalleMap[key] = { name: it.name || '?', tipo: v.tipo || '', qty: 0, total: 0 };
    detalleMap[key].qty += (it.qty || 1) * (cash / (v.total || cash));
    detalleMap[key].total += cash;
  });
  const datos = {
    montoContado: c.montoContado, montoEsperado: c.montoEsperado, diferencia: c.diferencia,
    ventasPorMetodo: c.ventasPorMetodo, ventasTotal: NUCLEO.roundCents(ventasTotal),
    movimientos: c.movimientos,
    subCajaTotal: c.subCajaTotal, subCaja: c.subCaja, sueltos: c.sueltos,
    subCajaDetalle: Object.keys(detalleMap).map(function (k) { const d = detalleMap[k]; return { name: d.name, tipo: d.tipo, qty: Math.round(d.qty * 100) / 100, total: NUCLEO.roundCents(d.total) }; }),
    subCajaOtrosMedios: NUCLEO.roundCents(otrosMedios),
    userId: userId_()
  };
  if (!NUCLEO.finalizarCiclo(datos)) return;
  conteoCierre = null;
  cerrarModales();
  NUCLEO.toast('Caja cerrada', 'success');
  abrirModalImprimirCierre(ciclo.id);
  if (NUCLEO.shouldRemindBackup()) setTimeout(function () { NUCLEO.toast('Hace 3 días o más sin backup. Hacelo desde CONFIG → Periféricos.', 'warning'); }, 3500);
}

function abrirModalImprimirCierre(cierreId) {
  const subcajas = NUCLEO.getData('pos_subcajas') || {};
  mostrarModal(
    '<h3 class="font-headline-md mb-2">Caja cerrada</h3>' +
    '<p class="font-body-sm text-on-surface-variant mb-4">¿Qué tickets querés imprimir? Si falla la impresión o lo necesitás otro día, podés reimprimirlos desde el estado de caja (arriba a la derecha).</p>' +
    '<label style="display:flex;align-items:center;gap:var(--space-sm);margin-bottom:var(--space-sm);cursor:pointer;"><input type="checkbox" id="caja-print-general" checked> <span>Ticket General (total de ventas + arqueo)</span></label>' +
    '<label style="display:flex;align-items:center;gap:var(--space-sm);margin-bottom:var(--space-lg);cursor:pointer;"><input type="checkbox" id="caja-print-subcaja" ' + (subcajas.printSubCajaTicketOnClose ? 'checked' : '') + '> <span>Ticket Sub-Caja Cigarrillos</span></label>' +
    '<div class="flex gap-space-sm justify-end"><button class="btn btn-secondary" onclick="window.CAJA.cerrarModales()">NO IMPRIMIR</button>' +
    '<button class="btn btn-primary" onclick="window.CAJA.imprimirCierreSeleccion(' + NUCLEO.jsArg(cierreId) + ')"><span class="material-symbols-outlined">print</span> IMPRIMIR</button></div>',
    { ancho: 440, fijo: true });
}

function imprimirCierreSeleccion(cierreId) {
  const g = $id('caja-print-general');
  const s = $id('caja-print-subcaja');
  const cierre = buscarCierre(cierreId);
  if (!cierre) return;
  const imprimirG = g && g.checked;
  const imprimirS = s && s.checked;
  cerrarModales();
  if (imprimirG) imprimirTicketCierreGeneral(cierre);
  if (imprimirS) imprimirTicketSubCaja(cierre);
}

function abrirModalVerCierres(fecha) {
  if (typeof fecha !== 'string') fecha = NUCLEO.today();
  const cierres = (NUCLEO.getData('pos_cierres') || []).filter(function (c) { return !fecha || NUCLEO.localDateOf(c.fechaCierre) === fecha; }).slice().reverse().slice(0, 100);
  mostrarModal(
    '<h3 class="font-headline-md mb-2">Cierres de Caja</h3>' +
    '<div class="flex gap-space-sm items-center" style="margin-bottom:var(--space-md);"><label class="font-label-md text-on-surface-variant">FECHA</label>' +
    '<input type="date" class="input" style="max-width:180px;" value="' + esc(fecha) + '" onchange="window.CAJA.abrirModalVerCierres(this.value)">' +
    '<button class="btn btn-secondary" onclick="window.CAJA.abrirModalVerCierres(\'\')">VER TODOS</button></div>' +
    (cierres.length === 0 ? '<p class="font-body-md text-on-surface-variant">No hay cierres en esa fecha.</p>'
      : '<div class="overflow-y-auto" style="max-height:340px;"><table class="table"><thead class="table-header"><tr><th>FECHA / HORA</th><th>CAJERO</th><th>CONTADO</th><th>DIFERENCIA</th><th>REIMPRIMIR</th></tr></thead><tbody>' +
        cierres.map(function (c) {
          const d = c.diferencia || 0;
          return '<tr class="table-row"><td>' + NUCLEO.formatDateTime(c.fechaCierre) + '</td><td>' + esc(nombreUsuario(c.userId)) + '</td><td>' + NUCLEO.money(c.montoContado || 0) + '</td>' +
            '<td class="' + (d < 0 ? 'text-error' : '') + '">' + NUCLEO.money(d) + '</td><td>' +
            '<button class="btn btn-secondary" onclick="window.CAJA.reimprimirCierreGeneral(' + NUCLEO.jsArg(c.id) + ')">GENERAL</button> ' +
            '<button class="btn btn-secondary" onclick="window.CAJA.reimprimirCierreSubCaja(' + NUCLEO.jsArg(c.id) + ')">SUB-CAJA</button></td></tr>';
        }).join('') + '</tbody></table></div>') +
    '<div class="flex justify-end" style="margin-top:var(--space-md);"><button class="btn btn-secondary" onclick="window.CAJA.cerrarModales()">Cerrar</button></div>', { ancho: 800 });
}

function buscarCierre(id) {
  const c = (NUCLEO.getData('pos_cierres') || []).find(function (x) { return x.id === id; });
  if (!c) NUCLEO.toast('Cierre no encontrado', 'error');
  return c;
}
function reimprimirCierreGeneral(id) { const c = buscarCierre(id); if (c) imprimirTicketCierreGeneral(c); }
function reimprimirCierreSubCaja(id) { const c = buscarCierre(id); if (c) imprimirTicketSubCaja(c); }

// Ticket General: SOLO cajón principal. No menciona la sub-caja.
function imprimirTicketCierreGeneral(cierre) {
  const business = NUCLEO.getData('pos_business') || {};
  const m = cierre.movimientos || {};
  const totalVentas = cierre.ventasTotal != null ? cierre.ventasTotal
    : Math.max(0, Object.keys(cierre.ventasPorMetodo || {}).reduce(function (s, k) { return s + cierre.ventasPorMetodo[k]; }, 0) - (cierre.subCajaTotal || 0));
  let html = '<div style="font-family:monospace;font-size:12px;padding:6px;">';
  html += '<h3>' + esc(business.razonSocial || 'NEURORA POS') + '</h3><p><strong>CIERRE DE CAJA</strong></p><hr>';
  html += '<p>Apertura: ' + esc(NUCLEO.formatDateTime(cierre.fechaApertura)) + '</p>';
  html += '<p>Cierre: ' + esc(NUCLEO.formatDateTime(cierre.fechaCierre)) + '</p>';
  html += '<p>Cajero: ' + esc(nombreUsuario(cierre.userId)) + '</p><hr>';
  html += '<p><strong>TOTAL VENTAS: ' + esc(NUCLEO.money(totalVentas)) + '</strong></p><hr>';
  html += '<p>Monto Apertura: ' + esc(NUCLEO.money(cierre.montoApertura || 0)) + '</p>';
  if (m.ingreso) html += '<p>Ingresos: ' + esc(NUCLEO.money(m.ingreso)) + '</p>';
  if (m.egreso) html += '<p>Egresos: ' + esc(NUCLEO.money(m.egreso)) + '</p>';
  if (m.retiro) html += '<p>Retiros: ' + esc(NUCLEO.money(m.retiro)) + '</p>';
  html += '<p>Efectivo Contado: ' + esc(NUCLEO.money(cierre.montoContado || 0)) + '</p>';
  html += '<p><strong>Diferencia: ' + esc(NUCLEO.money(cierre.diferencia || 0)) + '</strong></p></div>';
  NUCLEO.imprimirHTML(html);
}

function imprimirTicketSubCaja(cierre) {
  let html = '<div style="font-family:monospace;font-size:12px;padding:6px;">';
  html += '<h3>SUB-CAJA CIGARRILLOS</h3><p>Cierre: ' + esc(NUCLEO.formatDateTime(cierre.fechaCierre)) + '</p><p>Cajero: ' + esc(nombreUsuario(cierre.userId)) + '</p><hr>';
  const det = cierre.subCajaDetalle || [];
  if (det.length === 0) html += '<p>Sin ventas de cigarrillos en efectivo.</p>';
  det.forEach(function (d) { html += '<p>' + esc(d.name) + ' x' + d.qty + ' = ' + esc(NUCLEO.money(d.total)) + '</p>'; });
  html += '<hr><p><strong>TOTAL SUB-CAJA (efectivo): ' + esc(NUCLEO.money(cierre.subCajaTotal || 0)) + '</strong></p>';
  if (cierre.subCaja) html += '<p>Contado: ' + esc(NUCLEO.money(cierre.subCaja.contado)) + '</p><p><strong>Diferencia: ' + esc(NUCLEO.money(cierre.subCaja.diferencia)) + '</strong></p>';
  (cierre.sueltos || []).forEach(function (s) { html += '<p>' + esc(s.marca) + ' sueltos: esp ' + s.esperados + ' / cont ' + s.contados + '</p>'; });
  if (cierre.subCajaOtrosMedios) html += '<p>Cigarrillos cobrados por otros medios: ' + esc(NUCLEO.money(cierre.subCajaOtrosMedios)) + '</p>';
  html += '</div>';
  NUCLEO.imprimirHTML(html);
}

window.CAJA = {
  boot: boot, init: init, onShow: onShow, onHide: onHide, onEscape: onEscape, onKey: onKey,
  addQuickButton: addQuickButton, updateQty: updateQty, removeItem: removeItem,
  handleCobrarClick: handleCobrarClick, setMetodoPago: setMetodoPago, setRecibido: setRecibido, actualizarVuelto: actualizarVuelto,
  confirmarCobro: confirmarCobro, imprimirPostCobro: imprimirPostCobro, nuevaVentaPostCobro: nuevaVentaPostCobro,
  abrirModalBusqueda: abrirModalBusqueda, filtrarBusqueda: filtrarBusqueda, agregarDesdeBusqueda: agregarDesdeBusqueda,
  abrirModalReimprimir: abrirModalReimprimir, reimprimirTicket: reimprimirTicket,
  abrirModalPaquetes: abrirModalPaquetes, agregarPaquete: agregarPaquete,
  abrirModalSueltos: abrirModalSueltos, abrirPaqueteParaSueltos: abrirPaqueteParaSueltos, agregarSuelto: agregarSuelto,
  abrirModalMovimiento: abrirModalMovimiento, confirmarMovimiento: confirmarMovimiento,
  confirmarApertura: confirmarApertura, verCuadreCierre: verCuadreCierre, confirmarCierre: confirmarCierre,
  imprimirCierreSeleccion: imprimirCierreSeleccion, abrirModalVerCierres: abrirModalVerCierres,
  reimprimirCierreGeneral: reimprimirCierreGeneral, reimprimirCierreSubCaja: reimprimirCierreSubCaja,
  cerrarModales: cerrarModales,
  _estado: function () { return { carrito: carrito, cajaAbierta: cajaAbierta }; }
};
})();
