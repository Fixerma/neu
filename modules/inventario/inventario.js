/* ============================================
NEURORA POS - INVENTARIO (ANEXO B)
Módulo de gestión de stock y precios
============================================ */
(function () {
'use strict';
// Estado local
let productos = [];
let categorias = [];
let productoSeleccionado = null;
let filtroActivo = 'TODOS';
let busqueda = ''; // <-- NUEVO: Estado de búsqueda
let movimientosVisibles = false;
let csvPendingImport = null;
let listenersAttached = false;

// ==========================================
// 1. INICIALIZACIÓN
// ==========================================
function init() {
  cargarDatos();
  render();
  crearContenedorModales();
  if (listenersAttached) return;
  listenersAttached = true;
  
  document.addEventListener('keydown', function (e) {
    if (e.key === 'F4' && productoSeleccionado) {
      e.preventDefault();
      guardarProducto();
    } else if (e.key === 'Escape') {
      // <-- NUEVO: ESC borra la búsqueda antes de volver a CAJA
      const activo = document.activeElement;
      if (activo && activo.id === 'inv-search-input' && busqueda) {
        e.preventDefault(); e.stopPropagation();
        setBusqueda('');
        return;
      }
      const modales = document.getElementById('inv-modales-container');
      if (modales && modales.innerHTML.trim() !== '') {
        e.preventDefault();
        e.stopPropagation();
        csvPendingImport = null;
        modales.innerHTML = '';
        return;
      }
      e.preventDefault();
      NUCLEO.showTab('caja');
    }
  }, true);
}

function onShow() {
  cargarDatos();
  render();
}

function cargarDatos() {
  productos = NUCLEO.getData('pos_products');
  categorias = NUCLEO.getData('pos_categories');
}

// ==========================================
// 2. RENDERIZADO
// ==========================================
function render() {
  const container = document.getElementById('moduleContainer');
  if (!container) return;
  const productosFiltrados = aplicarFiltro();
  const conteos = calcularConteos();
  
  container.innerHTML = `
    <div class="inv-layout">
      <div class="inv-col-left">
        <div class="inv-header">
          <div class="inv-header-title">
            <h2 class="font-headline-md">Inventario</h2>
            <div class="inv-table-actions">
              <button class="btn btn-secondary" onclick="window.INVENTARIO.importarCSV()">
                <span class="material-symbols-outlined" style="font-size:18px;">upload</span> IMPORTAR CSV
              </button>
              <button class="btn btn-secondary" onclick="window.INVENTARIO.exportarCSV()">
                <span class="material-symbols-outlined" style="font-size:18px;">download</span> EXPORTAR CSV
              </button>
              <button class="btn btn-primary" onclick="window.INVENTARIO.nuevoProducto()">
                <span class="material-symbols-outlined" style="font-size:18px;">add</span> NUEVO
              </button>
            </div>
          </div>
          
          <!-- NUEVO: Buscador -->
          <div class="inv-search">
            <span class="material-symbols-outlined">search</span>
            <input type="text" id="inv-search-input" class="inv-search-input"
                   placeholder="Buscar por código, nombre o categoría..."
                   oninput="window.INVENTARIO.setBusqueda(this.value)"
                   onkeydown="window.INVENTARIO.searchKeydown(event)">
            ${busqueda ? '<button class="inv-search-clear" onclick="window.INVENTARIO.setBusqueda(\'\')"><span class="material-symbols-outlined">close</span></button>' : ''}
          </div>

          <div class="inv-chips">
            <button class="inv-chip ${filtroActivo === 'TODOS' ? 'active' : ''}" onclick="window.INVENTARIO.setFiltro('TODOS')">TODOS ${conteos.todos}</button>
            <button class="inv-chip ${filtroActivo === 'VENCIDOS' ? 'active' : ''}" onclick="window.INVENTARIO.setFiltro('VENCIDOS')">VENCIDOS ${conteos.vencidos}</button>
            <button class="inv-chip ${filtroActivo === 'POR VENCER' ? 'active' : ''}" onclick="window.INVENTARIO.setFiltro('POR VENCER')">POR VENCER ${conteos.porVencer}</button>
            <button class="inv-chip ${filtroActivo === 'FALTANTES' ? 'active' : ''}" onclick="window.INVENTARIO.setFiltro('FALTANTES')">FALTANTES ${conteos.faltantes}</button>
            <button class="inv-chip ${filtroActivo === 'AGOTADOS' ? 'active' : ''}" onclick="window.INVENTARIO.setFiltro('AGOTADOS')">AGOTADOS ${conteos.agotados}</button>
            <button class="inv-chip ${filtroActivo === 'NO FISCAL' ? 'active' : ''}" onclick="window.INVENTARIO.setFiltro('NO FISCAL')">NO FISCAL ${conteos.noFiscal}</button>
            <button class="inv-chip ${filtroActivo === 'SUELTO' ? 'active' : ''}" onclick="window.INVENTARIO.setFiltro('SUELTO')">SUELTO ${conteos.suelto}</button>
            <button class="inv-chip ${filtroActivo === 'INACTIVOS' ? 'active' : ''}" onclick="window.INVENTARIO.setFiltro('INACTIVOS')">INACTIVOS ${conteos.inactivos}</button>
          </div>
        </div>
        
        <div class="inv-table-container">
          <table class="inv-table">
            <thead>
              <tr><th>CÓDIGO</th><th>NOMBRE</th><th>PRECIO</th><th>STOCK</th><th>ESTADO</th></tr>
            </thead>
            <tbody>
              ${productosFiltrados.map(p => `
                <tr class="${productoSeleccionado && productoSeleccionado.code === p.code ? 'inv-row-selected' : ''}" 
                    onclick="window.INVENTARIO.seleccionarProducto('${p.code}')">
                  <td class="font-mono">${NUCLEO.esc(p.code)}</td>
                  <td>
                    <div class="font-semibold">${NUCLEO.esc(p.name)}</div>
                    <div class="font-body-sm text-on-surface-variant">${NUCLEO.esc(p.category || 'Sin categoría')}</div>
                  </td>
                  <td class="font-numeric-tape">${NUCLEO.money(p.price)}</td>
                  <td class="font-numeric-tape">${p.stock || 0}</td>
                  <td>${renderBadgeEstado(p)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        
        <div class="inv-table-footer">
          <span>Mostrando ${productosFiltrados.length} de ${productos.length} productos</span>
          <span class="font-label-sm">[F4] Guardar [ESC] Volver a CAJA</span>
        </div>
      </div>
      
      <div class="inv-col-right">
        ${productoSeleccionado ? renderPanelDetalle() : renderPanelVacio()}
      </div>
    </div>
  `;
  
  // <-- NUEVO: Restaurar el texto del buscador después del render
  const searchEl = document.getElementById('inv-search-input');
  if (searchEl) searchEl.value = busqueda;
}

function renderBadgeEstado(producto) {
  const badges = [];
  if (producto.active === false) badges.push('<span class="inv-badge inv-badge-agot">INACTIVO</span>');
  if (producto.stock === 0) {
    badges.push('<span class="inv-badge inv-badge-agot">AGOT</span>');
  } else if (producto.minStock && producto.stock <= producto.minStock) {
    badges.push('<span class="inv-badge inv-badge-crit">CRIT</span>');
  }
  if (producto.expiryDate) {
    const hoy = new Date();
    const vencimiento = new Date(producto.expiryDate);
    const dias = Math.ceil((vencimiento - hoy) / (1000 * 60 * 60 * 24));
    if (dias < 0) {
      badges.push('<span class="inv-badge inv-badge-vencido">VENCIDO</span>');
    } else if (dias <= (producto.expiryWarnDays || 7)) {
      badges.push(`<span class="inv-badge inv-badge-vence">VENCE ${formatDate(producto.expiryDate)}</span>`);
    }
  }
  if (producto.ventaSuelta) {
    const sueltos = producto[`sueltos_${producto.code}`] || 0;
    badges.push(`<span class="inv-badge inv-badge-suelto">SUELTO ${sueltos}</span>`);
  }
  return badges.length > 0 ? badges.join(' ') : '<span class="material-symbols-outlined text-tertiary-fixed-dim" style="font-size:18px;">check_circle</span>';
}

function renderPanelVacio() {
  return `<div class="inv-detail-panel" style="display:flex;align-items:center;justify-content:center;height:100%;text-align:center;color:var(--color-on-surface-variant);"> <div> <span class="material-symbols-outlined" style="font-size:48px;margin-bottom:var(--space-md);">inventory_2</span> <p class="font-body-md">Selecciona un producto para ver el detalle</p> </div> </div>`;
}

function renderPanelDetalle() {
  const p = productoSeleccionado;
  const margin = p.cost > 0 ? ((p.price - p.cost) / p.cost) * 100 : 0;
  const gananciaNeta = p.price - p.cost;
  const checkLoss = NUCLEO.checkLoss(p.price, p.cost, p.category);
  const inactivo = p.active === false;
  return `
    <div class="inv-detail-panel">
      <div class="inv-detail-header">
        <span class="material-symbols-outlined text-primary">edit</span>
        <div>
          <div class="font-headline-sm">Detalle de Producto ${inactivo ? '<span class="badge badge-neutral">INACTIVO</span>' : ''}</div>
          <div class="font-body-sm text-on-surface-variant">Código: ${NUCLEO.esc(p.code)}</div>
        </div>
      </div>
      <div class="inv-detail-section">
        <div class="inv-form-group">
          <label class="inv-form-label">NOMBRE COMERCIAL</label>
          <input type="text" class="inv-form-input" id="inv-nombre" value="${NUCLEO.esc(p.name)}">
        </div>
        <div class="inv-form-group">
          <label class="inv-form-label">CATEGORÍA</label>
          <select class="inv-form-select" id="inv-categoria">
            <option value="" ${!p.category ? 'selected' : ''}>Sin categoría</option>
            ${categorias.map(c => `<option value="${NUCLEO.esc(c)}" ${c === p.category ? 'selected' : ''}>${NUCLEO.esc(c)}</option>`).join('')}
          </select>
        </div>
        <div class="inv-form-group">
          <label class="inv-form-label">COSTO ($)</label>
          <input type="number" class="inv-form-input" id="inv-costo" value="${p.cost || 0}" step="0.01" oninput="window.INVENTARIO.recalcularMargin()">
        </div>
        <div class="inv-form-group">
          <label class="inv-form-label">MARGEN (%)</label>
          <input type="number" class="inv-form-input" id="inv-margen" value="${margin.toFixed(2)}" step="0.01" oninput="window.INVENTARIO.recalcularPrecio()">
        </div>
        <div class="inv-form-group">
          <label class="inv-form-label">P. VENTA AL PÚBLICO</label>
          <input type="number" class="inv-form-input" id="inv-precio" value="${p.price}" step="0.01" oninput="window.INVENTARIO.recalcularMargin()">
        </div>
        <div id="inv-loss-badges">
          ${checkLoss.isLoss ? '<div class="inv-badge inv-badge-vencido" style="margin-top:var(--space-sm);">PÉRDIDA</div>' : ''}
          ${checkLoss.isLowMargin ? '<div class="inv-badge inv-badge-vence" style="margin-top:var(--space-sm);">MARGEN BAJO</div>' : ''}
        </div>
        <div class="inv-ganancia-neta ${gananciaNeta >= 0 ? 'positive' : 'negative'}" id="inv-ganancia-neta-box">
          <span class="material-symbols-outlined">trending_up</span>
          <div>
            <div class="font-label-sm">Ganancia Neta</div>
            <div class="font-numeric-tape font-bold" id="inv-ganancia-neta-valor">${NUCLEO.money(gananciaNeta)} (${margin.toFixed(2)}%)</div>
          </div>
        </div>
      </div>
      <div class="inv-detail-section">
        <div class="inv-detail-section-title">STOCK DISPONIBLE</div>
        <div class="font-numeric-display text-primary">${p.stock || 0} UNID.</div>
        <div class="inv-stock-controls">
          <button class="inv-stock-btn" onclick="window.INVENTARIO.actualizarStock(1)">+1</button>
          <button class="inv-stock-btn" onclick="window.INVENTARIO.actualizarStock(5)">+5</button>
          <button class="inv-stock-btn" onclick="window.INVENTARIO.actualizarStock(10)">+10</button>
        </div>
        <div class="inv-form-group" style="margin-top:var(--space-md);">
          <label class="inv-form-label">STOCK MÍNIMO</label>
          <input type="number" class="inv-form-input" id="inv-minstock" value="${p.minStock || 0}">
        </div>
      </div>
      <div class="inv-detail-section">
        <div class="inv-detail-section-title">VENCIMIENTO</div>
        <div class="inv-form-group">
          <input type="date" class="inv-form-input" id="inv-expiry" value="${p.expiryDate || ''}">
        </div>
        <div class="inv-form-group">
          <label class="inv-form-label">AVISO DÍAS ANTES</label>
          <input type="number" class="inv-form-input" id="inv-expirywarn" value="${p.expiryWarnDays || 7}">
        </div>
      </div>
      <div class="inv-detail-section">
        <div class="inv-detail-section-title">RÉGIMEN</div>
        <label style="display:flex;align-items:center;gap:var(--space-sm);cursor:pointer;">
          <input type="checkbox" id="inv-nofiscal" ${p.noFiscal ? 'checked' : ''}>
          <span class="font-body-md">NO FISCAL - Excluir de controladores fiscales AFIP</span>
        </label>
      </div>
      <div class="inv-movimientos">
        <div class="inv-movimientos-header" onclick="window.INVENTARIO.toggleMovimientos()">
          <span class="font-label-md font-semibold">📋 Últimos Movimientos</span>
          <span class="material-symbols-outlined">${movimientosVisibles ? 'expand_less' : 'expand_more'}</span>
        </div>
        ${movimientosVisibles ? renderMovimientos() : ''}
      </div>
      <div class="inv-actions">
        <button class="btn btn-primary" onclick="window.INVENTARIO.guardarProducto()">
          <span class="material-symbols-outlined" style="font-size:18px;">save</span> ACTUALIZAR
        </button>
        <button class="btn btn-secondary" onclick="window.INVENTARIO.limpiarSeleccion()">
          <span class="material-symbols-outlined" style="font-size:18px;">backspace</span> LIMPIAR
        </button>
        <button class="btn btn-secondary" onclick="window.INVENTARIO.nuevoProducto()">
          <span class="material-symbols-outlined" style="font-size:18px;">add_circle</span> NUEVO
        </button>
        ${inactivo
          ? `<button class="btn btn-primary" onclick="window.INVENTARIO.altaProducto()">
              <span class="material-symbols-outlined" style="font-size:18px;">restore</span> REACTIVAR
            </button>`
          : `<button class="btn btn-danger" onclick="window.INVENTARIO.bajaProducto()">
              <span class="material-symbols-outlined" style="font-size:18px;">delete</span> BAJA
            </button>`
        }
      </div>
    </div>
  `;
}

function renderMovimientos() {
  const movimientos = NUCLEO.getData('pos_stock_movements')
    .filter(m => m.code === productoSeleccionado.code)
    .slice(-10)
    .reverse();
  if (movimientos.length === 0) return '<p class="font-body-sm text-on-surface-variant">Sin movimientos registrados</p>';
  return `
    <table class="inv-movimientos-table">
      <thead><tr><th>FECHA</th><th>TIPO</th><th>DELTA</th><th>USUARIO</th></tr></thead>
      <tbody>
        ${movimientos.map(m => `
          <tr>
            <td>${formatDateTime(m.fecha)}</td>
            <td>${m.motivo}</td>
            <td class="${m.delta > 0 ? 'text-tertiary-fixed-dim' : 'text-error'} font-semibold">${m.delta > 0 ? '+' : ''}${m.delta}</td>
            <td>${m.userId || 'Sistema'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// ==========================================
// 3. ACCIONES
// ==========================================
function setFiltro(filtro) {
  filtroActivo = filtro;
  render();
}

// <-- NUEVAS FUNCIONES DE BÚSQUEDA
function setBusqueda(valor) {
  busqueda = valor || '';
  render();
  const el = document.getElementById('inv-search-input');
  if (el) { el.focus(); el.setSelectionRange(busqueda.length, busqueda.length); }
}

function searchKeydown(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const q = busqueda.trim();
  const lista = aplicarFiltro();
  const elegido = lista.find(p => p.code === q) || (lista.length === 1 ? lista[0] : null);
  if (elegido) seleccionarProducto(elegido.code);
}

function seleccionarProducto(code) {
  productoSeleccionado = productos.find(p => p.code === code);
  movimientosVisibles = false;
  render();
}

function toggleMovimientos() {
  movimientosVisibles = !movimientosVisibles;
  render();
}

function recalcularMargin() {
  const costo = parseFloat(document.getElementById('inv-costo').value) || 0;
  const precio = parseFloat(document.getElementById('inv-precio').value) || 0;
  const margin = costo > 0 ? ((precio - costo) / costo) * 100 : 0;
  document.getElementById('inv-margen').value = margin.toFixed(2);
  actualizarIndicadoresEnVivo();
}

function recalcularPrecio() {
  const costo = parseFloat(document.getElementById('inv-costo').value) || 0;
  const margin = parseFloat(document.getElementById('inv-margen').value) || 0;
  const precio = NUCLEO.roundCurrency(costo * (1 + margin / 100));
  document.getElementById('inv-precio').value = precio;
  actualizarIndicadoresEnVivo();
}

function actualizarIndicadoresEnVivo() {
  if (!productoSeleccionado) return;
  const costoInput = document.getElementById('inv-costo');
  const precioInput = document.getElementById('inv-precio');
  if (!costoInput || !precioInput) return;
  const costo = parseFloat(costoInput.value) || 0;
  const precio = parseFloat(precioInput.value) || 0;
  const gananciaNeta = precio - costo;
  const margin = costo > 0 ? ((precio - costo) / costo) * 100 : 0;
  const resultadoLoss = NUCLEO.checkLoss(precio, costo, productoSeleccionado.category);
  
  const valorEl = document.getElementById('inv-ganancia-neta-valor');
  if (valorEl) valorEl.textContent = NUCLEO.money(gananciaNeta) + ' (' + margin.toFixed(2) + '%)';
  
  const boxEl = document.getElementById('inv-ganancia-neta-box');
  if (boxEl) boxEl.className = 'inv-ganancia-neta ' + (gananciaNeta >= 0 ? 'positive' : 'negative');
  
  const badgesEl = document.getElementById('inv-loss-badges');
  if (badgesEl) {
    let html = '';
    if (resultadoLoss.isLoss) html += '<div class="inv-badge inv-badge-vencido" style="margin-top:var(--space-sm);">PÉRDIDA</div>';
    if (resultadoLoss.isLowMargin) html += '<div class="inv-badge inv-badge-vence" style="margin-top:var(--space-sm);">MARGEN BAJO</div>';
    badgesEl.innerHTML = html;
  }
}

function actualizarStock(delta) {
  if (!productoSeleccionado) return;
  const userId = (NUCLEO.getUsuarioActivo() || {}).id || null;
  const success = NUCLEO.actualizarStock(productoSeleccionado.code, delta, 'ajuste', userId);
  if (success) {
    cargarDatos();
    productoSeleccionado = productos.find(p => p.code === productoSeleccionado.code);
    render();
    NUCLEO.toast(`Stock actualizado: ${delta > 0 ? '+' : ''}${delta}`, 'success');
  }
}

function guardarProducto() {
  if (!productoSeleccionado) return;
  const nombre = NUCLEO.normText(document.getElementById('inv-nombre').value);
  const categoria = document.getElementById('inv-categoria').value;
  const costo = parseFloat(document.getElementById('inv-costo').value) || 0;
  const precio = parseFloat(document.getElementById('inv-precio').value) || 0;
  const minStock = parseInt(document.getElementById('inv-minstock').value) || 0;
  const expiryDate = document.getElementById('inv-expiry').value;
  const expiryWarnDays = parseInt(document.getElementById('inv-expirywarn').value) || 7;
  const noFiscal = document.getElementById('inv-nofiscal').checked;
  
  const idx = productos.findIndex(p => p.code === productoSeleccionado.code);
  if (idx !== -1) {
    productos[idx].name = nombre;
    productos[idx].category = categoria;
    productos[idx].price = precio;
    productos[idx].minStock = minStock;
    productos[idx].expiryDate = expiryDate;
    productos[idx].expiryWarnDays = expiryWarnDays;
    productos[idx].noFiscal = noFiscal;
    NUCLEO.setData('pos_products', productos);
    
    const userId = (NUCLEO.getUsuarioActivo() || {}).id || null;
    NUCLEO.actualizarCostoProducto(productoSeleccionado.code, costo, userId);
    cargarDatos();
    productoSeleccionado = productos.find(p => p.code === productoSeleccionado.code);
    render();
    NUCLEO.toast('Producto actualizado', 'success');
  }
}

function limpiarSeleccion() {
  productoSeleccionado = null;
  render();
}

function nuevoProducto() {
  const container = crearContenedorModales();
  container.innerHTML = `<div class="inv-modal-overlay" onclick="if(event.target===this)window.INVENTARIO.cerrarModalNuevo()"> <div class="inv-modal-content" style="max-width:460px;"> <h3 class="font-headline-md mb-2">Nuevo Producto</h3> <div class="inv-form-group"> <label class="inv-form-label">CÓDIGO DE BARRAS / INTERNO *</label> <div style="display:flex;gap:var(--space-sm);"> <input type="text" class="inv-form-input" id="inv-nuevo-code" placeholder="Escaneá o escribí el código"> <button type="button" class="btn btn-secondary" onclick="window.INVENTARIO.autoGenCodigo()">AUTO-GEN</button> </div> </div> <div class="inv-form-group"> <label class="inv-form-label">NOMBRE COMERCIAL *</label> <input type="text" class="inv-form-input" id="inv-nuevo-nombre" placeholder="Ej: Master Box"> </div> <div class="inv-form-group"> <label class="inv-form-label">CATEGORÍA</label> <select class="inv-form-select" id="inv-nuevo-categoria"> <option value="">Sin categoría</option> ${categorias.map(c =>`<option value="${NUCLEO.esc(c)}">${NUCLEO.esc(c)}</option>`).join('')} </select> ${categorias.length === 0 ? '<p class="font-body-sm text-on-surface-variant" style="margin-top:var(--space-xs);">No hay categorías. Crealas en CONFIG · Categorías (para cigarrillos: "Cigarrillos").</p>' : ''} </div> <div id="inv-nuevo-error" class="font-body-sm text-error" style="min-height:16px;"></div> <div class="flex gap-space-sm justify-end" style="margin-top:var(--space-md);"> <button class="btn btn-secondary" onclick="window.INVENTARIO.cerrarModalNuevo()">Cancelar</button> <button class="btn btn-primary" onclick="window.INVENTARIO.confirmarNuevoProducto()"> <span class="material-symbols-outlined">check</span> CREAR </button> </div> </div> </div>`;
  const codeInput = document.getElementById('inv-nuevo-code');
  const nameInput = document.getElementById('inv-nuevo-nombre');
  codeInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); nameInput.focus(); } });
  nameInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); confirmarNuevoProducto(); } });
  codeInput.focus();
}

function autoGenCodigo() {
  let code;
  do { code = 'INT-' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 10); } while (productos.some(p => p.code === code));
  const input = document.getElementById('inv-nuevo-code');
  if (input) input.value = code;
}

function cerrarModalNuevo() { cerrarModalCSV(); }

function confirmarNuevoProducto() {
  const errorEl = document.getElementById('inv-nuevo-error');
  const code = NUCLEO.normText(document.getElementById('inv-nuevo-code').value);
  const name = NUCLEO.normText(document.getElementById('inv-nuevo-nombre').value);
  const category = document.getElementById('inv-nuevo-categoria').value;
  if (!code) { errorEl.textContent = 'El código es obligatorio'; return; }
  if (!name) { errorEl.textContent = 'El nombre es obligatorio'; return; }
  if (productos.some(p => p.code === code)) { errorEl.textContent = 'El código ya existe'; return; }
  
  productos.push({ code: code, name: name, category: category, price: 0, cost: 0, stock: 0, minStock: 0, active: true, noFiscal: false });
  NUCLEO.setData('pos_products', productos);
  cerrarModalCSV();
  cargarDatos();
  productoSeleccionado = productos.find(p => p.code === code);
  render();
  NUCLEO.toast('Producto creado. Completá costo, margen y stock.', 'success');
}

function bajaProducto() {
  if (!productoSeleccionado) return;
  if (!confirm(`¿Dar de baja el producto "${productoSeleccionado.name}"?`)) return;
  const idx = productos.findIndex(p => p.code === productoSeleccionado.code);
  if (idx !== -1) {
    productos[idx].active = false;
    NUCLEO.setData('pos_products', productos);
    cargarDatos();
    productoSeleccionado = null;
    render();
    NUCLEO.toast('Producto dado de baja', 'success');
  }
}

function altaProducto() {
  if (!productoSeleccionado) return;
  const idx = productos.findIndex(p => p.code === productoSeleccionado.code);
  if (idx !== -1) {
    productos[idx].active = true;
    NUCLEO.setData('pos_products', productos);
    cargarDatos();
    productoSeleccionado = productos.find(p => p.code === productoSeleccionado.code);
    filtroActivo = 'TODOS';
    render();
    NUCLEO.toast('Producto reactivado', 'success');
  }
}

function importarCSV() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv';
  input.onchange = function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (event) {
      const text = event.target.result;
      const lines = text.split('\n').filter(l => l.trim() !== '');
      if (lines.length < 2) { NUCLEO.toast('CSV vacío o sin filas de datos', 'error'); return; }
      const headers = lines[0].split(',').map(h => h.trim());
      const nuevos = [];
      const actualizados = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length < headers.length) continue;
        const row = {};
        headers.forEach((h, idx) => { row[h] = values[idx]; });
        if (!row.code) continue;
        const parsed = {
          code: row.code, name: row.name || '', category: row.category || '',
          price: parseFloat(row.price) || 0, cost: parseFloat(row.cost) || 0,
          stock: parseInt(row.stock, 10) || 0, minStock: parseInt(row.minStock, 10) || 0,
          active: row.active !== undefined ? row.active !== 'false' : true,
          noFiscal: row.noFiscal === 'true', expiryDate: row.expiryDate || '', expiryWarnDays: parseInt(row.expiryWarnDays, 10) || 7
        };
        const existing = productos.find(p => p.code === parsed.code);
        if (existing) actualizados.push({ actual: existing, nuevo: parsed });
        else nuevos.push(parsed);
      }
      if (nuevos.length === 0 && actualizados.length === 0) { NUCLEO.toast('No se encontraron filas válidas para importar', 'warning'); return; }
      csvPendingImport = { nuevos: nuevos, actualizados: actualizados };
      mostrarPreviewCSV();
    };
    reader.readAsText(file);
  };
  input.click();
}

function mostrarPreviewCSV() {
  if (!csvPendingImport) return;
  const { nuevos, actualizados } = csvPendingImport;
  const container = crearContenedorModales();
  container.innerHTML = `
    <div class="inv-modal-overlay" onclick="if(event.target===this)window.INVENTARIO.cancelarImportacionCSV()">
      <div class="inv-modal-content">
        <h3 class="font-headline-md mb-2">Vista Previa de Importación CSV</h3>
        <p class="font-body-sm text-on-surface-variant mb-4">${nuevos.length} producto(s) nuevo(s) · ${actualizados.length} producto(s) a actualizar.</p>
        <div class="overflow-y-auto" style="max-height:320px;">
          <table class="table">
            <thead class="table-header"><tr><th>CÓDIGO</th><th>NOMBRE</th><th>PRECIO</th><th>STOCK</th><th>ACCIÓN</th></tr></thead>
            <tbody>
              ${nuevos.map(p => `<tr class="table-row"><td class="font-mono">${NUCLEO.esc(p.code)}</td><td>${NUCLEO.esc(p.name)}</td><td>${NUCLEO.money(p.price)}</td><td>${p.stock}</td><td><span class="badge badge-success">NUEVO</span></td></tr>`).join('')}
              ${actualizados.map(u => `<tr class="table-row"><td class="font-mono">${NUCLEO.esc(u.nuevo.code)}</td><td>${NUCLEO.esc(u.nuevo.name)}</td><td>${NUCLEO.money(u.actual.price)} → ${NUCLEO.money(u.nuevo.price)}</td><td>${u.actual.stock || 0} → ${u.nuevo.stock}</td><td><span class="badge badge-warning">ACTUALIZA</span></td></tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div class="flex gap-space-sm justify-end" style="margin-top:var(--space-lg);">
          <button class="btn btn-secondary" onclick="window.INVENTARIO.cancelarImportacionCSV()">Cancelar</button>
          <button class="btn btn-primary" onclick="window.INVENTARIO.confirmarImportacionCSV()"><span class="material-symbols-outlined">check</span> APLICAR IMPORTACIÓN</button>
        </div>
      </div>
    </div>
  `;
}

function crearContenedorModales() {
  let el = document.getElementById('inv-modales-container');
  if (!el) { el = document.createElement('div'); el.id = 'inv-modales-container'; document.body.appendChild(el); }
  return el;
}

function cerrarModalCSV() {
  const container = document.getElementById('inv-modales-container');
  if (container) container.innerHTML = '';
}

function cancelarImportacionCSV() {
  csvPendingImport = null;
  cerrarModalCSV();
}

function confirmarImportacionCSV() {
  if (!csvPendingImport) return;
  const userId = (NUCLEO.getUsuarioActivo() || {}).id || null;
  const { nuevos, actualizados } = csvPendingImport;
  
  if (nuevos.length > 0) {
    nuevos.forEach(function (p) {
      productos.push({ code: p.code, name: p.name, category: p.category, price: p.price, cost: 0, stock: 0, minStock: p.minStock, active: p.active, noFiscal: p.noFiscal, expiryDate: p.expiryDate, expiryWarnDays: p.expiryWarnDays });
    });
    NUCLEO.setData('pos_products', productos);
    nuevos.forEach(function (p) {
      if (p.stock !== 0) NUCLEO.actualizarStock(p.code, p.stock, 'ajuste', userId);
      if (p.cost !== 0) NUCLEO.actualizarCostoProducto(p.code, p.cost, userId);
    });
  }
  
  if (actualizados.length > 0) {
    productos = NUCLEO.getData('pos_products');
    actualizados.forEach(function (u) {
      const idx = productos.findIndex(p => p.code === u.actual.code);
      if (idx === -1) return;
      productos[idx].name = u.nuevo.name;
      productos[idx].category = u.nuevo.category;
      productos[idx].price = u.nuevo.price;
      productos[idx].minStock = u.nuevo.minStock;
      productos[idx].active = u.nuevo.active;
      productos[idx].noFiscal = u.nuevo.noFiscal;
      productos[idx].expiryDate = u.nuevo.expiryDate;
      productos[idx].expiryWarnDays = u.nuevo.expiryWarnDays;
    });
    NUCLEO.setData('pos_products', productos);
    actualizados.forEach(function (u) {
      const deltaStock = u.nuevo.stock - (u.actual.stock || 0);
      if (deltaStock !== 0) NUCLEO.actualizarStock(u.actual.code, deltaStock, 'ajuste', userId);
      if (u.nuevo.cost !== (u.actual.cost || 0)) NUCLEO.actualizarCostoProducto(u.actual.code, u.nuevo.cost, userId);
    });
  }
  
  const totalNuevos = nuevos.length;
  const totalActualizados = actualizados.length;
  csvPendingImport = null;
  cerrarModalCSV();
  cargarDatos();
  render();
  NUCLEO.toast(`Importados: ${totalNuevos}, Actualizados: ${totalActualizados}`, 'success');
}

function exportarCSV() {
  const productosFiltrados = aplicarFiltro();
  const headers = ['code', 'name', 'category', 'price', 'cost', 'stock', 'minStock', 'active', 'noFiscal', 'expiryDate', 'expiryWarnDays'];
  const data = productosFiltrados.map(p => {
    const row = {};
    headers.forEach(h => { row[h] = p[h] !== undefined ? p[h] : ''; });
    return row;
  });
  NUCLEO.exportCSV(data, 'inventario.csv');
}

// ==========================================
// 4. UTILIDADES
// ==========================================
function aplicarFiltroChip() {
  if (filtroActivo === 'INACTIVOS') return productos.filter(p => p.active === false);
  let filtrados = productos.filter(p => p.active !== false);
  switch (filtroActivo) {
    case 'VENCIDOS': filtrados = filtrados.filter(p => p.expiryDate && new Date(p.expiryDate) < new Date()); break;
    case 'POR VENCER': filtrados = filtrados.filter(p => { if (!p.expiryDate) return false; const dias = Math.ceil((new Date(p.expiryDate) - new Date()) / (1000 * 60 * 60 * 24)); return dias >= 0 && dias <= (p.expiryWarnDays || 7); }); break;
    case 'FALTANTES': filtrados = filtrados.filter(p => p.minStock && p.stock <= p.minStock && p.stock > 0); break;
    case 'AGOTADOS': filtrados = filtrados.filter(p => p.stock === 0); break;
    case 'NO FISCAL': filtrados = filtrados.filter(p => p.noFiscal); break;
    case 'SUELTO': filtrados = filtrados.filter(p => p.ventaSuelta); break;
  }
  return filtrados;
}

function aplicarFiltro() {
  const base = aplicarFiltroChip();
  const q = NUCLEO.normText(busqueda).toLowerCase();
  if (!q) return base;
  return base.filter(p => ((p.code || '') + ' ' + (p.name || '') + ' ' + (p.category || '')).toLowerCase().includes(q));
}

function calcularConteos() {
  const activos = productos.filter(p => p.active !== false);
  return {
    todos: activos.length,
    vencidos: activos.filter(p => p.expiryDate && new Date(p.expiryDate) < new Date()).length,
    porVencer: activos.filter(p => { if (!p.expiryDate) return false; const dias = Math.ceil((new Date(p.expiryDate) - new Date()) / (1000 * 60 * 60 * 24)); return dias >= 0 && dias <= (p.expiryWarnDays || 7); }).length,
    faltantes: activos.filter(p => p.minStock && p.stock <= p.minStock && p.stock > 0).length,
    agotados: activos.filter(p => p.stock === 0).length,
    noFiscal: activos.filter(p => p.noFiscal).length,
    suelto: activos.filter(p => p.ventaSuelta).length,
    inactivos: productos.filter(p => p.active === false).length
  };
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

function formatDateTime(isoStr) {
  const date = new Date(isoStr);
  return date.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// ==========================================
// 5. API PÚBLICA
// ==========================================
window.INVENTARIO = {
  init: init,
  onShow: onShow,
  setFiltro: setFiltro,
  setBusqueda: setBusqueda,         // <-- NUEVO
  searchKeydown: searchKeydown,     // <-- NUEVO
  seleccionarProducto: seleccionarProducto,
  toggleMovimientos: toggleMovimientos,
  recalcularMargin: recalcularMargin,
  recalcularPrecio: recalcularPrecio,
  actualizarStock: actualizarStock,
  guardarProducto: guardarProducto,
  limpiarSeleccion: limpiarSeleccion,
  nuevoProducto: nuevoProducto,
  autoGenCodigo: autoGenCodigo,
  cerrarModalNuevo: cerrarModalNuevo,
  confirmarNuevoProducto: confirmarNuevoProducto,
  bajaProducto: bajaProducto,
  altaProducto: altaProducto,
  importarCSV: importarCSV,
  exportarCSV: exportarCSV,
  cancelarImportacionCSV: cancelarImportacionCSV,
  confirmarImportacionCSV: confirmarImportacionCSV
};

if (document.getElementById('moduleContainer')) {
  init();
}
})();