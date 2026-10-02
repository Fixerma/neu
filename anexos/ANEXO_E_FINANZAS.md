ANEXO E — FICHA DE MÓDULO: FINANZAS (CONGELADO)
1. PROPÓSITO
Controlar el flujo de dinero del negocio separando conceptualmente lo que es operación (Gastos), lo que es flujo futuro (Reservas) y lo que es patrimonio del dueño (Aportes/Retiros). Responde a la pregunta: "¿De quién es la plata que hay en la caja y para qué sirve?".

2. CONTRATO DE DATOS
ESCRIBE: `pos_finanzas_reservas` (reservas de dinero), `pos_finanzas_gastos` (egresos operativos), `pos_finanzas_capital` (aportes y retiros del dueño) — cada registro creado o modificado por acción del usuario incluye `userId` (`NUCLEO.getUsuarioActivo()`), excepto las reservas automáticas generadas por el evento `pos:facturaRecibida`, que guardan `userId: 'sistema'`.
LEE: `pos_cierres` (para calcular Efectivo Total actual), `pos_ciclo_actual` (para leer el monto de apertura del ciclo en curso), `pos_products` (para valorización de inventario en REPORTES), `pos_suppliers` (para nombres de proveedores en reservas)
PROHIBIDO ESCRIBIR: `pos_products`, `pos_sales`, `pos_cierres`, `pos_cig_subcaja`, `pos_tickets_log`, `pos_suppliers`, `pos_purchase_orders`

3. VISUAL
Referencia: MAQUETA_FINANZAS (imagen adjunta al ejecutar este ANEXO).
Estética minimalista blanca (definida en `core.css`).
Reglas de comportamiento:
- Layout 2 paneles: sidebar izquierda (240px fija) + panel principal derecho (fluido).
- Sidebar con 4 secciones clickeables: DASHBOARD · RESERVAS · GASTOS · PATRIMONIO.
- Panel principal con header + badge de estado + contenido dinámico por vista.
- Sin scroll de página.
- Desviación de la maqueta = devolución.

4. COMPORTAMIENTO (Reglas de negocio)
VISTA DASHBOARD (Flujo de Caja en tiempo real)
TARJETAS SUPERIORES (KPIs):
- EFECTIVO TOTAL: Lo que hay físicamente en caja. Cálculo: `montoApertura` (leído de `pos_ciclo_actual`) + ventas efectivo del ciclo - subcaja cigarrillos. Si no hay ciclo abierto (`pos_ciclo_actual` es nulo), muestra 0.
- EFECTIVO RESERVADO: Suma de todas las reservas con estado `activa`.
- EFECTIVO DISPONIBLE: `EFECTIVO TOTAL - EFECTIVO RESERVADO`.
- PRÓXIMOS VENCIMIENTOS: Lista de reservas que vencen en los próximos 3 días, ordenadas por fecha de vencimiento ascendente. Cada item muestra: Nombre, Monto, Fecha Vencimiento, Categoría.

VISTA RESERVAS (Apartar dinero)
FORMULARIO:
- Nombre (texto, obligatorio, ej: "Proveedor Aza", "Alquiler Enero").
- Monto (numérico, obligatorio).
- Fecha Vencimiento (fecha, obligatorio).
- Categoría (select: Proveedor, Sueldo, Alquiler, Impuesto, Otro).
- Detalle (texto, opcional).
TABLA DE RESERVAS ACTIVAS: Nombre | Monto | Vencimiento | Categoría | Estado | Acciones.
ACCIONES:
- EDITAR: cambia nombre, monto, fecha, categoría.
- PAGAR AHORA: convierte la reserva en un gasto real. Crea un registro en `pos_finanzas_gastos` con la misma categoría, monto, fecha actual, y `reservaId` vinculado. Cambia el estado de la reserva a `pagada`.
- CANCELAR: cambia el estado de la reserva a `cancelada` (no afecta ganancia).
REGLA: Crear/Modificar una reserva NO afecta la ganancia. Solo `PAGAR AHORA` la convierte en gasto.

VISTA GASTOS (Egresos operativos)
FORMULARIO:
- Categoría (select: Luz, Agua, Alquiler, Sueldo, AFIP, Proveedor, Internet, Rentas, Otro).
- Monto (numérico, obligatorio).
- Fecha (fecha, default hoy).
- Detalle (texto, opcional, ej: "Factura Luz Diciembre").
- Vincular a Reserva (dropdown opcional, muestra reservas activas; si se selecciona, la reserva pasa a estado `pagada`).
TABLA DE GASTOS: Fecha | Categoría | Detalle | Monto | Acciones.
ACCIONES:
- EDITAR: cambia categoría, monto, fecha, detalle.
- ELIMINAR: borra el gasto (si estaba vinculado a una reserva, la reserva vuelve a estado `activa`).
REGLA: Registrar un Gasto SÍ afecta la ganancia neta. Si se vincula a una Reserva, la Reserva pasa a estado `PAGADA`.

VISTA PATRIMONIO (Cuenta Corriente con el Negocio)
FORMULARIO:
- Tipo (select: APORTE DE CAPITAL / RETIRO DEL DUEÑO).
- Monto (numérico, obligatorio).
- Fecha (fecha, default hoy).
- Detalle (texto, opcional, ej: "Aporte inicial", "Retiro para gastos personales").
TABLA DE MOVIMIENTOS DE CAPITAL: Fecha | Tipo | Monto | Detalle | Acciones.
ACCIONES:
- EDITAR: cambia tipo, monto, fecha, detalle.
- ELIMINAR: borra el movimiento.
KPI INFERIOR: SALDO DE INVERSIÓN NETA = Suma de Aportes + Ganancias Netas Acumuladas (calculado por REPORTES) - Retiros.
REGLA: Aportes y Retiros NO afectan la ganancia operativa. Solo modifican el patrimonio.

5. INTEGRACIÓN
Escucha eventos: `pos:facturaRecibida` → si `diasCredito > 0`, crea reserva automática en `pos_finanzas_reservas` (categoría "Proveedor", vencimiento = fecha + diasCredito).
Llama funciones del NÚCLEO: `money`, `esc`, `toast`, `today`, `nowISO`, `getCicloAbierto`, `getVentasPorMetodo`, `getVentasSubCajaDelCiclo`, `getUsuarioActivo`.
Alimenta a: REPORTES (gastos para cálculo de rentabilidad, capital para patrimonio), AUTOMATIZACIÓN (reservas que vencen para alerta de liquidez).

6. CSS
PROPIO: `.fin-*` (layout, sidebar, secciones, tarjetas KPI, tablas, formularios).
CONGELADO: todo lo demás de `core.css`.

7. CHECKLIST DE REGRESIÓN
[ ] Sidebar muestra 4 secciones activas (Dashboard, Reservas, Gastos, Patrimonio).
[ ] Dashboard → Efectivo Total calcula correctamente leyendo `montoApertura` de `pos_ciclo_actual` (o 0 si no hay ciclo).
[ ] Dashboard → Efectivo Reservado suma solo reservas con estado `activa`.
[ ] Dashboard → Efectivo Disponible = Total - Reservado.
[ ] Dashboard → Próximos Vencimientos muestra reservas que vencen en 3 días.
[ ] Reservas → AGREGAR → persiste en `pos_finanzas_reservas` con estado `activa`.
[ ] Reservas → PAGAR AHORA → crea gasto en `pos_finanzas_gastos`, reserva pasa a `pagada`.
[ ] Reservas → CANCELAR → reserva pasa a estado `cancelada`.
[ ] Gastos → AGREGAR → persiste en `pos_finanzas_gastos`.
[ ] Gastos → vincular a reserva → reserva pasa a `pagada`.
[ ] Gastos → eliminar gasto vinculado → reserva vuelve a estado `activa`.
[ ] Patrimonio → AGREGAR APORTE → persiste en `pos_finanzas_capital` con tipo `aporte`.
[ ] Patrimonio → AGREGAR RETIRO → persiste en `pos_finanzas_capital` con tipo `retiro`.
[ ] Patrimonio → SALDO DE INVERSIÓN NETA calcula correctamente.
[ ] Gastos/Reservas/Capital cargados manualmente → guardan `userId` del usuario activo.
[ ] Reserva automática por `pos:facturaRecibida` → guarda `userId: 'sistema'`.
[ ] ESC → vuelve a CAJA desde cualquier vista.

8. RESTRICCIONES NEGATIVAS
- NO escribir en `pos_products`, `pos_sales`, `pos_cierres`, `pos_cig_subcaja`, `pos_tickets_log`, `pos_suppliers`, `pos_purchase_orders`.
- NO calcular ganancia neta (eso es REPORTES).
- NO tocar el DOM de la barra superior.
- NO usar librerías externas.
- NO crear funciones de reporte (eso es REPORTES).
- NO calcular sueldos variables (aparcado, se cargan como gasto fijo manual).

9. BLINDAJE VISUAL
NAMESPACING: `.fin-*`. PROHIBIDO `.caja-*`, `.inv-*`, `.config-*`, `.rep-*`, `.compras-*`, `.alert-*`.
CORE.CSS: PROHIBIDO modificar.
LAYOUT: `height: 100%` de `#moduleContainer`. PROHIBIDO `calc(100vh - Xpx)`.
TOPBAR: se genera dinámicamente. PROHIBIDO tocar el HTML.
ESTÉTICA: minimalista blanca. Referencia: MAQUETA_FINANZAS.

10. APARCADO
- Fórmulas de sueldos variables (cuando el dueño defina la lógica exacta, por ahora se cargan como Gasto fijo manual).
- Integración con cuentas bancarias (futuro).
- Proyección de flujo de caja (futuro).