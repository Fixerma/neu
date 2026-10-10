/* ============================================
   NEURORA POS — NÚCLEO (ANEXO C)
   Sistema operativo del POS
   Versión: 1.1 — Paso 1 de corrección de la maqueta
   ============================================ */

(function () {
  'use strict';

  const VERSION = '1.1';
  const SCHEMA_VERSION = 2;
  const DEFAULT_MIN_MARGIN = 35;
  const STORAGE_LIMIT_CHARS = 5000000;
  const MOTIVOS_STOCK = ['venta', 'recepcion', 'ajuste'];
  // Gastos que NO se restan de la ganancia porque ya están en el CMV (reposición de mercadería)
  const CATEGORIAS_GASTO_FUERA_DE_GANANCIA = ['Proveedor'];
  const FACTOR_TIPO_DEFAULT = { A: 70, B: 70, X: 50 };
  const CLAVES_TX_VENTA = ['pos_sales', 'pos_tickets_log', 'pos_products', 'pos_stock_movements', 'pos_cig_subcaja', 'pos_ticket_draft'];

  // ==========================================
  // 1. SCHEMA MAESTRO
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
    pos_cig_subcaja: { asientos: [] },
    pos_tickets_log: [],
    pos_stock_movements: [],
    pos_config_audit_log: [],
    pos_cost_history: [],
    pos_caja_movimientos: [],
    pos_cost_factors: { tipos: { A: 70, B: 70, X: 50 }, categorias: {} },
    pos_schema_version: SCHEMA_VERSION
  };

  // Estado interno
  const eventListeners = {};
  const registeredModules = {};
  let activeModuleId = null;
  let _iniciado = false;
  const escapeGlobales = [];
  let _idCounter = 0;
  let _loginFails = 0;
  let _loginLockUntil = 0;
  const _corruptAlerted = {};
  const _alertasActivas = {};

  // ==========================================
  // 2. UTILIDADES BÁSICAS
  // ==========================================
  function $(selector) { return document.querySelector(selector); }
  function $$(selector) { return document.querySelectorAll(selector); }

  function uid() {
    _idCounter = (_idCounter + 1) % 1679616;
    return Date.now().toString(36) + _idCounter.toString(36) + Math.random().toString(36).substr(2, 6);
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  // ---- Fechas: SIEMPRE hora local del negocio (no UTC) ----
  function localDateOf(v) {
    if (!v) return '';
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function today() { return localDateOf(new Date()); }

  function nowISO() { return new Date().toISOString(); } // instante exacto (UTC), para guardar

  // 'YYYY-MM-DD' → medianoche LOCAL (no UTC). Cualquier otro valor → new Date(v).
  function parseLocalDate(v) {
    if (v instanceof Date) return new Date(v.getTime());
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const p = v.split('-').map(Number);
      return new Date(p[0], p[1] - 1, p[2]);
    }
    return new Date(v);
  }

  function addDays(dateStr, n) {
    const d = parseLocalDate(dateStr);
    d.setDate(d.getDate() + n);
    return localDateOf(d);
  }

  function formatDate(v) {
    const s = localDateOf(v);
    if (!s) return '—';
    const p = s.split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function formatDateTime(v) {
    const d = v instanceof Date ? v : new Date(v);
    if (isNaN(d.getTime())) return '—';
    return formatDate(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  // ---- Dinero ----
  function roundCents(n) { return Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100; }

  function money(amount) {
    const moneda = getData('pos_moneda');
    const symbol = (moneda && moneda.symbol) || '$';
    const num = Number(amount) || 0;
    return symbol + ' ' + num.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function roundCurrency(num) {
    const moneda = getData('pos_moneda');
    let multiple = Number(moneda && moneda.roundMultiple);
    if (!isFinite(multiple) || multiple <= 0) multiple = 100;
    return Math.round((Number(num) || 0) / multiple) * multiple;
  }

  // ---- Texto ----
  function normText(str) {
    return (str === null || str === undefined ? '' : String(str)).trim().replace(/\s+/g, ' ');
  }

  function normCategory(str) {
    return normText(str).replace(/[^a-zA-Z0-9áéíóúüÁÉÍÓÚÜñÑ\s]/g, '');
  }

  // Escapa para HTML (texto y atributos). NO usar dentro de onclick="...('x')": para eso usar jsArg().
  function esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Argumento seguro para handlers inline: onclick="fn(${NUCLEO.jsArg(valor)})"
  function jsArg(v) {
    return esc(JSON.stringify(v === null || v === undefined ? '' : String(v)));
  }

  function esCategoriaCigarrillos(cat) {
    return normText(cat).toLowerCase() === 'cigarrillos';
  }

  // ---- Números / CSV ----
  // Acepta "1500", "1500.50", "1500,50", "1.500,50", "$ 1.500"
  function parseNumber(v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    let s = String(v === null || v === undefined ? '' : v).replace(/[^\d,.\-]/g, '');
    if (!s) return 0;
    const hasComma = s.indexOf(',') !== -1;
    const hasDot = s.indexOf('.') !== -1;
    if (hasComma && hasDot) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (hasComma) {
      s = s.replace(',', '.');
    } else if (hasDot && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    }
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }

  // Parser CSV real: comillas, comillas escapadas, saltos de línea dentro de campo, BOM, separador ; , o tab
  function parseCSV(text) {
    text = String(text || '').replace(/^\uFEFF/, '');
    const firstLine = text.split(/\r?\n/)[0] || '';
    let delim = ',';
    let best = 0;
    [';', '\t', ','].forEach(function (d) {
      const n = firstLine.split(d).length - 1;
      if (n > best) { best = n; delim = d; }
    });
    const rows = [];
    let row = [];
    let field = '';
    let inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else { inQ = false; }
        } else { field += c; }
      } else if (c === '"') {
        inQ = true;
      } else if (c === delim) {
        row.push(field); field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        rows.push(row); row = [];
      } else {
        field += c;
      }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    const limpias = rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
    if (limpias.length === 0) return { headers: [], rows: [], delimiter: delim };
    const headers = limpias[0].map(function (h) { return String(h).trim(); });
    const objetos = limpias.slice(1).map(function (r) {
      const o = {};
      headers.forEach(function (h, i) { o[h] = r[i] !== undefined ? String(r[i]).trim() : ''; });
      return o;
    });
    return { headers: headers, rows: objetos, delimiter: delim };
  }

  function exportCSV(data, filename, opts) {
    if (!data || data.length === 0) { toast('No hay datos para exportar', 'warning'); return; }
    const delim = (opts && opts.delimiter) || ';'; // Excel en Argentina
    const headers = Object.keys(data[0]);
    const fmt = function (v) {
      if (v === null || v === undefined) return '';
      if (typeof v === 'number') return delim === ';' ? String(v).replace('.', ',') : String(v);
      if (typeof v === 'boolean') return v ? 'true' : 'false';
      if (typeof v === 'object') return JSON.stringify(v);
      return String(v);
    };
    const q = function (s) {
      return (s.indexOf(delim) !== -1 || /["\n\r]/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [headers.map(q).join(delim)];
    data.forEach(function (row) {
      lines.push(headers.map(function (h) { return q(fmt(row[h])); }).join(delim));
    });
    descargar('\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8;', filename || 'export.csv');
  }

  function exportJSON(data, filename) {
    descargar(JSON.stringify(data, null, 2), 'application/json', filename || 'export.json');
  }

  function descargar(contenido, mime, filename) {
    const blob = new Blob([contenido], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  // ==========================================
  // 3. UI BASE DEL NÚCLEO: toast + modales duros
  // ==========================================
  function toast(message, type) {
    if (!document.body) { console.log('[toast]', message); return; }
    type = type || 'info';
    const existing = $('.toast-notification');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.className = 'toast-notification';
    el.style.cssText = 'position:fixed;bottom:20px;right:20px;max-width:420px;padding:12px 20px;border-radius:8px;color:#fff;font-size:14px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:opacity 0.3s;';
    const colors = { info: '#1e40af', success: '#00563a', error: '#ba1a1a', warning: '#b45309' };
    el.style.background = colors[type] || colors.info;
    el.textContent = message;

    document.body.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 300);
    }, type === 'error' ? 5000 : 3000);
  }

  // Modal del núcleo (alertas duras y confirmaciones). Devuelve Promise con el valor del botón elegido.
  function mostrarModal(opts) {
    return new Promise(function (resolve) {
      if (!document.body) { resolve(false); return; }
      const overlay = document.createElement('div');
      overlay.className = 'nucleo-modal-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(11,28,48,0.6);display:flex;align-items:center;justify-content:center;z-index:6000;padding:16px;';
      const tono = opts.tono === 'error' ? 'var(--color-error)' : 'var(--color-primary)';
      const botones = opts.botones || [{ texto: 'ENTENDIDO', valor: true, primario: true }];
      overlay.innerHTML =
        '<div style="background:var(--color-surface-container-lowest);border-radius:var(--radius-xl);box-shadow:var(--shadow-xl);width:100%;max-width:440px;padding:var(--space-xl);font-family:var(--font-body);border-top:4px solid ' + tono + ';">' +
        '<h3 style="margin-bottom:var(--space-sm);">' + esc(opts.titulo || '') + '</h3>' +
        '<p style="white-space:pre-line;color:var(--color-on-surface-variant);margin-bottom:var(--space-lg);">' + esc(opts.mensaje || '') + '</p>' +
        '<div style="display:flex;gap:var(--space-sm);justify-content:flex-end;">' +
        botones.map(function (b, i) {
          return '<button type="button" class="btn ' + (b.primario ? 'btn-primary' : 'btn-secondary') + '" data-i="' + i + '"' + (b.cancelar ? ' data-cancel="1"' : '') + '>' + esc(b.texto) + '</button>';
        }).join('') +
        '</div></div>';
      overlay.addEventListener('click', function (e) {
        const btn = e.target.closest ? e.target.closest('button[data-i]') : null;
        if (!btn) return;
        overlay.remove();
        resolve(botones[parseInt(btn.getAttribute('data-i'), 10)].valor);
      });
      document.body.appendChild(overlay);
      const first = overlay.querySelector('button.btn-primary') || overlay.querySelector('button');
      if (first) first.focus();
    });
  }

  function confirmar(titulo, mensaje, textoOk) {
    return mostrarModal({
      titulo: titulo, mensaje: mensaje,
      botones: [
        { texto: 'CANCELAR', valor: false, cancelar: true },
        { texto: textoOk || 'CONFIRMAR', valor: true, primario: true }
      ]
    });
  }

  function alertaGuardadoFallido(mensaje) {
    console.error('[NUCLEO] Guardado fallido:', mensaje);
    if (_alertasActivas[mensaje]) return;
    _alertasActivas[mensaje] = true;
    mostrarModal({ titulo: 'No se pudo guardar', mensaje: mensaje, tono: 'error' })
      .then(function () { delete _alertasActivas[mensaje]; });
  }

  function alertaDatoCorrupto(key) {
    console.error('[NUCLEO] Dato corrupto:', key);
    mostrarModal({
      titulo: 'Datos dañados',
      mensaje: 'La información de "' + key + '" está dañada. Se guardó una copia del contenido original en el navegador (clave corrupt_' + key + '_...) y el sistema usa valores vacíos para esa sección. No sigas operando: avisá y recuperá desde un backup.',
      tono: 'error'
    });
  }

  // ==========================================
  // 4. STORAGE (getData / setData / transacciones)
  // ==========================================
  function defaultFor(key) {
    return Object.prototype.hasOwnProperty.call(SCHEMA, key) ? JSON.parse(JSON.stringify(SCHEMA[key])) : null;
  }

  function getData(key) {
    let raw = null;
    try { raw = localStorage.getItem(key); } catch (e) { raw = null; }
    if (raw === null) return defaultFor(key); // clave inexistente: silencioso
    try {
      return JSON.parse(raw);
    } catch (e) {
      if (!_corruptAlerted[key]) { // alerta dura una sola vez por clave
        _corruptAlerted[key] = true;
        try { localStorage.setItem('corrupt_' + key + '_' + Date.now(), raw); } catch (_) { /* sin espacio */ }
        alertaDatoCorrupto(key);
      }
      return defaultFor(key);
    }
  }

  function setData(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value === undefined ? null : value));
      return true;
    } catch (e) {
      alertaGuardadoFallido('No se pudo guardar "' + key + '": ' + e.message + '\nHacé un backup y liberá espacio antes de seguir vendiendo.');
      return false;
    }
  }

  // Como setData pero lanza error si falla (para usar dentro de transaccion()).
  function setDataStrict(key, value) {
    if (!setData(key, value)) throw new Error('WRITE_FAIL:' + key);
    return true;
  }

  function restaurarSnapshot(snap) {
    Object.keys(snap).forEach(function (k) {
      try {
        if (snap[k] === null) localStorage.removeItem(k);
        else localStorage.setItem(k, snap[k]);
      } catch (e) { console.error('[NUCLEO] no se pudo revertir', k, e); }
    });
  }

  // Todo-o-nada: si fn devuelve false o lanza error, se restauran las claves tocadas.
  function transaccion(keys, fn) {
    const snap = {};
    keys.forEach(function (k) { snap[k] = localStorage.getItem(k); });
    try {
      const r = fn();
      if (r === false) { restaurarSnapshot(snap); return false; }
      return r === undefined ? true : r;
    } catch (e) {
      restaurarSnapshot(snap);
      if (!/^WRITE_FAIL/.test(e.message || '')) console.error('[NUCLEO] transacción revertida:', e);
      return false;
    }
  }

  function getStorageUsage() {
    let chars = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        chars += k.length + (localStorage.getItem(k) || '').length;
      }
    } catch (e) { /* ignorar */ }
    return { chars: chars, limit: STORAGE_LIMIT_CHARS, pct: Math.round(chars / STORAGE_LIMIT_CHARS * 1000) / 10 };
  }

  // ==========================================
  // 5. INICIALIZACIÓN DE DATOS + MIGRACIONES
  // ==========================================
  const MIGRACIONES = {
    // v1 → v2: pos_cig_subcaja pasa de contadores por NOMBRE de marca a libro de asientos por code y ciclo
    2: function () {
      const raw = getData('pos_cig_subcaja');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { setData('pos_cig_subcaja', { asientos: [] }); return; }
      const asientos = Array.isArray(raw.asientos) ? raw.asientos : [];
      const products = getData('pos_products');
      Object.keys(raw).forEach(function (marca) {
        if (marca === 'asientos') return;
        const d = raw[marca];
        if (!d || typeof d !== 'object') return;
        const p = products.find(function (x) { return x.name === marca; });
        const code = p ? p.code : marca;
        if (d.aperturas > 0) asientos.push({ id: uid(), tipo: 'apertura', code: code, name: marca, qty: d.aperturas, sueltos: d.aperturas * 20, cicloId: null, fecha: nowISO(), userId: 'sistema', nota: 'migración v2' });
        if (d.vendidos > 0) asientos.push({ id: uid(), tipo: 'venta_suelto', code: code, name: marca, qty: d.vendidos, cicloId: null, fecha: nowISO(), userId: 'sistema', nota: 'migración v2' });
      });
      setData('pos_cig_subcaja', { asientos: asientos });
    }
  };

  function migrarDatos() {
    const verRaw = localStorage.getItem('pos_schema_version');
    const hayDatos = localStorage.getItem('pos_products') !== null || localStorage.getItem('pos_sales') !== null;
    let version;
    if (verRaw === null) version = hayDatos ? 1 : SCHEMA_VERSION;
    else version = parseInt(JSON.parse(verRaw), 10) || 1;

    // Crea las claves faltantes con sus defaults
    Object.keys(SCHEMA).forEach(function (key) {
      if (key === 'pos_schema_version') return;
      if (localStorage.getItem(key) === null) setData(key, SCHEMA[key]);
    });

    for (let v = version + 1; v <= SCHEMA_VERSION; v++) {
      if (MIGRACIONES[v]) {
        const ok = transaccion(['pos_cig_subcaja'], function () { MIGRACIONES[v](); return true; });
        if (!ok) { alertaGuardadoFallido('Falló la migración de datos a la versión ' + v + '. No se modificó nada.'); return false; }
      }
    }
    setData('pos_schema_version', SCHEMA_VERSION);
    return true;
  }

  // ==========================================
  // 6. BUS DE EVENTOS
  // ==========================================
  function emit(eventName, payload) {
    const lista = eventListeners[eventName];
    if (!lista) return;
    lista.slice().forEach(function (cb) {
      try { cb(payload); } catch (e) { console.error('Error en listener de ' + eventName + ':', e); }
    });
  }

  function on(eventName, callback) {
    if (!eventListeners[eventName]) eventListeners[eventName] = [];
    if (eventListeners[eventName].indexOf(callback) === -1) eventListeners[eventName].push(callback);
    return function () { off(eventName, callback); };
  }

  function off(eventName, callback) {
    if (!eventListeners[eventName]) return;
    eventListeners[eventName] = eventListeners[eventName].filter(function (cb) { return cb !== callback; });
  }

  // ==========================================
  // 7. SESIÓN
  // ==========================================
  function leerSesionCruda() {
    try {
      const raw = sessionStorage.getItem('pos_active_user');
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // Devuelve {id, nombre, rol} (nunca el PIN). Si el usuario fue eliminado/desactivado, la sesión se invalida.
  function getUsuarioActivo() {
    const s = leerSesionCruda();
    if (!s || !s.id) return null;
    const u = (getData('pos_users') || []).find(function (x) { return x.id === s.id; });
    if (!u || u.activo === false) {
      try { sessionStorage.removeItem('pos_active_user'); } catch (e) { /* ignorar */ }
      return null;
    }
    return { id: u.id, nombre: u.nombre, rol: u.rol };
  }

  function hayUsuariosConfigurados() {
    const users = getData('pos_users');
    return Array.isArray(users) && users.length > 0;
  }

  function esAdmin() {
    const u = getUsuarioActivo();
    return !!u && u.rol === 'Admin';
  }

  // userId para trazabilidad. undefined = no se puede registrar (hay usuarios pero nadie logueado).
  // null solo se admite mientras no exista ningún usuario configurado (excepción transitoria del SPEC §2).
  function resolverUserId(userId) {
    if (userId) return userId;
    const u = getUsuarioActivo();
    if (u) return u.id;
    return hayUsuariosConfigurados() ? undefined : null;
  }

  function sinSesion() {
    toast('Iniciá sesión para realizar esta operación', 'error');
    return false;
  }

  function loginBloqueadoSegundos() {
    return Math.max(0, Math.ceil((_loginLockUntil - Date.now()) / 1000));
  }

  function validarLogin(userId, pin) {
    if (loginBloqueadoSegundos() > 0) return null;
    const user = (getData('pos_users') || []).find(function (u) {
      return u.id === userId && u.activo !== false && String(u.pin) === String(pin);
    });
    if (user) {
      _loginFails = 0;
      const sesion = { id: user.id, nombre: user.nombre, rol: user.rol };
      try { sessionStorage.setItem('pos_active_user', JSON.stringify(sesion)); } catch (e) { /* ignorar */ }
      registrarAcceso(user.id);
      actualizarUsuarioTopbar();
      emit('pos:sesionCambiada', { usuario: sesion });
      return sesion;
    }
    _loginFails++;
    if (_loginFails >= 5) { _loginLockUntil = Date.now() + 30000; _loginFails = 0; }
    return null;
  }

  function registrarAcceso(userId) {
    const users = getData('pos_users');
    const u = users.find(function (x) { return x.id === userId; });
    if (!u) return;
    u.ultimoAcceso = nowISO();
    setData('pos_users', users);
  }

  function cerrarSesion() {
    try { sessionStorage.removeItem('pos_active_user'); } catch (e) { /* ignorar */ }
    actualizarUsuarioTopbar();
    emit('pos:sesionCambiada', { usuario: null });
    if (shouldShowLogin()) renderLoginModal();
  }

  // ==========================================
  // 8. DOMINIO — MÁRGENES (única definición: sobre COSTO)
  // ==========================================
  // margen % = (precio − costo) / costo × 100. Devuelve null si no hay costo.
  function margenSobreCosto(price, cost) {
    const p = Number(price) || 0;
    const c = Number(cost) || 0;
    return c > 0 ? ((p - c) / c) * 100 : null;
  }

  function precioDesdeMargen(cost, margenPct) {
    return roundCurrency((Number(cost) || 0) * (1 + (Number(margenPct) || 0) / 100));
  }

  // null para Cigarrillos (excluida). Un margen configurado en 0 es válido y se respeta.
  function getMargenMinimo(category) {
    if (esCategoriaCigarrillos(category)) return null;
    const mm = getData('pos_min_margins') || {};
    const v = Object.prototype.hasOwnProperty.call(mm, category) ? mm[category] : undefined;
    return (typeof v === 'number' && isFinite(v)) ? v : DEFAULT_MIN_MARGIN;
  }

  // Solo RETORNA estado. No persiste nada.
  function checkLoss(price, cost, category) {
    const p = Number(price) || 0;
    const c = Number(cost) || 0;
    const isLoss = p < c;
    const margin = margenSobreCosto(p, c);
    if (esCategoriaCigarrillos(category)) {
      return { isLoss: isLoss, isLowMargin: false, margin: margin === null ? 0 : margin, minMargin: null };
    }
    const minMargin = getMargenMinimo(category);
    return {
      isLoss: isLoss,
      isLowMargin: margin !== null && margin < minMargin,
      margin: margin === null ? 0 : margin,
      minMargin: minMargin
    };
  }

  // ==========================================
  // 9. DOMINIO — STOCK / COSTO
  // ==========================================
  function redondear3(n) { return Math.round(n * 1000) / 1000; }

  // Todo-o-nada (producto + movimiento). Nunca deja stock negativo.
  function actualizarStock(code, delta, motivo, userId, nota) {
    delta = Number(delta);
    if (!isFinite(delta) || delta === 0) { toast('Cantidad inválida', 'error'); return false; }
    if (MOTIVOS_STOCK.indexOf(motivo) === -1) { toast('Motivo de stock inválido: ' + motivo, 'error'); return false; }
    const uid_ = resolverUserId(userId);
    if (uid_ === undefined) return sinSesion();

    return transaccion(['pos_products', 'pos_stock_movements'], function () {
      const products = getData('pos_products');
      const product = products.find(function (p) { return p.code === code; });
      if (!product) { toast('Producto no encontrado: ' + code, 'error'); return false; }
      if (motivo === 'venta' && product.active === false) {
        toast('"' + product.name + '" está dado de baja y no se puede vender', 'error');
        return false;
      }
      const anterior = Number(product.stock) || 0;
      const nuevo = redondear3(anterior + delta);
      if (nuevo < 0) {
        toast('Stock insuficiente de "' + product.name + '" (hay ' + anterior + '). Ingresalo primero en INVENTARIO.', 'error');
        return false;
      }
      product.stock = nuevo;
      setDataStrict('pos_products', products);

      const movements = getData('pos_stock_movements');
      const mov = { id: uid(), code: code, delta: delta, motivo: motivo, stockAnterior: anterior, stockNuevo: nuevo, fecha: nowISO(), userId: uid_ };
      if (nota) mov.nota = String(nota);
      movements.push(mov);
      setDataStrict('pos_stock_movements', movements);
      return true;
    });
  }

  // Último costo (decisión de negocio). Guarda historial con usuario. Retorna false o {ok, estado}.
  function actualizarCostoProducto(code, nuevoCosto, userId) {
    nuevoCosto = Number(nuevoCosto);
    if (!isFinite(nuevoCosto) || nuevoCosto < 0) { toast('Costo inválido', 'error'); return false; }
    const uid_ = resolverUserId(userId);
    if (uid_ === undefined) return sinSesion();

    let estado = null;
    const ok = transaccion(['pos_products', 'pos_cost_history'], function () {
      const products = getData('pos_products');
      const product = products.find(function (p) { return p.code === code; });
      if (!product) { toast('Producto no encontrado: ' + code, 'error'); return false; }
      const anterior = Number(product.cost) || 0;
      estado = checkLoss(product.price, nuevoCosto, product.category);
      if (anterior === nuevoCosto) return true; // sin cambios: no ensucia el historial
      product.cost = nuevoCosto;
      setDataStrict('pos_products', products);
      const hist = getData('pos_cost_history');
      hist.push({ id: uid(), code: code, costoAnterior: anterior, costoNuevo: nuevoCosto, fecha: nowISO(), userId: uid_ });
      setDataStrict('pos_cost_history', hist);
      return true;
    });
    return ok ? { ok: true, estado: estado } : false;
  }

  // % del precio de factura que se toma como costo real. Prioridad: producto > categoría > tipo de factura.
  function getFactorCosto(product, tipoFactura) {
    const cf = getData('pos_cost_factors') || {};
    const prod = product ? Number(product.costFactor) : NaN;
    if (product && product.costFactor !== null && product.costFactor !== undefined && product.costFactor !== '' && isFinite(prod) && prod > 0) {
      return { pct: prod, origen: 'producto' };
    }
    const cats = cf.categorias || {};
    const cat = product && product.category;
    if (cat && Object.prototype.hasOwnProperty.call(cats, cat) && Number(cats[cat]) > 0) return { pct: Number(cats[cat]), origen: 'categoria' };
    const tipos = Object.assign({}, FACTOR_TIPO_DEFAULT, cf.tipos || {});
    const t = tipos[tipoFactura] !== undefined ? tipos[tipoFactura] : tipos.X;
    return { pct: Number(t), origen: 'tipo' };
  }

  function calcularCostoReal(product, precioFactura, tipoFactura) {
    const f = getFactorCosto(product, tipoFactura);
    return { costo: roundCents((Number(precioFactura) || 0) * f.pct / 100), pct: f.pct, origen: f.origen };
  }

  // Valida el carrito completo ANTES de cobrar. Regla de negocio: no se vende lo que no está cargado.
  function validarStockVenta(items) {
    const products = getData('pos_products');
    const req = {};
    (items || []).forEach(function (it) {
      if (!it || it.isDummy) return;
      const tipo = (it.esCigarrillo && it.tipo === 'suelto') ? 'suelto' : 'unidad';
      const k = it.code + '|' + tipo;
      if (!req[k]) req[k] = { code: it.code, name: it.name, tipo: tipo, pedido: 0 };
      req[k].pedido += Number(it.qty) || 0;
    });
    const faltantes = [];
    Object.keys(req).forEach(function (k) {
      const r = req[k];
      const p = products.find(function (x) { return x.code === r.code; });
      const disponible = !p ? 0 : (r.tipo === 'suelto' ? (Number(p['sueltos_' + p.code]) || 0) : (Number(p.stock) || 0));
      if (!p || p.active === false || disponible < r.pedido) {
        faltantes.push({
          code: r.code, name: r.name, tipo: r.tipo, pedido: r.pedido, disponible: disponible,
          motivo: !p ? 'no existe en inventario' : (p.active === false ? 'producto dado de baja' : 'stock insuficiente')
        });
      }
    });
    return { ok: faltantes.length === 0, faltantes: faltantes };
  }

  function mensajeStockInsuficiente(faltantes) {
    return 'No se puede cobrar. Ingresá primero el producto en INVENTARIO:\n' +
      (faltantes || []).map(function (f) {
        return '• ' + f.name + ' — pedido ' + f.pedido + ', disponible ' + f.disponible + ' (' + f.motivo + ')';
      }).join('\n');
  }

  // ==========================================
  // 10. DOMINIO — CIGARRILLOS (por code, libro de asientos por ciclo)
  // ==========================================
  function leerCigSub() {
    const d = getData('pos_cig_subcaja');
    const base = (d && typeof d === 'object' && !Array.isArray(d)) ? d : {};
    if (!Array.isArray(base.asientos)) base.asientos = [];
    return base;
  }

  // Acepta code (preferido) o nombre exacto (compatibilidad con CAJA actual)
  function buscarProductoCig(products, ref) {
    let p = products.find(function (x) { return x.code === ref; });
    if (!p) p = products.find(function (x) { return x.name === ref && esCategoriaCigarrillos(x.category); });
    return p && esCategoriaCigarrillos(p.category) ? p : null;
  }

  function cicloActualId(cicloId) {
    if (cicloId) return cicloId;
    const c = getData('pos_ciclo_actual');
    return c ? c.id : null;
  }

  function abrirPaquete(ref, cicloId, userId) {
    const uid_ = resolverUserId(userId);
    if (uid_ === undefined) return sinSesion();
    const p0 = buscarProductoCig(getData('pos_products'), ref);
    if (!p0) { toast('Producto de cigarrillos no encontrado: ' + ref, 'error'); return false; }
    const cid = cicloActualId(cicloId);

    const ok = transaccion(['pos_products', 'pos_stock_movements', 'pos_cig_subcaja'], function () {
      if (!actualizarStock(p0.code, -1, 'ajuste', uid_, 'Apertura de paquete (+20 sueltos)')) return false;
      const products = getData('pos_products');
      const p = products.find(function (x) { return x.code === p0.code; });
      const key = 'sueltos_' + p.code;
      p[key] = (Number(p[key]) || 0) + 20;
      setDataStrict('pos_products', products);
      const sub = leerCigSub();
      sub.asientos.push({ id: uid(), tipo: 'apertura', code: p.code, name: p.name, qty: 1, sueltos: 20, cicloId: cid, fecha: nowISO(), userId: uid_ });
      setDataStrict('pos_cig_subcaja', sub);
      return true;
    });
    if (ok) toast('Paquete abierto: ' + p0.name, 'success');
    return ok;
  }

  function venderSuelto(ref, qty, cicloId, userId) {
    qty = Number(qty) || 1;
    const uid_ = resolverUserId(userId);
    if (uid_ === undefined) return sinSesion();
    const p0 = buscarProductoCig(getData('pos_products'), ref);
    if (!p0) { toast('Producto de cigarrillos no encontrado: ' + ref, 'error'); return false; }
    const cid = cicloActualId(cicloId);

    return transaccion(['pos_products', 'pos_cig_subcaja'], function () {
      const products = getData('pos_products');
      const p = products.find(function (x) { return x.code === p0.code; });
      const key = 'sueltos_' + p.code;
      if ((Number(p[key]) || 0) < qty) { toast('Sin sueltos suficientes de ' + p.name, 'error'); return false; }
      p[key] = (Number(p[key]) || 0) - qty;
      setDataStrict('pos_products', products);
      const sub = leerCigSub();
      sub.asientos.push({ id: uid(), tipo: 'venta_suelto', code: p.code, name: p.name, qty: qty, cicloId: cid, fecha: nowISO(), userId: uid_ });
      setDataStrict('pos_cig_subcaja', sub);
      return true;
    });
  }

  function registrarVentaCigarrillos(item, cicloId, method, tipo, pagos) {
    const uid_ = resolverUserId();
    if (uid_ === undefined) return sinSesion();
    if (!item || !isFinite(Number(item.price))) { toast('Ítem de cigarrillos inválido', 'error'); return false; }
    const sales = getData('pos_sales');
    sales.push({
      id: uid(),
      ticketId: item.ticketId || null,
      items: [item],
      total: roundCents(item.price * (item.qty || 1)),
      method: method || 'cash',
      pagos: Array.isArray(pagos) && pagos.length ? pagos : undefined,
      cicloId: cicloId,
      fecha: nowISO(),
      userId: uid_,
      esCigarrillo: true,
      tipo: tipo
    });
    return setData('pos_sales', sales);
  }

  function registrarVentaPaqueteCigarrillos(item, cicloId, method, pagos) {
    return registrarVentaCigarrillos(item, cicloId, method, 'paquete', pagos);
  }

  function registrarVentaSueltoCigarrillos(item, cicloId, method, pagos) {
    return registrarVentaCigarrillos(item, cicloId, method, 'suelto', pagos);
  }

  function setProductCigConfig(code, ventaSuelta, priceLoose) {
    const products = getData('pos_products');
    const product = products.find(function (p) { return p.code === code; });
    if (!product) return false;
    const precio = Number(priceLoose);
    product.ventaSuelta = !!ventaSuelta;
    product.priceLoose = (isFinite(precio) && precio >= 0) ? precio : 0;
    return setData('pos_products', products);
  }

  // Cuadre teórico de sueltos de una marca en un ciclo: inicio + aperturas×20 − vendidos
  function cuadreSubCajaPorMarca(ref, cicloId) {
    const products = getData('pos_products');
    const p = buscarProductoCig(products, ref);
    if (!p) return null;
    const cid = cicloActualId(cicloId);
    const sub = leerCigSub();
    const asientos = sub.asientos.filter(function (a) { return a.code === p.code && a.cicloId === cid; });
    const aperturas = asientos.filter(function (a) { return a.tipo === 'apertura'; }).reduce(function (s, a) { return s + (a.qty || 0); }, 0);
    const vendidos = asientos.filter(function (a) { return a.tipo === 'venta_suelto'; }).reduce(function (s, a) { return s + (a.qty || 0); }, 0);

    let inicio = 0;
    const ciclo = getData('pos_ciclo_actual');
    if (ciclo && ciclo.id === cid) inicio = (ciclo.sueltosInicio || {})[p.code] || 0;
    else {
      const cierre = (getData('pos_cierres') || []).find(function (c) { return c.id === cid; });
      if (cierre) inicio = (cierre.sueltosInicio || {})[p.code] || 0;
    }
    const esperados = inicio + aperturas * 20 - vendidos;
    const sistema = Number(p['sueltos_' + p.code]) || 0;
    return { code: p.code, marca: p.name, sueltosInicio: inicio, aperturas: aperturas, vendidos: vendidos, esperados: esperados, sistema: sistema, diferencia: sistema - esperados };
  }

  // Cuadre de todas las marcas con actividad o sueltos en el ciclo
  function cuadreSubCajaCiclo(cicloId) {
    const cid = cicloActualId(cicloId);
    return getData('pos_products')
      .filter(function (p) { return esCategoriaCigarrillos(p.category); })
      .map(function (p) { return cuadreSubCajaPorMarca(p.code, cid); })
      .filter(function (c) { return c && (c.sueltosInicio > 0 || c.aperturas > 0 || c.vendidos > 0 || c.sistema > 0); });
  }

  // ==========================================
  // 11. DOMINIO — CATEGORÍAS
  // ==========================================
  // Renombra la categoría en productos Y arrastra su margen mínimo (evita margen huérfano). Retorna cantidad de productos.
  function renombrarCategoria(oldName, newName) {
    oldName = normText(oldName);
    newName = normText(newName);
    if (!oldName || !newName || oldName === newName) return 0;
    if (esCategoriaCigarrillos(oldName) || esCategoriaCigarrillos(newName)) {
      toast('"Cigarrillos" no se puede renombrar ni usar como nuevo nombre', 'error');
      return 0;
    }
    let count = 0;
    const ok = transaccion(['pos_products', 'pos_min_margins'], function () {
      const products = getData('pos_products');
      products.forEach(function (p) {
        if (p.category === oldName) { p.category = newName; count++; }
      });
      if (count > 0) setDataStrict('pos_products', products);
      const mm = getData('pos_min_margins') || {};
      if (Object.prototype.hasOwnProperty.call(mm, oldName)) {
        if (!Object.prototype.hasOwnProperty.call(mm, newName)) mm[newName] = mm[oldName];
        delete mm[oldName];
        setDataStrict('pos_min_margins', mm);
      }
      return true;
    });
    return ok ? count : 0;
  }

  // ==========================================
  // 12. DOMINIO — ALERTAS
  // ==========================================
  function registrarAlerta(alertaObj) {
    const SEV = ['ALTA', 'MEDIA', 'BAJA'];
    if (!alertaObj || typeof alertaObj !== 'object' || !alertaObj.tipo || !alertaObj.mensaje || SEV.indexOf(alertaObj.severidad) === -1) {
      console.error('[NUCLEO] registrarAlerta: objeto inválido', alertaObj);
      return null;
    }
    const entry = Object.assign({}, alertaObj, {
      id: uid(),
      fecha: nowISO(),
      fechaLocal: today(), // para deduplicar por día local
      leida: false,
      userId: alertaObj.userId || (getUsuarioActivo() || {}).id || 'sistema'
    });
    const log = getData('pos_alerts_log');
    log.push(entry);
    if (!setData('pos_alerts_log', log)) return null;
    emit('pos:alertaRegistrada', entry);
    return entry;
  }

  function marcarAlertaLeida(alertaId, userId) {
    const uid_ = resolverUserId(userId);
    if (uid_ === undefined) return sinSesion();
    const log = getData('pos_alerts_log');
    const alerta = log.find(function (a) { return a.id === alertaId; });
    if (!alerta) return false;
    if (alerta.leida) return true;
    alerta.leida = true;
    alerta.leidaPor = uid_;
    alerta.fechaLeida = nowISO();
    if (!setData('pos_alerts_log', log)) return false;
    emit('pos:alertaLeida', alerta);
    return true;
  }

  // ==========================================
  // 13. DOMINIO — AUDITORÍA CONFIG
  // ==========================================
  function valorAuditable(v) {
    if (v === null || v === undefined || v === '') return '—';
    if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  }

  function registrarCambioConfig(config) {
    if (!config || !config.modulo || !config.seccion || !config.campo) {
      console.error('[NUCLEO] registrarCambioConfig: datos incompletos', config);
      return false;
    }
    const uid_ = resolverUserId(config.userId);
    if (uid_ === undefined) return sinSesion();
    const log = getData('pos_config_audit_log');
    log.push({
      id: uid(),
      modulo: config.modulo,
      seccion: config.seccion,
      campo: config.campo,
      valorAnterior: valorAuditable(config.valorAnterior),
      valorNuevo: valorAuditable(config.valorNuevo),
      userId: uid_,
      fecha: nowISO()
    });
    return setData('pos_config_audit_log', log);
  }

  // ==========================================
  // 14. SERVICIOS DE CIERRE
  // ==========================================
  function iniciarCiclo(montoApertura, userId) {
    const monto = Number(montoApertura);
    if (!isFinite(monto) || monto < 0) { toast('Monto de apertura inválido', 'error'); return false; }
    if (getData('pos_ciclo_actual')) { toast('Ya hay una caja abierta', 'error'); return false; }
    const uid_ = resolverUserId(userId);
    if (uid_ === undefined) return sinSesion();

    // Foto de los sueltos al abrir: base del arqueo de sub-caja
    const sueltosInicio = {};
    getData('pos_products').forEach(function (p) {
      if (esCategoriaCigarrillos(p.category)) {
        const n = Number(p['sueltos_' + p.code]) || 0;
        if (n > 0) sueltosInicio[p.code] = n;
      }
    });

    const ciclo = { id: uid(), fechaApertura: nowISO(), montoApertura: monto, userId: uid_, sueltosInicio: sueltosInicio };
    if (!setData('pos_ciclo_actual', ciclo)) return false;
    emit('pos:estadoCaja', { estado: 'ABIERTA' });
    return ciclo;
  }

  // Cierra el ciclo. NO pisa al usuario de apertura: guarda userIdApertura y userIdCierre.
  function finalizarCiclo(datosArqueo) {
    const ciclo = getData('pos_ciclo_actual');
    if (!ciclo) { toast('No hay ciclo abierto', 'error'); return false; }
    const uid_ = resolverUserId((datosArqueo || {}).userId);
    if (uid_ === undefined) return sinSesion();

    const cierre = Object.assign({}, datosArqueo || {}, {
      id: ciclo.id,
      fechaApertura: ciclo.fechaApertura,
      fechaCierre: nowISO(),
      montoApertura: ciclo.montoApertura,
      userIdApertura: ciclo.userId,
      userIdCierre: uid_,
      userId: uid_,
      sueltosInicio: ciclo.sueltosInicio || {}
    });

    const ok = transaccion(['pos_cierres', 'pos_ciclo_actual'], function () {
      const cierres = getData('pos_cierres');
      cierres.push(cierre);
      setDataStrict('pos_cierres', cierres);
      setDataStrict('pos_ciclo_actual', null);
      return true;
    });
    if (!ok) return false;
    emit('pos:estadoCaja', { estado: 'CERRADA' });
    emit('pos:cierreRealizado', { cicloId: ciclo.id, fecha: cierre.fechaCierre });
    return true;
  }

  function getEstadoCaja() { return getData('pos_ciclo_actual') ? 'ABIERTA' : 'CERRADA'; }
  function getCicloAbierto() { return getData('pos_ciclo_actual'); }

  function getCierresHoy() {
    const hoy = today();
    return getData('pos_cierres').filter(function (c) { return localDateOf(c.fechaCierre) === hoy; });
  }

  function getVentasDelCiclo(cicloId) {
    return getData('pos_sales').filter(function (s) { return s.cicloId === cicloId; });
  }

  // Una venta puede pagarse con varios medios: v.pagos = [{method, monto}]. Sin 'pagos' = un solo medio (v.method).
  function pagosDeVenta(v) {
    if (Array.isArray(v.pagos) && v.pagos.length) return v.pagos;
    return [{ method: v.method || 'cash', monto: v.total || 0 }];
  }

  function getVentasPorMetodo(cicloId) {
    const result = {};
    getVentasDelCiclo(cicloId).forEach(function (v) {
      pagosDeVenta(v).forEach(function (p) {
        result[p.method] = roundCents((result[p.method] || 0) + (p.monto || 0));
      });
    });
    return result;
  }

  function getVentasEnPerdida(cicloId) {
    return getVentasDelCiclo(cicloId).filter(function (v) {
      return v.items && v.items.some(function (item) {
        return item.cost && item.price && item.price < item.cost;
      });
    });
  }

  function getVentasSubCajaDelCiclo(cicloId) {
    let total = 0;
    getVentasDelCiclo(cicloId).forEach(function (v) {
      if (!v.esCigarrillo) return;
      pagosDeVenta(v).forEach(function (p) { if (p.method === 'cash') total += p.monto || 0; });
    });
    return roundCents(total);
  }

  // Única fórmula de "efectivo físico en el cajón principal" (CAJA, FINANZAS y AUTOMATIZACIÓN deben usar esta)
  function getEfectivoTotalCaja() {
    const c = getCicloAbierto();
    if (!c) return 0;
    const cash = getVentasPorMetodo(c.id).cash || 0;
    const m = getResumenMovimientosCaja(c.id);
    return roundCents((c.montoApertura || 0) + cash - getVentasSubCajaDelCiclo(c.id) + m.ingreso - m.egreso - m.retiro);
  }

  // Movimientos de efectivo del cajón principal fuera de las ventas: ingreso (cambio), egreso (pagos), retiro (excedente)
  function getMovimientosCaja(cicloId) {
    return getData('pos_caja_movimientos').filter(function (m) { return m.cicloId === cicloId; });
  }

  function getResumenMovimientosCaja(cicloId) {
    const r = { ingreso: 0, egreso: 0, retiro: 0 };
    getMovimientosCaja(cicloId).forEach(function (m) { if (r[m.tipo] !== undefined) r[m.tipo] += m.monto || 0; });
    r.ingreso = roundCents(r.ingreso); r.egreso = roundCents(r.egreso); r.retiro = roundCents(r.retiro);
    return r;
  }

  function registrarMovimientoCaja(mov) {
    const ciclo = getCicloAbierto();
    if (!ciclo) { toast('La caja está cerrada', 'error'); return false; }
    const tipo = mov && mov.tipo;
    const monto = Number(mov && mov.monto);
    const motivo = normText(mov && mov.motivo);
    if (['ingreso', 'egreso', 'retiro'].indexOf(tipo) === -1) { toast('Tipo de movimiento inválido', 'error'); return false; }
    if (!isFinite(monto) || monto <= 0) { toast('Monto inválido', 'error'); return false; }
    if (motivo.length < 3) { toast('El motivo es obligatorio', 'error'); return false; }
    if (tipo !== 'ingreso' && monto > getEfectivoTotalCaja()) { toast('No hay tanto efectivo en el cajón (' + money(getEfectivoTotalCaja()) + ')', 'error'); return false; }
    const uid_ = resolverUserId(mov.userId);
    if (uid_ === undefined) return sinSesion();
    const lista = getData('pos_caja_movimientos');
    lista.push({ id: uid(), cicloId: ciclo.id, tipo: tipo, monto: roundCents(monto), motivo: motivo, fecha: nowISO(), userId: uid_ });
    return setData('pos_caja_movimientos', lista);
  }

  // ==========================================
  // 15. RENTABILIDAD (única fuente de cálculo)
  // ==========================================
  function enRango(valor, desde, hasta) {
    if (!desde && !hasta) return true;
    const d = parseLocalDate(valor);
    if (isNaN(d.getTime())) return false;
    if (desde && d < desde) return false;
    if (hasta && d > hasta) return false;
    return true;
  }

  // desde/hasta: Date (o null). CMV siempre con el costo histórico de la línea de venta.
  function calcularResultado(desde, hasta) {
    const ventas = getData('pos_sales').filter(function (v) { return enRango(v.fecha, desde, hasta); });
    const gastos = getData('pos_finanzas_gastos').filter(function (g) { return enRango(g.fecha, desde, hasta); });
    const ventasTotales = ventas.reduce(function (s, v) { return s + (v.total || 0); }, 0);
    const cmv = ventas.reduce(function (s, v) {
      return s + (v.items || []).reduce(function (is, it) { return is + ((it.cost || 0) * (it.qty || 1)); }, 0);
    }, 0);
    const fuera = function (g) { return CATEGORIAS_GASTO_FUERA_DE_GANANCIA.indexOf(g.categoria) !== -1; };
    const gastosOperativos = gastos.filter(function (g) { return !fuera(g); }).reduce(function (s, g) { return s + (g.monto || 0); }, 0);
    const pagosProveedores = gastos.filter(fuera).reduce(function (s, g) { return s + (g.monto || 0); }, 0);
    const margenBruto = ventasTotales - cmv;
    return {
      ventasTotales: roundCents(ventasTotales),
      cmv: roundCents(cmv),
      margenBruto: roundCents(margenBruto),
      gastosOperativos: roundCents(gastosOperativos),
      pagosProveedores: roundCents(pagosProveedores), // informativo: ya está dentro del CMV
      gananciaNeta: roundCents(margenBruto - gastosOperativos)
    };
  }

  function getGananciasNetasAcumuladas() {
    return calcularResultado(null, null).gananciaNeta;
  }

  // ==========================================
  // 16. SERVICIOS DE TICKETS
  // ==========================================
  function guardarTicket(sale) {
    const uid_ = resolverUserId(sale && sale.userId);
    if (uid_ === undefined) { sinSesion(); return null; }
    const ticket = Object.assign({}, sale);
    ticket.id = ticket.id || uid();
    ticket.fecha = ticket.fecha || nowISO();
    ticket.userId = uid_;
    const log = getData('pos_tickets_log');
    log.push(ticket);
    if (!setData('pos_tickets_log', log)) return null;
    return ticket;
  }

  function getTicketsHoy() {
    const hoy = today();
    return getData('pos_tickets_log').filter(function (t) { return localDateOf(t.fecha) === hoy; });
  }

  function anchoTicket() {
    const per = getData('pos_peripherals') || {};
    const a = per.impresora && per.impresora.ancho;
    return a === '58mm' ? '48mm' : (a === 'A4' ? '180mm' : '72mm');
  }

  function nombreUsuarioPorId(id) {
    const u = (getData('pos_users') || []).find(function (x) { return x.id === id; });
    return u ? u.nombre : '';
  }

  const ETIQUETAS_METODO = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', other: 'Otro', mixed: 'Mixto' };

  // SIEMPRE filtra cigarrillos y ítems NO FISCAL
  function getTicketHTML(sale) {
    const business = getData('pos_business') || {};
    const items = (sale.items || []).filter(function (item) { return !item.esCigarrillo && !item.noFiscal; });
    const total = items.reduce(function (s, item) { return s + (item.price * (item.qty || 1)); }, 0);
    const cajero = nombreUsuarioPorId(sale.userId);

    let html = '<div style="font-family:monospace;font-size:12px;padding:6px;width:' + anchoTicket() + ';">';
    html += '<div style="text-align:center;"><strong>' + esc(business.razonSocial || 'NEURORA POS') + '</strong>';
    if (business.cuit) html += '<br>CUIT: ' + esc(business.cuit);
    if (business.direccion) html += '<br>' + esc(business.direccion);
    if (business.telefono) html += '<br>Tel: ' + esc(business.telefono);
    html += '</div><hr>';
    html += '<div>Fecha: ' + esc(formatDateTime(sale.fecha || nowISO())) + '</div>';
    if (cajero) html += '<div>Atendió: ' + esc(cajero) + '</div>';
    html += '<hr>';
    items.forEach(function (item) {
      const qty = item.qty || 1;
      html += '<div style="display:flex;justify-content:space-between;gap:6px;"><span>' + esc(item.name) + ' x' + qty + '</span><span>' + esc(money(item.price * qty)) + '</span></div>';
    });
    html += '<hr><div style="display:flex;justify-content:space-between;font-size:14px;"><strong>TOTAL</strong><strong>' + esc(money(total)) + '</strong></div>';
    if (sale.method) html += '<div>Pago: ' + esc(ETIQUETAS_METODO[sale.method] || sale.method) + '</div>';
    html += '</div>';
    return html;
  }

  function imprimirHTML(html) {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    doc.open();
    doc.write('<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page{margin:0}body{margin:0}hr{border:0;border-top:1px dashed #000}</style></head><body>' + html + '</body></html>');
    doc.close();
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
    setTimeout(function () { iframe.remove(); }, 3000);
  }

  function printTicket(sale) { imprimirHTML(getTicketHTML(sale)); }

  function guardarTicketDraft(carrito) { return setData('pos_ticket_draft', carrito); }
  function getTicketDraft() { return getData('pos_ticket_draft'); }

  // ==========================================
  // 17. SEGURIDAD / DIAGNÓSTICO / BACKUP
  // ==========================================
  function backupJSON() {
    const data = { __meta: { app: 'NEURORA POS', schemaVersion: SCHEMA_VERSION, fecha: nowISO() } };
    Object.keys(SCHEMA).forEach(function (key) { data[key] = getData(key); });
    const d = new Date();
    exportJSON(data, 'neurora_pos_backup_' + today() + '_' + pad(d.getHours()) + pad(d.getMinutes()) + '.json');
    setData('pos_last_backup_ts', nowISO());
    toast('Backup generado', 'success');
  }

  // Abre selector de archivo, valida, hace backup de seguridad del estado actual y restaura.
  function restaurarBackup() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = function (e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        let data;
        try { data = JSON.parse(reader.result); } catch (err) { alertaGuardadoFallido('El archivo no es un backup JSON válido.'); return; }
        const meta = (data && data.__meta) || {};
        const version = parseInt(meta.schemaVersion, 10) || 1;
        if (!data || typeof data !== 'object' || !data.pos_products) { alertaGuardadoFallido('El archivo no parece un backup de NEURORA POS.'); return; }
        if (version > SCHEMA_VERSION) { alertaGuardadoFallido('El backup es de una versión más nueva del sistema (v' + version + ').'); return; }
        const keys = Object.keys(SCHEMA).filter(function (k) { return k !== 'pos_schema_version' && Object.prototype.hasOwnProperty.call(data, k); });
        const malas = keys.filter(function (k) {
          const def = SCHEMA[k];
          if (def === null || data[k] === null) return false;
          return Array.isArray(def) !== Array.isArray(data[k]) || typeof def !== typeof data[k];
        });
        if (malas.length) { alertaGuardadoFallido('Backup inconsistente. Claves con formato inválido: ' + malas.join(', ')); return; }

        confirmar('Restaurar backup',
          'Se REEMPLAZARÁN todos los datos actuales por los del archivo (' + (meta.fecha ? formatDateTime(meta.fecha) : file.name) + ').\nPrimero se descargará un backup del estado actual por seguridad.',
          'RESTAURAR').then(function (ok) {
          if (!ok) return;
          backupJSON();
          const todas = keys.concat(['pos_schema_version']);
          const hecho = transaccion(todas, function () {
            keys.forEach(function (k) { setDataStrict(k, data[k]); });
            setDataStrict('pos_schema_version', version);
            return true;
          });
          if (hecho) {
            try { sessionStorage.removeItem('pos_active_user'); } catch (e2) { /* ignorar */ }
            toast('Backup restaurado. Recargando...', 'success');
            setTimeout(function () { location.reload(); }, 900);
          }
        });
      };
      reader.readAsText(file);
    };
    input.click();
  }

  function shouldRemindBackup() {
    const last = getData('pos_last_backup_ts');
    if (!last) return true;
    const days = (Date.now() - new Date(last).getTime()) / (1000 * 60 * 60 * 24);
    return days >= 3;
  }

  function runChecks() {
    const issues = [];
    Object.keys(SCHEMA).forEach(function (key) {
      try {
        const val = localStorage.getItem(key);
        if (val !== null) JSON.parse(val);
      } catch (e) { issues.push({ key: key, error: 'JSON corrupto en ' + key }); }
    });
    const uso = getStorageUsage();
    if (uso.pct >= 80) issues.push({ key: 'localStorage', error: 'Almacenamiento al ' + uso.pct + '%. Hacé backup y depurá datos antes de que deje de guardar.' });
    const products = getData('pos_products');
    const vistos = {};
    products.forEach(function (p) {
      if ((Number(p.stock) || 0) < 0) issues.push({ key: 'pos_products', error: 'Stock negativo en "' + p.name + '"' });
      if (vistos[p.code]) issues.push({ key: 'pos_products', error: 'Código de producto duplicado: ' + p.code });
      vistos[p.code] = true;
    });
    return issues;
  }

  // ==========================================
  // 18. REGISTRO DE MÓDULOS
  // ==========================================
  // Un módulo puede definir: boot() (suscripciones a eventos, una sola vez), init(), onShow(), onHide(),
  // onEscape(e) → true si lo manejó, onKey(e) → true si lo manejó, soloAdmin:true, noTab:true.
  function registerModule(id, module) {
    registeredModules[id] = module;
    if (typeof module.boot === 'function' && !module.__booted) {
      module.__booted = true;
      try { module.boot(); } catch (e) { console.error('[NUCLEO] boot de ' + id + ':', e); }
    }
    renderTabs();
  }

  // Handlers de ESC que van antes que el módulo activo (dropdowns, popovers). Deben devolver true si cerraron algo.
  function onEscapeGlobal(fn) { if (escapeGlobales.indexOf(fn) === -1) escapeGlobales.push(fn); }

  function puedeVerModulo(module) {
    if (!module || !module.soloAdmin) return true;
    if (!hayUsuariosConfigurados()) return true; // instalación sin usuarios todavía
    return esAdmin();
  }

  function showTab(id) {
    const module = registeredModules[id];
    if (!module) { toast('Módulo no encontrado: ' + id, 'error'); return; }
    if (shouldShowLogin()) { renderLoginModal(); return; }
    if (!puedeVerModulo(module)) { toast('No tenés permiso para acceder a ' + (module.name || id), 'error'); return; }

    const prev = activeModuleId && registeredModules[activeModuleId];
    if (prev && activeModuleId !== id && typeof prev.onHide === 'function') {
      try { prev.onHide(); } catch (e) { console.error('[NUCLEO] onHide:', e); }
    }
    activeModuleId = id;
    marcarTabActiva();

    const container = $('#moduleContainer');
    if (container) {
      container.innerHTML = '';
      [['render', container], ['init'], ['onShow']].forEach(function (par) {
        const fn = module[par[0]];
        if (typeof fn !== 'function') return;
        try { fn.call(module, par[1]); } catch (e) { console.error('[NUCLEO] ' + id + '.' + par[0] + ':', e); toast('Error en ' + (module.name || id) + ': ' + e.message, 'error'); }
      });
    }
    emit('pos:tabShown', { id: id });
  }

  function marcarTabActiva() {
    $$('.topbar-tab').forEach(function (tab) {
      tab.classList.toggle('active', tab.getAttribute('data-module') === activeModuleId);
    });
  }

  function renderTabs() {
    const tabsContainer = $('#topbar-tabs');
    if (!tabsContainer) return;
    tabsContainer.innerHTML = '';
    Object.keys(registeredModules).forEach(function (id) {
      const module = registeredModules[id];
      if (module.noTab || !puedeVerModulo(module)) return;
      const tab = document.createElement('a');
      tab.href = '#';
      tab.className = 'topbar-tab';
      tab.textContent = module.name || id.toUpperCase();
      tab.setAttribute('data-module', id);
      tab.addEventListener('click', function (e) { e.preventDefault(); showTab(id); });
      tabsContainer.appendChild(tab);
    });
    marcarTabActiva();
  }

  // ==========================================
  // 19. ENRUTADOR CENTRAL DE TECLADO
  // ==========================================
  // Se registra en la fase de captura de window, antes que cualquier listener de módulo.
  // - Login y modales del núcleo bloquean el teclado de fondo.
  // - ESC: el módulo activo lo maneja en onEscape(); si no lo maneja, vuelve a CAJA.
  // - Otras teclas: onKey(e) del módulo activo.
  // Los módulos que NO definan onEscape/onKey siguen con sus listeners propios (compatibilidad).
  function enrutarTeclado(e) {
    const k = e.key || '';
    const modales = document.querySelectorAll('.nucleo-modal-overlay');
    const login = document.getElementById('login-overlay');
    const bloqueante = modales.length ? modales[modales.length - 1] : login;
    if (bloqueante) {
      const dentro = bloqueante.contains(e.target);
      if (k === 'Escape') {
        const cancelar = bloqueante.querySelector('[data-cancel]');
        if (cancelar) cancelar.click();
        e.preventDefault(); e.stopImmediatePropagation();
      } else if (/^F\d{1,2}$/.test(k) || !dentro) {
        e.preventDefault(); e.stopImmediatePropagation();
      }
      return;
    }
    if (k === 'Escape') {
      for (let i = 0; i < escapeGlobales.length; i++) {
        let h = false;
        try { h = escapeGlobales[i](e) === true; } catch (err) { console.error(err); }
        if (h) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      }
    }
    const mod = activeModuleId && registeredModules[activeModuleId];
    if (!mod) return;
    if (k === 'Escape') {
      if (typeof mod.onEscape !== 'function') return; // módulo legacy
      let manejado = false;
      try { manejado = mod.onEscape(e) === true; } catch (err) { console.error(err); }
      if (!manejado && activeModuleId !== 'caja') showTab('caja');
      if (manejado || activeModuleId !== 'caja') { e.preventDefault(); e.stopImmediatePropagation(); }
      return;
    }
    if (typeof mod.onKey === 'function') {
      let manejado = false;
      try { manejado = mod.onKey(e) === true; } catch (err) { console.error(err); }
      if (manejado) { e.preventDefault(); e.stopImmediatePropagation(); }
    }
  }

  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('keydown', enrutarTeclado, true);
  }

  // ==========================================
  // 20. TOPBAR
  // ==========================================
  function renderTopbar() {
    if ($('.topbar')) return;
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
        <button id="btn-cerrar-sesion" class="btn-icon" title="Cerrar sesión" style="display:none;width:2rem;height:2rem;">
          <span class="material-symbols-outlined">logout</span>
        </button>
      </div>
    `;
    document.body.insertBefore(topbar, document.body.firstChild);

    actualizarEstadoCaja();
    actualizarUsuarioTopbar();
    iniciarReloj();

    $('#btn-abrir-cerrar-caja').addEventListener('click', function () {
      // El NÚCLEO no decide CÓMO se abre/cierra la caja (eso es CIERRE dentro de CAJA). Solo notifica la intención.
      emit('pos:solicitudAperturaCierre', { estado: getEstadoCaja() });
    });
    const badge = $('#badge-estado-caja');
    badge.style.cursor = 'pointer';
    badge.addEventListener('click', function () { emit('pos:solicitudVerCierres', {}); });
    $('#btn-cerrar-sesion').addEventListener('click', cerrarSesion);
  }

  function actualizarEstadoCaja() {
    const estado = getEstadoCaja();
    const badge = $('#badge-estado-caja');
    const texto = $('#texto-estado-caja');
    const btn = $('#texto-btn-caja');
    if (badge) badge.className = 'badge-status ' + (estado === 'ABIERTA' ? 'open' : 'closed');
    if (texto) texto.textContent = estado === 'ABIERTA' ? 'CAJA ABIERTA' : 'CAJA CERRADA';
    if (btn) btn.textContent = estado === 'ABIERTA' ? 'CERRAR CAJA' : 'ABRIR CAJA';
  }

  function actualizarUsuarioTopbar() {
    const user = getUsuarioActivo();
    const nameEl = $('#topbar-user-name');
    if (nameEl) nameEl.textContent = user ? user.nombre + ' · ' + user.rol : 'Sin sesión';
    const btn = $('#btn-cerrar-sesion');
    if (btn) btn.style.display = user ? 'flex' : 'none';
    renderTabs(); // los permisos por rol pueden cambiar las solapas visibles
  }

  function iniciarReloj() {
    setInterval(function () {
      const timeEl = $('#topbar-user-time');
      if (timeEl) timeEl.textContent = new Date().toLocaleTimeString('es-AR');
    }, 1000);
  }

  // ==========================================
  // 21. LOGIN
  // ==========================================
  function shouldShowLogin() {
    return hayUsuariosConfigurados() && !getUsuarioActivo();
  }

  function renderLoginModal() {
    if (document.getElementById('login-overlay')) return;
    const users = (getData('pos_users') || []).filter(function (u) { return u.activo !== false; });

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
          <input id="login-pin" type="password" inputmode="numeric" maxlength="6" class="input" placeholder="····" autocomplete="off">
        </div>
        <div id="login-error" style="color:var(--color-error);font-size:12px;min-height:16px;margin-bottom:var(--space-sm);"></div>
        <button id="login-submit" class="btn btn-primary w-full" style="height:2.75rem;">INGRESAR</button>
      </div>
    `;
    document.body.appendChild(overlay);

    const pinInput = document.getElementById('login-pin');
    const errorEl = document.getElementById('login-error');

    function intentarLogin() {
      const bloqueo = loginBloqueadoSegundos();
      if (bloqueo > 0) { errorEl.textContent = 'Demasiados intentos. Esperá ' + bloqueo + ' s.'; return; }
      const user = validarLogin(document.getElementById('login-usuario').value, pinInput.value);
      if (user) {
        overlay.remove();
        actualizarUsuarioTopbar();
        emit('pos:sesionCambiada', { usuario: user });
        toast('Bienvenido, ' + user.nombre, 'success');
        const actual = activeModuleId && registeredModules[activeModuleId];
        showTab(actual && puedeVerModulo(actual) ? activeModuleId : 'caja');
      } else {
        const b = loginBloqueadoSegundos();
        errorEl.textContent = b > 0 ? 'Demasiados intentos. Esperá ' + b + ' s.' : 'PIN incorrecto';
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
  // 22. INICIALIZACIÓN
  // ==========================================
  function init() {
    if (_iniciado) return;
    _iniciado = true;
    migrarDatos();
    renderTopbar();
    renderTabs();
    on('pos:estadoCaja', actualizarEstadoCaja);
    if (shouldShowLogin()) renderLoginModal();

    setTimeout(function () {
      const issues = runChecks();
      issues.forEach(function (i) { console.warn('[NUCLEO] runChecks:', i); });
      if (issues.length) {
        toast('Diagnóstico: ' + issues[0].error + (issues.length > 1 ? ' (+' + (issues.length - 1) + ' más, ver consola)' : ''), 'warning');
      } else if (getData('pos_products').length > 0 && shouldRemindBackup()) {
        toast('Hace 3 días o más sin backup. Hacelo desde CONFIG → Periféricos.', 'warning');
      }
    }, 2500);

    emit('pos:listo', {});
    console.log('[NUCLEO] Sistema inicializado v' + VERSION);
  }

  // ==========================================
  // 23. API PÚBLICA
  // ==========================================
  window.NUCLEO = {
    version: VERSION,
    CLAVES_TX_VENTA: CLAVES_TX_VENTA,

    // Storage
    getData: getData,
    setData: setData,
    setDataStrict: setDataStrict,
    transaccion: transaccion,
    getStorageUsage: getStorageUsage,
    migrarDatos: migrarDatos,

    // Utilidades
    $: $,
    $$: $$,
    uid: uid,
    today: today,
    nowISO: nowISO,
    localDateOf: localDateOf,
    parseLocalDate: parseLocalDate,
    addDays: addDays,
    formatDate: formatDate,
    formatDateTime: formatDateTime,
    money: money,
    roundCurrency: roundCurrency,
    roundCents: roundCents,
    normText: normText,
    normCategory: normCategory,
    esc: esc,
    jsArg: jsArg,
    toast: toast,
    confirmar: confirmar,
    mostrarModal: mostrarModal,
    parseNumber: parseNumber,
    parseCSV: parseCSV,
    exportCSV: exportCSV,
    exportJSON: exportJSON,
    imprimirHTML: imprimirHTML,

    // Dominio - Cigarrillos
    esCategoriaCigarrillos: esCategoriaCigarrillos,
    abrirPaquete: abrirPaquete,
    venderSuelto: venderSuelto,
    registrarVentaPaqueteCigarrillos: registrarVentaPaqueteCigarrillos,
    registrarVentaSueltoCigarrillos: registrarVentaSueltoCigarrillos,
    setProductCigConfig: setProductCigConfig,
    cuadreSubCajaPorMarca: cuadreSubCajaPorMarca,
    cuadreSubCajaCiclo: cuadreSubCajaCiclo,

    // Dominio - Categorías
    renombrarCategoria: renombrarCategoria,

    // Dominio - Márgenes (sobre costo)
    margenSobreCosto: margenSobreCosto,
    precioDesdeMargen: precioDesdeMargen,
    getMargenMinimo: getMargenMinimo,
    checkLoss: checkLoss,

    // Dominio - Stock/Costo
    actualizarStock: actualizarStock,
    actualizarCostoProducto: actualizarCostoProducto,
    validarStockVenta: validarStockVenta,
    mensajeStockInsuficiente: mensajeStockInsuficiente,

    // Dominio - Alertas / Auditoría
    registrarAlerta: registrarAlerta,
    marcarAlertaLeida: marcarAlertaLeida,
    registrarCambioConfig: registrarCambioConfig,

    // Servicios de CIERRE
    iniciarCiclo: iniciarCiclo,
    finalizarCiclo: finalizarCiclo,
    getEstadoCaja: getEstadoCaja,
    getCicloAbierto: getCicloAbierto,
    getCierresHoy: getCierresHoy,
    getVentasDelCiclo: getVentasDelCiclo,
    getVentasPorMetodo: getVentasPorMetodo,
    pagosDeVenta: pagosDeVenta,
    getFactorCosto: getFactorCosto,
    calcularCostoReal: calcularCostoReal,
    getVentasEnPerdida: getVentasEnPerdida,
    getVentasSubCajaDelCiclo: getVentasSubCajaDelCiclo,
    getEfectivoTotalCaja: getEfectivoTotalCaja,
    getMovimientosCaja: getMovimientosCaja,
    getResumenMovimientosCaja: getResumenMovimientosCaja,
    registrarMovimientoCaja: registrarMovimientoCaja,

    // Rentabilidad
    calcularResultado: calcularResultado,
    getGananciasNetasAcumuladas: getGananciasNetasAcumuladas,

    // Tickets
    guardarTicket: guardarTicket,
    getTicketsHoy: getTicketsHoy,
    getTicketHTML: getTicketHTML,
    printTicket: printTicket,
    guardarTicketDraft: guardarTicketDraft,
    getTicketDraft: getTicketDraft,

    // Seguridad / Diagnóstico
    backupJSON: backupJSON,
    restaurarBackup: restaurarBackup,
    shouldRemindBackup: shouldRemindBackup,
    runChecks: runChecks,
    alertaGuardadoFallido: alertaGuardadoFallido,
    alertaDatoCorrupto: alertaDatoCorrupto,

    // Sesión
    validarLogin: validarLogin,
    getUsuarioActivo: getUsuarioActivo,
    esAdmin: esAdmin,
    cerrarSesion: cerrarSesion,

    // Bus de eventos
    emit: emit,
    on: on,
    off: off,

    // Registro de módulos
    registerModule: registerModule,
    showTab: showTab,
    onEscapeGlobal: onEscapeGlobal,

    init: init
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
