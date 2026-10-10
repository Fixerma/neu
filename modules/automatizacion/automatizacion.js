/* ============================================
   NEURORA POS - AUTOMATIZACIÓN (ANEXO H)
   Motor transversal de alertas
   Versión: corrección de la maqueta (liquidez, deduplicación, boot)
   ============================================ */

(function () {
  'use strict';

  const AUTOMATIZACION = {
    // ==========================================
    // 0. ARRANQUE (hooks del NÚCLEO)
    // ==========================================
    // boot: una sola vez al registrar el módulo. No depende de la UI ni de timers.
    boot: function () {
      const self = this;
      NUCLEO.on('pos:listo', function () { self.renderBell(); self.checkLiquidez(); });
      NUCLEO.on('pos:facturaRecibida', function (p) { self.checkMargenErosionado(p); });
      NUCLEO.on('pos:cierreRealizado', function () { self.checkCajaChica(); });
      NUCLEO.on('pos:tabShown', function (d) {
        if (d.id === 'finanzas') self.checkLiquidez();
        else if (d.id === 'compras') self.checkCompraInteligente();
        self.updateBadge();
      });
      ['pos:alertaRegistrada', 'pos:alertaLeida', 'pos:sesionCambiada'].forEach(function (ev) {
        NUCLEO.on(ev, function () { self.updateBadge(); });
      });
      NUCLEO.onEscapeGlobal(function () { return self.cerrarDropdown(); });
    },

    init: function () {},

    // ==========================================
    // 1. CAMPANA Y DROPDOWN
    // ==========================================
    renderBell: function () {
      const slot = document.getElementById('slot-campana');
      if (!slot || slot.querySelector('#alertBellBtn')) return;
      const self = this;
      slot.innerHTML = `
        <div class="alert-bell-container" id="alertBellBtn">
          <span class="material-symbols-outlined">notifications</span>
          <span class="alert-badge" id="alertBadge" style="display: none;">0</span>
        </div>
        <div class="alert-dropdown" id="alertDropdown" style="display: none;">
          <div class="alert-dropdown-header">
            <h3>Alertas</h3>
            <button class="btn btn-ghost" id="markAllRead" style="font-size: 11px;">Marcar todas</button>
          </div>
          <div class="alert-dropdown-body" id="alertDropdownBody"><div class="alert-empty">No hay alertas activas</div></div>
        </div>`;
      document.getElementById('alertBellBtn').addEventListener('click', function (e) { e.stopPropagation(); self.toggleDropdown(); });
      // Clicks dentro del dropdown NO lo cierran
      document.getElementById('alertDropdown').addEventListener('click', function (e) { e.stopPropagation(); });
      document.getElementById('markAllRead').addEventListener('click', function () { self.markAllAsRead(); });
      document.addEventListener('click', function () { self.cerrarDropdown(); });
      this.updateBadge();
    },

    cerrarDropdown: function () {
      const dd = document.getElementById('alertDropdown');
      if (dd && dd.style.display !== 'none') { dd.style.display = 'none'; return true; }
      return false;
    },

    toggleDropdown: function () {
      const dd = document.getElementById('alertDropdown');
      if (!dd) return;
      const abrir = dd.style.display === 'none';
      dd.style.display = abrir ? 'flex' : 'none';
      if (abrir) this.renderAlerts();
    },

    noLeidas: function () { return (NUCLEO.getData('pos_alerts_log') || []).filter(function (a) { return !a.leida; }); },

    updateBadge: function () {
      const n = this.noLeidas().filter(function (a) { return a.severidad === 'ALTA'; }).length;
      const badge = document.getElementById('alertBadge');
      if (!badge) return;
      badge.textContent = n;
      badge.style.display = n > 0 ? 'flex' : 'none';
    },

    renderAlerts: function () {
      const self = this;
      const body = document.getElementById('alertDropdownBody');
      if (!body) return;
      const unread = this.noLeidas().sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });
      if (unread.length === 0) { body.innerHTML = '<div class="alert-empty">No hay alertas activas</div>'; return; }
      body.innerHTML = unread.map(function (a) {
        return `
        <div class="alert-card severity-${NUCLEO.esc(String(a.severidad).toLowerCase())}">
          <div class="alert-card-header">
            <span class="material-symbols-outlined alert-card-icon">${self.getIconForType(a.tipo)}</span>
            <span class="alert-card-title">${NUCLEO.esc(a.titulo || a.tipo)}</span>
            <span class="alert-card-severity">${NUCLEO.esc(a.severidad)}</span>
          </div>
          <div class="alert-card-body">${NUCLEO.esc(a.mensaje)}</div>
          <div class="alert-card-actions">
            <button class="btn btn-secondary" onclick="AUTOMATIZACION.markAsRead(${NUCLEO.jsArg(a.id)})">Marcar como leída</button>
            ${a.moduloDestino ? `<button class="btn btn-primary" onclick="AUTOMATIZACION.goToModule(${NUCLEO.jsArg(a.moduloDestino)}, ${NUCLEO.jsArg(a.id)})">IR A ${NUCLEO.esc(a.moduloDestino)}</button>` : ''}
          </div>
        </div>`;
      }).join('');
    },

    getIconForType: function (tipo) {
      return { margen_erosionado: 'trending_down', liquidez: 'payments', compra_inteligente: 'shopping_cart', caja_chica: 'account_balance_wallet' }[tipo] || 'notifications';
    },

    markAsRead: function (alertId) {
      NUCLEO.marcarAlertaLeida(alertId, (NUCLEO.getUsuarioActivo() || {}).id || null);
      this.updateBadge();
      this.renderAlerts();
    },

    markAllAsRead: function () {
      const self = this;
      const uid = (NUCLEO.getUsuarioActivo() || {}).id || null;
      this.noLeidas().forEach(function (a) { NUCLEO.marcarAlertaLeida(a.id, uid); });
      self.updateBadge();
      self.renderAlerts();
    },

    goToModule: function (modulo, alertId) {
      this.cerrarDropdown();
      NUCLEO.showTab(String(modulo).toLowerCase());
      if (alertId) this.markAsRead(alertId);
    },

    // ==========================================
    // 2. DEDUPLICACIÓN (siempre por fecha LOCAL guardada en la alerta)
    // ==========================================
    existe: function (tipo, filtro) {
      return (NUCLEO.getData('pos_alerts_log') || []).some(function (a) { return a.tipo === tipo && filtro(a); });
    },

    // ==========================================
    // 3. LAS 4 ALERTAS
    // ==========================================
    // 4.1 Margen erosionado: SOLO lee el array que calculó COMPRAS. Una alerta por producto y día.
    checkMargenErosionado: function (payload) {
      const self = this;
      const items = (payload && payload.itemsConMargenErosionado) || [];
      items.forEach(function (item) {
        if (self.existe('margen_erosionado', function (a) { return a.detalle === item.code && a.fechaLocal === NUCLEO.today(); })) return;
        NUCLEO.registrarAlerta({
          tipo: 'margen_erosionado', severidad: 'ALTA', titulo: 'Margen Erosionado',
          mensaje: 'El costo de ' + item.name + ' subió a ' + NUCLEO.money(item.costoNuevo) + '. Tu precio actual deja un margen del ' + Number(item.margenActual).toFixed(1) + '% (mínimo ' + item.margenMinimoRequerido + '%). Actualizá el precio en INVENTARIO.',
          moduloDestino: 'INVENTARIO', detalle: item.code
        });
      });
      this.updateBadge();
    },

    // 4.2 Liquidez. Regla: lo que vence en ≤3 días (incluye lo ya vencido) vs. el efectivo que hay para pagarlo.
    // Caja abierta → efectivo del cajón. Caja cerrada → efectivo contado en el último cierre.
    evaluarLiquidez: function () {
      const hoy = NUCLEO.parseLocalDate(NUCLEO.today());
      const limite = NUCLEO.parseLocalDate(NUCLEO.addDays(NUCLEO.today(), 3));
      const vencimientos = (NUCLEO.getData('pos_finanzas_reservas') || []).filter(function (r) {
        return r.estado === 'activa' && NUCLEO.parseLocalDate(r.fechaVencimiento) <= limite;
      });
      const total = NUCLEO.roundCents(vencimientos.reduce(function (s, r) { return s + (r.monto || 0); }, 0));
      let efectivo, referencia;
      if (NUCLEO.getCicloAbierto()) { efectivo = NUCLEO.getEfectivoTotalCaja(); referencia = 'caja'; }
      else {
        const cierres = NUCLEO.getData('pos_cierres') || [];
        efectivo = cierres.length ? (cierres[cierres.length - 1].montoContado || 0) : 0;
        referencia = 'ultimo_cierre';
      }
      return { alerta: vencimientos.length > 0 && total > efectivo, total: total, efectivo: efectivo, faltante: NUCLEO.roundCents(total - efectivo), referencia: referencia, cantidad: vencimientos.length, hoy: hoy };
    },

    checkLiquidez: function () {
      const r = this.evaluarLiquidez();
      // Máximo 1 por día (leída o no): sobrevive a F5 porque se verifica contra el log, no contra memoria
      if (r.alerta && !this.existe('liquidez', function (a) { return a.fechaLocal === NUCLEO.today(); })) {
        NUCLEO.registrarAlerta({
          tipo: 'liquidez', severidad: 'ALTA', titulo: 'Flujo de Caja', userId: 'sistema',
          mensaje: 'Hay ' + r.cantidad + ' reserva(s) por ' + NUCLEO.money(r.total) + ' que vencen en 3 días o ya vencieron. Efectivo disponible para pagar (' + (r.referencia === 'caja' ? 'caja actual' : 'último cierre') + '): ' + NUCLEO.money(r.efectivo) + '. Te faltan ' + NUCLEO.money(r.faltante) + '.',
          moduloDestino: 'FINANZAS'
        });
      }
      this.updateBadge();
      return r;
    },

    // 4.3 Compra inteligente: stock ≤ mínimo y sin pedido pendiente que lo incluya. Una por producto cada 7 días.
    evaluarCompraInteligente: function () {
      const products = NUCLEO.getData('pos_products') || [];
      const sales = NUCLEO.getData('pos_sales') || [];
      const pendientes = {};
      (NUCLEO.getData('pos_purchase_orders') || []).filter(function (o) { return o.estado === 'Pendiente'; })
        .forEach(function (o) { (o.items || []).forEach(function (i) { pendientes[i.code] = true; }); });
      const desde = new Date(); desde.setDate(desde.getDate() - 30);
      const vendido = {};
      sales.forEach(function (s) {
        if (new Date(s.fecha) < desde) return;
        (s.items || []).forEach(function (it) {
          const q = (it.esCigarrillo && it.tipo === 'suelto') ? (Number(it.qty) || 0) / 20 : (Number(it.qty) || 0);
          vendido[it.code] = (vendido[it.code] || 0) + q;
        });
      });
      return products.filter(function (p) {
        const min = Number(p.minStock) || 0;
        return p.active !== false && min > 0 && (Number(p.stock) || 0) <= min && !pendientes[p.code];
      }).map(function (p) {
        const diario = (vendido[p.code] || 0) / 30;
        const stock = Number(p.stock) || 0;
        return { code: p.code, name: p.name, stock: stock, dias: diario > 0 ? Math.floor(stock / diario) : null };
      });
    },

    checkCompraInteligente: function () {
      const hace7 = NUCLEO.addDays(NUCLEO.today(), -7);
      const self = this;
      this.evaluarCompraInteligente().forEach(function (c) {
        if (self.existe('compra_inteligente', function (a) { return a.detalle === c.code && a.fechaLocal >= hace7; })) return;
        NUCLEO.registrarAlerta({
          tipo: 'compra_inteligente', severidad: 'MEDIA', titulo: 'Stock Bajo', userId: 'sistema',
          mensaje: c.name + ' está en ' + c.stock + ' unidades (por debajo del mínimo) y no hay pedido pendiente.' + (c.dias !== null ? ' Con el ritmo de ventas alcanza para ~' + c.dias + ' día(s).' : '') + ' Armá un pedido en COMPRAS.',
          moduloDestino: 'COMPRAS', detalle: c.code
        });
      });
      this.updateBadge();
    },

    // 4.4 Caja chica: los últimos 3 cierres con faltante. Una alerta por cierre.
    checkCajaChica: function () {
      const ultimos = (NUCLEO.getData('pos_cierres') || []).slice(-3);
      if (ultimos.length < 3 || !ultimos.every(function (c) { return (c.diferencia || 0) < 0; })) return;
      const idUltimo = ultimos[2].id;
      if (this.existe('caja_chica', function (a) { return a.detalle === idUltimo; })) return;
      NUCLEO.registrarAlerta({
        tipo: 'caja_chica', severidad: 'BAJA', titulo: 'Control de Caja Chica',
        mensaje: 'Revisá el cambio y las salidas de efectivo: los últimos 3 cierres tuvieron faltante.',
        moduloDestino: 'CAJA', detalle: idUltimo
      });
      this.updateBadge();
    }
  };

  window.AUTOMATIZACION = AUTOMATIZACION;

  // Se registra sola (noTab). boot() corre al registrarse, antes de que exista la UI.
  if (typeof NUCLEO !== 'undefined') {
    NUCLEO.registerModule('automatizacion', {
      name: 'AUTOMATIZACIÓN',
      noTab: true,
      boot: function () { AUTOMATIZACION.boot(); },
      init: function () {}
    });
  }
})();
