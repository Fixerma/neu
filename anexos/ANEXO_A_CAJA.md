ANEXO A — CAJA + CIERRE (CONGELADO)
PROPÓSITO
Gestionar el ciclo completo de operación en el mostrador: abrir caja, cobrar ventas (estándar y cigarrillos), y cerrar con arqueo doble (general + sub-caja) a ciegas, manteniendo la independencia física y contable entre el cajón principal y la sub-caja de cigarrillos.
NOTA DE ARQUITECTURA: "CIERRE" NO es un módulo registrado por separado vía `registerModule()`. Es funcionalidad interna del mismo módulo CAJA (modales de Apertura/Cierre/Ver Cierres del Día descritos en §3). No tiene solapa propia ni `noTab: true` independiente; todo su código vive dentro del módulo CAJA.

CONTRATO DE DATOS
ESCRIBE (vía servicio del NÚCLEO): `pos_ticket_draft`, `pos_ciclo_actual` (vía `iniciarCiclo()`), `pos_cierres` (vía `finalizarCiclo()`).
ESCRIBE (vía servicio del NÚCLEO): `pos_ticket_draft` (borrador del carrito en curso, para restaurar tras F5).
LEE: `pos_products`, `pos_config`, `pos_quick_buttons`, `pos_subcajas`, `pos_cig_subcaja`, `pos_tickets_log`, `pos_ciclo_actual`.
PROHIBIDO ESCRIBIR: `pos_cig_subcaja`, `pos_tickets_log` (lo hace el NÚCLEO), `pos_products` directamente (usar `actualizarStock()` del NÚCLEO).

VISUAL
Referencia: MAQUETA_CAJA_ABIERTA.html - MAQUETA_CAJA_CERRADA.html (.html adjunta al ejecutar este ANEXO).
Estética minimalista blanca (definida en `core.css`).
Reglas de comportamiento:
- Layout 2 columnas: izquierda (escáner + tabla ticket con scroll interno), derecha fija (Venta Rápida + SUELTO + Total + COBRAR + REIMPRIMIR/PAQUETE).
- Topbar: botón único con estado [ABRIR CAJA] / [CERRAR CAJA] + badge de estado.
- Modales: Apertura, Cierre, Cobro, Post-cobro (preview), Búsqueda, Paquetes, Sueltos, Ver Cierres del Día.
- Desviación de la maqueta = devolución.

COMPORTAMIENTO (Reglas de negocio)
- CAJA CERRADA: cargar ítems SÍ, cobrar NO (modal de aviso). REIMPRIMIR y PAQUETE deshabilitados.
- CAJA ABIERTA: cobrar habilitado. Split automático de cigarrillos.
- APERTURA DE CAJA: Al confirmar el monto inicial, se invoca `NUCLEO.iniciarCiclo(montoApertura, userId)` que crea la clave `pos_ciclo_actual`.
- CIERRE A CIEGAS: modal no muestra montos esperados hasta ingresar el contado real.
- CIERRE DE CAJA: Al confirmar el arqueo final, se invoca `NUCLEO.finalizarCiclo(datosArqueo)` que consolida los datos en `pos_cierres` y elimina `pos_ciclo_actual`.
- ARQUEO INDEPENDIENTE: cajón principal y sub-caja no se mezclan en papel.
- POST-COBRO: con `autoPrintTicket = SÍ` (leído de `pos_config`) imprime directo; con `= NO` muestra modal con preview + [IMPRIMIR] + [NUEVA VENTA]. Atajos: F1/ESC.
- TICKETS CARGADOS AL CERRAR: aviso, quedan en el carrito.
- AUTOGUARDADO DE CARRITO: cada cambio en el carrito (agregar/quitar ítem) invoca `NUCLEO.guardarTicketDraft(carrito)`, que persiste en `pos_ticket_draft`. Al cargar la app, `NUCLEO.getTicketDraft()` restaura el carrito si existe. Se limpia al confirmar el cobro o al usar [NUEVA VENTA].
- TRAZABILIDAD (responsabilidad/auditoría): al confirmar el COBRO, la venta se guarda en `pos_sales` con `userId: NUCLEO.getUsuarioActivo().id`. Al confirmar el CIERRE (arqueo), el registro en `pos_cierres` guarda `userId` del usuario que lo confirmó. `guardarTicket(sale)` hereda el mismo `userId` desde `sale`, quedando también en `pos_tickets_log`. Si no hay usuario logueado (login todavía no obligatorio en una instalación), se guarda `userId: null` sin bloquear la operación.

BOTONES RÁPIDOS (Venta Rápida)
Los botones rápidos pueden estar vinculados a un producto real de INVENTARIO (campo `linkedProductCode` en `pos_quick_buttons`).
- Si el botón tiene `linkedProductCode`: descuenta stock del producto real, usa el precio del botón como override (si está definido) o el precio del producto, tiene vencimiento, todo normal.
- Si el botón NO tiene `linkedProductCode`: se comporta como venta suelta (no descuenta stock, no tiene vencimiento). Útil para "Bolsa", "Propina", "Recargo" o "Caramelos sueltos".
Al hacer click en un botón rápido:
- Si tiene `linkedProductCode` → buscar producto por código en `pos_products` → agregar al ticket.
- Si NO tiene `linkedProductCode` → crear producto dummy con código `RAP-{nombre}` → agregar al ticket.
NOTA CRÍTICA: El "producto dummy" es un concepto temporal que vive EXCLUSIVAMENTE en memoria y en el ticket en curso. NO se persiste en `pos_products` ni en el inventario.

INTEGRACIÓN
Emite eventos: `pos:cierreRealizado` (payload: `{ cicloId, fecha }`), se dispara EXCLUSIVAMENTE al confirmar el arqueo final y guardar el cierre en `pos_cierres`. AUTOMATIZACIÓN escucha este evento para evaluar alertas de caja chica.
Escucha eventos: `pos:estadoCaja` (para refrescar estado de botones COBRAR/REIMPRIMIR/PAQUETE).
Llama funciones del Núcleo: `abrirPaquete`, `venderSuelto`, `registrarVentaPaqueteCigarrillos`, `registrarVentaSueltoCigarrillos`, `getEstadoCaja`, `getCicloAbierto`, `getCierresHoy`, `getVentasDelCiclo`, `getVentasPorMetodo`, `getVentasEnPerdida`, `getVentasSubCajaDelCiclo`, `guardarTicket`, `printTicket`, `getTicketHTML`, `alertaGuardadoFallido`, `getTicketsHoy`, `actualizarStock`, `guardarTicketDraft`, `getTicketDraft`, `getUsuarioActivo`, `iniciarCiclo`, `finalizarCiclo`.

CSS
PROPIO: `.caja-*`, `.modal-charge-*` (nota: `.modal-charge-*` es una extensión permitida para estilizar el contenido interno de los modales de cobro, sin violar la base `.modal-*` de `core.css`).
CONGELADO: todo lo demás de `core.css`.

TICKETS (BLINDADO)
- Ticket Venta: NUNCA imprime cigarrillos.
- Ticket Cierre General: SOLO arqueo del cajón principal. PROHIBIDO mencionar sub-caja.
- Ticket Sub-Caja: SOLO si política `printSubCajaTicketOnClose = SÍ`. Detalle paquetes/sueltos + total.
- Reimpresión: desde modal "Ver Cierres del Día".

CHECKLIST DE REGRESIÓN
[ ] Escanear + cobrar → stock descuenta, ticket sin cigarrillos.
[ ] Vender cigarrillos → sub-caja, no ticket oficial.
[ ] Cerrar → Ticket General sin mención a sub-caja.
[ ] Cerrar → Ticket Sub-Caja si política = SÍ.
[ ] Reimprimir cierre histórico → reimprime ambos tickets si corresponde.
[ ] F5 con carrito → se restaura.
[ ] Escritura falla → alerta dura (modal).
[ ] POST-COBRO → F1 imprime, ESC limpia.
[ ] Botón rápido con `linkedProductCode` → descuenta stock del producto real.
[ ] Botón rápido sin `linkedProductCode` → no descuenta stock (venta suelta), NO se persiste en `pos_products`.
[ ] Modal de Apertura → invoca `iniciarCiclo` y crea `pos_ciclo_actual`.
[ ] Modal de Cierre → usa `getCicloAbierto`, `getVentasPorMetodo` y `getVentasEnPerdida` para calcular los totales esperados.
[ ] Confirmar Cierre → invoca `finalizarCiclo`, guarda en `pos_cierres`, elimina `pos_ciclo_actual` y emite evento `pos:cierreRealizado`.
[ ] Cobrar venta → `pos_sales` guarda `userId` del usuario logueado activo.
[ ] Confirmar cierre → `pos_cierres` guarda `userId` de quien lo confirmó.
[ ] ESC → vuelve a CAJA desde cualquier vista o cierra modales.

RESTRICCIONES NEGATIVAS
- NO crear solapa de CIERRE.
- NO mostrar montos en topbar.
- NO escribir en `pos_cig_subcaja` ni `pos_tickets_log`.
- NO escribir en `pos_products` (ni siquiera para botones rápidos dummy; los dummy viven en memoria/ticket).
- NO mezclar arqueo de sub-caja en Ticket General.
- NO abrir diálogo de impresión sin acción del usuario.
- NO usar librerías externas.
- NO leer `pos_min_margins` (no es responsabilidad de CAJA evaluar márgenes).

BLINDAJE VISUAL
NAMESPACING: `.caja-*`, `.modal-charge-*`. PROHIBIDO `.inv-*`, `.config-*`, `.rep-*`, `.compras-*`, `.fin-*`, `.alert-*`.
CORE.CSS: PROHIBIDO modificar.
LAYOUT: `height: 100%` de `#moduleContainer`. PROHIBIDO `calc(100vh - Xpx)`.
TOPBAR: se genera dinámicamente. PROHIBIDO tocar el HTML.
ESTÉTICA: minimalista blanca. Referencia: MAQUETA_CAJA.

APARCADO
Historial de cierres anteriores (navegable desde CAJA; hoy solo accesible vía modal "Ver Cierres del Día").