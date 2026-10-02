/* ============================================
   NEURORA POS - CONFIG (ANEXO D)
   Módulo dueño de todas las configuraciones
   ============================================ */

(function () {
  'use strict';

  // Estado local
  let vistaActiva = 'subcajas';
  let escListenerAttached = false;
  let modalAbierto = false;
  let montoPreviewMoneda = 1200; // preserva el valor del input de prueba entre renders
  const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const FORMAS_PAGO = ['Efectivo', 'Transferencia', 'Cuenta Corriente'];
  const vistas = [
    { id: 'subcajas', nombre: 'Sub-Cajas', icono: 'inbox' },
    { id: 'categorias', nombre: 'Categorías', icono: 'category' },
    { id: 'margenes', nombre: 'Márgenes', icono: 'percent' },
    { id: 'proveedores', nombre: 'Proveedores', icono: 'local_shipping' },
    { id: 'botonesrapidos', nombre: 'Botones Rápidos', icono: 'touch_app' },
    { id: 'moneda', nombre: 'Moneda', icono: 'payments' },
    { id: 'negocio', nombre: 'Negocio', icono: 'apartment' },
    { id: 'perifericos', nombre: 'Periféricos', icono: 'power' },
    { id: 'usuarios', nombre: 'Usuarios', icono: 'group' },
    { id: 'auditoria', nombre: 'Auditoría', icono: 'assignment' }
  ];

  // ==========================================
  // 1. INICIALIZACIÓN
  // ==========================================
  function init() {
    // Setup de una sola vez: showTab() del NÚCLEO invoca init() en CADA
    // visita al módulo, así que el listener de ESC se guarda con un flag
    // para no acumular handlers globales duplicados.
    if (!escListenerAttached) {
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          if (modalAbierto) {
            cerrarModal();
          } else {
            NUCLEO.showTab('caja');
          }
        }
      });
      escListenerAttached = true;
    }
  }

  function onShow() {
    // El renderizado del panel vive únicamente acá; showTab() del NÚCLEO
    // llama init() y luego onShow() en cada visita, así que con un solo
    // render por visita alcanza (antes se duplicaba).
    render();
  }

  // ==========================================
  // 1.1 MODALES GENÉRICOS (namespace .config-modal-*)
  // ==========================================
  function abrirModal(opts) {
    cerrarModal();
    const overlay = document.createElement('div');
    overlay.className = 'config-modal-overlay';
    overlay.id = 'config-modal-overlay';
    overlay.innerHTML = `
      <div class="config-modal">
        <div class="config-modal-header">
          <h3 class="config-modal-title">${NUCLEO.esc(opts.titulo)}</h3>
          <button type="button" class="config-modal-close" onclick="window.CONFIG.cerrarModal()">✕</button>
        </div>
        <div class="config-modal-body">${opts.body}</div>
        ${opts.footer ? `<div class="config-modal-footer">${opts.footer}</div>` : ''}
      </div>
    `;
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) cerrarModal();
    });
    document.body.appendChild(overlay);
    modalAbierto = true;
  }

  function cerrarModal() {
    const overlay = document.getElementById('config-modal-overlay');
    if (overlay) overlay.remove();
    modalAbierto = false;
    detenerEscuchaLector();
  }

  // Registra en auditoría solo los campos que efectivamente cambiaron
  // entre dos objetos planos (usado en guardados multi-campo).
  function logCambiosMultiples(seccion, anterior, nuevo, etiquetas, userId) {
    Object.keys(etiquetas).forEach(function (key) {
      const before = anterior ? anterior[key] : undefined;
      const after = nuevo ? nuevo[key] : undefined;
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        NUCLEO.registrarCambioConfig({
          modulo: 'CONFIG',
          seccion: seccion,
          campo: etiquetas[key],
          valorAnterior: (before === undefined || before === null || before === '') ? '—' : before,
          valorNuevo: (after === undefined || after === null || after === '') ? '—' : after,
          userId: userId
        });
      }
    });
  }

  function validarCUIT(cuit) {
    if (!/^\d{2}-\d{8}-\d{1}$/.test(cuit || '')) return false;
    const nums = cuit.replace(/-/g, '').split('').map(Number);
    const mult = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let suma = 0;
    for (let i = 0; i < 10; i++) suma += nums[i] * mult[i];
    let verificador = 11 - (suma % 11);
    if (verificador === 11) verificador = 0;
    if (verificador === 10) return false; // CUIT inválido para persona física/jurídica estándar
    return verificador === nums[10];
  }

  // ==========================================
  // 2. RENDERIZADO PRINCIPAL
  // ==========================================
  function render() {
    const container = document.getElementById('moduleContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="config-layout">
        ${renderSidebar()}
        <div class="config-main">
          ${renderPanel()}
        </div>
      </div>
    `;

    bindSidebarEvents();
    bindVistaEvents();
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
              <span class="material-symbols-outlined">${v.icono}</span>
              <span>${v.nombre}</span>
            </div>
          `).join('')}
        </div>
        <div class="config-sidebar-section">
          <div class="config-sidebar-section-title">APARCADO / RESTRINGIDO</div>
          <div class="config-sidebar-item disabled">
            <span class="material-symbols-outlined">schedule</span>
            <span>Turnos y Horarios</span>
            <span style="margin-left:auto;font-size:10px;">Inactivo</span>
          </div>
          <div class="config-sidebar-item locked">
            <span class="material-symbols-outlined">print_disabled</span>
            <span>Impresoras Fiscales</span>
            <span class="material-symbols-outlined" style="margin-left:auto;font-size:16px;">lock</span>
          </div>
          <div class="config-sidebar-item locked">
            <span class="material-symbols-outlined">devices_other</span>
            <span>Periféricos Avanzados</span>
            <span class="material-symbols-outlined" style="margin-left:auto;font-size:16px;">lock</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderPanel() {
    switch (vistaActiva) {
      case 'subcajas': return renderSubCajas();
      case 'categorias': return renderCategorias();
      case 'margenes': return renderMargenes();
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

  // ==========================================
  // 3. VISTA: SUB-CAJAS
  // ==========================================
  function renderSubCajas() {
    const subcajas = NUCLEO.getData('pos_subcajas');
    const products = NUCLEO.getData('pos_products');
    const marcasCigarrillos = products.filter(p => p.category === 'Cigarrillos' && p.active !== false);

    return `
      <div class="config-panel">
        <div class="config-panel-header">
          <div>
            <div class="font-label-sm text-on-surface-variant uppercase tracking-wider">CONFIGURACIÓN GENERAL · OPERACIÓN DE CAJA</div>
            <h2 class="config-panel-title">Configuración de Sub-Cajas</h2>
            <p class="font-body-md text-on-surface-variant">Gestiona las reglas de venta suelta, límites operativos y opciones de cierre para el punto de venta.</p>
          </div>
        </div>

        <div class="config-form">
          <div class="config-form-group">
            <label class="config-form-label">Imprimir ticket de cuadre al cierre</label>
            <p class="font-body-sm text-on-surface-variant mb-2">Emite automáticamente un resumen físico del inventario fraccionado en la ticketera primaria</p>
            <div class="config-toggle">
              <div class="config-toggle-switch ${subcajas.printSubCajaTicketOnClose ? 'active' : ''}" onclick="window.CONFIG.toggleSubCajaTicket()"></div>
              <span class="config-toggle-label">${subcajas.printSubCajaTicketOnClose ? 'SÍ' : 'NO'}</span>
            </div>
          </div>

          <h3 class="font-headline-sm mt-4 mb-2">Marcas Habilitadas para Venta Suelta</h3>
          <div class="flex items-center justify-between mb-2">
            <span class="font-label-md">${marcasCigarrillos.length} Marcas Activas</span>
            <button class="btn btn-primary" onclick="window.CONFIG.agregarMarca()">
              <span class="material-symbols-outlined" style="font-size:18px;">add</span>
              AGREGAR MARCA
            </button>
          </div>

          <table class="config-table">
            <thead>
              <tr>
                <th>MARCA / PRESENTACIÓN</th>
                <th>PRECIO SUELTO</th>
                <th>HABILITAR</th>
                <th>ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              ${marcasCigarrillos.map(p => {
                const brand = (subcajas.selectedBrands || []).find(b => b.code === p.code);
                const habilitada = brand ? brand.habilitada : false;
                const precioSuelto = brand ? brand.priceLoose : NUCLEO.roundCurrency((p.price || 0) / 20);
                return `
                  <tr>
                    <td>
                      <div class="font-semibold">${NUCLEO.esc(p.name)}</div>
                      <div class="font-body-sm text-on-surface-variant">SKU: ${NUCLEO.esc(p.code)} · Fracción por unidad</div>
                    </td>
                    <td>
                      <input type="number" min="0" step="1" class="config-price-input-sm"
                        value="${precioSuelto}"
                        onchange="window.CONFIG.actualizarPrecioSuelto('${p.code}', this.value)">
                    </td>
                    <td>
                      <span class="material-symbols-outlined config-inline-toggle ${habilitada ? 'text-tertiary-fixed-dim' : 'text-outline'}"
                        title="Click para ${habilitada ? 'deshabilitar' : 'habilitar'} venta suelta"
                        onclick="window.CONFIG.toggleHabilitarMarca('${p.code}')">
                        ${habilitada ? 'check_box' : 'check_box_outline_blank'}
                      </span>
                    </td>
                    <td>
                      <button class="config-table-btn delete" onclick="window.CONFIG.eliminarMarca('${p.code}')">✕</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ==========================================
  // 4. VISTA: CATEGORÍAS
  // ==========================================
  function renderCategorias() {
    const categorias = NUCLEO.getData('pos_categories');
    const products = NUCLEO.getData('pos_products');

    return `
      <div class="config-panel">
        <div class="config-panel-header">
          <h2 class="config-panel-title">Categorías</h2>
          <button class="btn btn-primary" onclick="window.CONFIG.agregarCategoria()">
            <span class="material-symbols-outlined" style="font-size:18px;">add</span>
            AGREGAR CATEGORÍA
          </button>
        </div>

        <table class="config-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>NOMBRE</th>
              <th>PRODUCTOS ASOCIADOS</th>
              <th>EDITAR</th>
              <th>✕</th>
            </tr>
          </thead>
          <tbody>
            ${categorias.map((cat, idx) => {
              const count = products.filter(p => p.category === cat && p.active !== false).length;
              const esCigarrillos = cat === 'Cigarrillos';
              return `
                <tr>
                  <td>${idx + 1}</td>
                  <td>
                    ${NUCLEO.esc(cat)}
                    ${esCigarrillos ? '<span class="config-badge config-badge-fixed">Categoría del sistema (fija)</span>' : ''}
                  </td>
                  <td>${count}</td>
                  <td>
                    ${esCigarrillos 
                      ? '<span class="text-outline font-label-sm">Intocable</span>' 
                      : `<button class="config-table-btn edit" onclick="window.CONFIG.editarCategoria('${NUCLEO.esc(cat)}')">Editar</button>`
                    }
                  </td>
                  <td>
                    ${esCigarrillos 
                      ? '<span class="text-outline">—</span>' 
                      : `<button class="config-table-btn delete" onclick="window.CONFIG.eliminarCategoria('${NUCLEO.esc(cat)}')">✕</button>`
                    }
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ==========================================
  // 5. VISTA: MÁRGENES
  // ==========================================
  function renderMargenes() {
    const categorias = NUCLEO.getData('pos_categories');
    const margenes = NUCLEO.getData('pos_min_margins');
    const defaultMargin = 35;

    return `
      <div class="config-panel">
        <div class="config-panel-header">
          <h2 class="config-panel-title">Márgenes</h2>
        </div>

        <table class="config-table">
          <thead>
            <tr>
              <th>CATEGORÍA</th>
              <th>MARGEN MÍNIMO (%)</th>
              <th>EDITAR</th>
            </tr>
          </thead>
          <tbody>
            ${categorias.map(cat => {
              const margen = margenes[cat] !== undefined ? margenes[cat] : defaultMargin;
              const esCigarrillos = cat === 'Cigarrillos';
              return `
                <tr>
                  <td>
                    ${NUCLEO.esc(cat)}
                    ${esCigarrillos ? '<span class="config-badge config-badge-fixed">Categoría del sistema (fija)</span>' : ''}
                  </td>
                  <td>
                    ${esCigarrillos 
                      ? '<span class="config-badge config-badge-excluded">EXCLUIDO</span>' 
                      : margen + '%'
                    }
                  </td>
                  <td>
                    ${esCigarrillos 
                      ? '<span class="text-outline font-label-sm">—</span>' 
                      : `<button class="config-table-btn edit" onclick="window.CONFIG.editarMargen('${NUCLEO.esc(cat)}')">Editar</button>`
                    }
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <div class="config-info-box mt-4">
          Margen default para nuevas categorías: <strong>${defaultMargin}%</strong>
        </div>
      </div>
    `;
  }

  // ==========================================
  // 6. VISTA: PROVEEDORES
  // ==========================================
  function renderProveedores() {
    const proveedores = NUCLEO.getData('pos_suppliers');
    const pedidos = NUCLEO.getData('pos_purchase_orders');
    const facturas = NUCLEO.getData('pos_invoices');

    return `
      <div class="config-panel">
        <div class="config-panel-header">
          <h2 class="config-panel-title">Proveedores</h2>
          <button class="btn btn-primary" onclick="window.CONFIG.agregarProveedor()">
            <span class="material-symbols-outlined" style="font-size:18px;">add</span>
            AGREGAR PROVEEDOR
          </button>
        </div>

        <table class="config-table">
          <thead>
            <tr>
              <th>NOMBRE</th>
              <th>RUBRO</th>
              <th>CUIT</th>
              <th>DÍAS VISITA</th>
              <th>DÍAS ENTREGA</th>
              <th>FAC / CRÉD</th>
              <th>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            ${proveedores.map(p => {
              const tienePedidos = pedidos.some(o => o.proveedorId === p.id);
              const tieneFacturas = facturas.some(f => f.proveedorId === p.id);
              const puedeEliminar = !tienePedidos && !tieneFacturas && p.activo !== false;
              const diasVisita = (p.diasVisita || []).join(', ');
              const diasEntrega = (p.diasEntrega || []).join(', ');
              const tipoCredito = `${p.tipoFactura || 'A'} • ${p.diasCredito || 0}d`;
              return `
                <tr>
                  <td class="font-semibold">${NUCLEO.esc(p.nombre)}</td>
                  <td>${NUCLEO.esc(p.rubro)}</td>
                  <td class="font-mono">${NUCLEO.esc(p.cuit)}</td>
                  <td class="font-body-sm">${diasVisita}</td>
                  <td class="font-body-sm">${diasEntrega}</td>
                  <td>${tipoCredito}</td>
                  <td>
                    <div class="config-table-actions">
                      <button class="config-table-btn edit" onclick="window.CONFIG.editarProveedor('${p.id}')">Editar</button>
                      ${puedeEliminar 
                        ? `<button class="config-table-btn delete" onclick="window.CONFIG.eliminarProveedor('${p.id}')">✕</button>` 
                        : '<span class="text-outline font-label-sm">—</span>'
                      }
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ==========================================
  // 7. VISTA: BOTONES RÁPIDOS
  // ==========================================
  function renderBotonesRapidos() {
    const botones = NUCLEO.getData('pos_quick_buttons');
    const maxBotones = 21;

    return `
      <div class="config-panel">
        <div class="config-panel-header">
          <h2 class="config-panel-title">Botones Rápidos</h2>
          <button class="btn btn-primary" onclick="window.CONFIG.agregarBotonRapido()" ${botones.length >= maxBotones ? 'disabled' : ''}>
            <span class="material-symbols-outlined" style="font-size:18px;">add</span>
            AGREGAR BOTÓN
          </button>
        </div>

        <div class="config-info-box">
          Máximo ${maxBotones} botones. Actualmente: ${botones.length}
        </div>

        <table class="config-table">
          <thead>
            <tr>
              <th>#</th>
              <th>NOMBRE</th>
              <th>PRECIO</th>
              <th>UNIDAD</th>
              <th>PRODUCTO VINCULADO</th>
              <th>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            ${botones.map((btn, idx) => {
              const productoRef = btn.linkedProductCode
                ? NUCLEO.getData('pos_products').find(p => p.code === btn.linkedProductCode)
                : null;
              const productoVinculado = productoRef ? productoRef.name : '(sin vínculo — venta suelta)';
              return `
                <tr>
                  <td>#${idx + 1}</td>
                  <td class="font-semibold">${NUCLEO.esc(btn.nombre)}</td>
                  <td class="font-numeric-tape">${NUCLEO.money(btn.precio)}</td>
                  <td>${NUCLEO.esc(btn.unidad)}</td>
                  <td>
                    ${NUCLEO.esc(productoVinculado)}
                    <button class="config-table-btn edit" style="margin-left:var(--space-xs);" onclick="window.CONFIG.vincularProducto(${idx})">
                      ${productoRef ? 'Cambiar' : 'Vincular'}
                    </button>
                  </td>
                  <td class="config-table-actions">
                    <button class="config-table-btn delete" onclick="window.CONFIG.eliminarBotonRapido(${idx})">✕</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ==========================================
  // 8. VISTA: MONEDA
  // ==========================================
  function renderMoneda() {
    const moneda = NUCLEO.getData('pos_moneda');

    return `
      <div class="config-panel">
        <div class="config-panel-header">
          <h2 class="config-panel-title">Moneda</h2>
        </div>

        <div class="config-form">
          <h3 class="font-headline-sm mb-2">Configuración de Moneda</h3>
          
          <div class="config-form-group">
            <label class="config-form-label">Código ISO</label>
            <input type="text" class="config-form-input" id="moneda-codigo" value="${NUCLEO.esc(moneda.code || 'ARS')}" onchange="window.CONFIG.guardarMoneda()">
          </div>

          <div class="config-form-group">
            <label class="config-form-label">Símbolo</label>
            <input type="text" class="config-form-input" id="moneda-simbolo" value="${NUCLEO.esc(moneda.symbol || '$')}" onchange="window.CONFIG.guardarMoneda()">
          </div>

          <div class="config-form-group">
            <label class="config-form-label">Múltiplo de Redondeo</label>
            <input type="number" class="config-form-input" id="moneda-multiplo" value="${moneda.roundMultiple || 100}" onchange="window.CONFIG.guardarMoneda()">
          </div>

          <div class="config-info-box">
            <strong>Vista previa interactiva del redondeo:</strong><br>
            Ingrese un monto de prueba: $<input type="number" id="moneda-preview-input" value="${montoPreviewMoneda}" style="width:100px;border:1px solid var(--color-outline-variant);border-radius:4px;padding:4px;" oninput="window.CONFIG.actualizarPreviewRedondeo()">
            → Resultado final: <strong id="moneda-preview-result">${NUCLEO.money(NUCLEO.roundCurrency(montoPreviewMoneda))}</strong><br>
            <span class="font-body-sm">Redondeo al múltiplo de ${moneda.roundMultiple || 100}</span>
          </div>

          <h3 class="font-headline-sm mt-4 mb-2">Billetes y monedas en circulación</h3>
          <p class="font-body-sm text-on-surface-variant mb-2">Valores predeterminados para facilitar cobros, sugerencias rápidas y cálculo de vueltos.</p>
          
          <div class="config-denominations">
            ${(moneda.denominations || []).sort((a, b) => a - b).map(d => `
              <div class="config-denomination-tag">
                <span>$${d}</span>
                <span class="remove" onclick="window.CONFIG.eliminarDenominacion(${d})">✕</span>
              </div>
            `).join('')}
          </div>

          <button class="btn btn-secondary mt-2" onclick="window.CONFIG.agregarDenominacion()">
            <span class="material-symbols-outlined" style="font-size:18px;">add</span>
            AGREGAR DENOMINACIÓN
          </button>
        </div>
      </div>
    `;
  }

  // ==========================================
  // 9. VISTA: NEGOCIO
  // ==========================================
  function renderNegocio() {
    const negocio = NUCLEO.getData('pos_business');

    return `
      <div class="config-panel">
        <div class="config-panel-header">
          <h2 class="config-panel-title">Negocio</h2>
        </div>

        <div class="config-form">
          <div class="config-panel-badge success mb-4">
            <span class="material-symbols-outlined" style="font-size:16px;">check_circle</span>
            Guardado automáticamente
          </div>

          <h3 class="font-headline-sm mb-2">Datos Fiscales y Comerciales</h3>

          <div class="config-form-group">
            <label class="config-form-label">Razón Social <span class="required">*</span></label>
            <input type="text" class="config-form-input" id="negocio-razon" value="${NUCLEO.esc(negocio.razonSocial || '')}" onchange="window.CONFIG.guardarNegocio()">
          </div>

          <div class="config-form-group">
            <label class="config-form-label">CUIT <span class="required">*</span></label>
            <input type="text" class="config-form-input" id="negocio-cuit" value="${NUCLEO.esc(negocio.cuit || '')}" onchange="window.CONFIG.guardarNegocio()">
          </div>

          <div class="config-form-group">
            <label class="config-form-label">Inicio de Actividades</label>
            <input type="date" class="config-form-input" id="negocio-inicio" value="${NUCLEO.esc(negocio.inicioActividades || '')}" onchange="window.CONFIG.guardarNegocio()">
          </div>

          <div class="config-form-group">
            <label class="config-form-label">Dirección</label>
            <input type="text" class="config-form-input" id="negocio-direccion" value="${NUCLEO.esc(negocio.direccion || '')}" onchange="window.CONFIG.guardarNegocio()">
          </div>

          <div class="config-form-group">
            <label class="config-form-label">Teléfono</label>
            <input type="text" class="config-form-input" id="negocio-telefono" value="${NUCLEO.esc(negocio.telefono || '')}" onchange="window.CONFIG.guardarNegocio()">
          </div>

          <div class="config-form-group">
            <label class="config-form-label">Email</label>
            <input type="email" class="config-form-input" id="negocio-email" value="${NUCLEO.esc(negocio.email || '')}" onchange="window.CONFIG.guardarNegocio()">
          </div>

          <h3 class="font-headline-sm mt-4 mb-2">Vista previa del ticket</h3>
          <div class="config-ticket-preview">
*** ${NUCLEO.esc(negocio.razonSocial || 'NEURORA POS')} ***
CUIT: ${NUCLEO.esc(negocio.cuit || '—')}
DIRECCIÓN: ${NUCLEO.esc(negocio.direccion || '—')}
TEL: ${NUCLEO.esc(negocio.telefono || '—')}
INICIO DE ACTIVIDADES: ${NUCLEO.esc(negocio.inicioActividades || '—')}

[Detalle de ítems y totales...]

$ 0,00
          </div>
          <p class="font-body-sm text-on-surface-variant mt-2">Este encabezado se imprimirá automáticamente al inicio de cada comprobante fiscal y ticket de venta.</p>
        </div>
      </div>
    `;
  }

  // ==========================================
  // 10. VISTA: PERIFÉRICOS
  // ==========================================
  function renderPerifericos() {
    const peripherals = NUCLEO.getData('pos_peripherals');
    const config = NUCLEO.getData('pos_config');

    return `
      <div class="config-panel">
        <div class="config-panel-header">
          <h2 class="config-panel-title">Periféricos</h2>
        </div>

        ${NUCLEO.shouldRemindBackup() ? `
          <div class="config-backup-banner">
            <div class="config-backup-banner-text">
              <span class="material-symbols-outlined">warning</span>
              <span>No hacés un backup hace varios días. Los datos solo viven en este navegador.</span>
            </div>
            <button class="btn btn-danger" onclick="window.CONFIG.hacerBackupAhora()">
              <span class="material-symbols-outlined" style="font-size:18px;">backup</span>
              BACKUP AHORA
            </button>
          </div>
        ` : ''}

        <div class="config-form">
          <h3 class="font-headline-sm mb-2">Impresora</h3>
          
          <div class="config-form-group">
            <label class="config-form-label">Tipo</label>
            <select class="config-form-select" id="perif-impresora-tipo" onchange="window.CONFIG.guardarPerifericos()">
              <option value="termica" ${peripherals.impresora?.tipo === 'termica' ? 'selected' : ''}>Térmica ESC/POS</option>
              <option value="matricial" ${peripherals.impresora?.tipo === 'matricial' ? 'selected' : ''}>Matricial</option>
              <option value="inyeccion" ${peripherals.impresora?.tipo === 'inyeccion' ? 'selected' : ''}>Inyección de tinta</option>
              <option value="pdf" ${peripherals.impresora?.tipo === 'pdf' ? 'selected' : ''}>PDF virtual</option>
            </select>
          </div>

          <div class="config-form-group">
            <label class="config-form-label">Modelo</label>
            <input type="text" class="config-form-input" id="perif-impresora-modelo" value="${NUCLEO.esc(peripherals.impresora?.modelo || '')}" onchange="window.CONFIG.guardarPerifericos()">
          </div>

          <div class="config-form-group">
            <label class="config-form-label">Puerto</label>
            <select class="config-form-select" id="perif-impresora-puerto" onchange="window.CONFIG.guardarPerifericos()">
              <option value="USB" ${peripherals.impresora?.puerto === 'USB' ? 'selected' : ''}>USB</option>
              <option value="COM1" ${peripherals.impresora?.puerto === 'COM1' ? 'selected' : ''}>COM1</option>
              <option value="COM2" ${peripherals.impresora?.puerto === 'COM2' ? 'selected' : ''}>COM2</option>
              <option value="COM3" ${peripherals.impresora?.puerto === 'COM3' ? 'selected' : ''}>COM3</option>
              <option value="LPT1" ${peripherals.impresora?.puerto === 'LPT1' ? 'selected' : ''}>LPT1</option>
              <option value="Red" ${peripherals.impresora?.puerto === 'Red' ? 'selected' : ''}>Red</option>
            </select>
          </div>

          <div class="config-form-group">
            <label class="config-form-label">Ancho de papel</label>
            <select class="config-form-select" id="perif-impresora-ancho" onchange="window.CONFIG.guardarPerifericos()">
              <option value="80mm" ${peripherals.impresora?.ancho === '80mm' ? 'selected' : ''}>80mm</option>
              <option value="58mm" ${peripherals.impresora?.ancho === '58mm' ? 'selected' : ''}>58mm</option>
              <option value="A4" ${peripherals.impresora?.ancho === 'A4' ? 'selected' : ''}>A4</option>
            </select>
          </div>

          <div class="config-form-group">
            <label class="config-form-label">Impresión automática post-cobro</label>
            <p class="font-body-sm text-on-surface-variant mb-2">Genera el ticket al finalizar cada transacción sin confirmación</p>
            <div class="config-toggle">
              <div class="config-toggle-switch ${config.autoPrintTicket ? 'active' : ''}" onclick="window.CONFIG.toggleAutoPrint()"></div>
              <span class="config-toggle-label">${config.autoPrintTicket ? 'SÍ' : 'NO'}</span>
            </div>
          </div>

          <button class="btn btn-secondary" onclick="window.CONFIG.probarImpresion()">
            <span class="material-symbols-outlined" style="font-size:18px;">check_circle</span>
            PROBAR IMPRESIÓN
          </button>

          <h3 class="font-headline-sm mt-4 mb-2">Lector de Códigos</h3>
          
          <div class="config-form-group">
            <label class="config-form-label">Tipo</label>
            <select class="config-form-select" id="perif-lector-tipo" onchange="window.CONFIG.guardarPerifericos()">
              <option value="USB HID" ${peripherals.lector?.tipo === 'USB HID' ? 'selected' : ''}>USB HID</option>
              <option value="RS232" ${peripherals.lector?.tipo === 'RS232' ? 'selected' : ''}>Serie RS232</option>
              <option value="Bluetooth" ${peripherals.lector?.tipo === 'Bluetooth' ? 'selected' : ''}>Bluetooth</option>
            </select>
          </div>

          <div class="config-form-group">
            <label class="config-form-label">Prefijo</label>
            <input type="text" class="config-form-input" id="perif-lector-prefijo" value="${NUCLEO.esc(peripherals.lector?.prefijo || '')}" onchange="window.CONFIG.guardarPerifericos()">
          </div>

          <div class="config-form-group">
            <label class="config-form-label">Sufijo</label>
            <input type="text" class="config-form-input" id="perif-lector-sufijo" value="${NUCLEO.esc(peripherals.lector?.sufijo || '')}" onchange="window.CONFIG.guardarPerifericos()">
          </div>

          <button class="btn btn-secondary" onclick="window.CONFIG.probarLectura()">
            <span class="material-symbols-outlined" style="font-size:18px;">play_arrow</span>
            PROBAR LECTURA
          </button>

          <h3 class="font-headline-sm mt-4 mb-2">Cajón de Dinero (Opcional)</h3>
          
          <div class="config-form-group">
            <label class="config-form-label">Habilitado</label>
            <p class="font-body-sm text-on-surface-variant mb-2">Permitir apertura automática mediante pulsos de impresora</p>
            <div class="config-toggle">
              <div class="config-toggle-switch ${peripherals.cajon?.habilitado ? 'active' : ''}" onclick="window.CONFIG.toggleCajon()"></div>
              <span class="config-toggle-label">${peripherals.cajon?.habilitado ? 'SÍ' : 'NO'}</span>
            </div>
          </div>

          <div class="config-form-group">
            <label class="config-form-label">Comando de apertura</label>
            <input type="text" class="config-form-input" id="perif-cajon-comando" value="${NUCLEO.esc(peripherals.cajon?.comando || '')}" onchange="window.CONFIG.guardarPerifericos()">
          </div>

          <div class="config-form-group">
            <label class="config-form-label">Momento de apertura</label>
            <select class="config-form-select" id="perif-cajon-momento" onchange="window.CONFIG.guardarPerifericos()">
              <option value="cobrar" ${peripherals.cajon?.momento === 'cobrar' ? 'selected' : ''}>Al cobrar</option>
              <option value="abrir" ${peripherals.cajon?.momento === 'abrir' ? 'selected' : ''}>Al abrir caja</option>
              <option value="cerrar" ${peripherals.cajon?.momento === 'cerrar' ? 'selected' : ''}>Al cerrar caja</option>
              <option value="manual" ${peripherals.cajon?.momento === 'manual' ? 'selected' : ''}>Manual</option>
            </select>
          </div>
        </div>
      </div>
    `;
  }

  // ==========================================
  // 11. VISTA: USUARIOS
  // ==========================================
  function renderUsuarios() {
    const usuarios = NUCLEO.getData('pos_users');

    return `
      <div class="config-panel">
        <div class="config-panel-header">
          <h2 class="config-panel-title">Usuarios</h2>
          <button class="btn btn-primary" onclick="window.CONFIG.agregarUsuario()">
            <span class="material-symbols-outlined" style="font-size:18px;">add</span>
            AGREGAR USUARIO
          </button>
        </div>

        <table class="config-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>NOMBRE</th>
              <th>ROL</th>
              <th>PIN</th>
              <th>ÚLTIMO ACCESO</th>
              <th>EDITAR</th>
              <th>ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            ${usuarios.map((u, idx) => {
              const admins = usuarios.filter(x => x.rol === 'Admin');
              const puedeEliminar = !(u.rol === 'Admin' && admins.length === 1);
              return `
                <tr>
                  <td>${idx + 1}</td>
                  <td class="font-semibold">${NUCLEO.esc(u.nombre)}</td>
                  <td>${u.rol}</td>
                  <td>••••</td>
                  <td class="font-body-sm">${u.ultimoAcceso || '—'}</td>
                  <td><button class="config-table-btn edit" onclick="window.CONFIG.editarUsuario('${u.id}')">Editar</button></td>
                  <td>
                    ${puedeEliminar 
                      ? `<button class="config-table-btn delete" onclick="window.CONFIG.eliminarUsuario('${u.id}')">✕</button>` 
                      : '<span class="text-outline font-label-sm">—</span>'
                    }
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ==========================================
  // 12. VISTA: AUDITORÍA (SOLO LECTURA)
  // ==========================================
  function renderAuditoria() {
    const log = NUCLEO.getData('pos_config_audit_log');
    const usuarios = NUCLEO.getData('pos_users');

    return `
      <div class="config-panel">
        <div class="config-panel-header">
          <h2 class="config-panel-title">Auditoría</h2>
          <div class="config-panel-badge success">
            <span class="material-symbols-outlined" style="font-size:16px;">visibility</span>
            Solo Lectura
          </div>
        </div>

        <div class="config-audit-filters">
          <div class="config-form-group">
            <label class="config-form-label">Usuario</label>
            <select class="config-form-select" id="audit-filtro-usuario">
              <option value="">Todos los usuarios</option>
              ${usuarios.map(u => `<option value="${u.id}">${NUCLEO.esc(u.nombre)}</option>`).join('')}
            </select>
          </div>
          <div class="config-form-group">
            <label class="config-form-label">Desde</label>
            <input type="date" class="config-form-input" id="audit-filtro-desde">
          </div>
          <div class="config-form-group">
            <label class="config-form-label">Hasta</label>
            <input type="date" class="config-form-input" id="audit-filtro-hasta">
          </div>
          <div class="config-form-group">
            <label class="config-form-label">Sección</label>
            <select class="config-form-select" id="audit-filtro-seccion">
              <option value="">Todas las secciones</option>
              ${vistas.filter(v => v.id !== 'auditoria').map(v => `<option value="${NUCLEO.esc(v.nombre)}">${v.nombre}</option>`).join('')}
            </select>
          </div>
          <div class="config-form-group" style="display:flex;align-items:flex-end;">
            <button class="btn btn-primary" onclick="window.CONFIG.aplicarFiltrosAuditoria()">
              <span class="material-symbols-outlined" style="font-size:18px;">filter_list</span>
              APLICAR FILTROS
            </button>
          </div>
        </div>

        <table class="config-table">
          <thead>
            <tr>
              <th>FECHA</th>
              <th>USUARIO</th>
              <th>MÓDULO</th>
              <th>SECCIÓN</th>
              <th>CAMPO</th>
              <th>VALOR ANTERIOR</th>
              <th>VALOR NUEVO</th>
            </tr>
          </thead>
          <tbody id="audit-tbody">
            ${log.slice().reverse().map(entry => `
              <tr>
                <td class="font-body-sm">${new Date(entry.fecha).toLocaleString('es-AR')}</td>
                <td>${NUCLEO.esc(entry.userId || '—')}</td>
                <td>${NUCLEO.esc(entry.modulo)}</td>
                <td>${NUCLEO.esc(entry.seccion)}</td>
                <td>${NUCLEO.esc(entry.campo)}</td>
                <td class="font-mono">${NUCLEO.esc(String(entry.valorAnterior))}</td>
                <td class="font-mono">${NUCLEO.esc(String(entry.valorNuevo))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // ==========================================
  // 13. EVENTOS Y BINDINGS
  // ==========================================
  function bindSidebarEvents() {
    document.querySelectorAll('.config-sidebar-item[data-vista]').forEach(item => {
      item.addEventListener('click', function () {
        vistaActiva = this.getAttribute('data-vista');
        render();
      });
    });
  }

  function bindVistaEvents() {
    // Los eventos específicos se bindean inline con onclick
  }

  // ==========================================
  // 14. ACCIONES: SUB-CAJAS
  // ==========================================
  function toggleSubCajaTicket() {
    const subcajas = NUCLEO.getData('pos_subcajas');
    const valorAnterior = subcajas.printSubCajaTicketOnClose;
    subcajas.printSubCajaTicketOnClose = !valorAnterior;
    NUCLEO.setData('pos_subcajas', subcajas);
    NUCLEO.registrarCambioConfig({
      modulo: 'CONFIG',
      seccion: 'Sub-Cajas',
      campo: 'printSubCajaTicketOnClose',
      valorAnterior: valorAnterior,
      valorNuevo: subcajas.printSubCajaTicketOnClose,
      userId: (NUCLEO.getUsuarioActivo() || {}).id
    });
    render();
    NUCLEO.toast('Configuración actualizada', 'success');
  }

  function agregarMarca() {
    const products = NUCLEO.getData('pos_products');
    const subcajas = NUCLEO.getData('pos_subcajas');
    const yaSeleccionadas = (subcajas.selectedBrands || []).map(b => b.code);
    const marcasCigarrillos = products.filter(p =>
      p.category === 'Cigarrillos' && p.active !== false && yaSeleccionadas.indexOf(p.code) === -1
    );

    if (marcasCigarrillos.length === 0) {
      NUCLEO.toast('No hay productos disponibles en categoría "Cigarrillos"', 'warning');
      return;
    }

    const body = `
      <input type="text" class="config-form-input mb-2" id="modal-buscar-marca"
        placeholder="Buscar por nombre o código..." oninput="window.CONFIG.filtrarModalLista('modal-buscar-marca','modal-lista-marcas')">
      <div class="config-modal-list" id="modal-lista-marcas">
        ${marcasCigarrillos.map(p => `
          <div class="config-modal-list-item" data-texto="${NUCLEO.esc((p.name + ' ' + p.code).toLowerCase())}"
            onclick="window.CONFIG.seleccionarMarca('${NUCLEO.esc(p.code)}')">
            <span class="font-semibold">${NUCLEO.esc(p.name)}</span>
            <span class="font-body-sm text-on-surface-variant">SKU ${NUCLEO.esc(p.code)} · ${NUCLEO.money(p.price)}</span>
          </div>
        `).join('')}
      </div>
    `;

    abrirModal({ titulo: 'Agregar Marca a Sub-Caja', body: body });
  }

  function seleccionarMarca(code) {
    const products = NUCLEO.getData('pos_products');
    const product = products.find(p => p.code === code);
    if (!product) { NUCLEO.toast('Producto no encontrado', 'error'); return; }

    const subcajas = NUCLEO.getData('pos_subcajas');
    if (!subcajas.selectedBrands) subcajas.selectedBrands = [];

    if (subcajas.selectedBrands.find(b => b.code === code)) {
      NUCLEO.toast('La marca ya está habilitada', 'warning');
      return;
    }

    const precioSuelto = NUCLEO.roundCurrency((product.price || 0) / 20);
    subcajas.selectedBrands.push({
      code: product.code,
      name: product.name,
      priceLoose: precioSuelto,
      habilitada: true
    });

    NUCLEO.setData('pos_subcajas', subcajas);
    NUCLEO.setProductCigConfig(product.code, true, precioSuelto);
    NUCLEO.registrarCambioConfig({
      modulo: 'CONFIG',
      seccion: 'Sub-Cajas',
      campo: 'selectedBrands',
      valorAnterior: '—',
      valorNuevo: product.name,
      userId: (NUCLEO.getUsuarioActivo() || {}).id
    });
    cerrarModal();
    render();
    NUCLEO.toast('Marca agregada', 'success');
  }

  function actualizarPrecioSuelto(code, valor) {
    const precio = Number(valor);
    if (isNaN(precio) || precio < 0) { NUCLEO.toast('Precio inválido', 'error'); render(); return; }

    const subcajas = NUCLEO.getData('pos_subcajas');
    const brand = (subcajas.selectedBrands || []).find(b => b.code === code);
    if (!brand) return;

    const anterior = brand.priceLoose;
    brand.priceLoose = precio;
    NUCLEO.setData('pos_subcajas', subcajas);
    NUCLEO.setProductCigConfig(code, brand.habilitada, precio);
    NUCLEO.registrarCambioConfig({
      modulo: 'CONFIG',
      seccion: 'Sub-Cajas',
      campo: 'priceLoose (' + brand.name + ')',
      valorAnterior: anterior,
      valorNuevo: precio,
      userId: (NUCLEO.getUsuarioActivo() || {}).id
    });
    NUCLEO.toast('Precio suelto actualizado', 'success');
  }

  function toggleHabilitarMarca(code) {
    const subcajas = NUCLEO.getData('pos_subcajas');
    const brand = (subcajas.selectedBrands || []).find(b => b.code === code);
    if (!brand) return;

    const anterior = brand.habilitada;
    brand.habilitada = !brand.habilitada;
    NUCLEO.setData('pos_subcajas', subcajas);
    NUCLEO.setProductCigConfig(code, brand.habilitada, brand.priceLoose);
    NUCLEO.registrarCambioConfig({
      modulo: 'CONFIG',
      seccion: 'Sub-Cajas',
      campo: 'habilitada (' + brand.name + ')',
      valorAnterior: anterior,
      valorNuevo: brand.habilitada,
      userId: (NUCLEO.getUsuarioActivo() || {}).id
    });
    render();
  }

  // Filtra genéricamente los items de una lista de modal por texto de búsqueda
  function filtrarModalLista(inputId, listId) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    if (!input || !list) return;
    const q = input.value.trim().toLowerCase();
    Array.prototype.forEach.call(list.children, function (item) {
      const texto = item.getAttribute('data-texto') || '';
      item.style.display = texto.indexOf(q) === -1 ? 'none' : '';
    });
  }

  function eliminarMarca(code) {
    const subcajas = NUCLEO.getData('pos_subcajas');
    const brand = subcajas.selectedBrands.find(b => b.code === code);
    if (!brand) return;

    subcajas.selectedBrands = subcajas.selectedBrands.filter(b => b.code !== code);
    NUCLEO.setData('pos_subcajas', subcajas);
    NUCLEO.setProductCigConfig(code, false, 0);
    NUCLEO.registrarCambioConfig({
      modulo: 'CONFIG',
      seccion: 'Sub-Cajas',
      campo: 'selectedBrands',
      valorAnterior: brand.name,
      valorNuevo: '—',
      userId: (NUCLEO.getUsuarioActivo() || {}).id
    });
    render();
    NUCLEO.toast('Marca eliminada', 'success');
  }

  // ==========================================
  // 15. ACCIONES: CATEGORÍAS
  // ==========================================
  function agregarCategoria() {
    abrirModal({
      titulo: 'Nueva Categoría',
      body: `
        <div class="config-form-group">
          <label class="config-form-label">Nombre <span class="required">*</span></label>
          <input type="text" class="config-form-input" id="modal-categoria-nombre" placeholder="Ej: Bebidas, Limpieza...">
          <div class="config-modal-error" id="modal-categoria-error"></div>
        </div>
      `,
      footer: `
        <button type="button" class="btn btn-secondary" onclick="window.CONFIG.cerrarModal()">CANCELAR</button>
        <button type="button" class="btn btn-primary" onclick="window.CONFIG.confirmarAgregarCategoria()">GUARDAR</button>
      `
    });
    setTimeout(function () {
      const input = document.getElementById('modal-categoria-nombre');
      if (input) input.focus();
    }, 0);
  }

  function confirmarAgregarCategoria() {
    const input = document.getElementById('modal-categoria-nombre');
    const errorEl = document.getElementById('modal-categoria-error');
    const nombre = NUCLEO.normText(input.value);

    if (!nombre) { errorEl.textContent = 'El nombre es obligatorio'; return; }

    const categorias = NUCLEO.getData('pos_categories');
    if (categorias.includes(nombre)) {
      errorEl.textContent = 'La categoría ya existe';
      return;
    }

    categorias.push(nombre);
    NUCLEO.setData('pos_categories', categorias);
    NUCLEO.registrarCambioConfig({
      modulo: 'CONFIG',
      seccion: 'Categorías',
      campo: 'Nombre',
      valorAnterior: '—',
      valorNuevo: nombre,
      userId: (NUCLEO.getUsuarioActivo() || {}).id
    });
    cerrarModal();
    render();
    NUCLEO.toast('Categoría agregada', 'success');
  }

  function editarCategoria(oldName) {
    if (oldName === 'Cigarrillos') {
      NUCLEO.toast('No se puede eliminar ni renombrar', 'error');
      return;
    }

    abrirModal({
      titulo: 'Renombrar Categoría',
      body: `
        <div class="config-form-group">
          <label class="config-form-label">Nombre <span class="required">*</span></label>
          <input type="text" class="config-form-input" id="modal-categoria-nombre" value="${NUCLEO.esc(oldName)}">
          <div class="config-modal-error" id="modal-categoria-error"></div>
        </div>
      `,
      footer: `
        <button type="button" class="btn btn-secondary" onclick="window.CONFIG.cerrarModal()">CANCELAR</button>
        <button type="button" class="btn btn-primary" onclick="window.CONFIG.confirmarEditarCategoria('${NUCLEO.esc(oldName)}')">GUARDAR</button>
      `
    });
    setTimeout(function () {
      const input = document.getElementById('modal-categoria-nombre');
      if (input) { input.focus(); input.select(); }
    }, 0);
  }

  function confirmarEditarCategoria(oldName) {
    const input = document.getElementById('modal-categoria-nombre');
    const errorEl = document.getElementById('modal-categoria-error');
    const newName = NUCLEO.normText(input.value);

    if (!newName) { errorEl.textContent = 'El nombre es obligatorio'; return; }
    if (newName === oldName) { cerrarModal(); return; }

    const categoriasExistentes = NUCLEO.getData('pos_categories');
    if (categoriasExistentes.includes(newName)) {
      errorEl.textContent = 'Ya existe una categoría con ese nombre';
      return;
    }

    NUCLEO.renombrarCategoria(oldName, newName);

    const categorias = NUCLEO.getData('pos_categories');
    const idx = categorias.indexOf(oldName);
    if (idx !== -1) {
      categorias[idx] = newName;
      NUCLEO.setData('pos_categories', categorias);
    }

    NUCLEO.registrarCambioConfig({
      modulo: 'CONFIG',
      seccion: 'Categorías',
      campo: 'Nombre',
      valorAnterior: oldName,
      valorNuevo: newName,
      userId: (NUCLEO.getUsuarioActivo() || {}).id
    });
    cerrarModal();
    render();
    NUCLEO.toast('Categoría renombrada', 'success');
  }

  function eliminarCategoria(nombre) {
    if (nombre === 'Cigarrillos') {
      NUCLEO.toast('No se puede eliminar ni renombrar', 'error');
      return;
    }

    const products = NUCLEO.getData('pos_products');
    // Se cuentan TODOS los productos (activos e inactivos/dados de baja):
    // si un producto inactivo quedara con category apuntando a una
    // categoría ya borrada, quedaría huérfano.
    const count = products.filter(p => p.category === nombre).length;
    
    if (count > 0) {
      NUCLEO.toast(`No se puede eliminar: hay ${count} productos usando esta categoría`, 'error');
      return;
    }

    const categorias = NUCLEO.getData('pos_categories');
    const filtered = categorias.filter(c => c !== nombre);
    NUCLEO.setData('pos_categories', filtered);
    NUCLEO.registrarCambioConfig({
      modulo: 'CONFIG',
      seccion: 'Categorías',
      campo: 'Nombre',
      valorAnterior: nombre,
      valorNuevo: '—',
      userId: (NUCLEO.getUsuarioActivo() || {}).id
    });
    render();
    NUCLEO.toast('Categoría eliminada', 'success');
  }

  // ==========================================
  // 16. ACCIONES: MÁRGENES
  // ==========================================
  function editarMargen(categoria) {
    if (categoria === 'Cigarrillos') {
      NUCLEO.toast('Cigarrillos no tiene margen mínimo', 'warning');
      return;
    }

    const margenes = NUCLEO.getData('pos_min_margins');
    const valorAnterior = margenes[categoria] !== undefined ? margenes[categoria] : 35;
    const nuevoValor = prompt(`Margen mínimo para ${categoria} (%):`, valorAnterior);
    
    if (nuevoValor === null) return;
    const num = parseFloat(nuevoValor);
    if (isNaN(num) || num < 0 || num > 100) {
      NUCLEO.toast('Valor inválido (0-100)', 'error');
      return;
    }

    margenes[categoria] = num;
    NUCLEO.setData('pos_min_margins', margenes);
    NUCLEO.registrarCambioConfig({
      modulo: 'CONFIG',
      seccion: 'Márgenes',
      campo: 'Margen Mínimo',
      valorAnterior: valorAnterior + '%',
      valorNuevo: num + '%',
      userId: (NUCLEO.getUsuarioActivo() || {}).id
    });
    render();
    NUCLEO.toast('Margen actualizado', 'success');
  }

  // ==========================================
  // 17. ACCIONES: PROVEEDORES
  // ==========================================
  function agregarProveedor() {
    abrirModalProveedor(null);
  }

  function editarProveedor(id) {
    const proveedores = NUCLEO.getData('pos_suppliers');
    const p = proveedores.find(x => x.id === id);
    if (!p) return;
    abrirModalProveedor(p);
  }

  function abrirModalProveedor(proveedorExistente) {
    const p = proveedorExistente || {
      nombre: '', rubro: '', cuit: '', telefono: '', email: '', whatsapp: '',
      diasVisita: [], diasEntrega: [], formasPago: [], tipoFactura: 'A', diasCredito: 0
    };

    const checkboxesDias = function (name, seleccionados) {
      return `<div class="config-days-grid">` + DIAS_SEMANA.map(function (d) {
        const checked = (seleccionados || []).indexOf(d) !== -1 ? 'checked' : '';
        return `<label class="config-day-checkbox"><input type="checkbox" name="${name}" value="${d}" ${checked}> ${d.slice(0, 3)}</label>`;
      }).join('') + `</div>`;
    };

    const checkboxesPago = function (seleccionados) {
      return `<div class="config-payment-methods">` + FORMAS_PAGO.map(function (f) {
        const checked = (seleccionados || []).indexOf(f) !== -1 ? 'checked' : '';
        return `<label class="config-payment-method"><input type="checkbox" name="modal-prov-formaspago" value="${f}" ${checked}> ${f}</label>`;
      }).join('') + `</div>`;
    };

    const body = `
      <div class="config-form-group">
        <label class="config-form-label">Nombre / Razón Social <span class="required">*</span></label>
        <input type="text" class="config-form-input" id="modal-prov-nombre" value="${NUCLEO.esc(p.nombre)}">
      </div>
      <div class="config-modal-grid-2">
        <div class="config-form-group">
          <label class="config-form-label">Rubro <span class="required">*</span></label>
          <input type="text" class="config-form-input" id="modal-prov-rubro" value="${NUCLEO.esc(p.rubro)}" placeholder="Bebidas, Almacén, Limpieza...">
        </div>
        <div class="config-form-group">
          <label class="config-form-label">CUIT <span class="required">*</span></label>
          <input type="text" class="config-form-input" id="modal-prov-cuit" value="${NUCLEO.esc(p.cuit)}" placeholder="XX-XXXXXXXX-X">
        </div>
      </div>
      <div class="config-modal-grid-2">
        <div class="config-form-group">
          <label class="config-form-label">Teléfono</label>
          <input type="text" class="config-form-input" id="modal-prov-telefono" value="${NUCLEO.esc(p.telefono || '')}">
        </div>
        <div class="config-form-group">
          <label class="config-form-label">Email</label>
          <input type="email" class="config-form-input" id="modal-prov-email" value="${NUCLEO.esc(p.email || '')}">
        </div>
      </div>
      <div class="config-form-group">
        <label class="config-form-label">WhatsApp</label>
        <input type="text" class="config-form-input" id="modal-prov-whatsapp" value="${NUCLEO.esc(p.whatsapp || '')}">
      </div>
      <div class="config-form-group">
        <label class="config-form-label">Días de Visita</label>
        ${checkboxesDias('modal-prov-diasvisita', p.diasVisita)}
      </div>
      <div class="config-form-group">
        <label class="config-form-label">Días de Entrega</label>
        ${checkboxesDias('modal-prov-diasentrega', p.diasEntrega)}
      </div>
      <div class="config-form-group">
        <label class="config-form-label">Formas de Pago</label>
        ${checkboxesPago(p.formasPago)}
      </div>
      <div class="config-modal-grid-2">
        <div class="config-form-group">
          <label class="config-form-label">Tipo de Factura</label>
          <select class="config-form-select" id="modal-prov-tipofactura">
            ${['A', 'B', 'X'].map(t => `<option value="${t}" ${p.tipoFactura === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="config-form-group">
          <label class="config-form-label">Días de Crédito</label>
          <input type="number" min="0" class="config-form-input" id="modal-prov-diascredito" value="${p.diasCredito || 0}">
        </div>
      </div>
      <div class="config-modal-error" id="modal-prov-error"></div>
    `;
    const footer = `
      <button class="btn btn-ghost" onclick="window.CONFIG.cerrarModal()">CANCELAR</button>
      <button class="btn btn-primary" onclick="window.CONFIG.guardarProveedorModal('${proveedorExistente ? proveedorExistente.id : ''}')">GUARDAR</button>
    `;

    abrirModal({ titulo: proveedorExistente ? 'Editar Proveedor' : 'Agregar Proveedor', body: body, footer: footer });
  }

  function guardarProveedorModal(id) {
    const errorEl = document.getElementById('modal-prov-error');
    const nombre = NUCLEO.normText(document.getElementById('modal-prov-nombre').value);
    const rubro = NUCLEO.normText(document.getElementById('modal-prov-rubro').value);
    const cuit = NUCLEO.normText(document.getElementById('modal-prov-cuit').value);

    if (!nombre) { errorEl.textContent = 'El nombre es obligatorio.'; return; }
    if (!rubro) { errorEl.textContent = 'El rubro es obligatorio.'; return; }
    if (!validarCUIT(cuit)) { errorEl.textContent = 'CUIT inválido. Formato XX-XXXXXXXX-X con dígito verificador correcto.'; return; }

    const diasVisita = Array.prototype.slice.call(document.querySelectorAll('input[name="modal-prov-diasvisita"]:checked')).map(el => el.value);
    const diasEntrega = Array.prototype.slice.call(document.querySelectorAll('input[name="modal-prov-diasentrega"]:checked')).map(el => el.value);
    const formasPago = Array.prototype.slice.call(document.querySelectorAll('input[name="modal-prov-formaspago"]:checked')).map(el => el.value);

    const nuevo = {
      nombre: nombre,
      rubro: rubro,
      cuit: cuit,
      telefono: NUCLEO.normText(document.getElementById('modal-prov-telefono').value),
      email: NUCLEO.normText(document.getElementById('modal-prov-email').value),
      whatsapp: NUCLEO.normText(document.getElementById('modal-prov-whatsapp').value),
      diasVisita: diasVisita,
      diasEntrega: diasEntrega,
      formasPago: formasPago,
      tipoFactura: document.getElementById('modal-prov-tipofactura').value,
      diasCredito: parseInt(document.getElementById('modal-prov-diascredito').value, 10) || 0
    };

    const proveedores = NUCLEO.getData('pos_suppliers');
    const userId = (NUCLEO.getUsuarioActivo() || {}).id;
    const etiquetas = {
      nombre: 'Nombre', rubro: 'Rubro', cuit: 'CUIT', telefono: 'Teléfono', email: 'Email',
      whatsapp: 'WhatsApp', diasVisita: 'Días de Visita', diasEntrega: 'Días de Entrega',
      formasPago: 'Formas de Pago', tipoFactura: 'Tipo de Factura', diasCredito: 'Días de Crédito'
    };

    if (id) {
      const p = proveedores.find(x => x.id === id);
      if (!p) return;
      const anterior = Object.assign({}, p);
      Object.assign(p, nuevo);
      NUCLEO.setData('pos_suppliers', proveedores);
      logCambiosMultiples('Proveedores', anterior, nuevo, etiquetas, userId);
      NUCLEO.toast('Proveedor actualizado', 'success');
    } else {
      nuevo.id = NUCLEO.uid();
      nuevo.activo = true;
      proveedores.push(nuevo);
      NUCLEO.setData('pos_suppliers', proveedores);
      NUCLEO.registrarCambioConfig({
        modulo: 'CONFIG', seccion: 'Proveedores', campo: 'Nombre',
        valorAnterior: '—', valorNuevo: nombre, userId: userId
      });
      NUCLEO.toast('Proveedor agregado', 'success');
    }

    cerrarModal();
    render();
  }

  function eliminarProveedor(id) {
    const pedidos = NUCLEO.getData('pos_purchase_orders');
    const facturas = NUCLEO.getData('pos_invoices');
    const tienePedidos = pedidos.some(o => o.proveedorId === id);
    const tieneFacturas = facturas.some(f => f.proveedorId === id);

    if (tienePedidos || tieneFacturas) {
      NUCLEO.toast('No se puede eliminar: tiene pedidos o facturas asociadas', 'error');
      return;
    }

    const proveedores = NUCLEO.getData('pos_suppliers');
    const p = proveedores.find(x => x.id === id);
    if (!p) return;

    p.activo = false;
    NUCLEO.setData('pos_suppliers', proveedores);
    NUCLEO.registrarCambioConfig({
      modulo: 'CONFIG',
      seccion: 'Proveedores',
      campo: 'activo',
      valorAnterior: 'true',
      valorNuevo: 'false',
      userId: (NUCLEO.getUsuarioActivo() || {}).id
    });
    render();
    NUCLEO.toast('Proveedor dado de baja', 'success');
  }

  // ==========================================
  // 18. ACCIONES: BOTONES RÁPIDOS
  // ==========================================
  function agregarBotonRapido() {
    const unidades = ['1 unidad', '1 kg', '100 gr', '1 litro'];
    abrirModal({
      titulo: 'Nuevo Botón Rápido',
      body: `
        <div class="config-form-group">
          <label class="config-form-label">Nombre <span class="required">*</span></label>
          <input type="text" class="config-form-input" id="modal-boton-nombre" placeholder="Ej: Bolsa, Propina, Caramelos sueltos...">
        </div>
        <div class="config-form-group">
          <label class="config-form-label">Precio <span class="required">*</span></label>
          <input type="number" class="config-form-input" id="modal-boton-precio" placeholder="0">
        </div>
        <div class="config-form-group">
          <label class="config-form-label">Unidad</label>
          <select class="config-form-select" id="modal-boton-unidad">
            ${unidades.map(u => `<option value="${u}">${u}</option>`).join('')}
          </select>
        </div>
        <div class="config-modal-error" id="modal-boton-error"></div>
      `,
      footer: `
        <button type="button" class="btn btn-secondary" onclick="window.CONFIG.cerrarModal()">CANCELAR</button>
        <button type="button" class="btn btn-primary" onclick="window.CONFIG.confirmarAgregarBotonRapido()">GUARDAR</button>
      `
    });
    setTimeout(function () {
      const input = document.getElementById('modal-boton-nombre');
      if (input) input.focus();
    }, 0);
  }

  function confirmarAgregarBotonRapido() {
    const botones = NUCLEO.getData('pos_quick_buttons');
    const errorEl = document.getElementById('modal-boton-error');
    const nombre = NUCLEO.normText(document.getElementById('modal-boton-nombre').value);
    const precio = parseFloat(document.getElementById('modal-boton-precio').value);
    const unidad = document.getElementById('modal-boton-unidad').value;

    if (!nombre) { errorEl.textContent = 'El nombre es obligatorio'; return; }
    if (isNaN(precio)) { errorEl.textContent = 'El precio es obligatorio'; return; }

    // Regla del anexo: si el nombre ya existe, actualiza precio/unidad/vínculo
    // (conserva el vínculo previo); si no existe, crea uno nuevo.
    const existente = botones.find(b => NUCLEO.normText(b.nombre).toLowerCase() === nombre.toLowerCase());

    if (existente) {
      const anterior = { precio: existente.precio, unidad: existente.unidad };
      existente.precio = precio;
      existente.unidad = unidad;
      NUCLEO.setData('pos_quick_buttons', botones);
      logCambiosMultiples('Botones Rápidos', anterior, { precio: precio, unidad: unidad },
        { precio: 'precio (' + nombre + ')', unidad: 'unidad (' + nombre + ')' },
        (NUCLEO.getUsuarioActivo() || {}).id);
      cerrarModal();
      render();
      NUCLEO.toast('Botón rápido actualizado', 'success');
      return;
    }

    if (botones.length >= 21) {
      errorEl.textContent = 'Máximo 21 botones alcanzado';
      return;
    }

    const nuevo = {
      code: NUCLEO.uid(),
      nombre: nombre,
      precio: precio,
      unidad: unidad,
      linkedProductCode: null
    };

    botones.push(nuevo);
    NUCLEO.setData('pos_quick_buttons', botones);
    NUCLEO.registrarCambioConfig({
      modulo: 'CONFIG',
      seccion: 'Botones Rápidos',
      campo: 'nombre',
      valorAnterior: '—',
      valorNuevo: nombre,
      userId: (NUCLEO.getUsuarioActivo() || {}).id
    });
    cerrarModal();
    render();
    NUCLEO.toast('Botón rápido agregado', 'success');
  }

  function eliminarBotonRapido(idx) {
    const botones = NUCLEO.getData('pos_quick_buttons');
    const btn = botones[idx];
    if (!btn) return;

    botones.splice(idx, 1);
    NUCLEO.setData('pos_quick_buttons', botones);
    NUCLEO.registrarCambioConfig({
      modulo: 'CONFIG',
      seccion: 'Botones Rápidos',
      campo: 'nombre',
      valorAnterior: btn.nombre,
      valorNuevo: '—',
      userId: (NUCLEO.getUsuarioActivo() || {}).id
    });
    render();
    NUCLEO.toast('Botón eliminado', 'success');
  }

  // [VINCULAR PRODUCTO]: modal con lista de productos ACTIVOS de INVENTARIO.
  function vincularProducto(idx) {
    const botones = NUCLEO.getData('pos_quick_buttons');
    const btn = botones[idx];
    if (!btn) return;

    const products = NUCLEO.getData('pos_products').filter(p => p.active !== false);
    if (products.length === 0) {
      NUCLEO.toast('No hay productos activos en INVENTARIO', 'warning');
      return;
    }

    const actual = btn.linkedProductCode
      ? products.find(p => p.code === btn.linkedProductCode)
      : null;

    const body = `
      ${actual ? `<div class="config-info-box">Vínculo actual: <strong>${NUCLEO.esc(actual.name)}</strong> (SKU ${NUCLEO.esc(actual.code)})</div>` : ''}
      <input type="text" class="config-form-input mb-2" id="modal-buscar-producto"
        placeholder="Buscar producto por nombre o código..." oninput="window.CONFIG.filtrarModalLista('modal-buscar-producto','modal-lista-productos')">
      <div class="config-modal-list" id="modal-lista-productos">
        ${products.map(p => `
          <div class="config-modal-list-item" data-texto="${NUCLEO.esc((p.name + ' ' + p.code).toLowerCase())}"
            onclick="window.CONFIG.seleccionarProductoVinculo(${idx}, '${NUCLEO.esc(p.code)}')">
            <span class="font-semibold">${NUCLEO.esc(p.name)}</span>
            <span class="font-body-sm text-on-surface-variant">SKU ${NUCLEO.esc(p.code)} · ${NUCLEO.money(p.price)}</span>
          </div>
        `).join('')}
      </div>
    `;
    const footer = actual
      ? `<button class="btn btn-ghost" onclick="window.CONFIG.quitarVinculoProducto(${idx})">QUITAR VÍNCULO</button>`
      : '';

    abrirModal({ titulo: 'Vincular Producto — ' + btn.nombre, body: body, footer: footer });
  }

  function seleccionarProductoVinculo(idx, code) {
    const botones = NUCLEO.getData('pos_quick_buttons');
    const btn = botones[idx];
    const product = NUCLEO.getData('pos_products').find(p => p.code === code);
    if (!btn || !product) return;

    const anterior = btn.linkedProductCode || '—';
    btn.linkedProductCode = code;
    NUCLEO.setData('pos_quick_buttons', botones);
    NUCLEO.registrarCambioConfig({
      modulo: 'CONFIG',
      seccion: 'Botones Rápidos',
      campo: 'linkedProductCode (' + btn.nombre + ')',
      valorAnterior: anterior,
      valorNuevo: product.name,
      userId: (NUCLEO.getUsuarioActivo() || {}).id
    });
    cerrarModal();
    render();
    NUCLEO.toast('Producto vinculado', 'success');
  }

  function quitarVinculoProducto(idx) {
    const botones = NUCLEO.getData('pos_quick_buttons');
    const btn = botones[idx];
    if (!btn || !btn.linkedProductCode) return;

    const products = NUCLEO.getData('pos_products');
    const anterior = (products.find(p => p.code === btn.linkedProductCode) || {}).name || btn.linkedProductCode;
    btn.linkedProductCode = null;
    NUCLEO.setData('pos_quick_buttons', botones);
    NUCLEO.registrarCambioConfig({
      modulo: 'CONFIG',
      seccion: 'Botones Rápidos',
      campo: 'linkedProductCode (' + btn.nombre + ')',
      valorAnterior: anterior,
      valorNuevo: '—',
      userId: (NUCLEO.getUsuarioActivo() || {}).id
    });
    cerrarModal();
    render();
    NUCLEO.toast('Vínculo removido — el botón vuelve a comportarse como venta suelta', 'success');
  }

  // ==========================================
  // 19. ACCIONES: MONEDA
  // ==========================================
  function guardarMoneda() {
    const moneda = NUCLEO.getData('pos_moneda');
    const anterior = { code: moneda.code, symbol: moneda.symbol, roundMultiple: moneda.roundMultiple };

    moneda.code = document.getElementById('moneda-codigo').value;
    moneda.symbol = document.getElementById('moneda-simbolo').value;
    moneda.roundMultiple = parseInt(document.getElementById('moneda-multiplo').value, 10) || 100;

    NUCLEO.setData('pos_moneda', moneda);
    logCambiosMultiples('Moneda', anterior,
      { code: moneda.code, symbol: moneda.symbol, roundMultiple: moneda.roundMultiple },
      { code: 'Código ISO', symbol: 'Símbolo', roundMultiple: 'Múltiplo de Redondeo' },
      (NUCLEO.getUsuarioActivo() || {}).id);

    // Refresca la vista (demo de redondeo, símbolo en denominaciones, etc.)
    // conservando el monto de prueba que el usuario haya ingresado.
    const previewInput = document.getElementById('moneda-preview-input');
    if (previewInput) montoPreviewMoneda = parseFloat(previewInput.value) || montoPreviewMoneda;
    render();
    NUCLEO.toast('Moneda actualizada', 'success');
  }

  function actualizarPreviewRedondeo() {
    const input = document.getElementById('moneda-preview-input');
    const result = document.getElementById('moneda-preview-result');
    if (input && result) {
      const val = parseFloat(input.value) || 0;
      montoPreviewMoneda = val;
      result.textContent = NUCLEO.money(NUCLEO.roundCurrency(val));
    }
  }

  function agregarDenominacion() {
    const valor = parseInt(prompt('Valor de la denominación:'));
    if (isNaN(valor) || valor <= 0) return;

    const moneda = NUCLEO.getData('pos_moneda');
    if (!moneda.denominations) moneda.denominations = [];
    if (moneda.denominations.includes(valor)) {
      NUCLEO.toast('La denominación ya existe', 'warning');
      return;
    }

    moneda.denominations.push(valor);
    moneda.denominations.sort((a, b) => a - b);
    NUCLEO.setData('pos_moneda', moneda);
    NUCLEO.registrarCambioConfig({
      modulo: 'CONFIG',
      seccion: 'Moneda',
      campo: 'denominations',
      valorAnterior: '—',
      valorNuevo: '$' + valor,
      userId: (NUCLEO.getUsuarioActivo() || {}).id
    });
    render();
    NUCLEO.toast('Denominación agregada', 'success');
  }

  function eliminarDenominacion(valor) {
    const moneda = NUCLEO.getData('pos_moneda');
    moneda.denominations = moneda.denominations.filter(d => d !== valor);
    NUCLEO.setData('pos_moneda', moneda);
    NUCLEO.registrarCambioConfig({
      modulo: 'CONFIG',
      seccion: 'Moneda',
      campo: 'denominations',
      valorAnterior: '$' + valor,
      valorNuevo: '—',
      userId: (NUCLEO.getUsuarioActivo() || {}).id
    });
    render();
    NUCLEO.toast('Denominación eliminada', 'success');
  }

  // ==========================================
  // 20. ACCIONES: NEGOCIO
  // ==========================================
  function guardarNegocio() {
    const negocio = NUCLEO.getData('pos_business');
    const anterior = {
      razonSocial: negocio.razonSocial, cuit: negocio.cuit, inicioActividades: negocio.inicioActividades,
      direccion: negocio.direccion, telefono: negocio.telefono, email: negocio.email
    };

    const nuevo = {
      razonSocial: document.getElementById('negocio-razon').value,
      cuit: document.getElementById('negocio-cuit').value,
      inicioActividades: document.getElementById('negocio-inicio').value,
      direccion: document.getElementById('negocio-direccion').value,
      telefono: document.getElementById('negocio-telefono').value,
      email: document.getElementById('negocio-email').value
    };

    if (nuevo.cuit && !validarCUIT(nuevo.cuit)) {
      NUCLEO.toast('CUIT con formato o dígito verificador inválido (XX-XXXXXXXX-X)', 'warning');
    }

    Object.assign(negocio, nuevo);
    NUCLEO.setData('pos_business', negocio);
    logCambiosMultiples('Negocio', anterior, nuevo, {
      razonSocial: 'Razón Social', cuit: 'CUIT', inicioActividades: 'Inicio de Actividades',
      direccion: 'Dirección', telefono: 'Teléfono', email: 'Email'
    }, (NUCLEO.getUsuarioActivo() || {}).id);

    // Refresca la vista previa del ticket sin perder el foco del campo activo
    render();
    NUCLEO.toast('Datos del negocio actualizados', 'success');
  }

  // ==========================================
  // 21. ACCIONES: PERIFÉRICOS
  // ==========================================
  function guardarPerifericos() {
    const peripherals = NUCLEO.getData('pos_peripherals');
    const userId = (NUCLEO.getUsuarioActivo() || {}).id;

    const impresoraAnterior = Object.assign({}, peripherals.impresora);
    const lectorAnterior = Object.assign({}, peripherals.lector);
    const cajonAnterior = Object.assign({}, peripherals.cajon);

    peripherals.impresora = {
      tipo: document.getElementById('perif-impresora-tipo').value,
      modelo: document.getElementById('perif-impresora-modelo').value,
      puerto: document.getElementById('perif-impresora-puerto').value,
      ancho: document.getElementById('perif-impresora-ancho').value
    };

    peripherals.lector = {
      tipo: document.getElementById('perif-lector-tipo').value,
      prefijo: document.getElementById('perif-lector-prefijo').value,
      sufijo: document.getElementById('perif-lector-sufijo').value
    };

    peripherals.cajon = {
      habilitado: (cajonAnterior && cajonAnterior.habilitado) || false,
      comando: document.getElementById('perif-cajon-comando').value,
      momento: document.getElementById('perif-cajon-momento').value
    };

    NUCLEO.setData('pos_peripherals', peripherals);

    logCambiosMultiples('Periféricos', impresoraAnterior, peripherals.impresora, {
      tipo: 'Impresora · Tipo', modelo: 'Impresora · Modelo', puerto: 'Impresora · Puerto', ancho: 'Impresora · Ancho de Papel'
    }, userId);
    logCambiosMultiples('Periféricos', lectorAnterior, peripherals.lector, {
      tipo: 'Lector · Tipo', prefijo: 'Lector · Prefijo', sufijo: 'Lector · Sufijo'
    }, userId);
    logCambiosMultiples('Periféricos', cajonAnterior, peripherals.cajon, {
      comando: 'Cajón · Comando', momento: 'Cajón · Momento de Apertura'
    }, userId);

    NUCLEO.toast('Periféricos actualizados', 'success');
  }

  function toggleAutoPrint() {
    const config = NUCLEO.getData('pos_config');
    const valorAnterior = config.autoPrintTicket;
    config.autoPrintTicket = !valorAnterior;
    NUCLEO.setData('pos_config', config);
    NUCLEO.registrarCambioConfig({
      modulo: 'CONFIG',
      seccion: 'Periféricos',
      campo: 'autoPrintTicket',
      valorAnterior: valorAnterior,
      valorNuevo: config.autoPrintTicket,
      userId: (NUCLEO.getUsuarioActivo() || {}).id
    });
    render();
    NUCLEO.toast('Configuración actualizada', 'success');
  }

  function toggleCajon() {
    const peripherals = NUCLEO.getData('pos_peripherals');
    if (!peripherals.cajon) peripherals.cajon = {};
    const valorAnterior = peripherals.cajon.habilitado;
    peripherals.cajon.habilitado = !valorAnterior;
    NUCLEO.setData('pos_peripherals', peripherals);
    NUCLEO.registrarCambioConfig({
      modulo: 'CONFIG',
      seccion: 'Periféricos',
      campo: 'cajon.habilitado',
      valorAnterior: valorAnterior,
      valorNuevo: peripherals.cajon.habilitado,
      userId: (NUCLEO.getUsuarioActivo() || {}).id
    });
    render();
    NUCLEO.toast('Configuración actualizada', 'success');
  }

  function probarImpresion() {
    const negocio = NUCLEO.getData('pos_business');
    const ticketPrueba = {
      id: 'PRUEBA-' + NUCLEO.uid(),
      fecha: NUCLEO.nowISO(),
      total: 0,
      items: [
        { name: 'Ticket de prueba de impresión', qty: 1, price: 0, esCigarrillo: false }
      ]
    };
    NUCLEO.printTicket(ticketPrueba);
    NUCLEO.toast('Enviando ticket de prueba a ' + (negocio.razonSocial || 'la impresora configurada'), 'success');
  }

  let scanListenerHandler = null;
  let scanBuffer = '';

  function probarLectura() {
    scanBuffer = '';
    const body = `
      <p class="font-body-sm text-on-surface-variant mb-2">Escaneá un código con el lector configurado. Se muestra tal cual llega, incluyendo prefijo/sufijo.</p>
      <div class="config-scan-listener" id="scan-listener-display">Esperando lectura…</div>
    `;
    abrirModal({ titulo: 'Probar Lectura de Código', body: body });

    scanListenerHandler = function (e) {
      const display = document.getElementById('scan-listener-display');
      if (!display) return;
      if (e.key === 'Enter') {
        display.textContent = scanBuffer || '(código vacío)';
        display.classList.add('captured');
        scanBuffer = '';
        return;
      }
      if (e.key.length === 1) {
        scanBuffer += e.key;
        display.textContent = scanBuffer;
        display.classList.remove('captured');
      }
    };
    document.addEventListener('keydown', scanListenerHandler);
  }

  // Se invoca desde cerrarModal() para no dejar el listener de escucha activo
  function detenerEscuchaLector() {
    if (scanListenerHandler) {
      document.removeEventListener('keydown', scanListenerHandler);
      scanListenerHandler = null;
    }
  }

  // ==========================================
  // 22. ACCIONES: USUARIOS
  // ==========================================
  function agregarUsuario() {
    abrirModal({
      titulo: 'Nuevo Usuario',
      body: `
        <div class="config-form-group">
          <label class="config-form-label">Nombre <span class="required">*</span></label>
          <input type="text" class="config-form-input" id="modal-usuario-nombre" placeholder="Nombre y apellido">
        </div>
        <div class="config-form-group">
          <label class="config-form-label">Rol <span class="required">*</span></label>
          <select class="config-form-select" id="modal-usuario-rol">
            <option value="Cajero">Cajero</option>
            <option value="Admin">Admin</option>
          </select>
        </div>
        <div class="config-form-group">
          <label class="config-form-label">PIN (4-6 dígitos) <span class="required">*</span></label>
          <input type="password" inputmode="numeric" maxlength="6" class="config-form-input" id="modal-usuario-pin" placeholder="····">
        </div>
        <div class="config-modal-error" id="modal-usuario-error"></div>
      `,
      footer: `
        <button type="button" class="btn btn-secondary" onclick="window.CONFIG.cerrarModal()">CANCELAR</button>
        <button type="button" class="btn btn-primary" onclick="window.CONFIG.confirmarAgregarUsuario()">GUARDAR</button>
      `
    });
    setTimeout(function () {
      const input = document.getElementById('modal-usuario-nombre');
      if (input) input.focus();
    }, 0);
  }

  function confirmarAgregarUsuario() {
    const errorEl = document.getElementById('modal-usuario-error');
    const nombre = NUCLEO.normText(document.getElementById('modal-usuario-nombre').value);
    const rol = document.getElementById('modal-usuario-rol').value;
    const pin = document.getElementById('modal-usuario-pin').value;

    if (!nombre) { errorEl.textContent = 'El nombre es obligatorio'; return; }
    if (!pin || pin.length < 4 || pin.length > 6 || !/^\d+$/.test(pin)) {
      errorEl.textContent = 'PIN inválido (4-6 dígitos)';
      return;
    }

    const usuarios = NUCLEO.getData('pos_users');
    const nuevo = {
      id: NUCLEO.uid(),
      nombre: nombre,
      rol: rol,
      pin: pin,
      ultimoAcceso: null
    };

    usuarios.push(nuevo);
    NUCLEO.setData('pos_users', usuarios);
    NUCLEO.registrarCambioConfig({
      modulo: 'CONFIG',
      seccion: 'Usuarios',
      campo: 'nombre',
      valorAnterior: '—',
      valorNuevo: nombre,
      userId: (NUCLEO.getUsuarioActivo() || {}).id
    });
    cerrarModal();
    render();
    NUCLEO.toast('Usuario agregado', 'success');
  }

  function editarUsuario(id) {
    const usuarios = NUCLEO.getData('pos_users');
    const u = usuarios.find(x => x.id === id);
    if (!u) return;

    abrirModal({
      titulo: 'Editar Usuario',
      body: `
        <div class="config-form-group">
          <label class="config-form-label">Nombre <span class="required">*</span></label>
          <input type="text" class="config-form-input" id="modal-usuario-nombre" value="${NUCLEO.esc(u.nombre)}">
        </div>
        <div class="config-form-group">
          <label class="config-form-label">Rol <span class="required">*</span></label>
          <select class="config-form-select" id="modal-usuario-rol">
            <option value="Cajero" ${u.rol === 'Cajero' ? 'selected' : ''}>Cajero</option>
            <option value="Admin" ${u.rol === 'Admin' ? 'selected' : ''}>Admin</option>
          </select>
        </div>
        <div class="config-form-group">
          <label class="config-form-label">PIN (4-6 dígitos)</label>
          <input type="password" inputmode="numeric" maxlength="6" class="config-form-input" id="modal-usuario-pin" value="${NUCLEO.esc(u.pin)}">
        </div>
        <div class="config-modal-error" id="modal-usuario-error"></div>
      `,
      footer: `
        <button type="button" class="btn btn-secondary" onclick="window.CONFIG.cerrarModal()">CANCELAR</button>
        <button type="button" class="btn btn-primary" onclick="window.CONFIG.confirmarEditarUsuario('${NUCLEO.esc(id)}')">GUARDAR</button>
      `
    });
    setTimeout(function () {
      const input = document.getElementById('modal-usuario-nombre');
      if (input) { input.focus(); input.select(); }
    }, 0);
  }

  function confirmarEditarUsuario(id) {
    const usuarios = NUCLEO.getData('pos_users');
    const u = usuarios.find(x => x.id === id);
    if (!u) { cerrarModal(); return; }

    const errorEl = document.getElementById('modal-usuario-error');
    const nuevoNombre = NUCLEO.normText(document.getElementById('modal-usuario-nombre').value);
    const nuevoRol = document.getElementById('modal-usuario-rol').value;
    const nuevoPin = document.getElementById('modal-usuario-pin').value;

    if (!nuevoNombre) { errorEl.textContent = 'El nombre es obligatorio'; return; }
    if (!/^\d{4,6}$/.test(nuevoPin)) { errorEl.textContent = 'PIN inválido (4-6 dígitos)'; return; }

    // Protección de último Admin también al degradar el rol, no solo al eliminar.
    const admins = usuarios.filter(x => x.rol === 'Admin');
    if (u.rol === 'Admin' && nuevoRol !== 'Admin' && admins.length === 1) {
      errorEl.textContent = 'No se puede quitar el rol Admin al último administrador';
      return;
    }

    const nombreAnterior = u.nombre;
    const rolAnterior = u.rol;
    const pinCambio = u.pin !== nuevoPin;
    u.nombre = nuevoNombre;
    u.rol = nuevoRol;
    u.pin = nuevoPin;
    NUCLEO.setData('pos_users', usuarios);

    // El PIN nunca se registra en texto plano en la auditoría, solo si cambió.
    logCambiosMultiples('Usuarios',
      { nombre: nombreAnterior, rol: rolAnterior },
      { nombre: u.nombre, rol: u.rol },
      { nombre: 'Nombre', rol: 'Rol' },
      (NUCLEO.getUsuarioActivo() || {}).id);
    if (pinCambio) {
      NUCLEO.registrarCambioConfig({
        modulo: 'CONFIG', seccion: 'Usuarios', campo: 'PIN',
        valorAnterior: '••••', valorNuevo: '••••',
        userId: (NUCLEO.getUsuarioActivo() || {}).id
      });
    }
    cerrarModal();
    render();
    NUCLEO.toast('Usuario actualizado', 'success');
  }

  function eliminarUsuario(id) {
    const usuarios = NUCLEO.getData('pos_users');
    const u = usuarios.find(x => x.id === id);
    if (!u) return;

    const admins = usuarios.filter(x => x.rol === 'Admin');
    if (u.rol === 'Admin' && admins.length === 1) {
      NUCLEO.toast('No se puede eliminar el último Admin', 'error');
      return;
    }

    const filtered = usuarios.filter(x => x.id !== id);
    NUCLEO.setData('pos_users', filtered);
    NUCLEO.registrarCambioConfig({
      modulo: 'CONFIG',
      seccion: 'Usuarios',
      campo: 'nombre',
      valorAnterior: u.nombre,
      valorNuevo: '—',
      userId: (NUCLEO.getUsuarioActivo() || {}).id
    });
    render();
    NUCLEO.toast('Usuario eliminado', 'success');
  }

  // ==========================================
  // 23. ACCIONES: AUDITORÍA
  // ==========================================
  function aplicarFiltrosAuditoria() {
    const usuario = document.getElementById('audit-filtro-usuario').value;
    const desde = document.getElementById('audit-filtro-desde').value;
    const hasta = document.getElementById('audit-filtro-hasta').value;
    const seccion = document.getElementById('audit-filtro-seccion').value;

    const log = NUCLEO.getData('pos_config_audit_log');
    let filtered = log.slice().reverse();

    if (usuario) filtered = filtered.filter(e => e.userId === usuario);
    if (desde) filtered = filtered.filter(e => e.fecha >= desde);
    if (hasta) filtered = filtered.filter(e => e.fecha <= hasta + 'T23:59:59');
    if (seccion) filtered = filtered.filter(e => e.seccion === seccion);

    const tbody = document.getElementById('audit-tbody');
    if (tbody) {
      tbody.innerHTML = filtered.map(entry => `
        <tr>
          <td class="font-body-sm">${new Date(entry.fecha).toLocaleString('es-AR')}</td>
          <td>${NUCLEO.esc(entry.userId || '—')}</td>
          <td>${NUCLEO.esc(entry.modulo)}</td>
          <td>${NUCLEO.esc(entry.seccion)}</td>
          <td>${NUCLEO.esc(entry.campo)}</td>
          <td class="font-mono">${NUCLEO.esc(String(entry.valorAnterior))}</td>
          <td class="font-mono">${NUCLEO.esc(String(entry.valorNuevo))}</td>
        </tr>
      `).join('');
    }

    NUCLEO.toast('Filtros aplicados', 'success');
  }

  // ==========================================
  // 24. UTILIDADES
  // ==========================================
  function hacerBackupAhora() {
    NUCLEO.backupJSON();
    // backupJSON() ya actualiza pos_last_backup_ts; re-renderizamos para que
    // el banner desaparezca (shouldRemindBackup() vuelve a evaluar en fresco).
    render();
  }

  // ==========================================
  // 25. API PÚBLICA
  // ==========================================
  window.CONFIG = {
    init: init,
    onShow: onShow,
    // Modales genéricos
    cerrarModal: cerrarModal,
    filtrarModalLista: filtrarModalLista,
    // Sub-Cajas
    toggleSubCajaTicket: toggleSubCajaTicket,
    agregarMarca: agregarMarca,
    seleccionarMarca: seleccionarMarca,
    eliminarMarca: eliminarMarca,
    actualizarPrecioSuelto: actualizarPrecioSuelto,
    toggleHabilitarMarca: toggleHabilitarMarca,
    // Categorías
    agregarCategoria: agregarCategoria,
    confirmarAgregarCategoria: confirmarAgregarCategoria,
    editarCategoria: editarCategoria,
    confirmarEditarCategoria: confirmarEditarCategoria,
    eliminarCategoria: eliminarCategoria,
    // Márgenes
    editarMargen: editarMargen,
    // Proveedores
    agregarProveedor: agregarProveedor,
    editarProveedor: editarProveedor,
    eliminarProveedor: eliminarProveedor,
    guardarProveedorModal: guardarProveedorModal,
    // Botones Rápidos
    agregarBotonRapido: agregarBotonRapido,
    confirmarAgregarBotonRapido: confirmarAgregarBotonRapido,
    eliminarBotonRapido: eliminarBotonRapido,
    vincularProducto: vincularProducto,
    seleccionarProductoVinculo: seleccionarProductoVinculo,
    quitarVinculoProducto: quitarVinculoProducto,
    // Moneda
    guardarMoneda: guardarMoneda,
    actualizarPreviewRedondeo: actualizarPreviewRedondeo,
    agregarDenominacion: agregarDenominacion,
    eliminarDenominacion: eliminarDenominacion,
    // Negocio
    guardarNegocio: guardarNegocio,
    // Periféricos
    guardarPerifericos: guardarPerifericos,
    toggleAutoPrint: toggleAutoPrint,
    toggleCajon: toggleCajon,
    probarImpresion: probarImpresion,
    probarLectura: probarLectura,
    hacerBackupAhora: hacerBackupAhora,
    // Usuarios
    agregarUsuario: agregarUsuario,
    confirmarAgregarUsuario: confirmarAgregarUsuario,
    editarUsuario: editarUsuario,
    confirmarEditarUsuario: confirmarEditarUsuario,
    eliminarUsuario: eliminarUsuario,
    // Auditoría
    aplicarFiltrosAuditoria: aplicarFiltrosAuditoria
  };

  // Auto-inicializar
  if (document.getElementById('moduleContainer')) {
    init();
  }

})();