ANEXO C — NÚCLEO (CONGELADO)
1. PROPÓSITO
Ser el "sistema operativo" del POS: cargar módulos, dar servicios compartidos, ser dueño del esquema de datos (SCHEMA) y del sistema de diseño. Provee el bus de eventos y las funciones de escritura controlada para que otros módulos no rompan la integridad de los datos.

2. CONTRATO DE DATOS
ESCRIBE (escritor único físico): `pos_cig_subcaja`, `pos_tickets_log`, `pos_stock_movements`.
ESCRIBE (vía servicio exclusivo para terceros): `pos_alerts_log` (AUTOMATIZACIÓN lo usa vía `registrarAlerta()` y `marcarAlertaLeida()`), `pos_products.category` (CONFIG lo usa vía `renombrarCategoria()`), `pos_config_audit_log` (CONFIG lo usa vía `registrarCambioConfig()`, invocado en cada guardado instantáneo de sus 9 vistas de datos).
ESCRIBE (inicialización / SCHEMA maestro): Crea las siguientes claves vacías o con defaults al primer arranque:
`pos_products`, `pos_sales`, `pos_config`, `pos_quick_buttons`, `pos_min_margins`, `pos_subcajas`, `pos_cierres`, `pos_ciclo_actual`, `pos_categories`, `pos_moneda`, `pos_ticket_draft`, `pos_last_backup_ts`, `pos_suppliers`, `pos_business`, `pos_peripherals`, `pos_users`, `pos_purchase_orders`, `pos_invoices`, `pos_finanzas_gastos`, `pos_finanzas_capital`, `pos_finanzas_reservas`, `pos_alerts_log`, `pos_cig_subcaja`, `pos_tickets_log`, `pos_stock_movements`, `pos_config_audit_log`.
LEE: todas las claves `pos_*`.
PROHIBIDO ESCRIBIR (durante operación normal): `pos_products` (lo hace INVENTARIO/COMPRAS), `pos_sales` (lo hace CAJA), `pos_cierres` (lo hace CIERRE), `pos_config`, `pos_quick_buttons`, `pos_subcajas`, `pos_moneda`, `pos_categories`, `pos_min_margins`, `pos_suppliers`, `pos_business`, `pos_peripherals`, `pos_users`, `pos_purchase_orders`, `pos_invoices`, `pos_finanzas_*` (lo hacen sus módulos dueños).
ESCRIBE (servicios runtime de dominio): `pos_products.stock`, `pos_products.cost` (SOLO vía `actualizarStock()` y `actualizarCostoProducto()`).

NOTA DE TRAZABILIDAD (transversal): toda escritura que registre una acción del usuario (venta, cierre, pedido, factura, gasto, reserva, movimiento de capital, movimiento de stock, cambio de costo, alerta marcada como leída, cambio de configuración) DEBE incluir el `userId` obtenido de `NUCLEO.getUsuarioActivo()` en el momento de guardar. Esta regla aplica a todos los módulos (A, B, D, E, G, H) y se detalla en el contrato de datos de cada uno.

3. VISUAL
Referencia: La barra superior es el único elemento visual del Núcleo.
- Icono de campana 🔔 (slot fijo entre las solapas y el badge de estado; el NÚCLEO solo reserva el espacio en el DOM, AUTOMATIZACIÓN inyecta contenido y lógica, sin tocar el resto de la topbar).
- Container: `#moduleContainer` calcula la altura correcta (100vh menos topbar real).
- Estética: minimalista blanca (definida en `core.css`).
- PROHIBIDO: mostrar "Cajero", "Total turno" o botón de engranaje (⚙) en la topbar.

COMPORTAMIENTO (Reglas de negocio)
4.1 Arranque y registro de módulos
- `registerModule(id, module)`: registra un módulo y actualiza las solapas automáticamente.
- `showTab(id)`: muestra el HTML del módulo en `#moduleContainer`, llama a `init()` y `onShow()`.
- Las solapas se generan dinámicamente desde los módulos registrados. Un módulo con `noTab: true` no aparece en la topbar (ej: AUTOMATIZACIÓN, que solo inyecta el ícono de campana). CIERRE no es un módulo registrado aparte: es funcionalidad interna de CAJA (ver ANEXO A §1).

4.2 Storage y esquema
- `getData(key)` / `setData(key, value)`: acceso a LocalStorage con manejo de errores.
- `setData` retorna `true` / `false` según éxito.
- `getData` distingue "clave inexistente" (silencioso, retorna default del SCHEMA) de "JSON corrupto" (alerta dura).
- SCHEMA define las claves y sus valores por defecto al primer arranque (ver §2 para la lista exhaustiva).

4.3 Utilidades
- `$`, `$$`: selectores DOM.
- `uid()`: identificador único.
- `today()`, `nowISO()`: fechas.
- `money(amount)`: formatea con símbolo de moneda (lee `pos_moneda`).
- `roundCurrency(num)`: redondea al múltiplo configurado (lee `pos_moneda.roundMultiple`).
- `normText()`, `normCategory()`: normalización de strings.
- `esc()`: escape HTML.
- `toast()`: notificaciones temporales.
- `exportCSV()`, `exportJSON()`: exportación de datos.

4.4 Dominio (lógica fija de negocio y servicios de escritura)
- Cigarrillos:
  - `abrirPaquete(marca)`: atado −1, sueltos +20, asiento en `pos_cig_subcaja`.
  - `venderSuelto(marca)`: suelto −1, asiento en `pos_cig_subcaja`.
  - `registrarVentaPaqueteCigarrillos(item, cicloId, method)`: asiento de venta de paquete.
  - `registrarVentaSueltoCigarrillos(item, cicloId, method)`: asiento de venta suelta.
  - `setProductCigConfig(code, ventaSuelta, priceLoose)`: escribe `ventaSuelta` / `priceLoose` en `pos_products`.
  - `cuadreSubCajaPorMarca(marca, cicloId)`: calcula aperturas × 20 − vendidos vs stock real.
- Categorías:
  - `renombrarCategoria(oldName, newName)`: busca todos los productos en `pos_products` con `category === oldName` y los actualiza a `newName`. (Servicio exclusivo para CONFIG).
- Moneda: `roundCurrency()` lee `pos_moneda.roundMultiple`.
- Pérdida y Márgenes:
  - `checkLoss(price, cost, category)` → RETORNA un booleano/valor. NO PERSISTE NADA en el storage. Cigarrillos son EXCLUIDOS (pérdida real = precio < costo); resto evalúa contra `pos_min_margins[category]` (o default 35%).
- Stock y costo:
  - `actualizarStock(code, delta, motivo, userId)`: suma/resta stock del producto; valida no-negativo; motivo ∈ {'venta','recepcion','ajuste'}. Además de escribir `pos_products.stock`, agrega una entrada a `pos_stock_movements` con `{id, code, delta, motivo, stockAnterior, stockNuevo, fecha, userId}` (escritor único físico: NÚCLEO).
  - `actualizarCostoProducto(code, nuevoCosto, userId)`: escribe `cost` en `pos_products` y garantiza la trazabilidad del `userId` que realizó el cambio.
- Alertas:
  - `registrarAlerta(alertaObj)`: escribe el objeto en `pos_alerts_log`. (Servicio exclusivo para AUTOMATIZACIÓN, garantiza que el formato y el timestamp sean correctos).
  - `marcarAlertaLeida(alertaId, userId)`: actualiza la alerta en `pos_alerts_log` con `leida: true` y `leidaPor: userId`. (Servicio exclusivo para AUTOMATIZACIÓN; nunca se edita `pos_alerts_log` a mano).
- Auditoría de configuración:
  - `registrarCambioConfig({modulo, seccion, campo, valorAnterior, valorNuevo, userId})`: agrega una entrada con `fecha` autogenerada a `pos_config_audit_log`. (Servicio exclusivo para CONFIG; se invoca en CADA guardado instantáneo de sus 9 vistas de datos, además de la escritura normal de la clave correspondiente).

4.5 Servicios de CIERRE
- `iniciarCiclo(montoApertura, userId)`: crea el objeto único `pos_ciclo_actual` con `{id, fechaApertura, montoApertura, userId}`.
- `finalizarCiclo(datosArqueo)`: consolida los datos del ciclo en un nuevo registro de `pos_cierres` y elimina/vacía `pos_ciclo_actual`.
- `getEstadoCaja()`: retorna 'ABIERTA' o 'CERRADA' (basado en la existencia de `pos_ciclo_actual`).
- `getCicloAbierto()`: retorna el objeto `pos_ciclo_actual` o null.
- `getCierresHoy()`: ciclos del día en curso (desde `pos_cierres`).
- `getVentasDelCiclo(cicloId)`: ventas filtradas por ciclo.
- `getVentasPorMetodo(cicloId)`: totales agrupados por método de pago.
- `getVentasEnPerdida(cicloId)`: usa costo histórico de la línea.
- `getVentasSubCajaDelCiclo(cicloId)`: SOLO suma movimientos con `method === 'cash'`.

4.6 Servicios de tickets
- `guardarTicket(sale)`: escribe en `pos_tickets_log`.
- `getTicketsHoy()`: tickets del día en curso.
- `getTicketHTML(sale)`: genera HTML del ticket oficial (SIEMPRE filtra cigarrillos).
- `printTicket(sale)`: imprime vía iframe oculto.
- `guardarTicketDraft(carrito)`: escribe el carrito en curso en `pos_ticket_draft` (autoguardado para sobrevivir F5).
- `getTicketDraft()`: retorna el carrito guardado en `pos_ticket_draft`, o `null` si no hay borrador.

4.7 Seguridad y Diagnósticos
- `backupJSON()`: descarga todas las claves `pos_*` en JSON. Registra `pos_last_backup_ts`.
- `shouldRemindBackup()`: retorna true si pasaron 3+ días desde el último backup.
- `runChecks()`: diagnósticos de integridad de datos.
- `alertaGuardadoFallido(mensaje)`: modal duro si falla un guardado crítico.
- `alertaDatoCorrupto(key)`: alerta si se detecta JSON corrupto.

4.8 Barra superior (topbar)
- Marca "NEURORA POS" (izquierda).
- Solapas dinámicas (generadas por `renderTabs()`).
- Badge de estado de caja (clickeable → abre "Ver Cierres del Día").
- Botón [ABRIR/CERRAR CAJA].
- Emite evento `pos:estadoCaja` al abrir/cerrar caja.
- Muestra el usuario logueado (reemplaza el antiguo placeholder "Cajero: N/A"), leído de la sesión activa.

4.9 Bus de eventos
- `emit(nombreEvento, payload)`: dispara evento a todos los listeners registrados.
- `on(nombreEvento, callback)`: registra listener de un módulo.
- NOTA: El Núcleo provee el bus. Los módulos (ej: COMPRAS) usan `NUCLEO.emit('pos:facturaRecibida', payload)` directamente. El Núcleo NO hace "relay" ni re-emite eventos de negocio de otros módulos.

4.10 Servicios de sesión (runtime de login)
- `validarLogin(userId, pin)`: verifica PIN contra `pos_users`.
- `getUsuarioActivo()`: retorna el usuario logueado en la sesión actual.
- `cerrarSesion()`: limpia la sesión activa.
- PERSISTENCIA: La sesión del usuario logueado persiste ante recargas de página (F5) utilizando `sessionStorage` del navegador, evitando re-login innecesarios mientras la pestaña siga abierta. El ABM de usuarios es EXCLUSIVO de CONFIG.

5. INTEGRACIÓN
Escucha eventos: (Ninguno a nivel de negocio, solo procesa los que él mismo emite como `pos:estadoCaja`).
Da servicios a: CAJA, INVENTARIO, CONFIG, CIERRE, COMPRAS, FINANZAS, REPORTES, AUTOMATIZACIÓN.
Recibe de: CONFIG (políticas de sub-caja, moneda, categorías, márgenes).
Emite eventos propios: `pos:estadoCaja`. (Provee el bus `emit()` para que los demás módulos emitan los suyos).

6. CSS
PROPIO: `.top-bar`, `.brand`, `.tabs`, `.tab`, `.box-status`, `#moduleContainer`, `.btn`, `.badge`, `.modal-*`, `.toast-*`.
CONGELADO: todo lo definido en `core.css`.

7. CHECKLIST DE REGRESIÓN
[ ] Arranque limpio → TODAS las claves `pos_*` del SCHEMA (§2), incluidas `pos_ciclo_actual`, `pos_cig_subcaja` y `pos_tickets_log`, existen con valores por defecto (arrays vacíos `[]` u objetos `{}`).
[ ] `registerModule()` → aparece solapa nueva en la topbar automáticamente.
[ ] `showTab()` → muestra HTML del módulo, llama a `init()` y `onShow()`.
[ ] `getData()` con clave inexistente → retorna default del SCHEMA (silencioso).
[ ] `getData()` con JSON corrupto → dispara alerta dura (una sola vez por clave).
[ ] `setData()` falla → retorna false, no explota.
[ ] `roundCurrency()` → redondea al múltiplo de `pos_moneda.roundMultiple`.
[ ] `abrirPaquete()` → atado −1, sueltos +20, asiento en `pos_cig_subcaja`.
[ ] `venderSuelto()` → suelto −1, asiento en `pos_cig_subcaja`.
[ ] `getVentasSubCajaDelCiclo()` → SOLO suma movimientos con `method === 'cash'`.
[ ] `getTicketHTML()` → NUNCA incluye cigarrillos en el ticket oficial.
[ ] `backupJSON()` → descarga JSON con todas las claves, registra `pos_last_backup_ts`.
[ ] Topbar → badge clickeable abre "Ver Cierres del Día".
[ ] Topbar → botón [ABRIR/CERRAR CAJA] dispara funciones de CIERRE.
[ ] Topbar → emite evento `pos:estadoCaja` al abrir/cerrar.
[ ] `actualizarStock()` → no permite stock negativo.
[ ] `actualizarStock()` → cada llamada agrega una entrada a `pos_stock_movements` con `userId` de la sesión activa.
[ ] `actualizarCostoProducto(code, nuevoCosto, userId)` → actualiza `cost` y garantiza la trazabilidad del `userId`, usa `checkLoss()` solo para retornar estado, sin persistir alertas por sí mismo.
[ ] `renombrarCategoria(old, new)` → actualiza `pos_products.category` en todos los productos afectados.
[ ] `registrarAlerta(obj)` → persiste correctamente en `pos_alerts_log` con timestamp.
[ ] `marcarAlertaLeida(id, userId)` → actualiza `leida: true` y `leidaPor: userId` en `pos_alerts_log`.
[ ] `registrarCambioConfig(obj)` → persiste en `pos_config_audit_log` con `fecha` y `userId`; CONFIG lo invoca en cada guardado instantáneo.
[ ] `iniciarCiclo(monto, userId)` → crea `pos_ciclo_actual`.
[ ] `finalizarCiclo(datos)` → mueve datos a `pos_cierres` y limpia `pos_ciclo_actual`.
[ ] `guardarTicketDraft(carrito)` / `getTicketDraft()` → F5 con carrito cargado en CAJA restaura el mismo carrito desde `pos_ticket_draft`.
[ ] Ninguna venta, cierre, pedido, factura, gasto, reserva, aporte/retiro, movimiento de stock o cambio de costo se persiste sin un `userId` válido de `getUsuarioActivo()`.
[ ] Topbar → renderiza el slot de campana 🔔 vacío incluso sin el módulo AUTOMATIZACIÓN cargado.
[ ] F5 en el navegador → mantiene la sesión del usuario logueado (no pide re-login).

8. RESTRICCIONES NEGATIVAS
- NO tener solapa propia en la topbar.
- NO mostrar "Cajero" ni "Total turno" en la topbar.
- NO mostrar botón de engranaje (⚙) en la topbar.
- NO escribir en claves de negocio (`pos_products`, `pos_sales`, `pos_suppliers`, `pos_finanzas_*`, etc.) durante operación normal, EXCEPTO a través de los servicios de dominio explícitos (`actualizarStock`, `actualizarCostoProducto`, `renombrarCategoria`, `registrarAlerta`, etc.).
- NO incluir cigarrillos en `getTicketHTML()`.
- NO usar librerías externas ni frameworks.
- NO modificar la topbar manualmente.
- NO tener semilla fija de categorías (las categorías se inicializan vacías y se gestionan desde CONFIG).
- NO hacer "relay" o re-emisión de eventos de negocio de otros módulos.
- NO permitir que `actualizarStock()`, `actualizarCostoProducto()`, `registrarAlerta()`, `marcarAlertaLeida()` o `registrarCambioConfig()` persistan una entrada sin `userId` (usar `'sistema'` como valor explícito SOLO para procesos automáticos sin sesión, ej. alertas periódicas de AUTOMATIZACIÓN o reservas automáticas de FINANZAS).

9. BLINDAJE VISUAL
- TOPBAR: se genera dinámicamente desde `renderTabs()`. PROHIBIDO tocar el HTML.
- CONTAINER: `#moduleContainer` calcula la altura correcta. Los módulos usan `height: 100%`. PROHIBIDO `calc(100vh - Xpx)`.
- CORE.CSS: define toda la estética global. Los módulos NO pueden modificar `core.css`.
- ESTÉTICA: minimalista blanca (definida en `core.css`).

10. APARCADO
- Multi-caja en red (eventos en tiempo real entre terminales).
- Migración a SQLite (reemplazo de LocalStorage).