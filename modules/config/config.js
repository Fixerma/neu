/* ============================================
   NEURORA POS - CONFIG (ANEXO D)
   Módulo dueño de todas las configuraciones
   ============================================ */

(function () {
  'use strict';

  let vistaActiva = 'subcajas';
  let visible = false;
  let montoPreviewMoneda = 1200;
  let filtrosAud = { usuario: '', desde: '', hasta: '', seccion: '' };
  let scanHandler = null;
  let scanBuffer = '';

  const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const FORMAS_PAGO = ['Efectivo', 'Transferencia', 'Cuenta Corriente'];
  const SIN = '(sin vínculo — venta suelta)';
  const vistas = [
    { id: 'subcajas', nombre: 'Sub-Cajas', icono: 'inbox' },
    { id: 'categorias', nombre: 'Categorías', icono: 'category' },
    { id: 'margenes', nombre: 'Márgenes', icono: 'percent' },
    { id: 'costos', nombre: 'Costos', icono: 'request_quote' },
    { id: 'proveedores', nombre: 'Proveedores', icono: 'local_shipping' },
    { id: 'botonesrapidos', nombre: 'Botones Rápidos', icono: 'touch_app' },
    { id: 'moneda', nombre: 'Moneda', icono: 'payments' },
    { id: 'negocio', nombre: 'Negocio', icono: 'apartment' },
    { id: 'perifericos', nombre: 'Periféricos', icono: 'power' },
    { id: 'usuarios', nombre: 'Usuarios', icono: 'group' },
    { id: 'auditoria', nombre: 'Auditoría', icono: 'assignment' }
  ];

  // ==========================================
  // 0. HELPERS
  // ==========================================
  function $id(id) { return document.getElementById(id); }
  function esc(s) { return NUCLEO.esc(s); }
  function arg(v) { return NUCLEO.jsArg(v); }

  // Regla transversal de auditoría: cada guardado persiste en su clave Y se anota en pos_config_audit_log
  function aud(seccion, campo, anterior, nuevo, userId) {
    return NUCLEO.registrarCambioConfig({ modulo: 'CONFIG', seccion: seccion, campo: campo, valorAnterior: anterior, valorNuevo: nuevo, userId: userId });
  }

  // Anota solo los campos que realmente cambiaron
  function logMulti(seccion, anterior, nuevo, etiquetas) {
    Object.keys(etiquetas).forEach(function (k) {
      if (JSON.stringify((anterior || {})[k]) !== JSON.stringify((nuevo || {})[k])) aud(seccion, etiquetas[k], (anterior || {})[k], (nuevo || {})[k]);
    });
  }

  function validarCUIT(cuit) {
    if (!/^\d{2}-\d{8}-\d{1}$/.test(cuit || '')) return false;
    const n = cuit.replace(/-/g, '').split('').map(Number);
    const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let suma = 0;
    for (let i = 0; i < 10; i++) suma += n[i] * mult[i];
    let dv = 11 - (suma % 11);
    if (dv === 11) dv = 0;
    if (dv === 10) return false;
    return dv === n[10];
  }

  // Acepta 20123456786 o 20-12345678-6 y devuelve siempre XX-XXXXXXXX-X
  function normalizarCUIT(raw) {
    const d = String(raw || '').replace(/\D/g, '');
    return d.length === 11 ? d.slice(0, 2) + '-' + d.slice(2, 10) + '-' + d.slice(10) : String(raw || '').trim();
  }

  function emailValido(e) { return !e || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
  function nombreUsuario(id) { const u = (NUCLEO.getData('pos_users') || []).find(x => x.id === id); return u ? u.nombre : (id === 'sistema' ? 'Sistema' : (id || '—')); }
  function per() { return NUCLEO.getData('pos_peripherals') || {}; }

  // ==========================================
  // 1. CICLO DE VIDA (hooks del NÚCLEO)
  // ==========================================
  function init() {}
  function onShow() { visible = true; render(); }
  function onHide() { visible = false; cerrarModal(); }
  function onEscape() {
    if ($id('config-modal-overlay')) { cerrarModal(); return true; }
    return false;
  }

  // ==========================================
  // 2. MODALES (namespace .config-modal-*)
  // ==========================================
  function abrirModal(opts) {
    cerrarModal();
    const overlay = document.createElement('div');
    overlay.className = 'config-modal-overlay';
    overlay.id = 'config-modal-overlay';
    overlay.innerHTML = `
      <div class="config-modal">
        <div class="config-modal-header">
          <h3 class="config-modal-title">${esc(opts.titulo)}</h3>
          <button type="button" class="config-modal-close" onclick="window.CONFIG.cerrarModal()">✕</button>
        </div>
        <div class="config-modal-body">${opts.body}</div>
        ${opts.footer ? `<div class="config-modal-footer">${opts.footer}</div>` : ''}
      </div>`;
    overlay.addEventListener('click', function (e) { if (e.target === overlay) cerrarModal(); });
    document.body.appendChild(overlay);
    const primero = overlay.querySelector('input:not([type=checkbox]), select');
    if (primero) primero.focus();
    // Enter confirma el botón principal del modal
    overlay.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') {
        const ok = overlay.querySelector('.config-modal-footer .btn-primary');
        if (ok) { e.preventDefault(); ok.click(); }
      }
    });
  }

  function cerrarModal() {
    const o = $id('config-modal-overlay');
    if (o) o.remove();
    detenerEscuchaLector();
  }

  function footerGuardar(accion) {
    return '<button type="button" class="btn btn-secondary" onclick="window.CONFIG.cerrarModal()">CANCELAR</button>' +
      '<button type="button" class="btn btn-primary" onclick="' + accion + '">GUARDAR</button>';
  }

  function campo(label, id, valor, extra) {
    return `<div class="config-form-group"><label class="config-form-label">${label}</label>
      <input class="config-form-input" id="${id}" value="${esc(valor)}" ${extra || ''}></div>`;
  }

  function errorEn(id, msg) { const e = $id(id); if (e) e.textContent = msg; return false; }

  // ==========================================
  // 3. RENDER PRINCIPAL
  // ==========================================
  function render() {
    if (!visible) return;
    const container = $id('moduleContainer');
    if (!container) return;
    container.innerHTML = `
      <div class="config-layout">
        ${renderSidebar()}
        <div class="config-main">${renderPanel()}</div>
      </div>`;
    document.querySelectorAll('.config-sidebar-item[data-vista]').forEach(function (item) {
      item.addEventListener('click', function () { vistaActiva = this.getAttribute('data-vista'); render(); });
    });
  }

  function renderSidebar() {
    return `
      <div class="config-sidebar">
        <div class="config-sidebar-header">
          <div class="config-sidebar-title">CONFIGURACIÓN</div>
          <div class="config-sidebar-subtitle">Ajustes y parámetros del sistema</div>
        </div>
        <div class="config-sidebar-section">
          <div class="config-sidebar-section-title">MÓDULOS ACTIVOS</div>
          ${vistas.map(v => `
            <div class="config-sidebar-item ${vistaActiva === v.id ? 'active' : ''}" data-vista="${v.id}">
              <span class="material-symbols-outlined">${v.icono}</span><span>${v.nombre}</span>
            </div>`).join('')}
        </div>
        <div class="config-sidebar-section">
          <div class="config-sidebar-section-title">APARCADO / RESTRINGIDO</div>
          <div class="config-sidebar-item disabled"><span class="material-symbols-outlined">schedule</span><span>Turnos y Horarios</span><span style="margin-left:auto;font-size:10px;">Inactivo</span></div>
          <div class="config-sidebar-item locked"><span class="material-symbols-outlined">print_disabled</span><span>Impresoras Fiscales</span><span class="material-symbols-outlined" style="margin-left:auto;font-size:16px;">lock</span></div>
          <div class="config-sidebar-item locked"><span class="material-symbols-outlined">devices_other</span><span>Periféricos Avanzados</span><span class="material-symbols-outlined" style="margin-left:auto;font-size:16px;">lock</span></div>
        </div>
      </div>`;
  }

  function renderPanel() {
    switch (vistaActiva) {
      case 'subcajas': return renderSubCajas();
      case 'categorias': return renderCategorias();
      case 'margenes': return renderMargenes();
      case 'costos': return renderCostos();
      case 'proveedores': return renderProveedores();
      case 'botonesrapidos': return renderBotonesRapidos();
      case 'moneda': return renderMoneda();
      case 'negocio': return renderNegocio();
      case 'perifericos': return renderPerifericos();
      case 'usuarios': return renderUsuarios();
      case 'auditoria': return renderAuditoria();
      default: return '<div class="config-panel">Vista no encontrada</div>';
    }
  }

  function header(titulo, extra) {
    return `<div class="config-panel-header"><h2 class="config-panel-title">${titulo}</h2>${extra || ''}</div>`;
  }

  // ==========================================
  // 4. SUB-CAJAS
  // ==========================================
  function renderSubCajas() {
    const sub = NUCLEO.getData('pos_subcajas');
    const products = NUCLEO.getData('pos_products');
    const hayCat = NUCLEO.getData('pos_categories').some(c => NUCLEO.esCategoriaCigarrillos(c));
    const brands = sub.selectedBrands || [];
    const habilitadas = brands.filter(b => b.habilitada).length;
    return `
      <div class="config-panel">
        <div class="config-panel-header"><div>
          <div class="font-label-sm text-on-surface-variant uppercase tracking-wider">CONFIGURACIÓN GENERAL · OPERACIÓN DE CAJA</div>
          <h2 class="config-panel-title">Configuración de Sub-Cajas</h2>
          <p class="font-body-md text-on-surface-variant">Gestiona las reglas de venta suelta, límites operativos y opciones de cierre para el punto de venta.</p>
        </div></div>
        ${hayCat ? '' : '<div class="config-info-box" id="cfg-aviso-cig"><strong>Paso previo:</strong> creá la categoría <strong>Cigarrillos</strong> en CONFIG · Categorías para habilitar la venta de cigarrillos y la sub-caja.</div>'}
        <div class="config-form">
          <div class="config-form-group">
            <label class="config-form-label">Imprimir ticket de cuadre al cierre</label>
            <p class="font-body-sm text-on-surface-variant mb-2">Emite automáticamente un resumen físico del inventario fraccionado en la ticketera primaria</p>
            <div class="config-toggle">
              <div class="config-toggle-switch ${sub.printSubCajaTicketOnClose ? 'active' : ''}" onclick="window.CONFIG.toggleSubCajaTicket()"></div>
              <span class="config-toggle-label">${sub.printSubCajaTicketOnClose ? 'SÍ' : 'NO'}</span>
            </div>
          </div>
          <h3 class="font-headline-sm mt-4 mb-2">Marcas Habilitadas para Venta Suelta</h3>
          <div class="flex items-center justify-between mb-2">
            <span class="font-label-md">${habilitadas} Marcas Habilitadas · ${brands.length} en la lista</span>
            <button class="btn btn-primary" onclick="window.CONFIG.agregarMarca()"><span class="material-symbols-outlined" style="font-size:18px;">add</span> AGREGAR MARCA</button>
          </div>
          <table class="config-table">
            <thead><tr><th>MARCA / PRESENTACIÓN</th><th>PRECIO SUELTO</th><th>HABILITAR</th><th>ACCIONES</th></tr></thead>
            <tbody id="cfg-subcajas-body">
              ${brands.length === 0 ? '<tr><td colspan="4" class="text-on-surface-variant">Todavía no agregaste marcas. Usá AGREGAR MARCA.</td></tr>' : brands.map(b => {
                const p = products.find(x => x.code === b.code);
                const nombre = p ? p.name : b.name;
                return `<tr>
                  <td><div class="font-semibold">${esc(nombre)}</div><div class="font-body-sm text-on-surface-variant">SKU: ${esc(b.code)} · ${p && p.active !== false ? 'Fracción por unidad' : '<span class="text-error">producto no disponible en INVENTARIO</span>'}</div></td>
                  <td><input type="number" min="0" step="1" class="config-price-input-sm" value="${esc(b.priceLoose)}" onchange="window.CONFIG.actualizarPrecioSuelto(${arg(b.code)}, this.value)"></td>
                  <td><span class="material-symbols-outlined config-inline-toggle ${b.habilitada ? 'text-tertiary-fixed-dim' : 'text-outline'}" title="Click para ${b.habilitada ? 'deshabilitar' : 'habilitar'} venta suelta" onclick="window.CONFIG.toggleHabilitarMarca(${arg(b.code)})">${b.habilitada ? 'check_box' : 'check_box_outline_blank'}</span></td>
                  <td><button class="config-table-btn delete" onclick="window.CONFIG.eliminarMarca(${arg(b.code)})">✕</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  }

  function toggleSubCajaTicket() {
    const sub = NUCLEO.getData('pos_subcajas');
    const antes = !!sub.printSubCajaTicketOnClose;
    sub.printSubCajaTicketOnClose = !antes;
    if (!NUCLEO.setData('pos_subcajas', sub)) return;
    aud('Sub-Cajas', 'printSubCajaTicketOnClose', antes, sub.printSubCajaTicketOnClose);
    render();
  }

  function agregarMarca() {
    const sub = NUCLEO.getData('pos_subcajas');
    const ya = (sub.selectedBrands || []).map(b => b.code);
    const hayCat = NUCLEO.getData('pos_categories').some(c => NUCLEO.esCategoriaCigarrillos(c));
    if (!hayCat) { NUCLEO.toast('Primero creá la categoría "Cigarrillos" en Categorías', 'warning'); return; }
    const marcas = NUCLEO.getData('pos_products').filter(p => NUCLEO.esCategoriaCigarrillos(p.category) && p.active !== false && ya.indexOf(p.code) === -1);
    if (marcas.length === 0) { NUCLEO.toast('No hay productos activos de "Cigarrillos" para agregar', 'warning'); return; }
    abrirModal({
      titulo: 'Agregar Marca a Sub-Caja',
      body: `<input type="text" class="config-form-input mb-2" id="modal-buscar-marca" placeholder="Buscar por nombre o código..." oninput="window.CONFIG.filtrarModalLista('modal-buscar-marca','modal-lista-marcas')">
        <div class="config-modal-list" id="modal-lista-marcas">
          ${marcas.map(p => `<div class="config-modal-list-item" data-texto="${esc((p.name + ' ' + p.code).toLowerCase())}" onclick="window.CONFIG.seleccionarMarca(${arg(p.code)})">
            <span class="font-semibold">${esc(p.name)}</span><span class="font-body-sm text-on-surface-variant">SKU ${esc(p.code)} · ${NUCLEO.money(p.price)}</span></div>`).join('')}
        </div>`
    });
  }

  function seleccionarMarca(code) {
    const p = NUCLEO.getData('pos_products').find(x => x.code === code);
    if (!p) { NUCLEO.toast('Producto no encontrado', 'error'); return; }
    const sub = NUCLEO.getData('pos_subcajas');
    sub.selectedBrands = sub.selectedBrands || [];
    if (sub.selectedBrands.some(b => b.code === code)) { NUCLEO.toast('La marca ya está en la lista', 'warning'); return; }
    const precio = p.priceLoose || NUCLEO.roundCurrency((p.price || 0) / 20);
    sub.selectedBrands.push({ code: p.code, name: p.name, priceLoose: precio, habilitada: true });
    const ok = NUCLEO.transaccion(['pos_subcajas', 'pos_products'], function () {
      return NUCLEO.setData('pos_subcajas', sub) && NUCLEO.setProductCigConfig(p.code, true, precio);
    });
    if (!ok) return;
    aud('Sub-Cajas', 'selectedBrands', '—', p.name);
    cerrarModal(); render();
    NUCLEO.toast('Marca agregada', 'success');
  }

  function actualizarPrecioSuelto(code, valor) {
    const sub = NUCLEO.getData('pos_subcajas');
    const b = (sub.selectedBrands || []).find(x => x.code === code);
    if (!b) return;
    const p = NUCLEO.getData('pos_products').find(x => x.code === code);
    // Vacío = precio sugerido (precio del paquete / 20, redondeado)
    const precio = String(valor).trim() === '' ? NUCLEO.roundCurrency(((p || {}).price || 0) / 20) : Number(valor);
    if (isNaN(precio) || precio < 0) { NUCLEO.toast('Precio inválido', 'error'); render(); return; }
    const antes = b.priceLoose;
    b.priceLoose = precio;
    const ok = NUCLEO.transaccion(['pos_subcajas', 'pos_products'], function () {
      return NUCLEO.setData('pos_subcajas', sub) && NUCLEO.setProductCigConfig(code, b.habilitada, precio);
    });
    if (!ok) return;
    aud('Sub-Cajas', 'priceLoose (' + b.name + ')', antes, precio);
    render();
    NUCLEO.toast('Precio suelto actualizado', 'success');
  }

  function toggleHabilitarMarca(code) {
    const sub = NUCLEO.getData('pos_subcajas');
    const b = (sub.selectedBrands || []).find(x => x.code === code);
    if (!b) return;
    const antes = b.habilitada;
    b.habilitada = !antes;
    const ok = NUCLEO.transaccion(['pos_subcajas', 'pos_products'], function () {
      return NUCLEO.setData('pos_subcajas', sub) && NUCLEO.setProductCigConfig(code, b.habilitada, b.priceLoose);
    });
    if (!ok) return;
    aud('Sub-Cajas', 'habilitada (' + b.name + ')', antes, b.habilitada);
    render();
  }

  function eliminarMarca(code) {
    const sub = NUCLEO.getData('pos_subcajas');
    const b = (sub.selectedBrands || []).find(x => x.code === code);
    if (!b) return;
    const p = NUCLEO.getData('pos_products').find(x => x.code === code);
    const sueltos = p ? (Number(p['sueltos_' + code]) || 0) : 0;
    NUCLEO.confirmar('Quitar marca', '¿Quitar "' + b.name + '" de la sub-caja? Se desactiva su venta suelta.' + (sueltos > 0 ? '\nQuedan ' + sueltos + ' sueltos físicos registrados.' : ''), 'QUITAR').then(function (ok) {
      if (!ok) return;
      const s2 = NUCLEO.getData('pos_subcajas');
      s2.selectedBrands = (s2.selectedBrands || []).filter(x => x.code !== code);
      const hecho = NUCLEO.transaccion(['pos_subcajas', 'pos_products'], function () {
        NUCLEO.setDataStrict('pos_subcajas', s2);
        NUCLEO.setProductCigConfig(code, false, 0);
        return true;
      });
      if (!hecho) return;
      aud('Sub-Cajas', 'selectedBrands', b.name, '—');
      render();
      NUCLEO.toast('Marca quitada', 'success');
    });
  }

  function filtrarModalLista(inputId, listId) {
    const input = $id(inputId), list = $id(listId);
    if (!input || !list) return;
    const q = input.value.trim().toLowerCase();
    Array.prototype.forEach.call(list.children, function (item) {
      item.style.display = (item.getAttribute('data-texto') || '').indexOf(q) === -1 ? 'none' : '';
    });
  }

  // ==========================================
  // 5. CATEGORÍAS
  // ==========================================
  function renderCategorias() {
    const cats = NUCLEO.getData('pos_categories');
    const products = NUCLEO.getData('pos_products');
    return `
      <div class="config-panel">
        ${header('Categorías', '<button class="btn btn-primary" onclick="window.CONFIG.agregarCategoria()"><span class="material-symbols-outlined" style="font-size:18px;">add</span> AGREGAR CATEGORÍA</button>')}
        <table class="config-table">
          <thead><tr><th>ID</th><th>NOMBRE</th><th>PRODUCTOS ASOCIADOS</th><th>EDITAR</th><th>✕</th></tr></thead>
          <tbody id="cfg-categorias-body">
            ${cats.length === 0 ? '<tr><td colspan="5" class="text-on-surface-variant">Sin categorías. Creá "Cigarrillos" primero si vendés cigarrillos.</td></tr>' : cats.map((cat, idx) => {
              const todos = products.filter(p => p.category === cat);
              const activos = todos.filter(p => p.active !== false).length;
              const fija = NUCLEO.esCategoriaCigarrillos(cat);
              return `<tr>
                <td>${idx + 1}</td>
                <td>${esc(cat)} ${fija ? '<span class="config-badge config-badge-fixed">Categoría del sistema (fija)</span>' : ''}</td>
                <td>${activos}${todos.length > activos ? ' <span class="text-on-surface-variant font-body-sm">(+' + (todos.length - activos) + ' inactivos)</span>' : ''}</td>
                <td>${fija ? '<span class="text-outline font-label-sm">Intocable</span>' : `<button class="config-table-btn edit" onclick="window.CONFIG.editarCategoria(${arg(cat)})">Editar</button>`}</td>
                <td>${fija ? '<span class="text-outline">—</span>' : `<button class="config-table-btn delete" onclick="window.CONFIG.eliminarCategoria(${arg(cat)})">✕</button>`}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // "cigarrillos" en cualquier mayúscula se guarda como la categoría fija "Cigarrillos"
  function canonCategoria(n) { return NUCLEO.esCategoriaCigarrillos(n) ? 'Cigarrillos' : n; }
  function existeCategoria(n, excepto) {
    return NUCLEO.getData('pos_categories').some(c => c !== excepto && c.toLowerCase() === n.toLowerCase());
  }

  function agregarCategoria() {
    abrirModal({
      titulo: 'Nueva Categoría',
      body: `<div class="config-form-group"><label class="config-form-label">Nombre <span class="required">*</span></label>
        <input type="text" class="config-form-input" id="modal-categoria-nombre" placeholder="Ej: Bebidas, Limpieza..."><div class="config-modal-error" id="modal-categoria-error"></div></div>`,
      footer: footerGuardar('window.CONFIG.confirmarAgregarCategoria()')
    });
  }

  function confirmarAgregarCategoria() {
    const nombre = canonCategoria(NUCLEO.normText($id('modal-categoria-nombre').value));
    if (!nombre) return errorEn('modal-categoria-error', 'El nombre es obligatorio');
    if (existeCategoria(nombre)) return errorEn('modal-categoria-error', 'La categoría ya existe');
    const cats = NUCLEO.getData('pos_categories');
    cats.push(nombre);
    if (!NUCLEO.setData('pos_categories', cats)) return;
    aud('Categorías', 'Nombre', '—', nombre);
    cerrarModal(); render();
    NUCLEO.toast('Categoría agregada', 'success');
  }

  function editarCategoria(old) {
    if (NUCLEO.esCategoriaCigarrillos(old)) { NUCLEO.toast('No se puede eliminar ni renombrar', 'error'); return; }
    abrirModal({
      titulo: 'Renombrar Categoría',
      body: `<div class="config-form-group"><label class="config-form-label">Nombre <span class="required">*</span></label>
        <input type="text" class="config-form-input" id="modal-categoria-nombre" value="${esc(old)}"><div class="config-modal-error" id="modal-categoria-error"></div></div>`,
      footer: footerGuardar('window.CONFIG.confirmarEditarCategoria(' + arg(old) + ')')
    });
  }

  function confirmarEditarCategoria(old) {
    const nuevo = NUCLEO.normText($id('modal-categoria-nombre').value);
    if (!nuevo) return errorEn('modal-categoria-error', 'El nombre es obligatorio');
    if (nuevo === old) { cerrarModal(); return; }
    if (NUCLEO.esCategoriaCigarrillos(nuevo)) return errorEn('modal-categoria-error', '"Cigarrillos" es un nombre reservado del sistema');
    if (existeCategoria(nuevo, old)) return errorEn('modal-categoria-error', 'Ya existe una categoría con ese nombre');
    // Productos y margen mínimo se mueven juntos (servicio del NÚCLEO)
    const cats = NUCLEO.getData('pos_categories');
    const i = cats.indexOf(old);
    if (i === -1) { cerrarModal(); return; }
    NUCLEO.renombrarCategoria(old, nuevo);
    moverFactorCategoria(old, nuevo);
    cats[i] = nuevo;
    if (!NUCLEO.setData('pos_categories', cats)) return;
    aud('Categorías', 'Nombre', old, nuevo);
    cerrarModal(); render();
    NUCLEO.toast('Categoría renombrada', 'success');
  }

  function eliminarCategoria(nombre) {
    if (NUCLEO.esCategoriaCigarrillos(nombre)) { NUCLEO.toast('No se puede eliminar ni renombrar', 'error'); return; }
    // Cuenta TODOS los productos (también los dados de baja) para no dejar huérfanos
    const count = NUCLEO.getData('pos_products').filter(p => p.category === nombre).length;
    if (count > 0) { NUCLEO.toast('No se puede eliminar: hay ' + count + ' productos usando esta categoría', 'error'); return; }
    NUCLEO.confirmar('Eliminar categoría', '¿Eliminar la categoría "' + nombre + '"?', 'ELIMINAR').then(function (ok) {
      if (!ok) return;
      const hecho = NUCLEO.transaccion(['pos_categories', 'pos_min_margins', 'pos_cost_factors'], function () {
        NUCLEO.setDataStrict('pos_categories', NUCLEO.getData('pos_categories').filter(c => c !== nombre));
        const mm = NUCLEO.getData('pos_min_margins') || {};
        if (Object.prototype.hasOwnProperty.call(mm, nombre)) { delete mm[nombre]; NUCLEO.setDataStrict('pos_min_margins', mm); }
        const cf = NUCLEO.getData('pos_cost_factors');
        if (cf.categorias && Object.prototype.hasOwnProperty.call(cf.categorias, nombre)) { delete cf.categorias[nombre]; NUCLEO.setDataStrict('pos_cost_factors', cf); }
        return true;
      });
      if (!hecho) return;
      aud('Categorías', 'Nombre', nombre, '—');
      render();
      NUCLEO.toast('Categoría eliminada', 'success');
    });
  }

  // ==========================================
  // 6. MÁRGENES
  // ==========================================
  function renderMargenes() {
    const cats = NUCLEO.getData('pos_categories');
    const mm = NUCLEO.getData('pos_min_margins') || {};
    return `
      <div class="config-panel">
        ${header('Márgenes')}
        <p class="font-body-sm text-on-surface-variant mb-2">El margen se calcula sobre el costo: (precio − costo) / costo.</p>
        <table class="config-table">
          <thead><tr><th>CATEGORÍA</th><th>MARGEN MÍNIMO (%)</th><th>EDITAR</th></tr></thead>
          <tbody>
            ${cats.length === 0 ? '<tr><td colspan="3" class="text-on-surface-variant">Sin categorías.</td></tr>' : cats.map(cat => {
              const fija = NUCLEO.esCategoriaCigarrillos(cat);
              return `<tr>
                <td>${esc(cat)} ${fija ? '<span class="config-badge config-badge-fixed">Categoría del sistema (fija)</span>' : ''}</td>
                <td>${fija ? '<span class="config-badge config-badge-excluded">EXCLUIDO</span>' : NUCLEO.getMargenMinimo(cat) + '%'}</td>
                <td>${fija ? '<span class="text-outline font-label-sm">—</span>' : `<button class="config-table-btn edit" onclick="window.CONFIG.editarMargen(${arg(cat)})">Editar</button>`}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        <div class="config-info-box mt-4">Margen default para nuevas categorías: <strong>35%</strong></div>
      </div>`;
  }

  function editarMargen(cat) {
    if (NUCLEO.esCategoriaCigarrillos(cat)) { NUCLEO.toast('Cigarrillos no tiene margen mínimo', 'warning'); return; }
    abrirModal({
      titulo: 'Margen mínimo — ' + cat,
      body: `<div class="config-form-group"><label class="config-form-label">Margen mínimo (%) — entre 0 y 100</label>
        <input type="number" min="0" max="100" step="0.5" class="config-form-input" id="modal-margen-valor" value="${esc(NUCLEO.getMargenMinimo(cat))}"><div class="config-modal-error" id="modal-margen-error"></div></div>`,
      footer: footerGuardar('window.CONFIG.confirmarMargen(' + arg(cat) + ')')
    });
  }

  function confirmarMargen(cat) {
    const raw = $id('modal-margen-valor').value;
    const n = parseFloat(raw);
    if (raw === '' || isNaN(n) || n < 0 || n > 100) return errorEn('modal-margen-error', 'Ingresá un valor entre 0 y 100');
    const antes = NUCLEO.getMargenMinimo(cat);
    const mm = NUCLEO.getData('pos_min_margins') || {};
    mm[cat] = n;
    if (!NUCLEO.setData('pos_min_margins', mm)) return;
    aud('Márgenes', 'Margen Mínimo (' + cat + ')', antes + '%', n + '%');
    cerrarModal(); render();
    NUCLEO.toast('Margen actualizado', 'success');
  }

  // ==========================================
  // 7. PROVEEDORES (la baja siempre es lógica)
  // ==========================================
  // ==========================================
  // 6.5 COSTOS (% del precio de factura que se toma como costo real)
  // ==========================================
  function leerFactores() {
    const cf = NUCLEO.getData('pos_cost_factors') || {};
    cf.tipos = Object.assign({ A: 70, B: 70, X: 50 }, cf.tipos || {});
    cf.categorias = cf.categorias || {};
    return cf;
  }

  function moverFactorCategoria(old, nuevo) {
    const cf = leerFactores();
    if (Object.prototype.hasOwnProperty.call(cf.categorias, old)) {
      cf.categorias[nuevo] = cf.categorias[old];
      delete cf.categorias[old];
      NUCLEO.setData('pos_cost_factors', cf);
    }
  }

  function renderCostos() {
    const cf = leerFactores();
    const cats = NUCLEO.getData('pos_categories');
    return `
      <div class="config-panel">
        ${header('Costos')}
        <div class="config-info-box">El <strong>costo real</strong> de un producto es un porcentaje de su precio de factura. Se aplica el primero que exista:
          <strong>1) el % propio del producto</strong> (en INVENTARIO), <strong>2) el % de su categoría</strong> (acá abajo), <strong>3) el % del tipo de factura</strong> (acá abajo).
          Ejemplo: Medicamentos al 100% significa que se toma el precio de factura completo.</div>
        <h3 class="font-headline-sm mt-4 mb-2">Por tipo de factura (base)</h3>
        <table class="config-table">
          <thead><tr><th>TIPO</th><th>% COSTO REAL</th><th>EDITAR</th></tr></thead>
          <tbody id="cfg-costos-tipos">
            ${['A', 'B', 'X'].map(t => `<tr><td>Tipo ${t}</td><td>${cf.tipos[t]}%</td><td><button class="config-table-btn edit" onclick="window.CONFIG.editarFactorTipo(${arg(t)})">Editar</button></td></tr>`).join('')}
          </tbody>
        </table>
        <h3 class="font-headline-sm mt-4 mb-2">Por categoría</h3>
        <table class="config-table">
          <thead><tr><th>CATEGORÍA</th><th>% COSTO REAL</th><th>EDITAR</th></tr></thead>
          <tbody id="cfg-costos-categorias">
            ${cats.length === 0 ? '<tr><td colspan="3" class="text-on-surface-variant">Sin categorías.</td></tr>' : cats.map(c => `<tr><td>${esc(c)}</td>
              <td>${cf.categorias[c] ? cf.categorias[c] + '%' : '<span class="text-on-surface-variant">usa el del tipo de factura</span>'}</td>
              <td><button class="config-table-btn edit" onclick="window.CONFIG.editarFactorCategoria(${arg(c)})">Editar</button></td></tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function editarFactorTipo(t) {
    abrirModal({
      titulo: 'Costo real — Factura tipo ' + t,
      body: `${campo('% del precio de factura (entre 1 y 100)', 'modal-factor-valor', leerFactores().tipos[t], 'type="number" min="1" max="100" step="0.5"')}<div class="config-modal-error" id="modal-factor-error"></div>`,
      footer: footerGuardar('window.CONFIG.confirmarFactorTipo(' + arg(t) + ')')
    });
  }

  function confirmarFactorTipo(t) {
    const raw = $id('modal-factor-valor').value;
    const n = parseFloat(raw);
    if (raw === '' || isNaN(n) || n < 1 || n > 100) return errorEn('modal-factor-error', 'Ingresá un porcentaje entre 1 y 100');
    const cf = leerFactores();
    const antes = cf.tipos[t];
    cf.tipos[t] = n;
    if (!NUCLEO.setData('pos_cost_factors', cf)) return;
    aud('Costos', 'Tipo de factura ' + t, antes + '%', n + '%');
    cerrarModal(); render();
    NUCLEO.toast('Porcentaje actualizado', 'success');
  }

  function editarFactorCategoria(cat) {
    const actual = leerFactores().categorias[cat];
    abrirModal({
      titulo: 'Costo real — ' + cat,
      body: `${campo('% del precio de factura (1 a 100). Vacío = usar el del tipo de factura', 'modal-factor-valor', actual || '', 'type="number" min="1" max="100" step="0.5"')}<div class="config-modal-error" id="modal-factor-error"></div>`,
      footer: footerGuardar('window.CONFIG.confirmarFactorCategoria(' + arg(cat) + ')')
    });
  }

  function confirmarFactorCategoria(cat) {
    const raw = $id('modal-factor-valor').value;
    const cf = leerFactores();
    const antes = cf.categorias[cat];
    if (raw === '') delete cf.categorias[cat];
    else {
      const n = parseFloat(raw);
      if (isNaN(n) || n < 1 || n > 100) return errorEn('modal-factor-error', 'Ingresá un porcentaje entre 1 y 100, o dejalo vacío');
      cf.categorias[cat] = n;
    }
    if (!NUCLEO.setData('pos_cost_factors', cf)) return;
    aud('Costos', 'Categoría ' + cat, antes ? antes + '%' : '—', raw === '' ? '—' : cf.categorias[cat] + '%');
    cerrarModal(); render();
    NUCLEO.toast('Porcentaje actualizado', 'success');
  }

  function renderProveedores() {
    const provs = NUCLEO.getData('pos_suppliers');
    const pedidos = NUCLEO.getData('pos_purchase_orders');
    const facturas = NUCLEO.getData('pos_invoices');
    return `
      <div class="config-panel">
        ${header('Proveedores', '<button class="btn btn-primary" onclick="window.CONFIG.agregarProveedor()"><span class="material-symbols-outlined" style="font-size:18px;">add</span> AGREGAR PROVEEDOR</button>')}
        <table class="config-table">
          <thead><tr><th>NOMBRE</th><th>RUBRO</th><th>CUIT</th><th>DÍAS VISITA</th><th>DÍAS ENTREGA</th><th>FAC / CRÉD</th><th>ACCIONES</th></tr></thead>
          <tbody>
            ${provs.length === 0 ? '<tr><td colspan="7" class="text-on-surface-variant">Sin proveedores.</td></tr>' : provs.map(p => {
              const baja = p.activo === false;
              const usado = pedidos.some(o => o.proveedorId === p.id) || facturas.some(f => f.proveedorId === p.id);
              return `<tr style="${baja ? 'opacity:.55;' : ''}">
                <td class="font-semibold">${esc(p.nombre)} ${baja ? '<span class="config-badge config-badge-fixed">BAJA</span>' : ''}</td>
                <td>${esc(p.rubro)}</td><td class="font-mono">${esc(p.cuit || '—')}</td>
                <td class="font-body-sm">${esc((p.diasVisita || []).join(', '))}</td><td class="font-body-sm">${esc((p.diasEntrega || []).join(', '))}</td>
                <td>${esc(p.tipoFactura || 'A')} • ${Number(p.diasCredito) || 0}d</td>
                <td><div class="config-table-actions">
                  <button class="config-table-btn edit" onclick="window.CONFIG.editarProveedor(${arg(p.id)})">Editar</button>
                  ${baja ? `<button class="config-table-btn edit" onclick="window.CONFIG.reactivarProveedor(${arg(p.id)})">Reactivar</button>`
                         : `<button class="config-table-btn delete" title="${usado ? 'Tiene pedidos/facturas: se da de baja sin borrar historial' : 'Dar de baja'}" onclick="window.CONFIG.eliminarProveedor(${arg(p.id)})">✕</button>`}
                </div></td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function agregarProveedor() { abrirModalProveedor(null); }
  function editarProveedor(id) {
    const p = NUCLEO.getData('pos_suppliers').find(x => x.id === id);
    if (p) abrirModalProveedor(p);
  }

  function abrirModalProveedor(ex) {
    const p = ex || { nombre: '', rubro: '', cuit: '', telefono: '', email: '', whatsapp: '', diasVisita: [], diasEntrega: [], formasPago: [], tipoFactura: 'A', diasCredito: 0 };
    const checks = (name, sel, lista, clase, cls2) => `<div class="${clase}">` + lista.map(d =>
      `<label class="${cls2}"><input type="checkbox" name="${name}" value="${esc(d)}" ${(sel || []).indexOf(d) !== -1 ? 'checked' : ''}> ${esc(name === 'modal-prov-formaspago' ? d : d.slice(0, 3))}</label>`).join('') + '</div>';
    abrirModal({
      titulo: ex ? 'Editar Proveedor' : 'Agregar Proveedor',
      body: `
        ${campo('Nombre / Razón Social <span class="required">*</span>', 'modal-prov-nombre', p.nombre)}
        <div class="config-modal-grid-2">
          ${campo('Rubro <span class="required">*</span>', 'modal-prov-rubro', p.rubro, 'placeholder="Bebidas, Almacén, Limpieza..."')}
          ${campo('CUIT <span class="text-on-surface-variant">(opcional)</span>', 'modal-prov-cuit', p.cuit, 'placeholder="XX-XXXXXXXX-X"')}
        </div>
        <div class="config-modal-grid-2">
          ${campo('Teléfono', 'modal-prov-telefono', p.telefono || '')}
          ${campo('Email', 'modal-prov-email', p.email || '', 'type="email"')}
        </div>
        ${campo('WhatsApp', 'modal-prov-whatsapp', p.whatsapp || '')}
        <div class="config-form-group"><label class="config-form-label">Días de Visita</label>${checks('modal-prov-diasvisita', p.diasVisita, DIAS_SEMANA, 'config-days-grid', 'config-day-checkbox')}</div>
        <div class="config-form-group"><label class="config-form-label">Días de Entrega</label>${checks('modal-prov-diasentrega', p.diasEntrega, DIAS_SEMANA, 'config-days-grid', 'config-day-checkbox')}</div>
        <div class="config-form-group"><label class="config-form-label">Formas de Pago</label>${checks('modal-prov-formaspago', p.formasPago, FORMAS_PAGO, 'config-payment-methods', 'config-payment-method')}</div>
        <div class="config-modal-grid-2">
          <div class="config-form-group"><label class="config-form-label">Tipo de Factura (por defecto)</label>
            <select class="config-form-select" id="modal-prov-tipofactura">${['A', 'B', 'X'].map(t => `<option value="${t}" ${p.tipoFactura === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
          ${campo('Días de Crédito (0 = contado)', 'modal-prov-diascredito', p.diasCredito || 0, 'type="number" min="0"')}
        </div>
        <div class="config-modal-error" id="modal-prov-error"></div>`,
      footer: footerGuardar('window.CONFIG.guardarProveedorModal(' + arg(ex ? ex.id : '') + ')')
    });
  }

  function marcados(name) { return Array.prototype.slice.call(document.querySelectorAll('input[name="' + name + '"]:checked')).map(e => e.value); }

  function guardarProveedorModal(id) {
    const nombre = NUCLEO.normText($id('modal-prov-nombre').value);
    const rubro = NUCLEO.normText($id('modal-prov-rubro').value);
    const cuitRaw = NUCLEO.normText($id('modal-prov-cuit').value);
    const email = NUCLEO.normText($id('modal-prov-email').value);
    const credito = parseInt($id('modal-prov-diascredito').value, 10);
    if (!nombre) return errorEn('modal-prov-error', 'El nombre es obligatorio.');
    if (!rubro) return errorEn('modal-prov-error', 'El rubro es obligatorio.');
    const cuit = cuitRaw ? normalizarCUIT(cuitRaw) : '';
    if (cuit && !validarCUIT(cuit)) return errorEn('modal-prov-error', 'CUIT inválido (formato XX-XXXXXXXX-X con dígito verificador correcto). Podés dejarlo vacío.');
    if (!emailValido(email)) return errorEn('modal-prov-error', 'El email no tiene un formato válido.');
    if (isNaN(credito) || credito < 0) return errorEn('modal-prov-error', 'Los días de crédito deben ser 0 o más.');

    const nuevo = {
      nombre: nombre, rubro: rubro, cuit: cuit, telefono: NUCLEO.normText($id('modal-prov-telefono').value), email: email,
      whatsapp: NUCLEO.normText($id('modal-prov-whatsapp').value),
      diasVisita: marcados('modal-prov-diasvisita'), diasEntrega: marcados('modal-prov-diasentrega'), formasPago: marcados('modal-prov-formaspago'),
      tipoFactura: $id('modal-prov-tipofactura').value, diasCredito: credito
    };
    const provs = NUCLEO.getData('pos_suppliers');
    const etiquetas = { nombre: 'Nombre', rubro: 'Rubro', cuit: 'CUIT', telefono: 'Teléfono', email: 'Email', whatsapp: 'WhatsApp', diasVisita: 'Días de Visita', diasEntrega: 'Días de Entrega', formasPago: 'Formas de Pago', tipoFactura: 'Tipo de Factura', diasCredito: 'Días de Crédito' };
    if (id) {
      const p = provs.find(x => x.id === id);
      if (!p) return;
      const anterior = Object.assign({}, p);
      Object.assign(p, nuevo);
      if (!NUCLEO.setData('pos_suppliers', provs)) return;
      logMulti('Proveedores', anterior, nuevo, etiquetas);
      NUCLEO.toast('Proveedor actualizado', 'success');
    } else {
      nuevo.id = NUCLEO.uid(); nuevo.activo = true;
      provs.push(nuevo);
      if (!NUCLEO.setData('pos_suppliers', provs)) return;
      aud('Proveedores', 'Nombre', '—', nombre);
      NUCLEO.toast('Proveedor agregado', 'success');
    }
    cerrarModal(); render();
  }

  // Baja lógica: nunca se borra (conserva pedidos y facturas históricas)
  function eliminarProveedor(id) {
    const p = NUCLEO.getData('pos_suppliers').find(x => x.id === id);
    if (!p) return;
    const usado = NUCLEO.getData('pos_purchase_orders').some(o => o.proveedorId === id) || NUCLEO.getData('pos_invoices').some(f => f.proveedorId === id);
    NUCLEO.confirmar('Dar de baja proveedor', '¿Dar de baja a "' + p.nombre + '"? No podrás elegirlo en pedidos nuevos.' + (usado ? '\nSus pedidos y facturas anteriores se conservan.' : ''), 'DAR DE BAJA').then(function (ok) {
      if (!ok) return;
      cambiarActivoProveedor(id, false, 'Proveedor dado de baja');
    });
  }

  function reactivarProveedor(id) { cambiarActivoProveedor(id, true, 'Proveedor reactivado'); }

  function cambiarActivoProveedor(id, activo, msg) {
    const provs = NUCLEO.getData('pos_suppliers');
    const p = provs.find(x => x.id === id);
    if (!p) return;
    const antes = p.activo !== false;
    p.activo = activo;
    if (!NUCLEO.setData('pos_suppliers', provs)) return;
    aud('Proveedores', 'activo (' + p.nombre + ')', antes, activo);
    render();
    NUCLEO.toast(msg, 'success');
  }

  // ==========================================
  // 8. BOTONES RÁPIDOS
  // ==========================================
  function renderBotonesRapidos() {
    const botones = NUCLEO.getData('pos_quick_buttons');
    const products = NUCLEO.getData('pos_products');
    return `
      <div class="config-panel">
        ${header('Botones Rápidos', `<button class="btn btn-primary" onclick="window.CONFIG.agregarBotonRapido()" ${botones.length >= 21 ? 'disabled' : ''}><span class="material-symbols-outlined" style="font-size:18px;">add</span> AGREGAR BOTÓN</button>`)}
        <div class="config-info-box">Máximo 21 botones. Actualmente: ${botones.length}</div>
        <table class="config-table">
          <thead><tr><th>#</th><th>NOMBRE</th><th>PRECIO</th><th>UNIDAD</th><th>PRODUCTO VINCULADO</th><th>ACCIONES</th></tr></thead>
          <tbody>
            ${botones.length === 0 ? '<tr><td colspan="6" class="text-on-surface-variant">Sin botones.</td></tr>' : botones.map((b, idx) => {
              const ref = b.linkedProductCode ? products.find(p => p.code === b.linkedProductCode) : null;
              return `<tr>
                <td>#${idx + 1}</td><td class="font-semibold">${esc(b.nombre)}</td><td class="font-numeric-tape">${NUCLEO.money(b.precio)}</td><td>${esc(b.unidad)}</td>
                <td>${esc(ref ? ref.name : (b.linkedProductCode ? '(producto no encontrado)' : SIN))}
                  <button class="config-table-btn edit" style="margin-left:var(--space-xs);" onclick="window.CONFIG.vincularProducto(${idx})">${b.linkedProductCode ? 'Cambiar' : 'Vincular'}</button></td>
                <td class="config-table-actions"><button class="config-table-btn edit" onclick="window.CONFIG.editarBotonRapido(${idx})">Editar</button>
                  <button class="config-table-btn delete" onclick="window.CONFIG.eliminarBotonRapido(${idx})">✕</button></td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function agregarBotonRapido() { abrirModalBoton(-1); }
  function editarBotonRapido(idx) { abrirModalBoton(idx); }

  function abrirModalBoton(idx) {
    const b = idx >= 0 ? NUCLEO.getData('pos_quick_buttons')[idx] : { nombre: '', precio: '', unidad: '1 unidad' };
    if (!b) return;
    const unidades = ['1 unidad', '1 kg', '100 gr', '1 litro'];
    abrirModal({
      titulo: idx >= 0 ? 'Editar Botón Rápido' : 'Nuevo Botón Rápido',
      body: `${campo('Nombre <span class="required">*</span>', 'modal-boton-nombre', b.nombre, 'placeholder="Ej: Bolsa, Propina, Caramelos sueltos..."')}
        ${campo('Precio <span class="required">*</span>', 'modal-boton-precio', b.precio, 'type="number" min="0" step="0.01"')}
        <div class="config-form-group"><label class="config-form-label">Unidad</label>
          <select class="config-form-select" id="modal-boton-unidad">${unidades.map(u => `<option value="${u}" ${u === b.unidad ? 'selected' : ''}>${u}</option>`).join('')}</select></div>
        <div class="config-modal-error" id="modal-boton-error"></div>`,
      footer: footerGuardar('window.CONFIG.guardarBotonRapido(' + idx + ')')
    });
  }

  function guardarBotonRapido(idx) {
    const botones = NUCLEO.getData('pos_quick_buttons');
    const nombre = NUCLEO.normText($id('modal-boton-nombre').value);
    const raw = $id('modal-boton-precio').value;
    const precio = parseFloat(raw);
    const unidad = $id('modal-boton-unidad').value;
    if (!nombre) return errorEn('modal-boton-error', 'El nombre es obligatorio');
    if (raw === '' || isNaN(precio) || precio < 0) return errorEn('modal-boton-error', 'Ingresá un precio válido (0 o más)');

    // Si el nombre ya existe en OTRO botón, se actualiza ese (regla del anexo)
    const otro = botones.findIndex((b, i) => i !== idx && b.nombre.toLowerCase() === nombre.toLowerCase());
    const destino = otro !== -1 ? otro : idx;
    if (destino >= 0) {
      const b = botones[destino];
      const ant = { nombre: b.nombre, precio: b.precio, unidad: b.unidad };
      Object.assign(b, { nombre: nombre, precio: precio, unidad: unidad });
      if (!NUCLEO.setData('pos_quick_buttons', botones)) return;
      logMulti('Botones Rápidos', ant, { nombre: nombre, precio: precio, unidad: unidad }, { nombre: 'nombre (' + ant.nombre + ')', precio: 'precio (' + nombre + ')', unidad: 'unidad (' + nombre + ')' });
      cerrarModal(); render();
      NUCLEO.toast('Botón rápido actualizado', 'success');
      return;
    }
    if (botones.length >= 21) return errorEn('modal-boton-error', 'Máximo 21 botones alcanzado');
    botones.push({ code: NUCLEO.uid(), nombre: nombre, precio: precio, unidad: unidad, linkedProductCode: null });
    if (!NUCLEO.setData('pos_quick_buttons', botones)) return;
    aud('Botones Rápidos', 'nombre', '—', nombre);
    cerrarModal(); render();
    NUCLEO.toast('Botón rápido agregado', 'success');
  }

  function eliminarBotonRapido(idx) {
    const b = NUCLEO.getData('pos_quick_buttons')[idx];
    if (!b) return;
    NUCLEO.confirmar('Eliminar botón', '¿Eliminar el botón "' + b.nombre + '"?', 'ELIMINAR').then(function (ok) {
      if (!ok) return;
      const botones = NUCLEO.getData('pos_quick_buttons');
      const i = botones.findIndex(x => x.code === b.code && x.nombre === b.nombre);
      if (i === -1) return;
      botones.splice(i, 1);
      if (!NUCLEO.setData('pos_quick_buttons', botones)) return;
      aud('Botones Rápidos', 'nombre', b.nombre, '—');
      render();
      NUCLEO.toast('Botón eliminado', 'success');
    });
  }

  function vincularProducto(idx) {
    const btn = NUCLEO.getData('pos_quick_buttons')[idx];
    if (!btn) return;
    const products = NUCLEO.getData('pos_products').filter(p => p.active !== false);
    if (products.length === 0) { NUCLEO.toast('No hay productos activos en INVENTARIO', 'warning'); return; }
    const actual = btn.linkedProductCode ? products.find(p => p.code === btn.linkedProductCode) : null;
    abrirModal({
      titulo: 'Vincular Producto — ' + btn.nombre,
      body: `${actual ? `<div class="config-info-box">Vínculo actual: <strong>${esc(actual.name)}</strong> (SKU ${esc(actual.code)})</div>` : ''}
        <input type="text" class="config-form-input mb-2" id="modal-buscar-producto" placeholder="Buscar producto por nombre o código..." oninput="window.CONFIG.filtrarModalLista('modal-buscar-producto','modal-lista-productos')">
        <div class="config-modal-list" id="modal-lista-productos">
          ${products.map(p => `<div class="config-modal-list-item" data-texto="${esc((p.name + ' ' + p.code).toLowerCase())}" onclick="window.CONFIG.seleccionarProductoVinculo(${idx}, ${arg(p.code)})">
            <span class="font-semibold">${esc(p.name)}</span><span class="font-body-sm text-on-surface-variant">SKU ${esc(p.code)} · ${NUCLEO.money(p.price)}</span></div>`).join('')}
        </div>`,
      footer: btn.linkedProductCode ? `<button class="btn btn-ghost" onclick="window.CONFIG.quitarVinculoProducto(${idx})">QUITAR VÍNCULO</button>` : ''
    });
  }

  function seleccionarProductoVinculo(idx, code) {
    const botones = NUCLEO.getData('pos_quick_buttons');
    const b = botones[idx];
    const p = NUCLEO.getData('pos_products').find(x => x.code === code);
    if (!b || !p) return;
    const antes = b.linkedProductCode || '—';
    b.linkedProductCode = code;
    if (!NUCLEO.setData('pos_quick_buttons', botones)) return;
    aud('Botones Rápidos', 'linkedProductCode (' + b.nombre + ')', antes, p.name);
    cerrarModal(); render();
    NUCLEO.toast('Producto vinculado', 'success');
  }

  function quitarVinculoProducto(idx) {
    const botones = NUCLEO.getData('pos_quick_buttons');
    const b = botones[idx];
    if (!b || !b.linkedProductCode) return;
    const p = NUCLEO.getData('pos_products').find(x => x.code === b.linkedProductCode);
    const antes = p ? p.name : b.linkedProductCode;
    b.linkedProductCode = null;
    if (!NUCLEO.setData('pos_quick_buttons', botones)) return;
    aud('Botones Rápidos', 'linkedProductCode (' + b.nombre + ')', antes, '—');
    cerrarModal(); render();
    NUCLEO.toast('Vínculo removido — el botón vuelve a ser venta suelta', 'success');
  }

  // ==========================================
  // 9. MONEDA
  // ==========================================
  function renderMoneda() {
    const m = NUCLEO.getData('pos_moneda');
    return `
      <div class="config-panel">
        ${header('Moneda')}
        <div class="config-form">
          <h3 class="font-headline-sm mb-2">Configuración de Moneda</h3>
          <div class="config-form-group"><label class="config-form-label">Código ISO (3 letras)</label>
            <input type="text" maxlength="3" class="config-form-input" id="moneda-codigo" value="${esc(m.code || 'ARS')}" onchange="window.CONFIG.guardarMoneda()"></div>
          <div class="config-form-group"><label class="config-form-label">Símbolo</label>
            <input type="text" maxlength="4" class="config-form-input" id="moneda-simbolo" value="${esc(m.symbol || '$')}" onchange="window.CONFIG.guardarMoneda()"></div>
          <div class="config-form-group"><label class="config-form-label">Múltiplo de Redondeo</label>
            <input type="number" min="1" step="1" class="config-form-input" id="moneda-multiplo" value="${esc(m.roundMultiple || 100)}" onchange="window.CONFIG.guardarMoneda()"></div>
          <div class="config-info-box"><strong>Vista previa interactiva del redondeo:</strong><br>
            Ingrese un monto de prueba: <input type="number" id="moneda-preview-input" value="${esc(montoPreviewMoneda)}" style="width:100px;border:1px solid var(--color-outline-variant);border-radius:4px;padding:4px;" oninput="window.CONFIG.actualizarPreviewRedondeo()">
            → Resultado final: <strong id="moneda-preview-result">${NUCLEO.money(NUCLEO.roundCurrency(montoPreviewMoneda))}</strong><br>
            <span class="font-body-sm" id="moneda-preview-nota">Redondeo al múltiplo de ${esc(m.roundMultiple || 100)}</span></div>
          <h3 class="font-headline-sm mt-4 mb-2">Billetes y monedas en circulación</h3>
          <p class="font-body-sm text-on-surface-variant mb-2">Valores predeterminados para facilitar cobros, sugerencias rápidas y cálculo de vueltos.</p>
          <div class="config-denominations" id="moneda-denoms">${denominacionesHTML(m)}</div>
          <button class="btn btn-secondary mt-2" onclick="window.CONFIG.agregarDenominacion()"><span class="material-symbols-outlined" style="font-size:18px;">add</span> AGREGAR DENOMINACIÓN</button>
        </div>
      </div>`;
  }

  function denominacionesHTML(m) {
    return (m.denominations || []).slice().sort((a, b) => a - b).map(d =>
      `<div class="config-denomination-tag"><span>${esc(m.symbol || '$')}${d}</span><span class="remove" onclick="window.CONFIG.eliminarDenominacion(${d})">✕</span></div>`).join('');
  }

  function guardarMoneda() {
    const m = NUCLEO.getData('pos_moneda');
    const ant = { code: m.code, symbol: m.symbol, roundMultiple: m.roundMultiple };
    const code = $id('moneda-codigo').value.trim().toUpperCase();
    const symbol = $id('moneda-simbolo').value.trim();
    const multiplo = parseInt($id('moneda-multiplo').value, 10);
    if (!/^[A-Z]{3}$/.test(code)) { NUCLEO.toast('El código ISO debe tener 3 letras (ej: ARS)', 'error'); render(); return; }
    if (!symbol) { NUCLEO.toast('El símbolo es obligatorio', 'error'); render(); return; }
    if (isNaN(multiplo) || multiplo < 1) { NUCLEO.toast('El múltiplo de redondeo debe ser 1 o más', 'error'); render(); return; }
    m.code = code; m.symbol = symbol; m.roundMultiple = multiplo;
    if (!NUCLEO.setData('pos_moneda', m)) return;
    logMulti('Moneda', ant, { code: code, symbol: symbol, roundMultiple: multiplo }, { code: 'Código ISO', symbol: 'Símbolo', roundMultiple: 'Múltiplo de Redondeo' });
    $id('moneda-codigo').value = code;
    refrescarMoneda(m); // sin re-render: no se pierde el foco
    NUCLEO.toast('Moneda actualizada', 'success');
  }

  function refrescarMoneda(m) {
    actualizarPreviewRedondeo();
    const nota = $id('moneda-preview-nota');
    if (nota) nota.textContent = 'Redondeo al múltiplo de ' + m.roundMultiple;
    const d = $id('moneda-denoms');
    if (d) d.innerHTML = denominacionesHTML(m);
  }

  function actualizarPreviewRedondeo() {
    const input = $id('moneda-preview-input'), res = $id('moneda-preview-result');
    if (!input || !res) return;
    montoPreviewMoneda = parseFloat(input.value) || 0;
    res.textContent = NUCLEO.money(NUCLEO.roundCurrency(montoPreviewMoneda));
  }

  function agregarDenominacion() {
    abrirModal({
      titulo: 'Agregar denominación',
      body: `${campo('Valor del billete o moneda', 'modal-denom-valor', '', 'type="number" min="1" step="1"')}<div class="config-modal-error" id="modal-denom-error"></div>`,
      footer: footerGuardar('window.CONFIG.confirmarDenominacion()')
    });
  }

  function confirmarDenominacion() {
    const v = parseInt($id('modal-denom-valor').value, 10);
    if (isNaN(v) || v <= 0) return errorEn('modal-denom-error', 'Ingresá un valor entero mayor a 0');
    const m = NUCLEO.getData('pos_moneda');
    m.denominations = m.denominations || [];
    if (m.denominations.indexOf(v) !== -1) return errorEn('modal-denom-error', 'Esa denominación ya existe');
    m.denominations.push(v);
    m.denominations.sort((a, b) => a - b);
    if (!NUCLEO.setData('pos_moneda', m)) return;
    aud('Moneda', 'denominations', '—', m.symbol + v);
    cerrarModal(); render();
    NUCLEO.toast('Denominación agregada', 'success');
  }

  function eliminarDenominacion(valor) {
    const m = NUCLEO.getData('pos_moneda');
    m.denominations = (m.denominations || []).filter(d => d !== valor);
    if (!NUCLEO.setData('pos_moneda', m)) return;
    aud('Moneda', 'denominations', m.symbol + valor, '—');
    render();
  }

  // ==========================================
  // 10. NEGOCIO
  // ==========================================
  function previewTicket(n) {
    return '*** ' + (n.razonSocial || 'NEURORA POS') + ' ***\nCUIT: ' + (n.cuit || '—') + '\nDIRECCIÓN: ' + (n.direccion || '—') + '\nTEL: ' + (n.telefono || '—') +
      '\nINICIO DE ACTIVIDADES: ' + (n.inicioActividades ? NUCLEO.formatDate(n.inicioActividades) : '—') + '\n\n[Detalle de ítems y totales...]\n\n$ 0,00';
  }

  function renderNegocio() {
    const n = NUCLEO.getData('pos_business');
    const f = (label, id, val, type) => `<div class="config-form-group"><label class="config-form-label">${label}</label>
      <input type="${type || 'text'}" class="config-form-input" id="${id}" value="${esc(val || '')}" onchange="window.CONFIG.guardarNegocio()"></div>`;
    return `
      <div class="config-panel">
        ${header('Negocio')}
        <div class="config-form">
          <div class="config-panel-badge success mb-4"><span class="material-symbols-outlined" style="font-size:16px;">check_circle</span> Guardado automáticamente</div>
          <h3 class="font-headline-sm mb-2">Datos Fiscales y Comerciales</h3>
          ${f('Razón Social <span class="required">*</span>', 'negocio-razon', n.razonSocial)}
          ${f('CUIT <span class="required">*</span>', 'negocio-cuit', n.cuit)}
          ${f('Inicio de Actividades', 'negocio-inicio', n.inicioActividades, 'date')}
          ${f('Dirección', 'negocio-direccion', n.direccion)}
          ${f('Teléfono', 'negocio-telefono', n.telefono)}
          ${f('Email', 'negocio-email', n.email, 'email')}
          <h3 class="font-headline-sm mt-4 mb-2">Vista previa del ticket</h3>
          <div class="config-ticket-preview" id="negocio-preview"></div>
          <p class="font-body-sm text-on-surface-variant mt-2">Este encabezado se imprimirá automáticamente al inicio de cada comprobante fiscal y ticket de venta.</p>
        </div>
      </div>`;
  }

  function guardarNegocio() {
    const n = NUCLEO.getData('pos_business');
    const ant = Object.assign({}, n);
    const nuevo = {
      razonSocial: NUCLEO.normText($id('negocio-razon').value),
      cuit: normalizarCUIT(NUCLEO.normText($id('negocio-cuit').value)),
      inicioActividades: $id('negocio-inicio').value,
      direccion: NUCLEO.normText($id('negocio-direccion').value),
      telefono: NUCLEO.normText($id('negocio-telefono').value),
      email: NUCLEO.normText($id('negocio-email').value)
    };
    if (nuevo.cuit && !validarCUIT(nuevo.cuit)) { NUCLEO.toast('CUIT inválido (XX-XXXXXXXX-X con dígito verificador correcto). No se guardó.', 'error'); render(); return; }
    if (!emailValido(nuevo.email)) { NUCLEO.toast('El email no tiene un formato válido. No se guardó.', 'error'); render(); return; }
    Object.assign(n, nuevo);
    if (!NUCLEO.setData('pos_business', n)) return;
    logMulti('Negocio', ant, nuevo, { razonSocial: 'Razón Social', cuit: 'CUIT', inicioActividades: 'Inicio de Actividades', direccion: 'Dirección', telefono: 'Teléfono', email: 'Email' });
    $id('negocio-cuit').value = nuevo.cuit;
    $id('negocio-preview').textContent = previewTicket(n); // sin re-render: no se pierde el foco
    NUCLEO.toast('Datos del negocio actualizados', 'success');
  }

  // ==========================================
  // 11. PERIFÉRICOS Y COPIA DE SEGURIDAD
  // ==========================================
  function renderPerifericos() {
    const p = per();
    const imp = p.impresora || {}, lec = p.lector || {}, caj = p.cajon || {};
    const cfg = NUCLEO.getData('pos_config');
    const last = NUCLEO.getData('pos_last_backup_ts');
    const sel = (id, valor, opts) => `<select class="config-form-select" id="${id}" onchange="window.CONFIG.guardarPerifericos()">${opts.map(o => `<option value="${esc(o[0])}" ${valor === o[0] ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
    const txt = (id, val) => `<input type="text" class="config-form-input" id="${id}" value="${esc(val || '')}" onchange="window.CONFIG.guardarPerifericos()">`;
    const grupo = (label, html) => `<div class="config-form-group"><label class="config-form-label">${label}</label>${html}</div>`;
    return `
      <div class="config-panel">
        ${header('Periféricos')}
        ${NUCLEO.shouldRemindBackup() ? `<div class="config-backup-banner"><div class="config-backup-banner-text"><span class="material-symbols-outlined">warning</span>
          <span>No hacés un backup hace varios días. Los datos solo viven en este navegador.</span></div>
          <button class="btn btn-danger" onclick="window.CONFIG.hacerBackupAhora()"><span class="material-symbols-outlined" style="font-size:18px;">backup</span> BACKUP AHORA</button></div>` : ''}
        <div class="config-form">
          <h3 class="font-headline-sm mb-2">Copia de seguridad</h3>
          <p class="font-body-sm text-on-surface-variant mb-2">Último backup: ${last ? NUCLEO.formatDateTime(last) : 'nunca'}</p>
          <div class="flex gap-space-sm mb-4">
            <button class="btn btn-secondary" onclick="window.CONFIG.hacerBackupAhora()"><span class="material-symbols-outlined" style="font-size:18px;">backup</span> BACKUP AHORA</button>
            <button class="btn btn-secondary" onclick="window.CONFIG.restaurarBackup()"><span class="material-symbols-outlined" style="font-size:18px;">restore</span> RESTAURAR BACKUP</button>
          </div>
          <h3 class="font-headline-sm mb-2">Impresora</h3>
          ${grupo('Tipo', sel('perif-impresora-tipo', imp.tipo, [['termica', 'Térmica ESC/POS'], ['matricial', 'Matricial'], ['inyeccion', 'Inyección de tinta'], ['pdf', 'PDF virtual']]))}
          ${grupo('Modelo', txt('perif-impresora-modelo', imp.modelo))}
          ${grupo('Puerto', sel('perif-impresora-puerto', imp.puerto, ['USB', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'Red'].map(x => [x, x])))}
          ${grupo('Ancho de papel', sel('perif-impresora-ancho', imp.ancho, [['80mm', '80mm'], ['58mm', '58mm'], ['A4', 'A4']]))}
          <div class="config-form-group"><label class="config-form-label">Impresión automática post-cobro</label>
            <p class="font-body-sm text-on-surface-variant mb-2">Genera el ticket al finalizar cada transacción sin confirmación</p>
            <div class="config-toggle"><div class="config-toggle-switch ${cfg.autoPrintTicket ? 'active' : ''}" onclick="window.CONFIG.toggleAutoPrint()"></div><span class="config-toggle-label">${cfg.autoPrintTicket ? 'SÍ' : 'NO'}</span></div></div>
          <button class="btn btn-secondary" onclick="window.CONFIG.probarImpresion()"><span class="material-symbols-outlined" style="font-size:18px;">check_circle</span> PROBAR IMPRESIÓN</button>
          <h3 class="font-headline-sm mt-4 mb-2">Lector de Códigos</h3>
          ${grupo('Tipo', sel('perif-lector-tipo', lec.tipo, [['USB HID', 'USB HID'], ['RS232', 'Serie RS232'], ['Bluetooth', 'Bluetooth']]))}
          ${grupo('Prefijo', txt('perif-lector-prefijo', lec.prefijo))}
          ${grupo('Sufijo', txt('perif-lector-sufijo', lec.sufijo))}
          <button class="btn btn-secondary" onclick="window.CONFIG.probarLectura()"><span class="material-symbols-outlined" style="font-size:18px;">play_arrow</span> PROBAR LECTURA</button>
          <h3 class="font-headline-sm mt-4 mb-2">Cajón de Dinero (Opcional)</h3>
          <div class="config-form-group"><label class="config-form-label">Habilitado</label>
            <p class="font-body-sm text-on-surface-variant mb-2">Permitir apertura automática mediante pulsos de impresora</p>
            <div class="config-toggle"><div class="config-toggle-switch ${caj.habilitado ? 'active' : ''}" onclick="window.CONFIG.toggleCajon()"></div><span class="config-toggle-label">${caj.habilitado ? 'SÍ' : 'NO'}</span></div></div>
          ${grupo('Comando de apertura', txt('perif-cajon-comando', caj.comando))}
          ${grupo('Momento de apertura', sel('perif-cajon-momento', caj.momento, [['cobrar', 'Al cobrar'], ['abrir', 'Al abrir caja'], ['cerrar', 'Al cerrar caja'], ['manual', 'Manual']]))}
        </div>
      </div>`;
  }

  function guardarPerifericos() {
    const p = per();
    const impA = Object.assign({}, p.impresora), lecA = Object.assign({}, p.lector), cajA = Object.assign({}, p.cajon);
    p.impresora = { tipo: $id('perif-impresora-tipo').value, modelo: NUCLEO.normText($id('perif-impresora-modelo').value), puerto: $id('perif-impresora-puerto').value, ancho: $id('perif-impresora-ancho').value };
    p.lector = { tipo: $id('perif-lector-tipo').value, prefijo: $id('perif-lector-prefijo').value, sufijo: $id('perif-lector-sufijo').value };
    p.cajon = { habilitado: !!cajA.habilitado, comando: NUCLEO.normText($id('perif-cajon-comando').value), momento: $id('perif-cajon-momento').value };
    if (!NUCLEO.setData('pos_peripherals', p)) return;
    logMulti('Periféricos', impA, p.impresora, { tipo: 'Impresora · Tipo', modelo: 'Impresora · Modelo', puerto: 'Impresora · Puerto', ancho: 'Impresora · Ancho de Papel' });
    logMulti('Periféricos', lecA, p.lector, { tipo: 'Lector · Tipo', prefijo: 'Lector · Prefijo', sufijo: 'Lector · Sufijo' });
    logMulti('Periféricos', cajA, p.cajon, { comando: 'Cajón · Comando', momento: 'Cajón · Momento de Apertura' });
    NUCLEO.toast('Periféricos actualizados', 'success');
  }

  function toggleAutoPrint() {
    const cfg = NUCLEO.getData('pos_config');
    const antes = !!cfg.autoPrintTicket;
    cfg.autoPrintTicket = !antes;
    if (!NUCLEO.setData('pos_config', cfg)) return;
    aud('Periféricos', 'autoPrintTicket', antes, cfg.autoPrintTicket);
    render();
  }

  function toggleCajon() {
    const p = per();
    p.cajon = p.cajon || {};
    const antes = !!p.cajon.habilitado;
    p.cajon.habilitado = !antes;
    if (!NUCLEO.setData('pos_peripherals', p)) return;
    aud('Periféricos', 'cajon.habilitado', antes, p.cajon.habilitado);
    render();
  }

  function probarImpresion() {
    const n = NUCLEO.getData('pos_business');
    NUCLEO.printTicket({ id: 'PRUEBA', fecha: NUCLEO.nowISO(), total: 0, items: [{ name: 'Ticket de prueba de impresión', qty: 1, price: 0 }] });
    NUCLEO.toast('Enviando ticket de prueba a ' + (n.razonSocial || 'la impresora configurada'), 'success');
  }

  function probarLectura() {
    scanBuffer = '';
    abrirModal({
      titulo: 'Probar Lectura de Código',
      body: `<p class="font-body-sm text-on-surface-variant mb-2">Escaneá un código con el lector configurado. Se muestra tal cual llega, incluyendo prefijo/sufijo.</p>
        <div class="config-scan-listener" id="scan-listener-display">Esperando lectura…</div>`
    });
    scanHandler = function (e) {
      const d = $id('scan-listener-display');
      if (!d || e.key === 'Escape') return;
      if (e.key === 'Enter') { d.textContent = scanBuffer || '(código vacío)'; d.classList.add('captured'); scanBuffer = ''; return; }
      if (e.key.length === 1) { scanBuffer += e.key; d.textContent = scanBuffer; d.classList.remove('captured'); }
    };
    document.addEventListener('keydown', scanHandler);
  }

  function detenerEscuchaLector() {
    if (scanHandler) { document.removeEventListener('keydown', scanHandler); scanHandler = null; }
  }

  function hacerBackupAhora() { NUCLEO.backupJSON(); render(); }
  function restaurarBackup() { NUCLEO.restaurarBackup(); }

  // ==========================================
  // 12. USUARIOS (baja lógica, nunca borrado)
  // ==========================================
  function adminsActivos(users) { return users.filter(u => u.rol === 'Admin' && u.activo !== false); }

  function renderUsuarios() {
    const users = NUCLEO.getData('pos_users');
    const yo = NUCLEO.getUsuarioActivo();
    const info = users.length === 0 ? '<div class="config-info-box">No hay usuarios. El primero que crees será <strong>Admin</strong> y el sistema pedirá PIN desde ese momento.</div>' : '';
    return `
      <div class="config-panel">
        ${header('Usuarios', '<button class="btn btn-primary" onclick="window.CONFIG.agregarUsuario()"><span class="material-symbols-outlined" style="font-size:18px;">add</span> AGREGAR USUARIO</button>')}
        ${info}
        <table class="config-table">
          <thead><tr><th>ID</th><th>NOMBRE</th><th>ROL</th><th>PIN</th><th>ÚLTIMO ACCESO</th><th>EDITAR</th><th>ACCIONES</th></tr></thead>
          <tbody>
            ${users.map((u, idx) => {
              const baja = u.activo === false;
              return `<tr style="${baja ? 'opacity:.55;' : ''}">
                <td>${idx + 1}</td><td class="font-semibold">${esc(u.nombre)} ${baja ? '<span class="config-badge config-badge-fixed">BAJA</span>' : ''} ${yo && yo.id === u.id ? '<span class="config-badge config-badge-excluded">VOS</span>' : ''}</td>
                <td>${esc(u.rol)}</td><td>••••</td><td class="font-body-sm">${u.ultimoAcceso ? NUCLEO.formatDateTime(u.ultimoAcceso) : '—'}</td>
                <td><button class="config-table-btn edit" onclick="window.CONFIG.editarUsuario(${arg(u.id)})">Editar</button></td>
                <td>${baja ? `<button class="config-table-btn edit" onclick="window.CONFIG.reactivarUsuario(${arg(u.id)})">Reactivar</button>`
                           : `<button class="config-table-btn delete" onclick="window.CONFIG.eliminarUsuario(${arg(u.id)})">✕</button>`}</td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function formUsuario(u, esPrimero) {
    return `${campo('Nombre <span class="required">*</span>', 'modal-usuario-nombre', u.nombre, 'placeholder="Nombre y apellido"')}
      <div class="config-form-group"><label class="config-form-label">Rol <span class="required">*</span></label>
        <select class="config-form-select" id="modal-usuario-rol" ${esPrimero ? 'disabled' : ''}>
          <option value="Cajero" ${u.rol === 'Cajero' && !esPrimero ? 'selected' : ''}>Cajero</option>
          <option value="Admin" ${u.rol === 'Admin' || esPrimero ? 'selected' : ''}>Admin</option></select>
        ${esPrimero ? '<p class="font-body-sm text-on-surface-variant">El primer usuario es siempre Admin.</p>' : ''}</div>
      <div class="config-form-group"><label class="config-form-label">PIN (4-6 dígitos) ${u.id ? '<span class="text-on-surface-variant">— vacío = no cambiar</span>' : '<span class="required">*</span>'}</label>
        <input type="password" inputmode="numeric" maxlength="6" class="config-form-input" id="modal-usuario-pin" autocomplete="new-password"></div>
      <div class="config-modal-error" id="modal-usuario-error"></div>`;
  }

  function agregarUsuario() {
    const primero = NUCLEO.getData('pos_users').length === 0;
    abrirModal({ titulo: 'Nuevo Usuario', body: formUsuario({ nombre: '', rol: 'Cajero' }, primero), footer: footerGuardar('window.CONFIG.confirmarAgregarUsuario()') });
  }

  function confirmarAgregarUsuario() {
    const users = NUCLEO.getData('pos_users');
    const primero = users.length === 0;
    const nombre = NUCLEO.normText($id('modal-usuario-nombre').value);
    const rol = primero ? 'Admin' : $id('modal-usuario-rol').value;
    const pin = $id('modal-usuario-pin').value;
    if (!nombre) return errorEn('modal-usuario-error', 'El nombre es obligatorio');
    if (users.some(u => u.nombre.toLowerCase() === nombre.toLowerCase())) return errorEn('modal-usuario-error', 'Ya existe un usuario con ese nombre');
    if (!/^\d{4,6}$/.test(pin)) return errorEn('modal-usuario-error', 'PIN inválido (4 a 6 dígitos)');
    const nuevo = { id: NUCLEO.uid(), nombre: nombre, rol: rol, pin: pin, ultimoAcceso: null, activo: true };
    users.push(nuevo);
    if (!NUCLEO.setData('pos_users', users)) return;
    // El primer usuario todavía no tiene sesión: la auditoría se anota a su nombre y se lo loguea.
    aud('Usuarios', 'nombre', '—', nombre, primero ? nuevo.id : undefined);
    if (primero) NUCLEO.validarLogin(nuevo.id, pin);
    cerrarModal(); render();
    NUCLEO.toast(primero ? 'Usuario Admin creado. Sesión iniciada como ' + nombre : 'Usuario agregado', 'success');
  }

  function editarUsuario(id) {
    const u = NUCLEO.getData('pos_users').find(x => x.id === id);
    if (!u) return;
    abrirModal({ titulo: 'Editar Usuario', body: formUsuario(u, false), footer: footerGuardar('window.CONFIG.confirmarEditarUsuario(' + arg(id) + ')') });
  }

  function confirmarEditarUsuario(id) {
    const users = NUCLEO.getData('pos_users');
    const u = users.find(x => x.id === id);
    if (!u) { cerrarModal(); return; }
    const nombre = NUCLEO.normText($id('modal-usuario-nombre').value);
    const rol = $id('modal-usuario-rol').value;
    const pin = $id('modal-usuario-pin').value;
    if (!nombre) return errorEn('modal-usuario-error', 'El nombre es obligatorio');
    if (users.some(x => x.id !== id && x.nombre.toLowerCase() === nombre.toLowerCase())) return errorEn('modal-usuario-error', 'Ya existe un usuario con ese nombre');
    if (pin !== '' && !/^\d{4,6}$/.test(pin)) return errorEn('modal-usuario-error', 'PIN inválido (4 a 6 dígitos)');
    if (u.rol === 'Admin' && rol !== 'Admin' && u.activo !== false && adminsActivos(users).length === 1) return errorEn('modal-usuario-error', 'No se puede quitar el rol Admin al último administrador');
    const ant = { nombre: u.nombre, rol: u.rol };
    const pinCambio = pin !== '' && pin !== u.pin;
    u.nombre = nombre; u.rol = rol;
    if (pin !== '') u.pin = pin;
    if (!NUCLEO.setData('pos_users', users)) return;
    logMulti('Usuarios', ant, { nombre: nombre, rol: rol }, { nombre: 'Nombre', rol: 'Rol' });
    if (pinCambio) aud('Usuarios', 'PIN (' + nombre + ')', '••••', '••••'); // el PIN nunca se registra en claro
    cerrarModal(); render();
    NUCLEO.toast('Usuario actualizado', 'success');
  }

  function eliminarUsuario(id) {
    const users = NUCLEO.getData('pos_users');
    const u = users.find(x => x.id === id);
    if (!u) return;
    const yo = NUCLEO.getUsuarioActivo();
    if (yo && yo.id === id) { NUCLEO.toast('No podés dar de baja tu propio usuario mientras estás logueado', 'error'); return; }
    if (u.rol === 'Admin' && adminsActivos(users).length === 1) { NUCLEO.toast('No se puede dar de baja al último Admin', 'error'); return; }
    NUCLEO.confirmar('Dar de baja usuario', '¿Dar de baja a "' + u.nombre + '"? No podrá iniciar sesión. Sus ventas y registros anteriores se conservan.', 'DAR DE BAJA').then(function (ok) {
      if (!ok) return;
      cambiarActivoUsuario(id, false, 'Usuario dado de baja');
    });
  }

  function reactivarUsuario(id) { cambiarActivoUsuario(id, true, 'Usuario reactivado'); }

  function cambiarActivoUsuario(id, activo, msg) {
    const users = NUCLEO.getData('pos_users');
    const u = users.find(x => x.id === id);
    if (!u) return;
    const antes = u.activo !== false;
    u.activo = activo;
    if (!NUCLEO.setData('pos_users', users)) return;
    aud('Usuarios', 'activo (' + u.nombre + ')', antes, activo);
    render();
    NUCLEO.toast(msg, 'success');
  }

  // ==========================================
  // 13. AUDITORÍA (solo lectura)
  // ==========================================
  function filasAuditoria() {
    const f = filtrosAud;
    const log = NUCLEO.getData('pos_config_audit_log').slice().reverse().filter(function (e) {
      const dia = NUCLEO.localDateOf(e.fecha);
      return (!f.usuario || e.userId === f.usuario) && (!f.desde || dia >= f.desde) && (!f.hasta || dia <= f.hasta) && (!f.seccion || e.seccion === f.seccion);
    });
    const html = log.slice(0, 500).map(e => `
      <tr><td class="font-body-sm">${NUCLEO.formatDateTime(e.fecha)}</td><td>${esc(nombreUsuario(e.userId))}</td><td>${esc(e.modulo)}</td><td>${esc(e.seccion)}</td>
      <td>${esc(e.campo)}</td><td class="font-mono">${esc(String(e.valorAnterior))}</td><td class="font-mono">${esc(String(e.valorNuevo))}</td></tr>`).join('');
    return { html: html || '<tr><td colspan="7" class="text-on-surface-variant">Sin registros para estos filtros.</td></tr>', total: log.length };
  }

  function renderAuditoria() {
    const users = NUCLEO.getData('pos_users');
    const f = filtrosAud;
    const r = filasAuditoria();
    return `
      <div class="config-panel">
        ${header('Auditoría', '<div class="config-panel-badge success"><span class="material-symbols-outlined" style="font-size:16px;">visibility</span> Solo Lectura</div>')}
        <div class="config-audit-filters">
          <div class="config-form-group"><label class="config-form-label">Usuario</label>
            <select class="config-form-select" id="audit-filtro-usuario"><option value="">Todos los usuarios</option>
              ${users.map(u => `<option value="${esc(u.id)}" ${f.usuario === u.id ? 'selected' : ''}>${esc(u.nombre)}</option>`).join('')}<option value="sistema" ${f.usuario === 'sistema' ? 'selected' : ''}>Sistema</option></select></div>
          <div class="config-form-group"><label class="config-form-label">Desde</label><input type="date" class="config-form-input" id="audit-filtro-desde" value="${esc(f.desde)}"></div>
          <div class="config-form-group"><label class="config-form-label">Hasta</label><input type="date" class="config-form-input" id="audit-filtro-hasta" value="${esc(f.hasta)}"></div>
          <div class="config-form-group"><label class="config-form-label">Sección</label>
            <select class="config-form-select" id="audit-filtro-seccion"><option value="">Todas las secciones</option>
              ${vistas.filter(v => v.id !== 'auditoria').map(v => `<option value="${esc(v.nombre)}" ${f.seccion === v.nombre ? 'selected' : ''}>${esc(v.nombre)}</option>`).join('')}</select></div>
          <div class="config-form-group" style="display:flex;align-items:flex-end;"><button class="btn btn-primary" onclick="window.CONFIG.aplicarFiltrosAuditoria()"><span class="material-symbols-outlined" style="font-size:18px;">filter_list</span> APLICAR FILTROS</button></div>
        </div>
        <p class="font-body-sm text-on-surface-variant mb-2" id="audit-total">${r.total} registro(s)${r.total > 500 ? ' — se muestran los 500 más recientes' : ''}</p>
        <table class="config-table">
          <thead><tr><th>FECHA</th><th>USUARIO</th><th>MÓDULO</th><th>SECCIÓN</th><th>CAMPO</th><th>VALOR ANTERIOR</th><th>VALOR NUEVO</th></tr></thead>
          <tbody id="audit-tbody">${r.html}</tbody>
        </table>
      </div>`;
  }

  function aplicarFiltrosAuditoria() {
    filtrosAud = { usuario: $id('audit-filtro-usuario').value, desde: $id('audit-filtro-desde').value, hasta: $id('audit-filtro-hasta').value, seccion: $id('audit-filtro-seccion').value };
    const r = filasAuditoria();
    $id('audit-tbody').innerHTML = r.html;
    $id('audit-total').textContent = r.total + ' registro(s)' + (r.total > 500 ? ' — se muestran los 500 más recientes' : '');
  }

  // ==========================================
  // 14. API PÚBLICA
  // ==========================================
  window.CONFIG = {
    init: init, onShow: onShow, onHide: onHide, onEscape: onEscape,
    cerrarModal: cerrarModal, filtrarModalLista: filtrarModalLista,
    toggleSubCajaTicket: toggleSubCajaTicket, agregarMarca: agregarMarca, seleccionarMarca: seleccionarMarca, eliminarMarca: eliminarMarca,
    actualizarPrecioSuelto: actualizarPrecioSuelto, toggleHabilitarMarca: toggleHabilitarMarca,
    agregarCategoria: agregarCategoria, confirmarAgregarCategoria: confirmarAgregarCategoria, editarCategoria: editarCategoria,
    confirmarEditarCategoria: confirmarEditarCategoria, eliminarCategoria: eliminarCategoria,
    editarMargen: editarMargen, confirmarMargen: confirmarMargen,
    editarFactorTipo: editarFactorTipo, confirmarFactorTipo: confirmarFactorTipo,
    editarFactorCategoria: editarFactorCategoria, confirmarFactorCategoria: confirmarFactorCategoria,
    agregarProveedor: agregarProveedor, editarProveedor: editarProveedor, eliminarProveedor: eliminarProveedor,
    reactivarProveedor: reactivarProveedor, guardarProveedorModal: guardarProveedorModal,
    agregarBotonRapido: agregarBotonRapido, editarBotonRapido: editarBotonRapido, guardarBotonRapido: guardarBotonRapido,
    eliminarBotonRapido: eliminarBotonRapido, vincularProducto: vincularProducto,
    seleccionarProductoVinculo: seleccionarProductoVinculo, quitarVinculoProducto: quitarVinculoProducto,
    guardarMoneda: guardarMoneda, actualizarPreviewRedondeo: actualizarPreviewRedondeo,
    agregarDenominacion: agregarDenominacion, confirmarDenominacion: confirmarDenominacion, eliminarDenominacion: eliminarDenominacion,
    guardarNegocio: guardarNegocio,
    guardarPerifericos: guardarPerifericos, toggleAutoPrint: toggleAutoPrint, toggleCajon: toggleCajon,
    probarImpresion: probarImpresion, probarLectura: probarLectura, hacerBackupAhora: hacerBackupAhora, restaurarBackup: restaurarBackup,
    agregarUsuario: agregarUsuario, confirmarAgregarUsuario: confirmarAgregarUsuario, editarUsuario: editarUsuario,
    confirmarEditarUsuario: confirmarEditarUsuario, eliminarUsuario: eliminarUsuario, reactivarUsuario: reactivarUsuario,
    aplicarFiltrosAuditoria: aplicarFiltrosAuditoria,
    _previewTicket: previewTicket
  };
})();
