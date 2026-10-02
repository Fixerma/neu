## SPEC MAESTRO — SISTEMA POS "NEURORA POS"
Documento de especificación consolidado para ejecución por IA
Versión: 1.1 — Consolidado y corregido (Auditoría de consistencia resuelta)

0. CÓMO USAR ESTE DOCUMENTO
Este SPEC consolida los 8 anexos funcionales del proyecto en un único documento de referencia. Está pensado para entregarse a una IA (o equipo de desarrollo) como fuente única de verdad antes de ejecutar la construcción del sistema, módulo por módulo.
Regla de oro: los anexos están CONGELADOS. Ninguna implementación puede desviarse de las reglas de negocio, contratos de datos o blindajes visuales aquí descritos sin que eso se considere una regresión. "Desviación de la maqueta = devolución" aplica a todos los módulos con referencia visual.
Orden de lectura recomendado para la IA ejecutora:
1. Leer este SPEC completo antes de tocar código.
2. Implementar el NÚCLEO primero (es la base de todo: storage, bus de eventos, servicios de escritura, topbar).
3. Implementar CAJA (módulo operativo diario, valida el ciclo completo de venta).
4. Implementar INVENTARIO, CONFIG (dependencias mutuas fuertes con CAJA).
5. Implementar COMPRAS, FINANZAS (dependen de CONFIG/NÚCLEO).
6. Implementar AUTOMATIZACIÓN y REPORTES al final (son transversales/consumidores, no generan datos propios críticos).
7. Validar contra los checklists de regresión de cada anexo (§7 de cada uno) antes de dar por cerrado un módulo.

1. VISIÓN GENERAL DEL SISTEMA
Nombre del producto: NEURORA POS
Tipo: Punto de venta (POS) para kiosco/almacén, con foco especial en venta de cigarrillos (paquete/suelto con sub-caja independiente), control financiero del dueño, compras a proveedores y automatización de alertas.
Arquitectura general:
- Un NÚCLEO (ANEXO C) actúa como "sistema operativo": dueño del schema de datos, del bus de eventos, de los servicios de escritura controlada, y del sistema de diseño (`core.css`).
- Módulos de negocio se registran contra el núcleo vía `registerModule()` y aparecen como solapas en la topbar (excepto AUTOMATIZACIÓN, que es `noTab: true` y solo inyecta un ícono de campana).
- Storage: LocalStorage del navegador, con claves `pos_*`. No hay backend/base de datos (SQLite está APARCADO para el futuro).
- Sin librerías externas ni frameworks en ningún módulo. JS vanilla.
- Estética: minimalista blanca, definida centralmente en `core.css`. Cada módulo tiene su propio namespace CSS y tiene PROHIBIDO tocar `core.css` o el namespace de otro módulo.
- Multi-caja en red y migración a SQLite: APARCADOS (fuera de alcance actual).
Los 8 módulos:
| Anexo | Módulo | Tipo | Tiene solapa propia |
|---|---|---|---|
| C | NÚCLEO | Infraestructura / servicios | No (solo topbar base) |
| A | CAJA + CIERRE | Operativo diario | Sí (CIERRE vive dentro de CAJA, sin solapa propia) |
| B | INVENTARIO | Gestión de stock/precios | Sí |
| D | CONFIG | Configuración del sistema | Sí |
| E | FINANZAS | Control de flujo de dinero | Sí |
| F | REPORTES | Solo lectura / tablero del dueño | Sí |
| G | COMPRAS | Proveedores, pedidos, facturas | Sí |
| H | AUTOMATIZACIÓN | Motor de alertas transversal | No (solo ícono 🔔 en topbar) |

2. MODELO DE DATOS GLOBAL (SCHEMA)
El NÚCLEO es responsable de inicializar todas estas claves vacías o con default al primer arranque. Ningún otro módulo inicializa storage.
| Clave | Escritor físico único | Quién más puede escribir (vía servicio) |
|---|---|---|
| pos_products | INVENTARIO | stock y cost → NÚCLEO (`actualizarStock`, `actualizarCostoProducto`, llamados por INVENTARIO o COMPRAS); category → NÚCLEO (`renombrarCategoria`, llamado por CONFIG); ventaSuelta / priceLoose → NÚCLEO (`setProductCigConfig`, llamado por CONFIG) |
| pos_sales | CAJA | — |
| pos_config | CONFIG (autoPrintTicket) | — |
| pos_quick_buttons | CONFIG | — |
| pos_min_margins | CONFIG | — |
| pos_subcajas | CONFIG | — |
| pos_cierres | CAJA (funcionalidad CIERRE, vía servicio del NÚCLEO `finalizarCiclo`) | — |
| pos_ciclo_actual | NÚCLEO (vía servicios de CIERRE invocados por CAJA) | — |
| pos_categories | CONFIG | — |
| pos_moneda | CONFIG | — |
| pos_ticket_draft | NÚCLEO (servicio guardarTicketDraft, invocado por CAJA) | — |
| pos_last_backup_ts | NÚCLEO (backupJSON) | — |
| pos_suppliers | CONFIG | — |
| pos_business | CONFIG | — |
| pos_peripherals | CONFIG | — |
| pos_users | CONFIG | — |
| pos_purchase_orders | COMPRAS | — |
| pos_invoices | COMPRAS | — |
| pos_finanzas_gastos | FINANZAS | — |
| pos_finanzas_capital | FINANZAS | — |
| pos_finanzas_reservas | FINANZAS | — |
| pos_alerts_log | NÚCLEO (servicio exclusivo registrarAlerta / marcarAlertaLeida, invocado por AUTOMATIZACIÓN) | — |
| pos_cig_subcaja | NÚCLEO | — |
| pos_tickets_log | NÚCLEO (guardarTicket) | — |
| pos_stock_movements | NÚCLEO (generado automáticamente dentro de actualizarStock()) | — |
| pos_config_audit_log | NÚCLEO (servicio exclusivo registrarCambioConfig, invocado por CONFIG en cada guardado instantáneo) | — |

Regla de trazabilidad transversal (aplica a A, B, D, E, G, H): toda escritura que registre una acción de usuario (venta, cierre, pedido, factura, gasto, reserva, movimiento de capital, movimiento de stock, cambio de costo, alerta marcada como leída, cambio de configuración) DEBE incluir el `userId` obtenido de `NUCLEO.getUsuarioActivo()` en el momento de guardar. Procesos automáticos sin sesión usan `userId: 'sistema'` explícito. Si no hay usuario logueado en una instalación donde el login todavía no es obligatorio, se guarda `userId: null` sin bloquear la operación (excepción documentada en CAJA, válida solo antes de implementar CONFIG).

3. NÚCLEO (ANEXO C) — LA BASE
3.1 Propósito
"Sistema operativo" del POS: carga de módulos, servicios compartidos, dueño del SCHEMA y del sistema de diseño. Provee el bus de eventos y las funciones de escritura controlada.
3.2 API pública que debe exponer (servicios)
- Storage: `getData(key)`, `setData(key, value)` → boolean.
- Utilidades: `$`, `$$`, `uid()`, `today()`, `nowISO()`, `money(amount)`, `roundCurrency(num)`, `normText()`, `normCategory()`, `esc()`, `toast()`, `exportCSV()`, `exportJSON()`.
- Dominio — Cigarrillos: `abrirPaquete(marca)`, `venderSuelto(marca)`, `registrarVentaPaqueteCigarrillos()`, `registrarVentaSueltoCigarrillos()`, `setProductCigConfig(code, ventaSuelta, priceLoose)`, `cuadreSubCajaPorMarca(marca, cicloId)`.
- Dominio — Categorías: `renombrarCategoria(oldName, newName)` (exclusivo CONFIG).
- Dominio — Márgenes/Pérdida: `checkLoss(price, cost, category)` → retorna estado, NO persiste. Cigarrillos excluidos del cálculo estándar.
- Dominio — Stock/Costo: `actualizarStock(code, delta, motivo, userId)` (motivo ∈ venta/recepcion/ajuste; valida no-negativo; genera entrada en `pos_stock_movements`), `actualizarCostoProducto(code, nuevoCosto, userId)` (actualiza costo y garantiza trazabilidad del usuario).
- Dominio — Alertas: `registrarAlerta(alertaObj)`, `marcarAlertaLeida(alertaId, userId)` (ambos exclusivos de AUTOMATIZACIÓN).
- Dominio — Auditoría config: `registrarCambioConfig({modulo, seccion, campo, valorAnterior, valorNuevo, userId})` (exclusivo CONFIG).
- Servicios de CIERRE: `iniciarCiclo(montoApertura, userId)` (crea `pos_ciclo_actual`), `finalizarCiclo(datosArqueo)` (consolida en `pos_cierres` y limpia `pos_ciclo_actual`), `getEstadoCaja()`, `getCicloAbierto()`, `getCierresHoy()`, `getVentasDelCiclo(cicloId)`, `getVentasPorMetodo(cicloId)`, `getVentasEnPerdida(cicloId)`, `getVentasSubCajaDelCiclo(cicloId)` (SOLO suma `method === 'cash'`).
- Servicios de tickets: `guardarTicket(sale)`, `getTicketsHoy()`, `getTicketHTML(sale)` (SIEMPRE filtra cigarrillos), `printTicket(sale)`, `guardarTicketDraft(carrito)`, `getTicketDraft()`.
- Seguridad/Diagnóstico: `backupJSON()`, `shouldRemindBackup()` (3+ días), `runChecks()`, `alertaGuardadoFallido()`, `alertaDatoCorrupto()`.
- Sesión: `validarLogin(userId, pin)`, `getUsuarioActivo()`, `cerrarSesion()`. Persiste en `sessionStorage`.
- Bus de eventos: `emit(nombreEvento, payload)`, `on(nombreEvento, callback)`. El núcleo NO re-emite eventos de negocio de otros módulos.
- Registro de módulos: `registerModule(id, module)`, `showTab(id)`.

3.3 Topbar (único elemento visual propio del núcleo)
- Marca "NEURORA POS" a la izquierda.
- Solapas dinámicas generadas por `renderTabs()` — PROHIBIDO tocar el HTML manualmente.
- Slot fijo para ícono de campana 🔔 (el núcleo solo reserva el espacio; AUTOMATIZACIÓN inyecta contenido).
- Badge de estado de caja (clickeable → "Ver Cierres del Día").
- Botón [ABRIR/CERRAR CAJA].
- Usuario logueado visible.
- PROHIBIDO: mostrar "Cajero", "Total turno" o botón de engranaje (⚙).
- `#moduleContainer` calcula altura real (100vh − topbar). Módulos usan `height: 100%`, nunca `calc(100vh - Xpx)`.

3.4 Restricciones negativas clave
- No escribe en claves de negocio salvo vía los servicios de dominio explícitos.
- No tiene solapa propia.
- No usa librerías externas.
- No tiene semilla fija de categorías (arrancan vacías; CONFIG las gestiona).

4. MÓDULO CAJA + CIERRE (ANEXO A)
4.1 Propósito
Ciclo completo de mostrador: abrir caja, cobrar (estándar + cigarrillos), cerrar con arqueo doble (general + sub-caja) a ciegas, manteniendo independencia física/contable entre cajón principal y sub-caja de cigarrillos.
Nota de arquitectura: CIERRE no es un módulo `registerModule()` separado; vive dentro de CAJA (modales de Apertura/Cierre/Ver Cierres del Día).
4.2 Contrato de datos
- ESCRIBE: `pos_sales`, `pos_cierres` (con `userId`).
- ESCRIBE vía servicio núcleo: `pos_ticket_draft`.
- LEE: `pos_products`, `pos_config`, `pos_quick_buttons`, `pos_subcajas`, `pos_cig_subcaja`, `pos_tickets_log`, `pos_ciclo_actual`.
- PROHIBIDO ESCRIBIR: `pos_cig_subcaja`, `pos_tickets_log`, `pos_products` directo.
4.3 Layout (MAQUETA_CAJA)
2 columnas: izquierda (escáner + tabla ticket, scroll interno), derecha fija (Venta Rápida + SUELTO + Total + COBRAR + REIMPRIMIR/PAQUETE). Modales: Apertura, Cierre, Cobro, Post-cobro, Búsqueda, Paquetes, Sueltos, Ver Cierres del Día.
4.4 Reglas de negocio críticas
- Caja cerrada: cargar ítems sí, cobrar no; REIMPRIMIR/PAQUETE deshabilitados.
- Caja abierta: cobrar habilitado, split automático de cigarrillos.
- Apertura de Caja: Al confirmar el monto inicial, se invoca `NUCLEO.iniciarCiclo(montoApertura, userId)` que crea la clave `pos_ciclo_actual`.
- Cierre a ciegas: no muestra montos esperados hasta ingresar el contado real.
- Cierre de Caja: Al confirmar el arqueo, se invoca `NUCLEO.finalizarCiclo(datosArqueo)` que mueve los datos a `pos_cierres` y elimina `pos_ciclo_actual`.
- Arqueo independiente: cajón principal y sub-caja nunca se mezclan en papel.
- Post-cobro: `autoPrintTicket=SÍ` → imprime directo; `=NO` → modal preview + [IMPRIMIR]/[NUEVA VENTA]. Atajos F1/ESC.
- Autoguardado de carrito en cada cambio (`guardarTicketDraft`), restaurado en `getTicketDraft()` al cargar la app; se limpia al cobrar o [NUEVA VENTA].
- Botones rápidos: si tienen `linkedProductCode` → descuentan stock real, tienen vencimiento; si NO tienen `linkedProductCode` → se crea un objeto dummy en memoria/ticket con código `RAP-{nombre}`. ESTE OBJETO NO SE PERSISTE EN `pos_products` ni en el inventario; es un concepto temporal exclusivo del ticket en curso.
4.5 Tickets (blindado)
- Ticket Venta: NUNCA incluye cigarrillos.
- Ticket Cierre General: SOLO cajón principal, PROHIBIDO mencionar sub-caja.
- Ticket Sub-Caja: solo si `printSubCajaTicketOnClose = SÍ`.
4.6 Eventos
- Emite: `pos:cierreRealizado` (`{cicloId, fecha}`) al confirmar arqueo final.
- Escucha: `pos:estadoCaja` (refresca botones).
4.7 CSS / Blindaje
- Namespace `.caja-*`, `.modal-charge-*` (nota: `.modal-charge-*` es una extensión permitida para estilizar el contenido interno de los modales de cobro, sin violar la base `.modal-*` de `core.css`).
- Prohibido tocar otros namespaces, topbar o `core.css`.

5. MÓDULO INVENTARIO (ANEXO B)
5.1 Propósito
Stock, precios y categorías con cargas rápidas; cigarrillos sin descuadre; vencimientos y faltantes visibles de un vistazo.
5.2 Contrato de datos
- ESCRIBE directo: `pos_products` (code, name, category, price, minStock, expiryDate, expiryWarnDays, noFiscal, active).
- ESCRIBE CONDICIONAL (solo vía servicios núcleo): `stock` → `actualizarStock(code, delta, 'ajuste', userId)`; `cost` → `actualizarCostoProducto(code, nuevoCosto, userId)`; `ventaSuelta`/`priceLoose` → `setProductCigConfig()`.
- LEE: `pos_categories`, `pos_stock_movements` (solo lectura, historial).
- PROHIBIDO ESCRIBIR: `pos_cig_subcaja`, `pos_sales`, `pos_cierres`.
5.3 Layout (MAQUETA_INVENTARIO)
2 columnas: izquierda (header + chips + tabla, único elemento con scroll = `tbody`), derecha fija (panel DETALLE/ALTA, no scrollea).
5.4 Reglas de negocio
- Margen: entrada directa; `P.VENTA = roundCurrency(costo × (1+m/100))`; editar precio recalcula margen y viceversa; ganancia neta en vivo.
- Aviso pérdida/margen bajo: invoca `checkLoss()` (no persiste), muestra badge [PÉRDIDA]/[MARGEN BAJO].
- Historial de movimientos: sub-sección colapsable, hasta 10 entradas de `pos_stock_movements` por `code` (fecha, delta, motivo, usuario), solo lectura.
- Mínimo por producto: stock ≤ mínimo → badge [CRIT].
- Vencimiento: badge [VENCIDO] o [VENCE DD/MM], aviso configurable en días.
- No fiscal: checkbox, sella la línea de venta.
- Venta suelta/despiece: NO editable acá (exclusivo CONFIG · Sub-Cajas); solo badge lectura [SUELTO X].
- Baja/Alta: único mecanismo para sacar producto de circulación (flag `active`, no borrado físico).
- CSV: importar (preview + merge por código), exportar filtro activo.
- Stock: botones +1/+5/+10 vía `actualizarStock`.
5.5 CSS / Blindaje
- Namespace `.inv-*`.

6. MÓDULO CONFIG (ANEXO D)
6.1 Propósito
Dueño de todas las configuraciones: Sub-Cajas, Categorías, Márgenes, Proveedores, Botones Rápidos, Moneda, Negocio, Periféricos, Usuarios, y Auditoría (10 secciones en sidebar).
6.2 Contrato de datos
- ESCRIBE: `pos_subcajas`, `pos_categories`, `pos_min_margins`, `pos_suppliers`, `pos_quick_buttons`, `pos_moneda`, `pos_business`, `pos_peripherals`, `pos_users`, `pos_config`.
- ESCRIBE CONDICIONAL (vía núcleo): `pos_products.category` (`renombrarCategoria`), `ventaSuelta`/`priceLoose` (`setProductCigConfig`).
- ESCRIBE vía servicio exclusivo: `pos_config_audit_log` (`registrarCambioConfig`).
- LEE: `pos_products`, `pos_purchase_orders`, `pos_invoices`, `pos_config_audit_log`.
6.3 REGLA TRANSVERSAL DE AUDITORÍA (crítica)
En las 9 vistas de datos (todas menos Auditoría), cada guardado instantáneo ejecuta dos escrituras en el mismo paso: (1) persiste en su clave `pos_*`, (2) invoca `NUCLEO.registrarCambioConfig({modulo:'CONFIG', seccion, campo, valorAnterior, valorNuevo, userId})`. Aplica también a altas/bajas.
6.4 Resumen por vista
- Sub-Cajas: política `printSubCajaTicketOnClose`; tabla `selectedBrands`.
- Categorías: ABM; renombrar invoca `renombrarCategoria()`; no se puede eliminar con productos asociados; "Cigarrillos" es intocable. NOTA DE PUESTA EN MARCHA: La categoría "Cigarrillos" no se crea automáticamente por el sistema. Su creación manual en esta vista es un paso obligatorio y previo para habilitar la lógica de sub-caja de cigarrillos en CAJA.
- Márgenes: margen mínimo por categoría (default 35%); "Cigarrillos" excluida (badge EXCLUIDO).
- Proveedores: ABM completo; baja lógica solamente; no eliminar si tiene pedidos/facturas asociadas.
- Botones Rápidos: nombre/precio/unidad + vínculo opcional a producto real; máx 21 botones.
- Moneda: ISO, símbolo, múltiplo de redondeo, denominaciones editables.
- Negocio: datos fiscales + preview del ticket.
- Periféricos: impresora, lector de códigos, cajón de dinero, `autoPrintTicket`. Banner de backup si `shouldRemindBackup()` es true.
- Usuarios: ABM (nombre, rol Admin/Cajero, PIN); no eliminar último Admin; login al abrir el sistema.
- Auditoría: SOLO LECTURA, fuente `pos_config_audit_log`, filtros por usuario/fecha/sección. No incluye ventas/cierres/stock/facturas.
6.5 CSS / Blindaje
- Namespace `.config-*`.

7. MÓDULO FINANZAS (ANEXO E)
7.1 Propósito
Controlar el flujo de dinero separando: Gastos (operación), Reservas (flujo futuro), Aportes/Retiros (patrimonio del dueño). Responde "¿de quién es la plata y para qué sirve?".
7.2 Contrato de datos
- ESCRIBE: `pos_finanzas_reservas`, `pos_finanzas_gastos`, `pos_finanzas_capital` (con `userId`, excepto reservas automáticas por `pos:facturaRecibida` que usan `'sistema'`).
- LEE: `pos_cierres`, `pos_ciclo_actual`, `pos_products`, `pos_suppliers`.
- PROHIBIDO ESCRIBIR: `pos_products`, `pos_sales`, `pos_cierres`, `pos_cig_subcaja`, `pos_tickets_log`, `pos_suppliers`, `pos_purchase_orders`.
7.3 Layout
Sidebar 240px (Dashboard · Reservas · Gastos · Patrimonio) + panel principal fluido.
7.4 Vistas
- Dashboard: KPIs Efectivo Total (montoApertura leído de `pos_ciclo_actual` + ventas efectivo del ciclo − subcaja cigarrillos; si no hay ciclo abierto, muestra 0), Efectivo Reservado (suma reservas `activa`), Efectivo Disponible (Total − Reservado); Próximos Vencimientos (≤3 días).
- Reservas: formulario; acciones EDITAR / PAGAR AHORA (crea gasto vinculado, reserva→`pagada`) / CANCELAR (→`cancelada`). Crear/editar reserva NO afecta ganancia.
- Gastos: formulario; SÍ afecta ganancia neta; eliminar gasto vinculado devuelve la reserva a `activa`.
- Patrimonio: formulario (tipo aporte/retiro, monto, fecha, detalle); KPI Saldo de Inversión Neta = Aportes + Ganancias Netas Acumuladas (de REPORTES) − Retiros. No afecta ganancia operativa.
7.5 Eventos
- Escucha `pos:facturaRecibida` → si `diasCredito > 0`, crea reserva automática (categoría "Proveedor", vencimiento = fecha + diasCredito, `userId:'sistema'`).
7.6 CSS / Blindaje
- Namespace `.fin-*`.

8. MÓDULO REPORTES (ANEXO F)
8.1 Propósito
Tablero del dueño, SOLO LECTURA y CÁLCULO: "¿cuánto vale mi negocio?", "¿cuánto gané realmente?", "¿cuánto de mi plata hay invertida?".
8.2 Contrato de datos
- ESCRIBE: nada.
- LEE: `pos_sales`, `pos_products`, `pos_finanzas_gastos`, `pos_finanzas_capital`.
8.3 Layout
Sidebar 240px (Rentabilidad · Patrimonio · Inventario) + panel principal.
8.4 Vistas
- Rentabilidad (P&L cascada): selector de período. Ventas Totales − CMV (costo histórico de línea, NUNCA costo actual) = Margen Bruto − Gastos Operativos = Ganancia Neta Operativa.
- Patrimonio: Inversión Neta Actual = Aportes (histórico) + Ganancias Netas Acumuladas (histórico) − Retiros (histórico).
- Inventario (valorización): Valor a Costo (`stock×cost` de activos), Valor a Precio de Venta (`stock×price`), Margen Potencial (diferencia). Top 5 productos con mayor valor inmovilizado.
8.5 Restricción clave
- CMV siempre usa el costo histórico guardado en la línea de venta al momento de vender, nunca el costo actual de `pos_products`.
8.6 CSS / Blindaje
- Namespace `.rep-*`.

9. MÓDULO COMPRAS (ANEXO G)
9.1 Propósito
Gestionar proveedores (en coordinación con CONFIG, que es dueño del ABM), generar pedidos (manuales o sugeridos), cargar facturas que actualizan stock y costo automáticamente.
9.2 Contrato de datos
- ESCRIBE: `pos_purchase_orders`, `pos_invoices` (con `userId`).
- LLAMA (no escribe directo): `actualizarStock()`, `actualizarCostoProducto(code, nuevoCosto, userId)`.
- LEE: `pos_products`, `pos_sales`, `pos_suppliers` (solo lectura), `pos_min_margins`.
- PROHIBIDO ESCRIBIR: `pos_sales`, `pos_cierres`, `pos_cig_subcaja`, `pos_tickets_log`, `pos_finanzas_*`, `pos_suppliers`.
9.3 Layout
Sidebar (Proveedores · Pedidos · Facturas) + panel principal.
9.4 Reglas de negocio
- Proveedores: vista de solo lectura/selección (ABM exclusivo de CONFIG). Si no existe el proveedor buscado → enlace [IR A CONFIG · PROVEEDORES]. Botón [VER HISTORIAL DE PRECIOS] = vista calculada sobre `pos_invoices.items[]` filtrado por proveedor.
- Pedidos: formulario (proveedor, fecha estimada); tabla de ítems; [SUGERIR PEDIDO] cruza ventas 30 días + stock actual/mínimo; tabla de pedidos guardados.
- Facturas: carga directa o desde pedido recibido. Tipo de factura hereda del proveedor pero permite override por factura individual.
- Al confirmar: (1) `actualizarStock(+cantidad, 'recepcion', userId)` por ítem, (2) `actualizarCostoProducto(code, costoReal, userId)` por ítem, (3) aplica regla 70%/50% (A/B=70%, X=50% sobre precio de factura), (4) calcula `itemsConMargenErosionado` contra `pos_min_margins`, (5) emite `pos:facturaRecibida`.
- Margen erosionado: COMPRAS es la ÚNICA fuente de verdad de este cálculo; AUTOMATIZACIÓN solo lee el array del payload, nunca recalcula.
9.5 Eventos
- Emite `pos:facturaRecibida` con payload: `{proveedorId, diasCredito, monto, fecha, tipoFactura, itemsConMargenErosionado:[{code, name, costoAnterior, costoNuevo, margenActual, margenMinimoRequerido}]}`.
9.6 CSS / Blindaje
- Namespace `.compras-*`.

10. MÓDULO AUTOMATIZACIÓN (ANEXO H)
10.1 Propósito
Motor transversal de alertas y salud del negocio, para prevenir pérdidas o falta de liquidez que el dueño no siempre tiene presentes.
10.2 Contrato de datos
- ESCRIBE: nada directamente.
- LLAMA: `NUCLEO.registrarAlerta()`, `NUCLEO.marcarAlertaLeida()`.
- LEE: `pos_products`, `pos_sales`, `pos_suppliers`, `pos_purchase_orders`, `pos_finanzas_reservas`, `pos_finanzas_gastos`, `pos_cierres`, `pos_alerts_log`.
- PROHIBIDO ESCRIBIR (directo): todas las claves transaccionales, incluido `pos_alerts_log`.
10.3 Visual
Ícono 🔔 en el slot reservado por el núcleo. Badge rojo con conteo de alertas ALTA no leídas. Click → dropdown de tarjetas. Marcar como leída → desaparece del dropdown, queda en el log.
10.4 Las 4 alertas implementadas
1. Margen Erosionado (ALTA): Evento `pos:facturaRecibida`. Lee `itemsConMargenErosionado[]`.
2. Flujo de Caja / Liquidez (ALTA): Al entrar a FINANZAS o abrir la app (1x/día). Reservas que vencen en ≤3 días vs. Efectivo Disponible.
3. Sugerencia de Compra Inteligente (MEDIA): Background diario o al entrar a COMPRAS. Cruce `pos_sales` (30 días) + stock vs. mínimo/entrega proveedor.
4. Control de Caja Chica (BAJA): Evento `pos:cierreRealizado`. Últimos 3 cierres con diferencia negativa.
10.5 Mecanismo
Alertas calculadas en tiempo real al ocurrir el evento desencadenante; las periódicas (liquidez) 1x/día. Persisten vía `registrarAlerta({tipo, severidad, mensaje, moduloDestino, fecha, leida:false})`. Dropdown muestra solo `leida:false`. Deduplicar por tipo + fecha + producto/proveedor.
10.6 CSS / Blindaje
- Namespace `.alert-*`.

11. MAPA DE EVENTOS DEL BUS (transversal)
| Evento | Emisor | Payload | Escuchas |
|---|---|---|---|
| pos:estadoCaja | NÚCLEO | — | CAJA (refresca botones) |
| pos:cierreRealizado | CAJA (CIERRE) | {cicloId, fecha} | AUTOMATIZACIÓN (alerta caja chica §10.4.4) |
| pos:facturaRecibida | COMPRAS | {proveedorId, diasCredito, monto, fecha, tipoFactura, itemsConMargenErosionado[]} | FINANZAS (reserva automática si diasCredito >0), AUTOMATIZACIÓN (alerta margen erosionado) |
El núcleo provee el bus (`emit`/`on`) pero nunca re-emite eventos de negocio de otros módulos.

12. MATRIZ DE DEPENDENCIAS ENTRE MÓDULOS
- NÚCLEO → da servicios a todos. Recibe políticas de CONFIG.
- CAJA → alimenta CIERRE (interno), consume productos/precios/sueltos/botones de INVENTARIO y CONFIG.
- INVENTARIO → alimenta CAJA (productos/precios), CIERRE (stock).
- CONFIG → alimenta CAJA, CIERRE, INVENTARIO, COMPRAS, NÚCLEO.
- COMPRAS → alimenta INVENTARIO (stock/costo), FINANZAS (reservas automáticas), AUTOMATIZACIÓN (margen erosionado).
- FINANZAS → alimenta REPORTES (gastos/capital), AUTOMATIZACIÓN (vencimientos), COMPRAS (reservas).
- REPORTES → depende de FINANZAS y CAJA/INVENTARIO. No interactúa con CIERRE, CONFIG, COMPRAS, AUTOMATIZACIÓN directamente.
- AUTOMATIZACIÓN → transversal, lee de todos. No bloquea la operatoria.

13. REGLAS TRANSVERSALES OBLIGATORIAS (aplican a TODOS los módulos)
- Sin librerías externas ni frameworks.
- Estética minimalista blanca en `core.css`; ningún módulo puede modificarlo.
- Namespacing CSS estricto: cada módulo usa solo su propio prefijo.
- Layout: `height: 100%` de `#moduleContainer`. PROHIBIDO `calc(100vh - Xpx)`.
- Topbar: se genera dinámicamente. PROHIBIDO tocar su HTML (excepto slot de campana).
- Sin scroll de página en ningún módulo.
- Desviación de la maqueta visual = devolución.
- Trazabilidad de `userId`: toda escritura transaccional incluye `userId` de `NUCLEO.getUsuarioActivo()`, o `'sistema'` para procesos automáticos.
- Escritura controlada: ningún módulo escribe directamente `pos_products.stock`, `pos_products.cost`, `pos_products.category`, `ventaSuelta`/`priceLoose`, `pos_alerts_log`, ni `pos_config_audit_log` — siempre vía servicios del NÚCLEO.
- ESC vuelve a CAJA desde cualquier vista/módulo y cierra modales/dropdowns.
- Ningún módulo, salvo REPORTES, calcula rentabilidad; ningún módulo salvo COMPRAS calcula margen erosionado; ningún módulo salvo AUTOMATIZACIÓN dispara alertas.

14. FUERA DE ALCANCE (APARCADO en todos los anexos)
- Multi-caja en red, Migración a SQLite, Historial de cierres anteriores navegable fuera del modal, Vinculación productos↔proveedores, Fórmulas de sueldos variables, Integración bancaria, Exportar reportes a PDF/Excel, Importación de facturas desde PDF/CSV con OCR, Alertas por vencimiento de productos, Impuestos avanzados/AFIP.

15. CHECKLIST MAESTRO DE ACEPTACIÓN (resumen ejecutivo)
- [ ] Arranque limpio inicializa las 26 claves `pos_*` del SCHEMA (incluida `pos_ciclo_actual`).
- [ ] El ciclo completo Venta → Cierre → Reportes cuadra numéricamente.
- [ ] El ciclo Compra → Recepción → Stock/Costo actualizado → Margen erosionado → Alerta funciona end-to-end.
- [ ] El ciclo Factura con crédito → Reserva automática → Alerta de liquidez funciona end-to-end.
- [ ] Ningún ticket oficial muestra cigarrillos ni sub-caja.
- [ ] Todo registro transaccional (incluidos cambios de costo) incluye `userId` válido.
- [ ] Auditoría de CONFIG registra el 100% de los guardados instantáneos.
- [ ] Ningún módulo escribe fuera de su contrato de datos.
- [ ] Namespacing CSS respetado en los 7 módulos con solapa/UI propia.
- [ ] Topbar nunca modificada manualmente.

16. PROTOCOLO DE EJECUCIÓN PARA LA IA
16.1 Orden de ejecución obligatorio
1. C — NÚCLEO | 2. A — CAJA + CIERRE | 3. B — INVENTARIO | 4. D — CONFIG | 5. G — COMPRAS | 6. E — FINANZAS | 7. H — AUTOMATIZACIÓN | 8. F — REPORTES.
Regla dura: no se avanza al paso N+1 hasta que el paso N esté validado contra su checklist y aprobado explícitamente.
16.2 Reglas de contexto acotado
- Un anexo por turno. Prohibido interpretar o implementar reglas de otros anexos "por adelantado".
- Prohibición explícita de inventar. Si creés que falta algo, preguntá antes de implementarlo.
- El anexo es la fuente de verdad, el SPEC es el mapa.
- Sesiones separadas por anexo.
- Cierre con checklist, no con resumen libre.
- Aprobación humana explícita entre anexos.
16.3 Plantilla de prompt por turno
Contexto: SPEC + ANEXO_X. Tarea: Implementar ÚNICAMENTE el ANEXO X. Reglas: No toques otros anexos. No agregues nada que no esté explícito. Respetá el contrato de datos, CSS y blindaje. Ante ambigüedad, preguntá. Al terminar, mostrá el checklist marcado ítem por ítem. No avances hasta que yo lo confirme.
16.4 Señales de alerta durante la ejecución
Si la IA menciona/modifica una clave no declarada, propone estilos fuera de su namespace, sugiere "ya que estamos...", razona sobre un anexo futuro, o se aparta de la MAQUETA sin consultar, es señal de desviación. Cortar y redirigir.
Fin del SPEC maestro.

17. ESTRUCTURA DE PROYECTO
neurora-pos/
│
├── index.html                    ← Entry point principal (carga núcleo + módulos)
│
├── core/                         ← NÚCLEO (ANEXO C)
│   ├── core.css                  ← Sistema de diseño completo (estética minimalista blanca)
│   └── nucleo.js                 ← Lógica del núcleo (storage, bus, servicios)
│
├── modules/                      ← Módulos de negocio (uno por carpeta)
│   ├── caja/
│   │   ├── caja.css              ← Namespace .caja-* + .modal-charge-*
│   │   └── caja.js
│   │
│   ├── inventario/
│   │   ├── inventario.css        ← Namespace .inv-*
│   │   └── inventario.js
│   │
│   ├── config/
│   │   ├── config.css            ← Namespace .config-*
│   │   └── config.js
│   │
│   ├── finanzas/
│   │   ├── finanzas.css          ← Namespace .fin-*
│   │   └── finanzas.js
│   │
│   ├── reportes/
│   │   ├── reportes.css          ← Namespace .rep-*
│   │   └── reportes.js
│   │
│   ├── compras/
│   │   ├── compras.css           ← Namespace .compras-*
│   │   └── compras.js
│   │
│   └── automatizacion/
│       ├── automatizacion.css    ← Namespace .alert-*
│       └── automatizacion.js
│
└── maquetas/                     ← Maquetas HTML estáticas (referencia visual)
    ├── _README.md                ← Índice y reglas de uso
    │
    ├── nucleo/
    │   └── MAQUETA_TOPBAR.html   ← Topbar base (marca + solapas + slot campana)
    │
    ├── caja/
    │   ├── MAQUETA_CAJA_ABIERTA.html
    │   ├── MAQUETA_CAJA_CERRADA.html
    │   ├── MODAL_APERTURA.html
    │   ├── MODAL_CIERRE.html
    │   ├── MODAL_COBRO.html
    │   ├── MODAL_POSTCOBRO.html
    │   ├── MODAL_BUSQUEDA.html
    │   ├── MODAL_PAQUETES.html
    │   ├── MODAL_SUeltos.html
    │   └── MODAL_VER_CIERRES.html
    │
    ├── inventario/
    │   └── MAQUETA_INVENTARIO.html
    │
    ├── config/
    │   ├── MAQUETA_CONFIG_SUBCAJAS.html
    │   ├── MAQUETA_CONFIG_CATEGORIAS.html
    │   ├── MAQUETA_CONFIG_MARGENES.html
    │   ├── MAQUETA_CONFIG_PROVEEDORES.html
    │   ├── MAQUETA_CONFIG_BOTONESRAPIDOS.html
    │   ├── MAQUETA_CONFIG_MONEDA.html
    │   ├── MAQUETA_CONFIG_NEGOCIO.html
    │   ├── MAQUETA_CONFIG_PERIFERICOS.html
    │   ├── MAQUETA_CONFIG_USUARIOS.html
    │   └── MAQUETA_CONFIG_AUDITORIA.html
    │
    ├── finanzas/
    │   ├── MAQUETA_FINANZAS_DASHBOARD.html
    │   ├── MAQUETA_FINANZAS_RESERVAS.html
    │   ├── MAQUETA_FINANZAS_GASTOS.html
    │   └── MAQUETA_FINANZAS_PATRIMONIO.html
    │
    ├── reportes/
    │   ├── MAQUETA_REPORTES_RENTABILIDAD.html
    │   ├── MAQUETA_REPORTES_PATRIMONIO.html
    │   └── MAQUETA_REPORTES_INVENTARIO.html
    │
    ├── compras/
    │   ├── MAQUETA_COMPRAS_PROVEEDORES.html
    │   ├── MAQUETA_COMPRAS_PEDIDOS.html
    │   └── MAQUETA_COMPRAS_FACTURAS.html
    │
    └── automatizacion/
        └── MAQUETA_AUTOMATIZACION_DROPDOWN.html