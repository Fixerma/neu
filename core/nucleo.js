/* ============================================
   NEURORA POS — NÚCLEO (ANEXO C)
   Sistema operativo del POS
   Versión: 1.0
   ============================================ */

(function () {
  'use strict';

  // ==========================================
  // 1. SCHEMA MAESTRO (26 claves pos_*)
  // ==========================================
  const SCHEMA = {
    pos_products: [],
    pos_sales: [],
    pos_config: { autoPrintTicket: false },
    pos_quick_buttons: [],
    pos_min_margins: {},
    pos_subcajas: { printSubCajaTicketOnClose: false, selectedBrands: [] },
    pos_cierres: [],
    pos_ciclo_actual: null,
    pos_categories: [],
    pos_moneda: { code: 'ARS', symbol: '$', roundMultiple: 100, denominations: [100, 200, 500, 1000, 2000, 5000, 10000] },
    pos_ticket_draft: null,
    pos_last_backup_ts: null,
    pos_suppliers: [],
    pos_business: {},
    pos_peripherals: {},
    pos_users: [],
    pos_purchase_orders: [],
    pos_invoices: [],
    pos_finanzas_gastos: [],
    pos_finanzas_capital: [],
    pos_finanzas_reservas: [],
    pos_alerts_log: [],
    pos_cig_subcaja: {},
    pos_tickets_log: [],
    pos_stock_movements: [],
    pos_config_audit_log: []
  };

  // ==========================================
  // 2. STORAGE (getData / setData)
  // ==========================================
  function getData(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) {
        // Clave inexistente → retornar default del SCHEMA
        return SCHEMA.hasOwnProperty(key) ? JSON.parse(JSON.stringify(SCHEMA[key])) : null;
      }
      return JSON.parse(raw);
    } catch (e) {
      // JSON corrupto → alerta dura
      alertaDatoCorrupto(key);
      return SCHEMA.hasOwnProperty(key) ? JSON.parse(JSON.stringify(SCHEMA[key])) : null;
    }
  }

  function setData(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      alertaGuardadoFallido('Error al guardar ' + key + ': ' + e.message);
      return false;
    }
  }

  // Inicialización del SCHEMA al primer arranque
  function initSchema() {
    Object.keys(SCHEMA).forEach(function (key) {
      if (localStorage.getItem(key) === null) {
        setData(key, SCHEMA[key]);
      }
    });
  }

  // ==========================================
  // 3. UTILIDADES
  // ==========================================
  function $(selector) { return document.querySelector(selector); }
  function $$(selector) { return document.querySelectorAll(selector); }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  function today() {
    return new Date().toISOString().split('T')[0];
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function money(amount) {
    const moneda = getData('pos_moneda');
    const symbol = (moneda && moneda.symbol) || '$';
    const num = Number(amount) || 0;
    return symbol + ' ' + num.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function roundCurrency(num) {
    const moneda = getData('pos_moneda');
    const multiple = (moneda && moneda.roundMultiple) || 100;
    return Math.round(num / multiple) * multiple;
  }

  function normText(str) {
    return (str || '').toString().trim().replace(/\s+/g, ' ');
  }

  function normCategory(str) {
    return normText(str).replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s]/g, '');
  }

  function esc(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function toast(message, type) {
    type = type || 'info';
    const existing = $('.toast-notification');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.style.cssText = 'position:fixed;bottom:20px;right:20px;padding:12px 20px;border-radius:8px;color:#fff;font-size:14px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:opacity 0.3s;';
    
    const colors = { info: '#1e40af', success: '#00563a', error: '#ba1a1a', warning: '#f59e0b' };
    toast.style.background = colors[type] || colors.info;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity = '0';
      setTimeout(function () { toast.remove(); }, 300);
    }, 3000);
  }

  function exportCSV(data, filename) {
    if (!data || data.length === 0) { toast('No hay datos para exportar', 'warning'); return; }
    const headers = Object.keys(data[0]);
    const rows = data.map(function (row) {
      return headers.map(function (h) {
        const val = row[h] !== null && row[h] !== undefined ? String(row[h]) : '';
        return '"' + val.replace(/"/g, '""') + '"';
      }).join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename || 'export.csv';
    link.click();
  }

  function exportJSON(data, filename) {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename || 'export.json';
    link.click();
  }

  // ==========================================
  // 4. BUS DE EVENTOS
  // ==========================================
  const eventListeners = {};

  function emit(eventName, payload) {
    if (eventListeners[eventName]) {
      eventListeners[eventName].forEach(function (cb) {
        try { cb(payload); } catch (e) { console.error('Error en listener de ' + eventName + ':', e); }
      });
    }
  }

  function on(eventName, callback) {
    if (!eventListeners[eventName]) eventListeners[eventName] = [];
    eventListeners[eventName].push(callback);
  }

  // ==========================================
  // 5. SESIÓN
  // ==========================================
  function validarLogin(userId, pin) {
    const users = getData('pos_users');
    const user = users.find(function (u) { return u.id === userId && u.pin === pin; });
    if (user) {
      sessionStorage.setItem('pos_active_user', JSON.stringify(user));
      return user;
    }
    return null;
  }

  function getUsuarioActivo() {
    try {
      const raw = sessionStorage.getItem('pos_active_user');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function cerrarSesion() {
    sessionStorage.removeItem('pos_active_user');
    actualizarUsuarioTopbar();
    if (shouldShowLogin()) renderLoginModal();
  }

  // ==========================================
  // 6. DOMINIO — CIGARRILLOS
  // ==========================================
  function abrirPaquete(marca) {
    const products = getData('pos_products');
    const product = products.find(function (p) { return p.name === marca && p.category === 'Cigarrillos'; });
    if (!product) { toast('Producto no encontrado: ' + marca, 'error'); return false; }

    product.stock = (product.stock || 0) - 1;
    const sueltosKey = 'sueltos_' + product.code;
    product[sueltosKey] = (product[sueltosKey] || 0) + 20;

    setData('pos_products', products);

    const cigSubcaja = getData('pos_cig_subcaja');
    if (!cigSubcaja[marca]) cigSubcaja[marca] = { aperturas: 0, vendidos: 0 };
    cigSubcaja[marca].aperturas = (cigSubcaja[marca].aperturas || 0) + 1;
    setData('pos_cig_subcaja', cigSubcaja);

    toast('Paquete abierto: ' + marca, 'success');
    return true;
  }

  function venderSuelto(marca) {
    const products = getData('pos_products');
    const product = products.find(function (p) { return p.name === marca && p.category === 'Cigarrillos'; });
    if (!product) { toast('Producto no encontrado: ' + marca, 'error'); return false; }

    const sueltosKey = 'sueltos_' + product.code;
    if ((product[sueltosKey] || 0) <= 0) { toast('Sin stock suelto de ' + marca, 'error'); return false; }

    product[sueltosKey] = product[sueltosKey] - 1;
    setData('pos_products', products);

    const cigSubcaja = getData('pos_cig_subcaja');
    if (!cigSubcaja[marca]) cigSubcaja[marca] = { aperturas: 0, vendidos: 0 };
    cigSubcaja[marca].vendidos = (cigSubcaja[marca].vendidos || 0) + 1;
    setData('pos_cig_subcaja', cigSubcaja);

    toast('Venta suelta: ' + marca, 'success');
    return true;
  }

  function registrarVentaPaqueteCigarrillos(item, cicloId, method) {
    const sale = getData('pos_sales');
    sale.push({
      id: uid(),
      items: [item],
      total: item.price * (item.qty || 1),
      method: method || 'cash',
      cicloId: cicloId,
      fecha: nowISO(),
      userId: (getUsuarioActivo() || {}).id || null,
      esCigarrillo: true,
      tipo: 'paquete'
    });
    setData('pos_sales', sale);
  }

  function registrarVentaSueltoCigarrillos(item, cicloId, method) {
    const sale = getData('pos_sales');
    sale.push({
      id: uid(),
      items: [item],
      total: item.price * (item.qty || 1),
      method: method || 'cash',
      cicloId: cicloId,
      fecha: nowISO(),
      userId: (getUsuarioActivo() || {}).id || null,
      esCigarrillo: true,
      tipo: 'suelto'
    });
    setData('pos_sales', sale);
  }

  function setProductCigConfig(code, ventaSuelta, priceLoose) {
    const products = getData('pos_products');
    const product = products.find(function (p) { return p.code === code; });
    if (product) {
      product.ventaSuelta = ventaSuelta;
      product.priceLoose = priceLoose;
      setData('pos_products', products);
      return true;
    }
    return false;
  }

  function cuadreSubCajaPorMarca(marca, cicloId) {
    const cigSubcaja = getData('pos_cig_subcaja');
    const data = cigSubcaja[marca] || { aperturas: 0, vendidos: 0 };
    const esperados = (data.aperturas || 0) * 20 - (data.vendidos || 0);
    return { marca: marca, aperturas: data.aperturas, vendidos: data.vendidos, esperados: esperados };
  }

  // ==========================================
  // 7. DOMINIO — CATEGORÍAS
  // ==========================================
  function renombrarCategoria(oldName, newName) {
    const products = getData('pos_products');
    let count = 0;
    products.forEach(function (p) {
      if (p.category === oldName) {
        p.category = newName;
        count++;
      }
    });
    if (count > 0) setData('pos_products', products);
    return count;
  }

  // ==========================================
  // 8. DOMINIO — MÁRGENES / PÉRDIDA
  // ==========================================
  function checkLoss(price, cost, category) {
    if (category === 'Cigarrillos') {
      return { isLoss: price < cost, isLowMargin: false, margin: 0 };
    }
    const minMargins = getData('pos_min_margins');
    const minMargin = minMargins[category] || 35;
    const margin = cost > 0 ? ((price - cost) / cost) * 100 : 0;
    return {
      isLoss: price < cost,
      isLowMargin: margin < minMargin,
      margin: margin,
      minMargin: minMargin
    };
  }

  // ==========================================
  // 9. DOMINIO — STOCK / COSTO
  // ==========================================
  function actualizarStock(code, delta, motivo, userId) {
    const products = getData('pos_products');
    const product = products.find(function (p) { return p.code === code; });
    if (!product) { toast('Producto no encontrado: ' + code, 'error'); return false; }

    const stockAnterior = product.stock || 0;
    const stockNuevo = stockAnterior + delta;

    if (stockNuevo < 0) {
      toast('Stock no puede ser negativo', 'error');
      return false;
    }

    product.stock = stockNuevo;
    setData('pos_products', products);

    const movements = getData('pos_stock_movements');
    movements.push({
      id: uid(),
      code: code,
      delta: delta,
      motivo: motivo,
      stockAnterior: stockAnterior,
      stockNuevo: stockNuevo,
      fecha: nowISO(),
      userId: userId || (getUsuarioActivo() || {}).id || null
    });
    setData('pos_stock_movements', movements);

    return true;
  }

  function actualizarCostoProducto(code, nuevoCosto, userId) {
    const products = getData('pos_products');
    const product = products.find(function (p) { return p.code === code; });
    if (!product) { toast('Producto no encontrado: ' + code, 'error'); return false; }

    product.cost = nuevoCosto;
    setData('pos_products', products);

    return true;
  }

  // ==========================================
  // 10. DOMINIO — ALERTAS
  // ==========================================
  function registrarAlerta(alertaObj) {
    const log = getData('pos_alerts_log');
    alertaObj.id = uid();
    alertaObj.fecha = nowISO();
    alertaObj.leida = false;
    log.push(alertaObj);
    setData('pos_alerts_log', log);
    emit('pos:alertaRegistrada', alertaObj);
    return alertaObj;
  }

  function marcarAlertaLeida(alertaId, userId) {
    const log = getData('pos_alerts_log');
    const alerta = log.find(function (a) { return a.id === alertaId; });
    if (alerta) {
      alerta.leida = true;
      alerta.leidaPor = userId || (getUsuarioActivo() || {}).id || null;
      alerta.fechaLeida = nowISO();
      setData('pos_alerts_log', log);
      emit('pos:alertaLeida', alerta);
      return true;
    }
    return false;
  }

  // ==========================================
  // 11. DOMINIO — AUDITORÍA CONFIG
  // ==========================================
  function registrarCambioConfig(config) {
    const log = getData('pos_config_audit_log');
    log.push({
      id: uid(),
      modulo: config.modulo,
      seccion: config.seccion,
      campo: config.campo,
      valorAnterior: config.valorAnterior,
      valorNuevo: config.valorNuevo,
      userId: config.userId || (getUsuarioActivo() || {}).id || null,
      fecha: nowISO()
    });
    setData('pos_config_audit_log', log);
  }

  // ==========================================
  // 12. SERVICIOS DE CIERRE
  // ==========================================
  function iniciarCiclo(montoApertura, userId) {
    const ciclo = {
      id: uid(),
      fechaApertura: nowISO(),
      montoApertura: montoApertura,
      userId: userId || (getUsuarioActivo() || {}).id || null
    };
    setData('pos_ciclo_actual', ciclo);
    emit('pos:estadoCaja', { estado: 'ABIERTA' });
    return ciclo;
  }

  function finalizarCiclo(datosArqueo) {
    const ciclo = getData('pos_ciclo_actual');
    if (!ciclo) { toast('No hay ciclo abierto', 'error'); return false; }

    const cierres = getData('pos_cierres');
    cierres.push({
      id: ciclo.id,
      fechaApertura: ciclo.fechaApertura,
      fechaCierre: nowISO(),
      montoApertura: ciclo.montoApertura,
      userId: ciclo.userId,
      ...datosArqueo
    });
    setData('pos_cierres', cierres);
    setData('pos_ciclo_actual', null);
    emit('pos:estadoCaja', { estado: 'CERRADA' });
    emit('pos:cierreRealizado', { cicloId: ciclo.id, fecha: nowISO() });
    return true;
  }

  function getEstadoCaja() {
    const ciclo = getData('pos_ciclo_actual');
    return ciclo ? 'ABIERTA' : 'CERRADA';
  }

  function getCicloAbierto() {
    return getData('pos_ciclo_actual');
  }

  function getCierresHoy() {
    const cierres = getData('pos_cierres');
    const hoy = today();
    return cierres.filter(function (c) { return c.fechaCierre && c.fechaCierre.startsWith(hoy); });
  }

  function getVentasDelCiclo(cicloId) {
    const sales = getData('pos_sales');
    return sales.filter(function (s) { return s.cicloId === cicloId; });
  }

  function getVentasPorMetodo(cicloId) {
    const ventas = getVentasDelCiclo(cicloId);
    const result = {};
    ventas.forEach(function (v) {
      const method = v.method || 'cash';
      if (!result[method]) result[method] = 0;
      result[method] += v.total || 0;
    });
    return result;
  }

  function getVentasEnPerdida(cicloId) {
    const ventas = getVentasDelCiclo(cicloId);
    return ventas.filter(function (v) {
      return v.items && v.items.some(function (item) {
        return item.cost && item.price && item.price < item.cost;
      });
    });
  }

  function getVentasSubCajaDelCiclo(cicloId) {
    const ventas = getVentasDelCiclo(cicloId);
    let total = 0;
    ventas.forEach(function (v) {
      if (v.method === 'cash' && v.esCigarrillo) {
        total += v.total || 0;
      }
    });
    return total;
  }

  // ==========================================
  // 12.5 SERVICIO COMPARTIDO DE RENTABILIDAD
  // ==========================================
  // Único punto de cálculo de "Ganancia Neta Operativa" histórica.
  // Existe en NÚCLEO (y no en REPORTES ni en FINANZAS) porque FINANZAS no
  // tiene permiso de leer pos_sales, y ambos módulos necesitan el mismo
  // número para sus KPIs de Patrimonio/Inversión Neta (ver ANEXO E §4 KPI
  // INFERIOR y ANEXO F §4 Vista Patrimonio). Usa siempre el costo histórico
  // de la línea de venta, igual que REPORTES.
  function getGananciasNetasAcumuladas() {
    const ventas = getData('pos_sales');
    const gastos = getData('pos_finanzas_gastos');

    const ventasTotales = ventas.reduce(function (sum, v) { return sum + (v.total || 0); }, 0);
    const cmv = ventas.reduce(function (sum, v) {
      return sum + (v.items || []).reduce(function (itemSum, item) {
        return itemSum + ((item.cost || 0) * (item.qty || 1));
      }, 0);
    }, 0);
    const margenBruto = ventasTotales - cmv;
    const gastosOperativos = gastos.reduce(function (sum, g) { return sum + (g.monto || 0); }, 0);

    return margenBruto - gastosOperativos;
  }

  // ==========================================
  // 13. SERVICIOS DE TICKETS
  // ==========================================
  function guardarTicket(sale) {
    const log = getData('pos_tickets_log');
    sale.id = sale.id || uid();
    sale.fecha = sale.fecha || nowISO();
    sale.userId = sale.userId || (getUsuarioActivo() || {}).id || null;
    log.push(sale);
    setData('pos_tickets_log', log);
    return sale;
  }

  function getTicketsHoy() {
    const log = getData('pos_tickets_log');
    const hoy = today();
    return log.filter(function (t) { return t.fecha && t.fecha.startsWith(hoy); });
  }

  function getTicketHTML(sale) {
    // SIEMPRE filtra cigarrillos
    const business = getData('pos_business');
    // Nunca se imprimen: cigarrillos (sub-caja) ni ítems marcados NO FISCAL.
    const items = (sale.items || []).filter(function (item) { return !item.esCigarrillo && !item.noFiscal; });
    const totalImpreso = items.reduce(function (sum, item) { return sum + (item.price * (item.qty || 1)); }, 0);
    
    let html = '<div style="font-family:monospace;font-size:12px;padding:10px;">';
    html += '<h3>' + esc(business.razonSocial || 'NEURORA POS') + '</h3>';
    if (business.cuit) html += '<p>CUIT: ' + esc(business.cuit) + '</p>';
    if (business.direccion) html += '<p>' + esc(business.direccion) + '</p>';
    html += '<hr><p>Fecha: ' + esc(sale.fecha || nowISO()) + '</p><hr>';
    
    items.forEach(function (item) {
      html += '<p>' + esc(item.name) + ' x' + (item.qty || 1) + ' = ' + money(item.price * (item.qty || 1)) + '</p>';
    });
    
    html += '<hr><p><strong>TOTAL: ' + money(totalImpreso) + '</strong></p>';
    html += '</div>';
    return html;
  }

  function printTicket(sale) {
    const html = getTicketHTML(sale);
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();
    iframe.contentWindow.print();
    setTimeout(function () { iframe.remove(); }, 1000);
  }

  function guardarTicketDraft(carrito) {
    setData('pos_ticket_draft', carrito);
  }

  function getTicketDraft() {
    return getData('pos_ticket_draft');
  }

  // ==========================================
  // 14. SEGURIDAD / DIAGNÓSTICO
  // ==========================================
  function backupJSON() {
    const data = {};
    Object.keys(SCHEMA).forEach(function (key) {
      data[key] = getData(key);
    });
    exportJSON(data, 'neurora_pos_backup_' + today() + '.json');
    setData('pos_last_backup_ts', nowISO());
    toast('Backup generado', 'success');
  }

  function shouldRemindBackup() {
    const lastBackup = getData('pos_last_backup_ts');
    if (!lastBackup) return true;
    const days = (Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24);
    return days >= 3;
  }

  function runChecks() {
    const issues = [];
    Object.keys(SCHEMA).forEach(function (key) {
      try {
        const val = localStorage.getItem(key);
        if (val !== null) JSON.parse(val);
      } catch (e) {
        issues.push({ key: key, error: 'JSON corrupto' });
      }
    });
    return issues;
  }

  function alertaGuardadoFallido(mensaje) {
    console.error('[NUCLEO] Guardado fallido:', mensaje);
    toast('Error: ' + mensaje, 'error');
  }

  function alertaDatoCorrupto(key) {
    console.error('[NUCLEO] Dato corrupto:', key);
    toast('Datos corruptos en: ' + key, 'error');
  }

  // ==========================================
  // 15. REGISTRO DE MÓDULOS
  // ==========================================
  const registeredModules = {};

  function registerModule(id, module) {
    registeredModules[id] = module;
    renderTabs();
  }

  function showTab(id) {
    const module = registeredModules[id];
    if (!module) { toast('Módulo no encontrado: ' + id, 'error'); return; }
    
    $$('.topbar-tab').forEach(function (tab) { tab.classList.remove('active'); });
    const activeTab = document.querySelector('[data-module="' + id + '"]');
    if (activeTab) activeTab.classList.add('active');
    
    const container = $('#moduleContainer');
    if (container) {
      container.innerHTML = '';
      if (module.render) module.render(container);
      if (module.init) module.init();
      if (module.onShow) module.onShow();
    }

    // Notifica a módulos transversales (ej. AUTOMATIZACIÓN) que se mostró
    // esta pestaña, para triggers tipo "al entrar a FINANZAS/COMPRAS".
    // No es un evento de negocio de otro módulo: lo emite el propio NÚCLEO
    // sobre su propia acción de showTab(), por eso no viola la restricción
    // de "no hacer relay de eventos de otros módulos".
    emit('pos:tabShown', { id: id });
  }

  function renderTabs() {
    const tabsContainer = $('#topbar-tabs');
    if (!tabsContainer) return;
    
    tabsContainer.innerHTML = '';
    Object.keys(registeredModules).forEach(function (id) {
      const module = registeredModules[id];
      if (module.noTab) return;
      
      const tab = document.createElement('a');
      tab.href = '#';
      tab.className = 'topbar-tab';
      tab.textContent = module.name || id.toUpperCase();
      tab.setAttribute('data-module', id);
      tab.addEventListener('click', function (e) {
        e.preventDefault();
        showTab(id);
      });
      tabsContainer.appendChild(tab);
    });
  }

  // ==========================================
  // 16. TOPBAR
  // ==========================================
  function renderTopbar() {
    const topbar = document.createElement('header');
    topbar.className = 'topbar';
    topbar.innerHTML = `
      <div class="topbar-brand">
        <div class="topbar-brand-icon">
          <span class="material-symbols-outlined">point_of_sale</span>
        </div>
        <span class="topbar-brand-text">NEURORA POS</span>
      </div>
      <nav class="topbar-tabs" id="topbar-tabs"></nav>
      <div class="topbar-actions">
        <div id="slot-campana" style="position:relative;"></div>
        <div id="badge-estado-caja" class="badge-status closed">
          <span class="badge-status-dot"></span>
          <span id="texto-estado-caja">CAJA CERRADA</span>
        </div>
        <button id="btn-abrir-cerrar-caja" class="btn btn-primary" style="height:2.25rem;padding:0 1rem;">
          <span class="material-symbols-outlined" style="font-size:18px;">lock_open</span>
          <span id="texto-btn-caja">ABRIR CAJA</span>
        </button>
        <div style="height:1.5rem;width:1px;background:var(--color-outline-variant);"></div>
        <div class="topbar-user">
          <span id="topbar-user-name" class="topbar-user-name">Sin sesión</span>
          <span id="topbar-user-time" class="topbar-user-time">--:--:--</span>
        </div>
        <div class="topbar-user-avatar">
          <span class="material-symbols-outlined">person</span>
        </div>
      </div>
    `;
    document.body.insertBefore(topbar, document.body.firstChild);
    
    actualizarEstadoCaja();
    actualizarUsuarioTopbar();
    iniciarReloj();
    
    $('#btn-abrir-cerrar-caja').addEventListener('click', function () {
      // El NÚCLEO no decide CÓMO se abre/cierra la caja (eso es CIERRE, que vive
      // dentro de CAJA, ver ANEXO A). Sólo notifica la intención vía el bus.
      emit('pos:solicitudAperturaCierre', { estado: getEstadoCaja() });
    });

    const badgeEstadoCajaEl = $('#badge-estado-caja');
    if (badgeEstadoCajaEl) {
      badgeEstadoCajaEl.style.cursor = 'pointer';
      badgeEstadoCajaEl.addEventListener('click', function () {
        emit('pos:solicitudVerCierres', {});
      });
    }
  }

  function actualizarEstadoCaja() {
    const estado = getEstadoCaja();
    const badge = $('#badge-estado-caja');
    const texto = $('#texto-estado-caja');
    const btn = $('#texto-btn-caja');
    
    if (badge) {
      badge.className = 'badge-status ' + (estado === 'ABIERTA' ? 'open' : 'closed');
    }
    if (texto) texto.textContent = estado === 'ABIERTA' ? 'CAJA ABIERTA' : 'CAJA CERRADA';
    if (btn) btn.textContent = estado === 'ABIERTA' ? 'CERRAR CAJA' : 'ABRIR CAJA';
  }

  function actualizarUsuarioTopbar() {
    const user = getUsuarioActivo();
    const nameEl = $('#topbar-user-name');
    if (nameEl) nameEl.textContent = user ? user.nombre : 'Sin sesión';
  }

  function iniciarReloj() {
    setInterval(function () {
      const timeEl = $('#topbar-user-time');
      if (timeEl) {
        const now = new Date();
        timeEl.textContent = now.toLocaleTimeString('es-AR');
      }
    }, 1000);
  }

  // ==========================================
  // 16.5 LOGIN (modal bloqueante de sesión)
  // ==========================================
  // ANEXO D: "LOGIN: al abrir el sistema, modal de login con selector de
  // usuario + input PIN." El ABM de usuarios es de CONFIG, pero la pantalla
  // de login es un gate de arranque del sistema, por eso vive en NÚCLEO
  // (igual que la topbar). Usa NUCLEO.validarLogin(), ya existente.
  // Si pos_users está vacío (instalación nueva, todavía sin usuarios
  // cargados en CONFIG), se saltea el login: se sigue permitiendo operar
  // con userId: null, tal como contempla la excepción transitoria del
  // SPEC §2 hasta que haya al menos un usuario configurado.
  function shouldShowLogin() {
    const users = getData('pos_users');
    return Array.isArray(users) && users.length > 0 && !getUsuarioActivo();
  }

  function renderLoginModal() {
    const users = getData('pos_users');
    if (document.getElementById('login-overlay')) return; // ya está abierto

    const overlay = document.createElement('div');
    overlay.id = 'login-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(11,28,48,0.6);display:flex;align-items:center;justify-content:center;z-index:5000;';
    overlay.innerHTML = `
      <div style="background:var(--color-surface-container-lowest);border-radius:var(--radius-xl);box-shadow:var(--shadow-xl);width:100%;max-width:380px;padding:var(--space-xl);font-family:var(--font-body);">
        <div style="display:flex;align-items:center;gap:var(--space-sm);margin-bottom:var(--space-lg);">
          <div class="topbar-brand-icon"><span class="material-symbols-outlined">point_of_sale</span></div>
          <span class="font-headline-md">Iniciar sesión</span>
        </div>
        <div style="margin-bottom:var(--space-md);">
          <label class="font-label-md" style="display:block;margin-bottom:var(--space-xs);color:var(--color-on-surface-variant);">Usuario</label>
          <select id="login-usuario" class="input">
            ${users.map(function (u) { return '<option value="' + esc(u.id) + '">' + esc(u.nombre) + '</option>'; }).join('')}
          </select>
        </div>
        <div style="margin-bottom:var(--space-md);">
          <label class="font-label-md" style="display:block;margin-bottom:var(--space-xs);color:var(--color-on-surface-variant);">PIN</label>
          <input id="login-pin" type="password" inputmode="numeric" maxlength="6" class="input" placeholder="····">
        </div>
        <div id="login-error" style="color:var(--color-error);font-size:12px;min-height:16px;margin-bottom:var(--space-sm);"></div>
        <button id="login-submit" class="btn btn-primary w-full" style="height:2.75rem;">INGRESAR</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const pinInput = document.getElementById('login-pin');
    const errorEl = document.getElementById('login-error');

    function intentarLogin() {
      const userId = document.getElementById('login-usuario').value;
      const pin = pinInput.value;
      const user = validarLogin(userId, pin);
      if (user) {
        overlay.remove();
        actualizarUsuarioTopbar();
        toast('Bienvenido, ' + user.nombre, 'success');
      } else {
        errorEl.textContent = 'PIN incorrecto';
        pinInput.value = '';
        pinInput.focus();
      }
    }

    document.getElementById('login-submit').addEventListener('click', intentarLogin);
    pinInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); intentarLogin(); }
    });
    pinInput.focus();
  }

  // ==========================================
  // 17. INICIALIZACIÓN
  // ==========================================
  function init() {
    initSchema();
    renderTopbar();
    renderTabs();
    
    on('pos:estadoCaja', function () { actualizarEstadoCaja(); });

    if (shouldShowLogin()) {
      renderLoginModal();
    }
    
    console.log('[NUCLEO] Sistema inicializado');
  }

  // ==========================================
  // 18. API PÚBLICA
  // ==========================================
  window.NUCLEO = {
    // Storage
    getData: getData,
    setData: setData,
    
    // Utilidades
    $: $,
    $$: $$,
    uid: uid,
    today: today,
    nowISO: nowISO,
    money: money,
    roundCurrency: roundCurrency,
    normText: normText,
    normCategory: normCategory,
    esc: esc,
    toast: toast,
    exportCSV: exportCSV,
    exportJSON: exportJSON,
    
    // Dominio - Cigarrillos
    abrirPaquete: abrirPaquete,
    venderSuelto: venderSuelto,
    registrarVentaPaqueteCigarrillos: registrarVentaPaqueteCigarrillos,
    registrarVentaSueltoCigarrillos: registrarVentaSueltoCigarrillos,
    setProductCigConfig: setProductCigConfig,
    cuadreSubCajaPorMarca: cuadreSubCajaPorMarca,
    
    // Dominio - Categorías
    renombrarCategoria: renombrarCategoria,
    
    // Dominio - Márgenes
    checkLoss: checkLoss,
    
    // Dominio - Stock/Costo
    actualizarStock: actualizarStock,
    actualizarCostoProducto: actualizarCostoProducto,
    
    // Dominio - Alertas
    registrarAlerta: registrarAlerta,
    marcarAlertaLeida: marcarAlertaLeida,
    
    // Dominio - Auditoría
    registrarCambioConfig: registrarCambioConfig,
    
    // Servicios de CIERRE
    iniciarCiclo: iniciarCiclo,
    finalizarCiclo: finalizarCiclo,
    getEstadoCaja: getEstadoCaja,
    getCicloAbierto: getCicloAbierto,
    getCierresHoy: getCierresHoy,
    getVentasDelCiclo: getVentasDelCiclo,
    getVentasPorMetodo: getVentasPorMetodo,
    getVentasEnPerdida: getVentasEnPerdida,
    getVentasSubCajaDelCiclo: getVentasSubCajaDelCiclo,

    // Servicio compartido de rentabilidad
    getGananciasNetasAcumuladas: getGananciasNetasAcumuladas,
    
    // Servicios de tickets
    guardarTicket: guardarTicket,
    getTicketsHoy: getTicketsHoy,
    getTicketHTML: getTicketHTML,
    printTicket: printTicket,
    guardarTicketDraft: guardarTicketDraft,
    getTicketDraft: getTicketDraft,
    
    // Seguridad/Diagnóstico
    backupJSON: backupJSON,
    shouldRemindBackup: shouldRemindBackup,
    runChecks: runChecks,
    alertaGuardadoFallido: alertaGuardadoFallido,
    alertaDatoCorrupto: alertaDatoCorrupto,
    
    // Sesión
    validarLogin: validarLogin,
    getUsuarioActivo: getUsuarioActivo,
    cerrarSesion: cerrarSesion,
    
    // Bus de eventos
    emit: emit,
    on: on,
    
    // Registro de módulos
    registerModule: registerModule,
    showTab: showTab,
    
    // Inicialización
    init: init
  };

  // Auto-inicializar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();