/* ============================================
NEURORA POS - INVENTARIO (ANEXO B)
Módulo de gestión de stock y precios
Versión: Paso 2 de corrección de la maqueta
============================================ */
(function () {
'use strict';

// Estado local
let productos = [];
let categorias = [];
let selCode = null;          // código del producto seleccionado
let borrador = null;         // ediciones sin guardar del panel DETALLE: { code, vals } (solo campos que el usuario tocó)
const editados = new Set();  // ids de campos editados por el usuario
let filtroActivo = 'TODOS';
let busqueda = '';
let movimientosVisibles = false;
let csvPendingImport = null;
let visible = false;         // true solo mientras la solapa INVENTARIO está en pantalla

const CAMPOS_BORRADOR = ['inv-nombre', 'inv-categoria', 'inv-costo', 'inv-margen', 'inv-precio', 'inv-costfactor', 'inv-minstock', 'inv-expiry', 'inv-expirywarn', 'inv-nofiscal', 'inv-ajuste-delta', 'inv-ajuste-nota'];
const CSV_HEADERS = ['code', 'name', 'category', 'price', 'cost', 'stock', 'minStock', 'active', 'noFiscal', 'expiryDate', 'expiryWarnDays'];

// ==========================================
// 0. HELPERS
// ==========================================
function $id(id) { return document.getElementById(id); }
function userId_() { return (NUCLEO.getUsuarioActivo() || {}).id || null; }
function selProducto() { return selCode ? (productos.find(function (p) { return p.code === selCode; }) || null) : null; }
function sueltosDe(p) { return Number(p['sueltos_' + p.code]) || 0; }

// Búsqueda sin tildes ni mayúsculas
function norm(s) {
  return NUCLEO.normText(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Días hasta una fecha 'YYYY-MM-DD' (negativo = ya pasó). Hora local.
function diasHasta(dateStr) {
  const d = NUCLEO.parseLocalDate(dateStr);
  const h = NUCLEO.parseLocalDate(NUCLEO.today());
  return Math.round((d - h) / 86400000);
}

function formatDateCorta(dateStr) { return NUCLEO.formatDate(dateStr).slice(0, 5); }

function nombreUsuario(id) {
  if (!id || id === 'sistema') return 'Sistema';
  const u = (NUCLEO.getData('pos_users') || []).find(function (x) { return x.id === id; });
  return u ? u.nombre : '—';
}

// ==========================================
// 1. CICLO DE VIDA (hooks que usa el NÚCLEO)
// ==========================================
function init() {
  crearContenedorModales();
}

function onShow() {
  visible = true;
  cargarDatos();
  render();
}

function onHide() {
  visible = false;
  cerrarModalCSV();
  csvPendingImport = null;
}

// ESC: cierra modal → limpia búsqueda → (si no) el NÚCLEO vuelve a CAJA
function onEscape() {
  const modales = $id('inv-modales-container');
  if (modales && modales.innerHTML.trim() !== '') {
    cerrarModalCSV();
    csvPendingImport = null;
    return true;
  }
  if (busqueda) {
    const el = $id('inv-search-input');
    if (el) el.value = '';
    setBusqueda('');
    return true;
  }
  return false;
}

// F4 solo actúa cuando INVENTARIO es la solapa activa
function onKey(e) {
  if (e.key === 'F4') {
    if (selProducto()) guardarProducto();
    return true;
  }
  return false;
}

function cargarDatos() {
  productos = NUCLEO.getData('pos_products') || [];
  categorias = NUCLEO.getData('pos_categories') || [];
  if (selCode && !productos.some(function (p) { return p.code === selCode; })) { selCode = null; descartarBorrador(); }
}

// ==========================================
// 2. BORRADOR (ediciones sin guardar sobreviven a los re-render)
// ==========================================
function capturarBorrador() {
  const nombre = $id('inv-nombre');
  if (!nombre || nombre.getAttribute('data-code') !== selCode) return;
  const vals = {};
  CAMPOS_BORRADOR.forEach(function (id) {
    const el = $id(id);
    if (el && editados.has(id)) vals[id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  borrador = { code: selCode, vals: vals };
}

function descartarBorrador() { borrador = null; editados.clear(); }

function marcarEditado(e) {
  const id = e.target && e.target.id;
  if (id && CAMPOS_BORRADOR.indexOf(id) !== -1) editados.add(id);
}

function v(id, original) {
  if (borrador && borrador.code === selCode && Object.prototype.hasOwnProperty.call(borrador.vals, id)) return borrador.vals[id];
  return original;
}

function hayCambios() {
  capturarBorrador();
  const p = selProducto();
  if (!p || !borrador || borrador.code !== p.code) return false;
  const b = borrador.vals;
  const dif = function (id, actual) { return Object.prototype.hasOwnProperty.call(b, id) && actual(b[id]); };
  return dif('inv-nombre', function (x) { return NUCLEO.normText(x) !== p.name; }) ||
    dif('inv-categoria', function (x) { return (x || '') !== (p.category || ''); }) ||
    dif('inv-costo', function (x) { return (parseFloat(x) || 0) !== (Number(p.cost) || 0); }) ||
    dif('inv-precio', function (x) { return (parseFloat(x) || 0) !== (Number(p.price) || 0); }) ||
    dif('inv-minstock', function (x) { return (parseFloat(x) || 0) !== (Number(p.minStock) || 0); }) ||
    dif('inv-expiry', function (x) { return (x || '') !== (p.expiryDate || ''); }) ||
    dif('inv-expirywarn', function (x) { return (parseInt(x, 10) || 7) !== (p.expiryWarnDays || 7); }) ||
    dif('inv-nofiscal', function (x) { return !!x !== !!p.noFiscal; }) ||
    dif('inv-costfactor', function (x) { return (x === '' ? null : parseFloat(x)) !== (p.costFactor === undefined ? null : p.costFactor); });
}

function conConfirmacionDeCambios(cb) {
  if (!hayCambios()) { cb(); return; }
  NUCLEO.confirmar('Cambios sin guardar', 'Tenés cambios sin guardar en este producto. ¿Descartarlos?', 'DESCARTAR').then(function (ok) {
    if (ok) { descartarBorrador(); cb(); }
  });
}

// ==========================================
// 3. RENDERIZADO
// ==========================================
function render() {
  if (!visible) return;
  const container = $id('moduleContainer');
  if (!container) return;
  capturarBorrador();
  const conteos = calcularConteos();
  const chip = function (id, label, n) {
    return '<button class="inv-chip ' + (filtroActivo === id ? 'active' : '') + '" onclick="window.INVENTARIO.setFiltro(' + NUCLEO.jsArg(id) + ')">' + label + ' ' + n + '</button>';
  };

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

          <div class="inv-search">
            <span class="material-symbols-outlined">search</span>
            <input type="text" id="inv-search-input" class="inv-search-input"
                   placeholder="Buscar por código, nombre o categoría..."
                   value="${NUCLEO.esc(busqueda)}"
                   oninput="window.INVENTARIO.setBusqueda(this.value)"
                   onkeydown="window.INVENTARIO.searchKeydown(event)">
            <button class="inv-search-clear" id="inv-search-clear" style="display:${busqueda ? 'flex' : 'none'};" onclick="window.INVENTARIO.limpiarBusqueda()"><span class="material-symbols-outlined">close</span></button>
          </div>

          <div class="inv-chips">
            ${chip('TODOS', 'TODOS', conteos.todos)}
            ${chip('VENCIDOS', 'VENCIDOS', conteos.vencidos)}
            ${chip('POR VENCER', 'POR VENCER', conteos.porVencer)}
            ${chip('FALTANTES', 'FALTANTES', conteos.faltantes)}
            ${chip('AGOTADOS', 'AGOTADOS', conteos.agotados)}
            ${chip('NO FISCAL', 'NO FISCAL', conteos.noFiscal)}
            ${chip('SUELTO', 'SUELTO', conteos.suelto)}
            ${chip('INACTIVOS', 'INACTIVOS', conteos.inactivos)}
          </div>
        </div>

        <div class="inv-table-container">
          <table class="inv-table">
            <thead>
              <tr><th>CÓDIGO</th><th>NOMBRE</th><th>PRECIO</th><th>STOCK</th><th>ESTADO</th></tr>
            </thead>
            <tbody id="inv-tbody">${filasHTML()}</tbody>
          </table>
        </div>

        <div class="inv-table-footer">
          <span id="inv-count">${textoConteo()}</span>
          <span class="font-label-sm">[F4] Guardar [ESC] Volver a CAJA</span>
        </div>
      </div>

      <div class="inv-col-right">
        ${selProducto() ? renderPanelDetalle() : renderPanelVacio()}
      </div>
    </div>
  `;
  const panel = container.querySelector('.inv-col-right');
  if (panel) { panel.addEventListener('input', marcarEditado); panel.addEventListener('change', marcarEditado); }
}

function textoConteo() {
  return 'Mostrando ' + aplicarFiltro().length + ' de ' + productos.length + ' productos';
}

function filasHTML() {
  const lista = aplicarFiltro();
  if (lista.length === 0) {
    return '<tr><td colspan="5" class="text-center text-on-surface-variant" style="padding:var(--space-xl);">' +
      (productos.length === 0 ? 'No hay productos. Usá NUEVO o IMPORTAR CSV.' : 'Sin resultados para este filtro.') + '</td></tr>';
  }
  return lista.map(function (p) {
    return `
      <tr class="${p.code === selCode ? 'inv-row-selected' : ''}" onclick="window.INVENTARIO.seleccionarProducto(${NUCLEO.jsArg(p.code)})">
        <td class="font-mono">${NUCLEO.esc(p.code)}</td>
        <td>
          <div class="font-semibold">${NUCLEO.esc(p.name)}</div>
          <div class="font-body-sm text-on-surface-variant">${NUCLEO.esc(p.category || 'Sin categoría')}</div>
        </td>
        <td class="font-numeric-tape">${NUCLEO.money(p.price)}</td>
        <td class="font-numeric-tape">${Number(p.stock) || 0}</td>
        <td>${renderBadgeEstado(p)}</td>
      </tr>`;
  }).join('');
}

// Actualiza solo la tabla (no toca el panel ni el foco del buscador)
function actualizarTabla() {
  const tbody = $id('inv-tbody');
  if (tbody) tbody.innerHTML = filasHTML();
  const count = $id('inv-count');
  if (count) count.textContent = textoConteo();
  const clear = $id('inv-search-clear');
  if (clear) clear.style.display = busqueda ? 'flex' : 'none';
}

function renderBadgeEstado(p) {
  const badges = [];
  const stock = Number(p.stock) || 0;
  if (p.active === false) badges.push('<span class="inv-badge inv-badge-agot">INACTIVO</span>');
  if (stock === 0) {
    badges.push('<span class="inv-badge inv-badge-agot">AGOT</span>');
  } else if (p.minStock && stock <= p.minStock) {
    badges.push('<span class="inv-badge inv-badge-crit">CRIT</span>');
  }
  if (p.expiryDate) {
    const dias = diasHasta(p.expiryDate);
    if (dias < 0) {
      badges.push('<span class="inv-badge inv-badge-vencido">VENCIDO</span>');
    } else if (dias <= (p.expiryWarnDays || 7)) {
      badges.push('<span class="inv-badge inv-badge-vence">VENCE ' + formatDateCorta(p.expiryDate) + '</span>');
    }
  }
  if (p.ventaSuelta || sueltosDe(p) > 0) {
    badges.push('<span class="inv-badge inv-badge-suelto">SUELTO ' + sueltosDe(p) + '</span>');
  }
  return badges.length > 0 ? badges.join(' ') : '<span class="material-symbols-outlined text-tertiary-fixed-dim" style="font-size:18px;">check_circle</span>';
}

function renderPanelVacio() {
  return `<div class="inv-detail-panel" style="display:flex;align-items:center;justify-content:center;height:100%;text-align:center;color:var(--color-on-surface-variant);"> <div> <span class="material-symbols-outlined" style="font-size:48px;margin-bottom:var(--space-md);">inventory_2</span> <p class="font-body-md">Selecciona un producto para ver el detalle</p> </div> </div>`;
}

function renderPanelDetalle() {
  const p = selProducto();
  const costo = parseFloat(v('inv-costo', p.cost || 0)) || 0;
  const precio = parseFloat(v('inv-precio', p.price || 0)) || 0;
  const margenCalc = NUCLEO.margenSobreCosto(precio, costo);
  const margen = margenCalc === null ? 0 : margenCalc;
  const categoriaSel = v('inv-categoria', p.category || '');
  const loss = NUCLEO.checkLoss(precio, costo, categoriaSel);
  const ganancia = precio - costo;
  const inactivo = p.active === false;
  const esCig = NUCLEO.esCategoriaCigarrillos(p.category);
  const porDefecto = NUCLEO.getFactorCosto(Object.assign({}, p, { costFactor: null }), 'A');
  const opcionesCat = categorias.slice();
  if (p.category && opcionesCat.indexOf(p.category) === -1) opcionesCat.push(p.category); // categoría huérfana: se muestra igual

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
          <input type="text" class="inv-form-input" id="inv-nombre" data-code="${NUCLEO.esc(p.code)}" value="${NUCLEO.esc(v('inv-nombre', p.name))}">
        </div>
        <div class="inv-form-group">
          <label class="inv-form-label">CATEGORÍA</label>
          <select class="inv-form-select" id="inv-categoria" onchange="window.INVENTARIO.actualizarIndicadoresEnVivo()">
            <option value="" ${!categoriaSel ? 'selected' : ''}>Sin categoría</option>
            ${opcionesCat.map(function (c) { return '<option value="' + NUCLEO.esc(c) + '" ' + (c === categoriaSel ? 'selected' : '') + '>' + NUCLEO.esc(c) + '</option>'; }).join('')}
          </select>
        </div>
        <div class="inv-form-group">
          <label class="inv-form-label">COSTO ($) — último costo</label>
          <input type="number" class="inv-form-input" id="inv-costo" value="${NUCLEO.esc(v('inv-costo', p.cost || 0))}" step="0.01" min="0" oninput="window.INVENTARIO.recalcularMargin()">
        </div>
        <div class="inv-form-group">
          <label class="inv-form-label">% COSTO REAL (opcional) — sin valor se usa ${porDefecto.pct}% (${porDefecto.origen === 'categoria' ? 'de la categoría' : 'tipo de factura A'})</label>
          <input type="number" class="inv-form-input" id="inv-costfactor" min="1" max="100" step="0.5" placeholder="${porDefecto.pct}" value="${NUCLEO.esc(v('inv-costfactor', p.costFactor === undefined || p.costFactor === null ? '' : p.costFactor))}">
        </div>
        <div class="inv-form-group">
          <label class="inv-form-label">MARGEN (%) sobre costo</label>
          <input type="number" class="inv-form-input" id="inv-margen" value="${NUCLEO.esc(v('inv-margen', margen.toFixed(2)))}" step="0.01" oninput="window.INVENTARIO.recalcularPrecio()">
        </div>
        <div class="inv-form-group">
          <label class="inv-form-label">P. VENTA AL PÚBLICO</label>
          <input type="number" class="inv-form-input" id="inv-precio" value="${NUCLEO.esc(v('inv-precio', p.price || 0))}" step="0.01" min="0" oninput="window.INVENTARIO.recalcularMargin()">
        </div>
        <div id="inv-loss-badges">
          ${loss.isLoss ? '<div class="inv-badge inv-badge-vencido" style="margin-top:var(--space-sm);">PÉRDIDA</div>' : ''}
          ${loss.isLowMargin ? '<div class="inv-badge inv-badge-vence" style="margin-top:var(--space-sm);">MARGEN BAJO</div>' : ''}
        </div>
        <div class="inv-ganancia-neta ${ganancia >= 0 ? 'positive' : 'negative'}" id="inv-ganancia-neta-box">
          <span class="material-symbols-outlined">trending_up</span>
          <div>
            <div class="font-label-sm">Ganancia Neta</div>
            <div class="font-numeric-tape font-bold" id="inv-ganancia-neta-valor">${NUCLEO.money(ganancia)} (${margen.toFixed(2)}%)</div>
          </div>
        </div>
      </div>
      <div class="inv-detail-section">
        <div class="inv-detail-section-title">STOCK DISPONIBLE</div>
        <div class="font-numeric-display text-primary">${Number(p.stock) || 0} UNID.</div>
        ${esCig ? '<div class="font-body-sm text-on-surface-variant">Sueltos en sub-caja: ' + sueltosDe(p) + '</div>' : ''}
        <div class="inv-stock-controls">
          <button class="inv-stock-btn" onclick="window.INVENTARIO.actualizarStock(1)">+1</button>
          <button class="inv-stock-btn" onclick="window.INVENTARIO.actualizarStock(5)">+5</button>
          <button class="inv-stock-btn" onclick="window.INVENTARIO.actualizarStock(10)">+10</button>
        </div>
        <div class="inv-ajuste-row">
          <input type="number" step="any" class="inv-form-input" id="inv-ajuste-delta" placeholder="± cant." value="${NUCLEO.esc(v('inv-ajuste-delta', ''))}">
          <input type="text" class="inv-form-input" id="inv-ajuste-nota" placeholder="Motivo (merma, rotura, conteo...)" value="${NUCLEO.esc(v('inv-ajuste-nota', ''))}">
          <button class="btn btn-secondary" onclick="window.INVENTARIO.ajustarStock()">AJUSTAR</button>
        </div>
        <div class="inv-form-group" style="margin-top:var(--space-md);">
          <label class="inv-form-label">STOCK MÍNIMO</label>
          <input type="number" class="inv-form-input" id="inv-minstock" min="0" value="${NUCLEO.esc(v('inv-minstock', p.minStock || 0))}">
        </div>
      </div>
      <div class="inv-detail-section">
        <div class="inv-detail-section-title">VENCIMIENTO</div>
        <div class="inv-form-group">
          <input type="date" class="inv-form-input" id="inv-expiry" value="${NUCLEO.esc(v('inv-expiry', p.expiryDate || ''))}">
        </div>
        <div class="inv-form-group">
          <label class="inv-form-label">AVISO DÍAS ANTES</label>
          <input type="number" class="inv-form-input" id="inv-expirywarn" min="0" value="${NUCLEO.esc(v('inv-expirywarn', p.expiryWarnDays || 7))}">
        </div>
      </div>
      <div class="inv-detail-section">
        <div class="inv-detail-section-title">RÉGIMEN</div>
        <label style="display:flex;align-items:center;gap:var(--space-sm);cursor:pointer;">
          <input type="checkbox" id="inv-nofiscal" ${v('inv-nofiscal', !!p.noFiscal) ? 'checked' : ''}>
          <span class="font-body-md">NO FISCAL - Excluir de controladores fiscales AFIP</span>
        </label>
      </div>
      <div class="inv-movimientos">
        <div class="inv-movimientos-header" onclick="window.INVENTARIO.toggleMovimientos()">
          <span class="font-label-md font-semibold">📋 Últimos Movimientos</span>
          <span class="material-symbols-outlined">${movimientosVisibles ? 'expand_less' : 'expand_more'}</span>
        </div>
        ${movimientosVisibles ? renderMovimientos(p) : ''}
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

function renderMovimientos(p) {
  const movimientos = (NUCLEO.getData('pos_stock_movements') || [])
    .filter(function (m) { return m.code === p.code; })
    .slice(-10)
    .reverse();
  if (movimientos.length === 0) return '<p class="font-body-sm text-on-surface-variant">Sin movimientos registrados</p>';
  return `
    <table class="inv-movimientos-table">
      <thead><tr><th>FECHA</th><th>MOTIVO</th><th>DELTA</th><th>USUARIO</th></tr></thead>
      <tbody>
        ${movimientos.map(function (m) {
          return `
          <tr>
            <td>${NUCLEO.formatDateTime(m.fecha)}</td>
            <td>${NUCLEO.esc(m.motivo)}${m.nota ? '<div class="inv-nota">' + NUCLEO.esc(m.nota) + '</div>' : ''}</td>
            <td class="${m.delta > 0 ? 'text-tertiary-fixed-dim' : 'text-error'} font-semibold">${m.delta > 0 ? '+' : ''}${m.delta}</td>
            <td>${NUCLEO.esc(nombreUsuario(m.userId))}</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

// ==========================================
// 4. ACCIONES
// ==========================================
function setFiltro(filtro) {
  filtroActivo = filtro;
  render();
}

function setBusqueda(valor) {
  busqueda = valor || '';
  actualizarTabla();
}

function limpiarBusqueda() {
  const el = $id('inv-search-input');
  if (el) { el.value = ''; el.focus(); }
  setBusqueda('');
}

function searchKeydown(e) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const q = busqueda.trim();
  const lista = aplicarFiltro();
  const elegido = lista.find(function (p) { return p.code === q; }) || (lista.length === 1 ? lista[0] : null);
  if (elegido) seleccionarProducto(elegido.code);
}

function seleccionarProducto(code) {
  if (code === selCode) return;
  conConfirmacionDeCambios(function () {
    selCode = code;
    descartarBorrador();
    movimientosVisibles = false;
    render();
  });
}

function toggleMovimientos() {
  movimientosVisibles = !movimientosVisibles;
  render();
}

function recalcularMargin() {
  const costo = parseFloat($id('inv-costo').value) || 0;
  const precio = parseFloat($id('inv-precio').value) || 0;
  const m = NUCLEO.margenSobreCosto(precio, costo);
  $id('inv-margen').value = (m === null ? 0 : m).toFixed(2);
  editados.add('inv-margen');
  actualizarIndicadoresEnVivo();
}

function recalcularPrecio() {
  const costo = parseFloat($id('inv-costo').value) || 0;
  const margin = parseFloat($id('inv-margen').value) || 0;
  $id('inv-precio').value = NUCLEO.precioDesdeMargen(costo, margin);
  editados.add('inv-precio');
  actualizarIndicadoresEnVivo();
}

function actualizarIndicadoresEnVivo() {
  const p = selProducto();
  const costoInput = $id('inv-costo');
  const precioInput = $id('inv-precio');
  if (!p || !costoInput || !precioInput) return;
  const costo = parseFloat(costoInput.value) || 0;
  const precio = parseFloat(precioInput.value) || 0;
  const catEl = $id('inv-categoria');
  const categoria = catEl ? catEl.value : p.category;
  const ganancia = precio - costo;
  const m = NUCLEO.margenSobreCosto(precio, costo);
  const margen = m === null ? 0 : m;
  const loss = NUCLEO.checkLoss(precio, costo, categoria);

  const valorEl = $id('inv-ganancia-neta-valor');
  if (valorEl) valorEl.textContent = NUCLEO.money(ganancia) + ' (' + margen.toFixed(2) + '%)';
  const boxEl = $id('inv-ganancia-neta-box');
  if (boxEl) boxEl.className = 'inv-ganancia-neta ' + (ganancia >= 0 ? 'positive' : 'negative');
  const badgesEl = $id('inv-loss-badges');
  if (badgesEl) {
    let html = '';
    if (loss.isLoss) html += '<div class="inv-badge inv-badge-vencido" style="margin-top:var(--space-sm);">PÉRDIDA</div>';
    if (loss.isLowMargin) html += '<div class="inv-badge inv-badge-vence" style="margin-top:var(--space-sm);">MARGEN BAJO</div>';
    badgesEl.innerHTML = html;
  }
}

function actualizarStock(delta) {
  const p = selProducto();
  if (!p) return;
  if (NUCLEO.actualizarStock(p.code, delta, 'ajuste', userId_(), 'Carga manual')) {
    cargarDatos();
    render();
    NUCLEO.toast('Stock actualizado: ' + (delta > 0 ? '+' : '') + delta, 'success');
  }
}

// Ajuste con motivo obligatorio (positivo o negativo): merma, rotura, conteo físico, etc. Queda trazado con usuario.
function ajustarStock() {
  const p = selProducto();
  if (!p) return;
  const delta = parseFloat($id('inv-ajuste-delta').value);
  const nota = NUCLEO.normText($id('inv-ajuste-nota').value);
  if (!isFinite(delta) || delta === 0) { NUCLEO.toast('Ingresá una cantidad distinta de 0 (puede ser negativa)', 'error'); return; }
  if (nota.length < 3) { NUCLEO.toast('El motivo del ajuste es obligatorio', 'error'); return; }
  if (NUCLEO.actualizarStock(p.code, delta, 'ajuste', userId_(), nota)) {
    editados.delete('inv-ajuste-delta'); editados.delete('inv-ajuste-nota');
    if (borrador && borrador.code === p.code) { delete borrador.vals['inv-ajuste-delta']; delete borrador.vals['inv-ajuste-nota']; }
    cargarDatos();
    render();
    NUCLEO.toast('Ajuste registrado: ' + (delta > 0 ? '+' : '') + delta, 'success');
  }
}

function guardarProducto() {
  const p0 = selProducto();
  if (!p0 || !$id('inv-nombre')) return;
  const nombre = NUCLEO.normText($id('inv-nombre').value);
  const categoria = $id('inv-categoria').value;
  const costo = parseFloat($id('inv-costo').value) || 0;
  const precio = parseFloat($id('inv-precio').value) || 0;
  const minStock = parseFloat($id('inv-minstock').value) || 0;
  const expiryDate = $id('inv-expiry').value;
  const expiryWarnDays = parseInt($id('inv-expirywarn').value, 10) || 7;
  const noFiscal = $id('inv-nofiscal').checked;
  const cfRaw = $id('inv-costfactor').value;
  const costFactor = cfRaw === '' ? null : parseFloat(cfRaw);
  if (costFactor !== null && (isNaN(costFactor) || costFactor < 1 || costFactor > 100)) { NUCLEO.toast('El % de costo real debe estar entre 1 y 100 (o vacío)', 'error'); return; }

  if (!nombre) { NUCLEO.toast('El nombre es obligatorio', 'error'); return; }
  if (costo < 0 || precio < 0 || minStock < 0) { NUCLEO.toast('Costo, precio y mínimo no pueden ser negativos', 'error'); return; }

  const todos = NUCLEO.getData('pos_products');
  const p = todos.find(function (x) { return x.code === p0.code; });
  if (!p) { NUCLEO.toast('El producto ya no existe', 'error'); return; }
  const costoAnterior = Number(p.cost) || 0;

  const ok = NUCLEO.transaccion(['pos_products', 'pos_cost_history'], function () {
    p.name = nombre;
    p.category = categoria;
    p.price = precio;
    p.minStock = minStock;
    p.expiryDate = expiryDate;
    p.expiryWarnDays = expiryWarnDays;
    p.noFiscal = noFiscal;
    p.costFactor = costFactor;
    if (!NUCLEO.setData('pos_products', todos)) return false;
    if (costo !== costoAnterior && !NUCLEO.actualizarCostoProducto(p.code, costo, userId_())) return false;
    return true;
  });
  if (!ok) { NUCLEO.toast('No se pudo guardar el producto. No se modificó nada.', 'error'); return; }

  descartarBorrador();
  cargarDatos();
  render();
  if (NUCLEO.checkLoss(precio, costo, categoria).isLoss) NUCLEO.toast('Producto actualizado — ATENCIÓN: el precio está por debajo del costo', 'warning');
  else NUCLEO.toast('Producto actualizado', 'success');
}

function limpiarSeleccion() {
  conConfirmacionDeCambios(function () {
    selCode = null;
    descartarBorrador();
    render();
  });
}

function nuevoProducto() {
  conConfirmacionDeCambios(abrirModalNuevo);
}

function abrirModalNuevo() {
  const container = crearContenedorModales();
  container.innerHTML = `<div class="inv-modal-overlay" onclick="if(event.target===this)window.INVENTARIO.cerrarModalNuevo()"> <div class="inv-modal-content" style="max-width:460px;"> <h3 class="font-headline-md mb-2">Nuevo Producto</h3> <div class="inv-form-group"> <label class="inv-form-label">CÓDIGO DE BARRAS / INTERNO *</label> <div style="display:flex;gap:var(--space-sm);"> <input type="text" class="inv-form-input" id="inv-nuevo-code" placeholder="Escaneá o escribí el código"> <button type="button" class="btn btn-secondary" onclick="window.INVENTARIO.autoGenCodigo()">AUTO-GEN</button> </div> </div> <div class="inv-form-group"> <label class="inv-form-label">NOMBRE COMERCIAL *</label> <input type="text" class="inv-form-input" id="inv-nuevo-nombre" placeholder="Ej: Master Box"> </div> <div class="inv-form-group"> <label class="inv-form-label">CATEGORÍA</label> <select class="inv-form-select" id="inv-nuevo-categoria"> <option value="">Sin categoría</option> ${categorias.map(function (c) { return '<option value="' + NUCLEO.esc(c) + '">' + NUCLEO.esc(c) + '</option>'; }).join('')} </select> ${categorias.length === 0 ? '<p class="font-body-sm text-on-surface-variant" style="margin-top:var(--space-xs);">No hay categorías. Crealas en CONFIG · Categorías (para cigarrillos: "Cigarrillos").</p>' : ''} </div> <div id="inv-nuevo-error" class="font-body-sm text-error" style="min-height:16px;"></div> <div class="flex gap-space-sm justify-end" style="margin-top:var(--space-md);"> <button class="btn btn-secondary" onclick="window.INVENTARIO.cerrarModalNuevo()">Cancelar</button> <button class="btn btn-primary" onclick="window.INVENTARIO.confirmarNuevoProducto()"> <span class="material-symbols-outlined">check</span> CREAR </button> </div> </div> </div>`;
  const codeInput = $id('inv-nuevo-code');
  const nameInput = $id('inv-nuevo-nombre');
  codeInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); nameInput.focus(); } });
  nameInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); confirmarNuevoProducto(); } });
  codeInput.focus();
}

function autoGenCodigo() {
  const existentes = NUCLEO.getData('pos_products');
  let code;
  do { code = 'INT-' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 10); } while (existentes.some(function (p) { return p.code === code; }));
  const input = $id('inv-nuevo-code');
  if (input) input.value = code;
}

function cerrarModalNuevo() { cerrarModalCSV(); }

function confirmarNuevoProducto() {
  const errorEl = $id('inv-nuevo-error');
  const code = NUCLEO.normText($id('inv-nuevo-code').value);
  const name = NUCLEO.normText($id('inv-nuevo-nombre').value);
  const category = $id('inv-nuevo-categoria').value;
  if (!code) { errorEl.textContent = 'El código es obligatorio'; return; }
  if (!name) { errorEl.textContent = 'El nombre es obligatorio'; return; }
  const todos = NUCLEO.getData('pos_products');
  if (todos.some(function (p) { return p.code === code; })) { errorEl.textContent = 'El código ya existe'; return; }

  todos.push({ code: code, name: name, category: category, price: 0, cost: 0, stock: 0, minStock: 0, active: true, noFiscal: false });
  if (!NUCLEO.setData('pos_products', todos)) return;
  cerrarModalCSV();
  selCode = code;
  descartarBorrador();
  cargarDatos();
  render();
  NUCLEO.toast('Producto creado. Completá costo, margen y stock.', 'success');
}

function bajaProducto() {
  const p = selProducto();
  if (!p) return;
  const stock = Number(p.stock) || 0;
  NUCLEO.confirmar('Dar de baja',
    '¿Dar de baja "' + p.name + '"? Dejará de aparecer en CAJA.' + (stock > 0 ? '\nTiene ' + stock + ' unidades en stock.' : ''),
    'DAR DE BAJA').then(function (ok) {
    if (!ok) return;
    const todos = NUCLEO.getData('pos_products');
    const x = todos.find(function (q) { return q.code === p.code; });
    if (!x) return;
    x.active = false;
    if (!NUCLEO.setData('pos_products', todos)) return;
    selCode = null;
    descartarBorrador();
    cargarDatos();
    render();
    NUCLEO.toast('Producto dado de baja', 'success');
  });
}

function altaProducto() {
  const p = selProducto();
  if (!p) return;
  const todos = NUCLEO.getData('pos_products');
  const x = todos.find(function (q) { return q.code === p.code; });
  if (!x) return;
  x.active = true;
  if (!NUCLEO.setData('pos_products', todos)) return;
  filtroActivo = 'TODOS';
  cargarDatos();
  render();
  NUCLEO.toast('Producto reactivado', 'success');
}

// ==========================================
// 5. IMPORTAR / EXPORTAR CSV
// ==========================================
function importarCSV() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv,text/csv';
  input.onchange = function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (ev) { procesarCSV(ev.target.result); };
    reader.readAsText(file);
  };
  input.click();
}

function parseBool(raw) {
  const s = norm(raw);
  if (['true', '1', 'si', 'activo', 'x'].indexOf(s) !== -1) return true;
  if (['false', '0', 'no', 'inactivo'].indexOf(s) !== -1) return false;
  return null;
}

function parseFechaCSV(raw) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  return null;
}

// Regla: celda vacía = "sin cambios". Solo se aplican las filas válidas. Nada se escribe hasta confirmar.
function procesarCSV(text) {
  const parsed = NUCLEO.parseCSV(text);
  const map = {};
  parsed.headers.forEach(function (h) { map[h.toLowerCase()] = h; });
  if (!map.code) { NUCLEO.toast('El CSV debe tener una columna "code"', 'error'); return false; }

  const existentes = {};
  NUCLEO.getData('pos_products').forEach(function (p) { existentes[p.code] = p; });
  const cats = NUCLEO.getData('pos_categories') || [];
  const vistos = {};
  const validos = [];
  const errores = [];
  let sinCambios = 0;

  parsed.rows.forEach(function (row, i) {
    const linea = i + 2;
    const get = function (campo) { return map[campo.toLowerCase()] !== undefined ? String(row[map[campo.toLowerCase()]] || '').trim() : ''; };
    const code = NUCLEO.normText(get('code'));
    if (!code) { errores.push({ linea: linea, msg: 'código vacío' }); return; }
    if (vistos[code]) { errores.push({ linea: linea, code: code, msg: 'código repetido en el archivo' }); return; }
    vistos[code] = true;

    const actual = existentes[code] || null;
    const cambios = {};
    const errs = [];
    const num = function (campo) {
      const raw = get(campo);
      if (raw === '') return undefined;
      if (!/^[\s$\-\d.,]+$/.test(raw)) { errs.push(campo + ' no es un número ("' + raw + '")'); return undefined; }
      const n = NUCLEO.parseNumber(raw);
      if (n < 0) { errs.push(campo + ' no puede ser negativo'); return undefined; }
      return n;
    };

    const name = NUCLEO.normText(get('name'));
    if (name) cambios.name = name;

    const catRaw = NUCLEO.normText(get('category'));
    if (catRaw) {
      const canon = cats.find(function (c) { return norm(c) === norm(catRaw); });
      if (canon) cambios.category = canon;
      else errs.push('la categoría "' + catRaw + '" no existe (crearla en CONFIG · Categorías)');
    }

    ['price', 'cost', 'stock', 'minStock', 'expiryWarnDays'].forEach(function (campo) {
      const n = num(campo);
      if (n !== undefined) cambios[campo] = n;
    });

    ['active', 'noFiscal'].forEach(function (campo) {
      const raw = get(campo);
      if (raw === '') return;
      const b = parseBool(raw);
      if (b === null) errs.push(campo + ' debe ser true/false ("' + raw + '")');
      else cambios[campo] = b;
    });

    const expRaw = get('expiryDate');
    if (expRaw !== '') {
      const f = parseFechaCSV(expRaw);
      if (f) cambios.expiryDate = f; else errs.push('expiryDate inválida ("' + expRaw + '")');
    }

    if (!actual && !name) errs.push('producto nuevo sin nombre');
    if (errs.length) { errores.push({ linea: linea, code: code, msg: errs.join('; ') }); return; }

    if (actual) {
      Object.keys(cambios).forEach(function (k) {
        let igual;
        if (k === 'name' || k === 'category' || k === 'expiryDate') igual = NUCLEO.normText(actual[k] || '') === cambios[k];
        else if (k === 'active') igual = (actual.active !== false) === cambios[k];
        else if (k === 'noFiscal') igual = !!actual.noFiscal === cambios[k];
        else if (k === 'expiryWarnDays') igual = (actual.expiryWarnDays || 7) === cambios[k];
        else igual = (Number(actual[k]) || 0) === cambios[k];
        if (igual) delete cambios[k];
      });
      if (Object.keys(cambios).length === 0) { sinCambios++; return; }
    }
    validos.push({ linea: linea, code: code, nuevo: !actual, actual: actual, cambios: cambios });
  });

  if (validos.length === 0 && errores.length === 0) {
    NUCLEO.toast('Archivo leído: ' + sinCambios + ' fila(s) sin cambios, nada para importar', 'info');
    return true;
  }
  csvPendingImport = { validos: validos, errores: errores, sinCambios: sinCambios };
  mostrarPreviewCSV();
  return true;
}

const ETIQUETAS_CAMPO = { name: 'Nombre', category: 'Categoría', price: 'Precio', cost: 'Costo', stock: 'Stock', minStock: 'Mínimo', active: 'Activo', noFiscal: 'No fiscal', expiryDate: 'Vence', expiryWarnDays: 'Aviso días' };

function resumenCambios(item) {
  return Object.keys(item.cambios).map(function (k) {
    const nuevo = item.cambios[k];
    const fmt = function (x) { return typeof x === 'boolean' ? (x ? 'sí' : 'no') : x; };
    if (item.nuevo) return ETIQUETAS_CAMPO[k] + ': ' + fmt(nuevo);
    return ETIQUETAS_CAMPO[k] + ': ' + fmt(item.actual[k] === undefined ? '—' : item.actual[k]) + ' → ' + fmt(nuevo);
  }).join(' · ');
}

function mostrarPreviewCSV() {
  if (!csvPendingImport) return;
  const validos = csvPendingImport.validos;
  const errores = csvPendingImport.errores;
  const nuevos = validos.filter(function (x) { return x.nuevo; }).length;
  const container = crearContenedorModales();
  container.innerHTML = `
    <div class="inv-modal-overlay" onclick="if(event.target===this)window.INVENTARIO.cancelarImportacionCSV()">
      <div class="inv-modal-content">
        <h3 class="font-headline-md mb-2">Vista Previa de Importación CSV</h3>
        <p class="font-body-sm text-on-surface-variant mb-4">
          ${nuevos} nuevo(s) · ${validos.length - nuevos} a actualizar · ${csvPendingImport.sinCambios} sin cambios · <span class="${errores.length ? 'text-error' : ''}">${errores.length} con error</span>.
          Solo se importan las filas válidas. Celda vacía = sin cambios.
        </p>
        ${errores.length ? `<div class="inv-csv-errores">${errores.slice(0, 15).map(function (er) { return '<div>Línea ' + er.linea + (er.code ? ' (' + NUCLEO.esc(er.code) + ')' : '') + ': ' + NUCLEO.esc(er.msg) + '</div>'; }).join('')}${errores.length > 15 ? '<div>… y ' + (errores.length - 15) + ' más</div>' : ''}</div>` : ''}
        <div class="overflow-y-auto" style="max-height:300px;">
          <table class="table">
            <thead class="table-header"><tr><th>CÓDIGO</th><th>CAMBIOS</th><th>ACCIÓN</th></tr></thead>
            <tbody>
              ${validos.slice(0, 100).map(function (it) {
                return '<tr class="table-row"><td class="font-mono">' + NUCLEO.esc(it.code) + '</td><td class="font-body-sm">' + NUCLEO.esc(it.nuevo && it.cambios.name ? it.cambios.name + ' — ' : '') + NUCLEO.esc(resumenCambios(it)) + '</td><td><span class="badge ' + (it.nuevo ? 'badge-success' : 'badge-warning') + '">' + (it.nuevo ? 'NUEVO' : 'ACTUALIZA') + '</span></td></tr>';
              }).join('')}
              ${validos.length > 100 ? '<tr><td colspan="3" class="font-body-sm text-on-surface-variant">… y ' + (validos.length - 100) + ' más</td></tr>' : ''}
            </tbody>
          </table>
        </div>
        <div class="flex gap-space-sm justify-end" style="margin-top:var(--space-lg);">
          <button class="btn btn-secondary" onclick="window.INVENTARIO.cancelarImportacionCSV()">Cancelar</button>
          <button class="btn btn-primary" ${validos.length === 0 ? 'disabled' : ''} onclick="window.INVENTARIO.confirmarImportacionCSV()"><span class="material-symbols-outlined">check</span> APLICAR IMPORTACIÓN</button>
        </div>
      </div>
    </div>
  `;
}

function crearContenedorModales() {
  let el = $id('inv-modales-container');
  if (!el) { el = document.createElement('div'); el.id = 'inv-modales-container'; document.body.appendChild(el); }
  return el;
}

function cerrarModalCSV() {
  const container = $id('inv-modales-container');
  if (container) container.innerHTML = '';
}

function cancelarImportacionCSV() {
  csvPendingImport = null;
  cerrarModalCSV();
}

// Todo o nada: si cualquier fila falla, no se modifica nada.
function confirmarImportacionCSV() {
  if (!csvPendingImport) return;
  const pendiente = csvPendingImport;
  const userId = userId_();
  let nuevos = 0;
  let actualizados = 0;

  const ok = NUCLEO.transaccion(['pos_products', 'pos_stock_movements', 'pos_cost_history'], function () {
    const todos = NUCLEO.getData('pos_products');
    // 1) Campos directos (todo menos stock y costo)
    pendiente.validos.forEach(function (it) {
      let p = todos.find(function (x) { return x.code === it.code; });
      if (!p) {
        p = { code: it.code, name: '', category: '', price: 0, cost: 0, stock: 0, minStock: 0, active: true, noFiscal: false, expiryDate: '', expiryWarnDays: 7 };
        todos.push(p);
        nuevos++;
      } else { actualizados++; }
      ['name', 'category', 'price', 'minStock', 'active', 'noFiscal', 'expiryDate', 'expiryWarnDays'].forEach(function (k) {
        if (it.cambios[k] !== undefined) p[k] = it.cambios[k];
      });
    });
    if (!NUCLEO.setData('pos_products', todos)) return false;
    // 2) Stock y costo SOLO por los servicios del NÚCLEO (dejan movimiento e historial)
    for (let i = 0; i < pendiente.validos.length; i++) {
      const it = pendiente.validos[i];
      const fresco = NUCLEO.getData('pos_products').find(function (x) { return x.code === it.code; });
      if (it.cambios.stock !== undefined) {
        const delta = it.cambios.stock - (Number(fresco.stock) || 0);
        if (delta !== 0 && !NUCLEO.actualizarStock(it.code, delta, 'ajuste', userId, 'Importación CSV')) return false;
      }
      if (it.cambios.cost !== undefined && !NUCLEO.actualizarCostoProducto(it.code, it.cambios.cost, userId)) return false;
    }
    return true;
  });

  csvPendingImport = null;
  cerrarModalCSV();
  if (!ok) { NUCLEO.toast('La importación falló y se revirtió: no se modificó ningún dato.', 'error'); return; }
  cargarDatos();
  render();
  NUCLEO.toast('Importados: ' + nuevos + ' · Actualizados: ' + actualizados, 'success');
}

function exportarCSV() {
  const lista = aplicarFiltro();
  const data = lista.map(function (p) {
    const row = {};
    CSV_HEADERS.forEach(function (h) {
      if (h === 'active') row[h] = p.active !== false;
      else if (h === 'noFiscal') row[h] = !!p.noFiscal;
      else row[h] = p[h] !== undefined ? p[h] : '';
    });
    return row;
  });
  NUCLEO.exportCSV(data, 'inventario_' + NUCLEO.today() + '.csv');
}

// ==========================================
// 6. FILTROS
// ==========================================
function esVencido(p) { return !!p.expiryDate && diasHasta(p.expiryDate) < 0; }
function esPorVencer(p) { if (!p.expiryDate) return false; const d = diasHasta(p.expiryDate); return d >= 0 && d <= (p.expiryWarnDays || 7); }
function esFaltante(p) { const s = Number(p.stock) || 0; return !!p.minStock && s <= p.minStock && s > 0; }
function esAgotado(p) { return (Number(p.stock) || 0) === 0; }
function esSuelto(p) { return !!p.ventaSuelta || sueltosDe(p) > 0; }

function aplicarFiltroChip() {
  if (filtroActivo === 'INACTIVOS') return productos.filter(function (p) { return p.active === false; });
  let filtrados = productos.filter(function (p) { return p.active !== false; });
  switch (filtroActivo) {
    case 'VENCIDOS': filtrados = filtrados.filter(esVencido); break;
    case 'POR VENCER': filtrados = filtrados.filter(esPorVencer); break;
    case 'FALTANTES': filtrados = filtrados.filter(esFaltante); break;
    case 'AGOTADOS': filtrados = filtrados.filter(esAgotado); break;
    case 'NO FISCAL': filtrados = filtrados.filter(function (p) { return p.noFiscal; }); break;
    case 'SUELTO': filtrados = filtrados.filter(esSuelto); break;
  }
  return filtrados;
}

function aplicarFiltro() {
  const base = aplicarFiltroChip();
  const q = norm(busqueda);
  if (!q) return base;
  return base.filter(function (p) { return norm((p.code || '') + ' ' + (p.name || '') + ' ' + (p.category || '')).indexOf(q) !== -1; });
}

function calcularConteos() {
  const activos = productos.filter(function (p) { return p.active !== false; });
  return {
    todos: activos.length,
    vencidos: activos.filter(esVencido).length,
    porVencer: activos.filter(esPorVencer).length,
    faltantes: activos.filter(esFaltante).length,
    agotados: activos.filter(esAgotado).length,
    noFiscal: activos.filter(function (p) { return p.noFiscal; }).length,
    suelto: activos.filter(esSuelto).length,
    inactivos: productos.filter(function (p) { return p.active === false; }).length
  };
}

// ==========================================
// 7. API PÚBLICA
// ==========================================
window.INVENTARIO = {
  // Hooks del NÚCLEO
  init: init,
  onShow: onShow,
  onHide: onHide,
  onEscape: onEscape,
  onKey: onKey,
  // Acciones de la UI
  setFiltro: setFiltro,
  setBusqueda: setBusqueda,
  limpiarBusqueda: limpiarBusqueda,
  searchKeydown: searchKeydown,
  seleccionarProducto: seleccionarProducto,
  toggleMovimientos: toggleMovimientos,
  recalcularMargin: recalcularMargin,
  recalcularPrecio: recalcularPrecio,
  actualizarIndicadoresEnVivo: actualizarIndicadoresEnVivo,
  actualizarStock: actualizarStock,
  ajustarStock: ajustarStock,
  guardarProducto: guardarProducto,
  limpiarSeleccion: limpiarSeleccion,
  nuevoProducto: nuevoProducto,
  autoGenCodigo: autoGenCodigo,
  cerrarModalNuevo: cerrarModalNuevo,
  confirmarNuevoProducto: confirmarNuevoProducto,
  bajaProducto: bajaProducto,
  altaProducto: altaProducto,
  importarCSV: importarCSV,
  procesarCSV: procesarCSV,
  exportarCSV: exportarCSV,
  cancelarImportacionCSV: cancelarImportacionCSV,
  confirmarImportacionCSV: confirmarImportacionCSV
};
})();
