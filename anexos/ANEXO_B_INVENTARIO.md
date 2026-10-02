ANEXO B — INVENTARIO (CONGELADO)
1. PROPÓSITO
Gestionar stock, precios y categorías con cargas rápidas; cigarrillos sin descuadre; vencimientos y faltantes visibles de un vistazo.

2. CONTRATO DE DATOS
ESCRIBE: `pos_products` (code, name, category, price, minStock, expiryDate, expiryWarnDays, noFiscal, active) — campos editables directamente por INVENTARIO.
LEE: `pos_categories` (inicializada vacía por el NÚCLEO; gestión y alta de categorías es exclusiva de CONFIG — ver ANEXO D §4 Vista Categorías), `pos_stock_movements` (para mostrar el historial de movimientos del producto seleccionado en el panel DETALLE, escritor único: NÚCLEO)
PROHIBIDO ESCRIBIR: `pos_cig_subcaja`, `pos_sales`, `pos_cierres` (lo hacen otros módulos)
ESCRIBE CONDICIONAL:
- `stock` en `pos_products` SOLO vía servicio del NÚCLEO `actualizarStock(code, delta, 'ajuste', userId)` (incluye altas manuales +1/+5/+10 y merge de importación CSV).
- `cost` en `pos_products` SOLO vía servicio del NÚCLEO `actualizarCostoProducto(code, nuevoCosto, userId)` (edición manual de costo en el panel DETALLE).
- `ventaSuelta` y `priceLoose` en `pos_products` SOLO vía servicio del NÚCLEO `setProductCigConfig()`.
Nota: `price` y `marginPct` NO son persistidos como campos independientes con reglas de escritura propias del NÚCLEO; `price` se escribe directo por INVENTARIO (ver §4 MARGEN) y `marginPct` es un valor derivado en pantalla, no una clave de escritura obligatoria.

3. VISUAL
Referencia: MAQUETA_INVENTARIO.html (html adjunta al ejecutar este ANEXO).
Estética minimalista blanca (definida en `core.css`).
Reglas de comportamiento:
- Layout 2 columnas: izquierda (header + chips + tabla), derecha fija (panel DETALLE/ALTA)
- Panel derecho FIJO (no scrollea)
- ÚNICO elemento que scrollea: `tbody` de la tabla de productos
- Sin scroll de página
- Desviación de la maqueta = devolución

4. REGLAS DE NEGOCIO (NO NEGOCIABLES)
- MARGEN (%): entrada directa; `P. VENTA = roundCurrency(costo × (1+m/100))`; editar P. VENTA recalcula margen (y viceversa); GANANCIA NETA visible en vivo
- AVISO DE PÉRDIDA/MARGEN BAJO: al editar costo, margen o precio, INVENTARIO invoca `NUCLEO.checkLoss(price, cost, category)` (no persiste nada, solo retorna estado) y muestra un badge visual [PÉRDIDA] o [MARGEN BAJO] en el panel DETALLE si el resultado lo indica.
- HISTORIAL DE MOVIMIENTOS (auditoría): en el panel DETALLE, sub-sección colapsable "Últimos movimientos" muestra hasta 10 entradas de `pos_stock_movements` filtradas por `code` del producto: fecha, delta (+/-), motivo (venta/recepción/ajuste), usuario. Solo lectura, sin edición.
- MÍNIMO por producto: stock ≤ mínimo → badge [CRIT] + aviso de reposición
- VENCIMIENTO: por producto + "AVISO A DÍAS ANTES" (default 7); badge [VENCIDO] o [VENCE DD/MM]
- NO FISCAL: checkbox por producto en el detalle (cualquier categoría); sella la línea de venta
- VENTA SUELTA / DESPIECE: NO editable en INVENTARIO — exclusivo de Cigarrillos, se decide en CONFIG · SUB-CAJAS (`selectedBrands`); INVENTARIO muestra solo el badge [SUELTO X] (lectura)
- BAJA/ALTA: ÚNICO mecanismo para sacar un producto de circulación (flag `active`, no borrado físico)
- CSV: importar con vista previa + aplicar (merge por código); exportar filtro activo (round-trip sin perder datos)
- STOCK: +1/+5/+10 (vía `NUCLEO.actualizarStock(code, delta, 'ajuste', userId)`); [AUTO-GEN] para código

5. INTEGRACIÓN
Emite eventos: (Ninguno por ahora)
Escucha eventos: (Ninguno por ahora)
Llama funciones del Núcleo: `setProductCigConfig`, `actualizarStock`, `actualizarCostoProducto` (requiere `userId`), `checkLoss`, `roundCurrency`, `normCategory`, `normText`, `money`, `esc`, `toast`, `exportCSV`
Alimenta a: CAJA (productos/precios/sueltos), CIERRE (stock para cuadre)

6. CSS
PROPIO: `.inv-*` (layout, chips, tabla, panel, footer)
CONGELADO: todo lo demás de `core.css`

7. CHECKLIST DE REGRESIÓN
[ ] Click en fila de tabla → carga panel DETALLE con datos del producto
[ ] Editar costo/margen/precio → GANANCIA NETA se recalcula en vivo; el costo se persiste vía `NUCLEO.actualizarCostoProducto(code, nuevoCosto, userId)`
[ ] Stock +1/+5/+10 → actualiza valor y display; se persiste vía `NUCLEO.actualizarStock(code, delta, 'ajuste', userId)`
[ ] BAJA → producto desaparece de CAJA (flag `active = false`)
[ ] ALTA → producto vuelve a aparecer en CAJA
[ ] IMPORTAR CSV → vista previa + merge por código (actualiza existentes, crea nuevos)
[ ] EXPORTAR CSV → exporta filtro activo sin perder datos
[ ] Chip VENCIDOS → muestra solo productos vencidos
[ ] Chip SUELTO → muestra productos con `ventaSuelta = true` o `sueltos > 0`
[ ] Badge SUELTO 0 → aparece cuando `ventaSuelta = true` pero `sueltos = 0`
[ ] F4 → guarda producto actual
[ ] ESC → vuelve a CAJA
[ ] Panel DETALLE → sub-sección "Últimos movimientos" muestra entradas de `pos_stock_movements` para el producto, con usuario y motivo

8. RESTRICCIONES NEGATIVAS
- NO editar `ventaSuelta` ni `priceLoose` directamente en `pos_products` (usar `setProductCigConfig` del NÚCLEO)
- NO editar `stock` ni `cost` directamente en `pos_products` (usar `actualizarStock()` y `actualizarCostoProducto()` del NÚCLEO, incluida la importación CSV)
- NO escribir en `pos_stock_movements` directamente (es escritor único físico del NÚCLEO; se genera automáticamente dentro de `actualizarStock()`, INVENTARIO solo lo lee)
- NO borrar productos físicamente (usar flag `active`)
- NO mostrar ventas en pérdida en INVENTARIO (eso es de CIERRE)
- NO tocar el DOM de la barra superior
- NO usar librerías externas
- NO crear funciones de reporte (eso es de REPORTES)

9. APARCADO
- PROVEEDORES (vincular productos a proveedores)
- GASTOS (asociar gastos a productos)

10. BLINDAJE VISUAL (reglas de no-rotura)
NAMESPACING: este módulo usa prefijo `.inv-*`. PROHIBIDO definir estilos para `.caja-*`, `.config-*`, `.rep-*`, `.compras-*`, `.fin-*`, `.alert-*`.
CORE.CSS: PROHIBIDO modificar `core/core.css`. Los estilos globales (botones, modales, badges) ya están ahí.
LAYOUT: este módulo usa `height: 100%` de `#moduleContainer`. PROHIBIDO usar `calc(100vh - Xpx)` o asumir altura fija de topbar.
TOPBAR: las solapas se generan automáticamente desde `registerModule()`. PROHIBIDO tocar el HTML de la topbar.
ESTÉTICA: minimalista blanca (definida en `core.css`). Referencia visual: MAQUETA_INVENTARIO (imagen adjunta al ejecutar este ANEXO). Desviación = devolución.