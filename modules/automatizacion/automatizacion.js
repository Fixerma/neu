/* ============================================
   NEURORA POS - AUTOMATIZACIÓN (ANEXO H)
   Motor transversal de alertas
   ============================================ */

(function () {
  'use strict';

  const AUTOMATIZACION = {
    id: 'automatizacion',
    name: 'AUTOMATIZACIÓN',
    noTab: true,
    lastLiquidityCheck: null,

    init: function () {
      console.log('[AUTOMATIZACIÓN] Inicializando...');
      this.renderBell();
      this.bindEvents();
      this.checkPeriodicAlerts();
    },

    onShow: function () {
      this.updateBadge();
      this.checkPeriodicAlerts();
    },

    // ==========================================
    // 1. RENDERIZADO DE CAMPANA Y DROPDOWN
    // ==========================================
    renderBell: function () {
      // Esperar un poco para asegurar que el slot exista
      setTimeout(() => {
        const slot = document.getElementById('slot-campana');
        if (!slot) {
          console.warn('[AUTOMATIZACIÓN] Slot de campana no encontrado');
          return;
        }

        slot.innerHTML = `
          <div class="alert-bell-container" id="alertBellBtn">
            <span class="material-symbols-outlined">notifications</span>
            <span class="alert-badge" id="alertBadge" style="display: none;">0</span>
            <div class="alert-dropdown" id="alertDropdown" style="display: none;">
              <div class="alert-dropdown-header">
                <h3>Alertas</h3>
                <button class="btn btn-ghost" id="markAllRead" style="font-size: 11px;">Marcar todas</button>
              </div>
              <div class="alert-dropdown-body" id="alertDropdownBody">
                <div class="alert-empty">No hay alertas activas</div>
              </div>
            </div>
          </div>
        `;

        document.getElementById('alertBellBtn').addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleDropdown();
        });

        document.getElementById('markAllRead').addEventListener('click', (e) => {
          e.stopPropagation();
          this.markAllAsRead();
        });

        document.addEventListener('click', () => {
          const dropdown = document.getElementById('alertDropdown');
          if (dropdown) dropdown.style.display = 'none';
        });

        this.updateBadge();
        console.log('[AUTOMATIZACIÓN] Campana renderizada correctamente');
      }, 300);
    },

    toggleDropdown: function () {
      const dropdown = document.getElementById('alertDropdown');
      if (!dropdown) return;
      dropdown.style.display = dropdown.style.display === 'none' ? 'flex' : 'none';
      if (dropdown.style.display === 'flex') {
        this.renderAlerts();
      }
    },

    updateBadge: function () {
      const alerts = NUCLEO.getData('pos_alerts_log') || [];
      const unreadAlta = alerts.filter(a => !a.leida && a.severidad === 'ALTA').length;
      const badge = document.getElementById('alertBadge');
      if (badge) {
        if (unreadAlta > 0) {
          badge.textContent = unreadAlta;
          badge.style.display = 'flex';
        } else {
          badge.style.display = 'none';
        }
      }
    },

    renderAlerts: function () {
      const alerts = NUCLEO.getData('pos_alerts_log') || [];
      const unread = alerts.filter(a => !a.leida).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      const body = document.getElementById('alertDropdownBody');
      if (!body) return;

      if (unread.length === 0) {
        body.innerHTML = '<div class="alert-empty">No hay alertas activas</div>';
        return;
      }

      body.innerHTML = unread.map(alert => `
        <div class="alert-card severity-${alert.severidad.toLowerCase()}">
          <div class="alert-card-header">
            <span class="material-symbols-outlined alert-card-icon">${this.getIconForType(alert.tipo)}</span>
            <span class="alert-card-title">${NUCLEO.esc(alert.titulo)}</span>
            <span class="alert-card-severity">${alert.severidad}</span>
          </div>
          <div class="alert-card-body">${NUCLEO.esc(alert.mensaje)}</div>
          <div class="alert-card-actions">
            <button class="btn btn-secondary" onclick="AUTOMATIZACION.markAsRead('${alert.id}')">Marcar como leída</button>
            ${alert.moduloDestino ? `<button class="btn btn-primary" onclick="AUTOMATIZACION.goToModule('${alert.moduloDestino}', '${alert.id || ''}')">IR A ${alert.moduloDestino}</button>` : ''}
          </div>
        </div>
      `).join('');
    },

    getIconForType: function (tipo) {
      const icons = {
        'margen_erosionado': 'trending_down',
        'liquidez': 'payments',
        'compra_inteligente': 'shopping_cart',
        'caja_chica': 'account_balance_wallet'
      };
      return icons[tipo] || 'notifications';
    },

    // ==========================================
    // 2. ACCIONES DE ALERTAS
    // ==========================================
    markAsRead: function (alertId) {
      const userId = (NUCLEO.getUsuarioActivo() || {}).id || null;
      NUCLEO.marcarAlertaLeida(alertId, userId);
      this.updateBadge();
      this.renderAlerts();
    },

    markAllAsRead: function () {
      const alerts = NUCLEO.getData('pos_alerts_log') || [];
      const userId = (NUCLEO.getUsuarioActivo() || {}).id || null;
      alerts.forEach(a => {
        if (!a.leida) {
          NUCLEO.marcarAlertaLeida(a.id, userId);
        }
      });
      this.updateBadge();
      this.renderAlerts();
    },

    goToModule: function (modulo, alertId) {
      NUCLEO.showTab(modulo.toLowerCase());
      if (alertId) {
        this.markAsRead(alertId);
      }
      const dropdown = document.getElementById('alertDropdown');
      if (dropdown) dropdown.style.display = 'none';
    },

    // ==========================================
    // 3. LÓGICA DE ALERTAS
    // ==========================================
    bindEvents: function () {
      NUCLEO.on('pos:facturaRecibida', (payload) => {
        this.checkMargenErosionado(payload);
      });

      NUCLEO.on('pos:cierreRealizado', () => {
        this.checkCajaChica();
      });

      // "Al entrar a FINANZAS" (liquidez) y "al entrar a COMPRAS" (compra
      // inteligente) — ANEXO H §4.2/§4.3. showTab() del NÚCLEO emite
      // pos:tabShown cada vez que se muestra una pestaña; antes de esto,
      // ambos triggers dependían de leer el DOM 200ms después de cargar la
      // página (antes de que el usuario clickeara nada), así que en la
      // práctica nunca se disparaban al navegar entre pestañas.
      NUCLEO.on('pos:tabShown', (data) => {
        if (data.id === 'finanzas') {
          this.checkLiquidez();
        } else if (data.id === 'compras') {
          this.checkCompraInteligente();
        }
      });
    },

    checkPeriodicAlerts: function () {
      const today = NUCLEO.today();
      if (this.lastLiquidityCheck !== today) {
        this.checkLiquidez();
        this.lastLiquidityCheck = today;
      }
    },

    checkMargenErosionado: function (payload) {
      if (!payload.itemsConMargenErosionado || payload.itemsConMargenErosionado.length === 0) return;
      
      const alerts = NUCLEO.getData('pos_alerts_log') || [];
      
      payload.itemsConMargenErosionado.forEach(item => {
        const exists = alerts.some(a => 
          a.tipo === 'margen_erosionado' && 
          !a.leida && 
          a.fecha.startsWith(NUCLEO.today()) &&
          a.detalle && a.detalle.includes(item.code)
        );
        
        if (!exists) {
          NUCLEO.registrarAlerta({
            tipo: 'margen_erosionado',
            severidad: 'ALTA',
            titulo: 'Margen Erosionado',
            mensaje: `El costo de ${item.name} subió a ${NUCLEO.money(item.costoNuevo)}. Tu precio actual deja una ganancia del ${item.margenActual.toFixed(1)}%. Actualizar precio en INVENTARIO.`,
            moduloDestino: 'INVENTARIO',
            fecha: NUCLEO.nowISO(),
            leida: false,
            detalle: item.code
          });
        }
      });
      
      this.updateBadge();
    },

    checkLiquidez: function () {
      const reservas = NUCLEO.getData('pos_finanzas_reservas') || [];
      const hoy = new Date();
      const tresDias = new Date(hoy.getTime() + 3 * 24 * 60 * 60 * 1000);
      
      const vencimientos = reservas.filter(r => {
        if (r.estado !== 'activa') return false;
        const venc = new Date(r.fechaVencimiento);
        return venc >= hoy && venc <= tresDias;
      });
      
      if (vencimientos.length === 0) return;
      
      const totalVencimientos = vencimientos.reduce((sum, r) => sum + (r.monto || 0), 0);
      
      // Calcular efectivo disponible (simplificado)
      const ciclo = NUCLEO.getCicloAbierto();
      let efectivoDisponible = 0;
      if (ciclo) {
        const ventasEfectivo = NUCLEO.getVentasPorMetodo(ciclo.id)['cash'] || 0;
        const subcaja = NUCLEO.getVentasSubCajaDelCiclo(ciclo.id);
        efectivoDisponible = (ciclo.montoApertura || 0) + ventasEfectivo - subcaja;
      }
      
      const reservasActivas = reservas.filter(r => r.estado === 'activa').reduce((sum, r) => sum + (r.monto || 0), 0);
      efectivoDisponible -= reservasActivas;
      
      if (totalVencimientos > efectivoDisponible) {
        const alerts = NUCLEO.getData('pos_alerts_log') || [];
        const exists = alerts.some(a => 
          a.tipo === 'liquidez' && 
          !a.leida && 
          a.fecha.startsWith(NUCLEO.today())
        );
        
        if (!exists) {
          const faltante = totalVencimientos - efectivoDisponible;
          NUCLEO.registrarAlerta({
            tipo: 'liquidez',
            severidad: 'ALTA',
            titulo: 'Flujo de Caja',
            mensaje: `En ${Math.ceil((tresDias - hoy) / (1000 * 60 * 60 * 24))} días vencen ${NUCLEO.money(totalVencimientos)} en reservas. Tu disponible actual es ${NUCLEO.money(efectivoDisponible)}. Te faltan ${NUCLEO.money(faltante)}.`,
            moduloDestino: 'FINANZAS',
            fecha: NUCLEO.nowISO(),
            leida: false
          });
        }
      }
      
      this.updateBadge();
    },

    checkCompraInteligente: function () {
      const products = NUCLEO.getData('pos_products') || [];
      const sales = NUCLEO.getData('pos_sales') || [];
      const alerts = NUCLEO.getData('pos_alerts_log') || [];
      
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
      
      products.forEach(p => {
        if (p.active === false) return;
        const vtas30d = salesByProduct[p.code] || 0;
        const dailyAvg = vtas30d / 30;
        const daysOfStock = dailyAvg > 0 ? p.stock / dailyAvg : 999;
        
        if (p.stock <= (p.minStock || 0) || daysOfStock < 15) {
          const exists = alerts.some(a => 
            a.tipo === 'compra_inteligente' && 
            !a.leida && 
            a.detalle === p.code
          );
          
          if (!exists) {
            const needed = Math.ceil((dailyAvg * 30) - p.stock);
            NUCLEO.registrarAlerta({
              tipo: 'compra_inteligente',
              severidad: 'MEDIA',
              titulo: 'Stock Bajo',
              mensaje: `Te sugerimos pedir ${needed} unidades de ${p.name}. Se agotará en aproximadamente ${Math.ceil(daysOfStock)} días.`,
              moduloDestino: 'COMPRAS',
              fecha: NUCLEO.nowISO(),
              leida: false,
              detalle: p.code
            });
          }
        }
      });
      
      this.updateBadge();
    },

    checkCajaChica: function () {
      const cierres = NUCLEO.getData('pos_cierres') || [];
      const ultimos3 = cierres.slice(-3);
      
      if (ultimos3.length < 3) return;
      
      const todosNegativos = ultimos3.every(c => c.diferencia < 0);
      
      if (todosNegativos) {
        const alerts = NUCLEO.getData('pos_alerts_log') || [];
        const exists = alerts.some(a => 
          a.tipo === 'caja_chica' && 
          !a.leida && 
          a.fecha.startsWith(NUCLEO.today())
        );
        
        if (!exists) {
          NUCLEO.registrarAlerta({
            tipo: 'caja_chica',
            severidad: 'BAJA',
            titulo: 'Control de Caja Chica',
            mensaje: 'Revisa tu cambio. Los últimos 3 cierres tuvieron diferencia negativa.',
            moduloDestino: 'CAJA',
            fecha: NUCLEO.nowISO(),
            leida: false
          });
        }
      }
      
      this.updateBadge();
    }
  };

  // Exportar globalmente
  window.AUTOMATIZACION = AUTOMATIZACION;
  
  // Auto-registrar en NUCLEO si existe
  if (typeof NUCLEO !== 'undefined') {
    NUCLEO.registerModule('automatizacion', {
      name: 'AUTOMATIZACIÓN',
      noTab: true,
      init: function () {
        AUTOMATIZACION.init();
      }
    });
  }
})();