ANEXO F — FICHA DE MÓDULO: REPORTES (CONGELADO)
1. PROPÓSITO
Tablero de control del dueño. Responder a: "¿Cuánto vale mi negocio?", "¿Cuánto gané realmente?" y "¿Cuánto de mi propio dinero hay invertido?". Es un módulo de SOLO LECTURA y CÁLCULO (no registra transacciones).

2. CONTRATO DE DATOS
ESCRIBE: (Nada, módulo de solo lectura).
LEE: `pos_sales` (para Ventas y CMV), `pos_products` (para valorización de Inventario), `pos_finanzas_gastos` (para Gastos Operativos), `pos_finanzas_capital` (para Aportes y Retiros).
PROHIBIDO ESCRIBIR: cualquier clave `pos_*`.

3. VISUAL
Referencia: MAQUETA_REPORTES (imagen adjunta al ejecutar este ANEXO).
Estética minimalista blanca (definida en `core.css`).
Reglas de comportamiento:
- Layout 2 paneles: sidebar izquierda (240px fija) + panel principal derecho (fluido).
- Sidebar con 3 secciones clickeables: RENTABILIDAD · PATRIMONIO · INVENTARIO.
- Panel principal con header + badge de estado + contenido dinámico por vista.
- Sin scroll de página.
- Desviación de la maqueta = devolución.

4. COMPORTAMIENTO (Reglas de negocio)
VISTA RENTABILIDAD (Estado de Resultados / P&L)
- SELECTOR DE PERÍODO: [HOY] [ESTA SEMANA] [ESTE MES] [ESTE AÑO] [PERSONALIZADO].
- TABLERO DE CASCADA (WATERFALL):
  - (+) VENTAS TOTALES: Suma de `pos_sales.total` en el período seleccionado.
  - (-) CMV - Costo de Mercadería Vendida: Suma de `item.cost * item.qty` de todas las ventas en el período. Usa el costo histórico de la línea (guardado al momento de la venta), no el costo actual de `pos_products`.
  - (=) MARGEN BRUTO: `VENTAS TOTALES - CMV`.
  - (-) GASTOS OPERATIVOS: Suma de `pos_finanzas_gastos.monto` en el período seleccionado.
  - (=) GANANCIA NETA OPERATIVA: `MARGEN BRUTO - GASTOS OPERATIVOS`. El dinero que el negocio generó por sí mismo.
- GRÁFICO DE BARRAS (opcional): Evolución mensual de Ventas vs Ganancia Neta (últimos 12 meses).

VISTA PATRIMONIO (Cuenta con el Dueño)
- KPI PRINCIPAL: INVERSIÓN NETA ACTUAL.
- DESGLOSE:
  - (+) Aportes de Capital: Suma de `pos_finanzas_capital` con tipo `aporte` (histórico completo).
  - (+) Ganancias Netas Acumuladas: Suma de todas las Ganancias Netas Operativas calculadas en RENTABILIDAD (histórico completo).
  - (-) Retiros del Dueño: Suma de `pos_finanzas_capital` con tipo `retiro` (histórico completo).
- GRÁFICO O TABLA HISTÓRICA: Evolución del saldo de Inversión Neta mes a mes.

VISTA INVENTARIO (Valorización)
- KPIs:
  - VALOR DE INVENTARIO A COSTO: Suma de `p.stock * p.cost` para todos los productos activos. "¿Cuánto tengo congelado en la pared?".
  - VALOR DE INVENTARIO A PRECIO DE VENTA: Suma de `p.stock * p.price` para todos los productos activos. "¿Cuánto vale si lo vendo todo hoy?".
  - MARGEN POTENCIAL: Diferencia entre ambos (Ganancia bruta si se vende todo el stock).
- LISTADO TOP 5: Productos con mayor valor inmovilizado a costo. Muestra: Nombre, Código, Stock, Costo Unitario, Valor Total a Costo.

5. INTEGRACIÓN
Emite eventos: (Ninguno).
Escucha eventos: (Ninguno).
Llama funciones del NÚCLEO: `money`, `esc`, `toast`, `today`, `nowISO`, `getData`.
Dependencia directa de: FINANZAS (para Gastos y Capital), CAJA/INVENTARIO (para Ventas y Stock).
NO interactúa con: CIERRE, CONFIG, COMPRAS, AUTOMATIZACIÓN.

6. CSS
PROPIO: `.rep-*` (layout, sidebar, secciones, tarjetas KPI, tablas, gráficos).
CONGELADO: todo lo demás de `core.css`.

7. CHECKLIST DE REGRESIÓN
[ ] Sidebar muestra 3 secciones activas (Rentabilidad, Patrimonio, Inventario).
[ ] Rentabilidad → selector de período funciona (HOY, SEMANA, MES, AÑO, PERSONALIZADO).
[ ] Rentabilidad → VENTAS TOTALES calcula correctamente desde `pos_sales` en el período.
[ ] Rentabilidad → CMV usa costo histórico de la línea (no el costo actual de `pos_products`).
[ ] Rentabilidad → MARGEN BRUTO = VENTAS - CMV.
[ ] Rentabilidad → GASTOS OPERATIVOS suma `pos_finanzas_gastos` en el período.
[ ] Rentabilidad → GANANCIA NETA = MARGEN BRUTO - GASTOS.
[ ] Patrimonio → INVERSIÓN NETA = Aportes + Ganancias Acumuladas - Retiros.
[ ] Patrimonio → gráfico/tabla histórica muestra evolución mes a mes.
[ ] Inventario → VALOR A COSTO calcula correctamente desde `pos_products`.
[ ] Inventario → VALOR A PRECIO VENTA calcula correctamente.
[ ] Inventario → MARGEN POTENCIAL = Valor Venta - Valor Costo.
[ ] Inventario → TOP 5 productos con mayor valor inmovilizado.
[ ] ESC → vuelve a CAJA desde cualquier vista.

8. RESTRICCIONES NEGATIVAS
- NO escribir ninguna clave `pos_*` (módulo de solo lectura).
- NO modificar productos, ventas, gastos, capital.
- NO tocar el DOM de la barra superior.
- NO usar librerías externas.
- NO crear funciones de edición o registro de transacciones.
- NO calcular CMV con el costo actual de `pos_products` (siempre usar el costo histórico de la línea).

9. BLINDAJE VISUAL
NAMESPACING: `.rep-*`. PROHIBIDO `.caja-*`, `.inv-*`, `.config-*`, `.fin-*`, `.compras-*`, `.alert-*`.
CORE.CSS: PROHIBIDO modificar.
LAYOUT: `height: 100%` de `#moduleContainer`. PROHIBIDO `calc(100vh - Xpx)`.
TOPBAR: se genera dinámicamente. PROHIBIDO tocar el HTML.
ESTÉTICA: minimalista blanca. Referencia: MAQUETA_REPORTES.

10. APARCADO
- Exportar reportes a PDF/Excel (futuro).
- Comparativas entre períodos (futuro).
- Proyecciones de ventas (futuro).
- Análisis de rentabilidad por producto (futuro).
- Análisis de rentabilidad por categoría (futuro).