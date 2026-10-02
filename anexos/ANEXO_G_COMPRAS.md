ANEXO G — COMPRAS (CONGELADO)
PROPÓSITO
Gestionar proveedores (en coordinación con CONFIG), generar pedidos de compra (manuales o sugeridos), y cargar facturas para actualizar stock y costos automáticamente.

CONTRATO DE DATOS
ESCRIBE: `pos_purchase_orders` (pedidos de compra), `pos_invoices` (facturas cargadas/recibidas) — cada registro incluye `userId` (`NUCLEO.getUsuarioActivo()`) de quien creó el pedido o cargó la factura.
LLAMA (no escribe directo): `NUCLEO.actualizarStock()` y `NUCLEO.actualizarCostoProducto(code, nuevoCosto, userId)` al recibir mercadería/factura.
LEE: `pos_products` (para armar pedidos y sugerencias), `pos_sales` (para calcular velocidad de venta), `pos_suppliers` (dueño: CONFIG — solo lectura, para seleccionar proveedor y heredar config), `pos_min_margins` (para calcular margen erosionado al recibir).
PROHIBIDO ESCRIBIR: `pos_sales`, `pos_cierres`, `pos_cig_subcaja`, `pos_tickets_log`, `pos_finanzas_*`, `pos_suppliers` (el ABM de proveedores es EXCLUSIVO de CONFIG).

VISUAL
Referencia: MAQUETA_COMPRAS (imagen adjunta al ejecutar este ANEXO).
Estética minimalista blanca (definida en `core.css`).
Reglas de comportamiento:
- Layout 2 columnas: sidebar izquierda (navegación) + panel principal derecho.
- Sidebar con 3 secciones: PROVEEDORES · PEDIDOS · FACTURAS.
- Sin scroll de página.
- Desviación de la maqueta = devolución.

REGLAS DE NEGOCIO
PROVEEDORES (vista de solo lectura/selección)
- Tabla: Nombre | Rubro | Contacto | Días Crédito | Tipo Factura | Acciones.
- Datos leídos desde `pos_suppliers` (gestionado por CONFIG).
- Acciones disponibles en COMPRAS: seleccionar proveedor para un pedido o factura.
- Alta, edición y baja lógica de proveedores: EXCLUSIVO de CONFIG. Si el proveedor buscado no existe, COMPRAS muestra un enlace [IR A CONFIG · PROVEEDORES].
- HISTORIAL DE PRECIOS POR PROVEEDOR (auditoría/administrativa): botón [VER HISTORIAL DE PRECIOS] en la fila del proveedor. Abre modal con tabla Fecha | Producto | Precio | Tipo Factura, derivada de recorrer `pos_invoices.items[]` filtrados por `proveedorId`, ordenada por fecha descendente. No requiere una clave de almacenamiento nueva: es una vista calculada sobre `pos_invoices`, que ya guarda precio e ítems por factura.

PEDIDOS DE COMPRA
- Formulario de Pedido: Selector de Proveedor, fecha estimada de entrega.
- Tabla de ítems: Producto (búsqueda en INVENTARIO), Cantidad, Precio Proveedor, Subtotal.
- Botón [SUGERIR PEDIDO]: El sistema analiza ventas de los últimos 30 días + stock actual/mínimo y arma una lista de productos a reponer.
- Tabla de Pedidos Guardados: N° OC | Proveedor | Fecha | Estado (Pendiente/Recibido) | Total.
- Persistencia: Cada pedido creado o modificado se guarda en `pos_purchase_orders`.

FACTURAS (Carga directa o desde pedido)
- Cargar factura sin pedido previo: [CARGAR FACTURA] → seleccionar proveedor → cargar ítems manualmente → confirmar.
- Recibir mercadería desde pedido: [RECIBIR] en pedido pendiente → ajustar cantidades → confirmar.
- TIPO DE FACTURA: Se hereda automáticamente del proveedor (A/B/X), pero el usuario puede hacer OVERRIDE (cambiarlo) en el formulario de la factura individual si el proveedor emitió un tipo distinto ese día.
- Persistencia: Cada factura confirmada se guarda en `pos_invoices` (con estructura: proveedorId, fecha, tipo, items[], montoTotal, estado).
- Al confirmar recepción/carga:
  - Se llama `NUCLEO.actualizarStock(code, +cantidad, 'recepcion', userId)` por cada ítem.
  - Se llama `NUCLEO.actualizarCostoProducto(code, costoReal, userId)` por cada ítem.
  - Se aplica la regla 70%/50% según el tipo de factura (A/B = 70%, X = 50%).
  - Se calcula `itemsConMargenErosionado` (comparando el nuevo costo contra `pos_min_margins`).
  - Se emite el evento `pos:facturaRecibida` (ver §5).

REGLA DE COSTO REAL (70% / 50%)
- Factura A o B: Costo real = Precio de factura × 70%.
- Factura X: Costo real = Precio de factura × 50%.
- Esta regla es fija (recomendación de la contadora). NO se desglosan impuestos individuales.

MARGEN EROSIONADO (Fuente única de verdad)
- COMPRAS es el ÚNICO módulo que calcula si un margen se erosionó al momento de recibir la factura.
- Usa `pos_min_margins` (de CONFIG) para evaluar si el nuevo precio de venta (que no cambió) ahora está por debajo del margen mínimo permitido con el nuevo costo real.
- Genera el array `itemsConMargenErosionado[]` y lo incluye en el payload del evento. AUTOMATIZACIÓN solo lee este array y genera la alerta (no recalcula nada).

5. INTEGRACIÓN
Emite eventos: `pos:facturaRecibida` usando `NUCLEO.emit('pos:facturaRecibida', payload)`.
Payload: `{ proveedorId, diasCredito, monto, fecha, tipoFactura, itemsConMargenErosionado: [{code, name, costoAnterior, costoNuevo, margenActual, margenMinimoRequerido}] }`.
Llama funciones del Núcleo: `actualizarStock`, `actualizarCostoProducto`, `roundCurrency`, `money`, `toast`, `esc`, `normText`, `emit`, `getUsuarioActivo`.
Alimenta a: INVENTARIO (actualiza stock y costo), FINANZAS (crea reservas automáticas si hay días de crédito), AUTOMATIZACIÓN (dispara alertas de margen erosionado usando el payload provisto).

6. CSS
PROPIO: `.compras-*` (layout, sidebar, secciones, tablas, formularios).
CONGELADO: todo lo demás de `core.css`.

7. CHECKLIST DE REGRESIÓN
[ ] COMPRAS lista proveedores desde `pos_suppliers`; no existe formulario de alta en COMPRAS.
[ ] Crear pedido manual → persiste en `pos_purchase_orders`.
[ ] [SUGERIR PEDIDO] → muestra lista de productos a reponer basada en ventas de los últimos 30 días.
[ ] Recibir mercadería desde pedido → stock se actualiza en `pos_products` vía `NUCLEO.actualizarStock()`.
[ ] Recibir mercadería → costo se actualiza en `pos_products.cost` (aplicando 70% o 50% según tipo factura) vía `NUCLEO.actualizarCostoProducto(code, costo, userId)`.
[ ] Cargar factura sin pedido previo → persiste en `pos_invoices`, stock y costo se actualizan.
[ ] Override de Tipo de Factura → se puede cambiar el tipo (A/B/X) por factura individual sin alterar el default del proveedor.
[ ] Proveedor con días de crédito → se emite `pos:facturaRecibida`; FINANZAS escucha y crea la reserva.
[ ] Margen erosionado detectado → COMPRAS calcula el array y lo incluye en el payload de `pos:facturaRecibida`; AUTOMATIZACIÓN genera la alerta.
[ ] Pedido o factura creados → guardan `userId` del usuario activo en `pos_purchase_orders` / `pos_invoices`.
[ ] [VER HISTORIAL DE PRECIOS] en un proveedor → muestra ítems de `pos_invoices` filtrados por ese proveedor, ordenados por fecha.
[ ] Baja lógica de proveedor (en CONFIG) → no borra si tiene pedidos (`pos_purchase_orders`) o facturas (`pos_invoices`) asociadas.
[ ] ESC → vuelve a CAJA desde cualquier vista.

8. RESTRICCIONES NEGATIVAS
- NO escribir directamente en `pos_products` (usar `actualizarStock` y `actualizarCostoProducto` del NÚCLEO).
- NO borrar productos físicamente (usar flag `active` de INVENTARIO).
- NO tocar el DOM de la barra superior.
- NO usar librerías externas.
- NO crear funciones de reporte (eso es REPORTES).
- NO sugerir automáticamente el proveedor más barato (el dueño elige).
- NO crear, editar ni dar de baja proveedores desde COMPRAS (usar CONFIG).
- NO recalcular márgenes erosionados en AUTOMATIZACIÓN (COMPRAS ya lo calcula y lo envía en el payload).

9. APARCADO
- Importación de facturas desde PDF/CSV (futuro, con OCR).
- Comparativa de precios entre proveedores.

10. BLINDAJE VISUAL
NAMESPACING: `.compras-*`. PROHIBIDO `.caja-*`, `.inv-*`, `.config-*`, `.rep-*`, `.fin-*`, `.alert-*`.
CORE.CSS: PROHIBIDO modificar.
LAYOUT: `height: 100%` de `#moduleContainer`. PROHIBIDO `calc(100vh - Xpx)`.
TOPBAR: se genera dinámicamente. PROHIBIDO tocar el HTML.
ESTÉTICA: minimalista blanca. Referencia: MAQUETA_COMPRAS.