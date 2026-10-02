ANEXO D — FICHA DE MÓDULO: CONFIG (CERRADA / CONGELADA)
PROPÓSITO
Módulo dueño de todas las configuraciones del sistema: Sub-Cajas, Categorías, Márgenes, Proveedores, Botones Rápidos, Moneda, Negocio, Periféricos y Usuarios.

CONTRATO DE DATOS
ESCRIBE: `pos_subcajas`, `pos_categories`, `pos_min_margins`, `pos_suppliers`, `pos_quick_buttons`, `pos_moneda`, `pos_business`, `pos_peripherals`, `pos_users`, `pos_config`
ESCRIBE CONDICIONAL: `pos_products.category` (SOLO vía servicio del NÚCLEO `renombrarCategoria()`), `ventaSuelta` y `priceLoose` en `pos_products` (SOLO vía servicio del NÚCLEO `setProductCigConfig()`).
ESCRIBE (vía servicio exclusivo del NÚCLEO): `pos_config_audit_log`, SOLO vía `NUCLEO.registrarCambioConfig()`.
LEE: `pos_products` (para listar marcas de cigarrillos y vincular botones rápidos), `pos_purchase_orders` e `pos_invoices` (para validar baja lógica de proveedores), `pos_config_audit_log` (para la Vista Auditoría).
PROHIBIDO ESCRIBIR: `pos_products` directamente (excepto vía los servicios del NÚCLEO mencionados), `pos_sales`, `pos_cierres`, `pos_cig_subcaja`, `pos_tickets_log`.

VISUAL
Referencia: MAQUETA_CONFIG_AUDITORIA.html - MAQUETA_CONFIG_BOTONESRAPIDOS.html - MAQUETA_CONFIG_CATEGORIAS.html - MAQUETA_CONFIG_MARGENES.html - MAQUETA_CONFIG_MONEDA.html - MAQUETA_CONFIG_NEGOCIO.html - MAQUETA_CONFIG_PERIFERICOS.html - MAQUETA_CONFIG_PROVEEDORES.html - MAQUETA_CONFIG_SUBCAJAS.html - MAQUETA_CONFIG_USUARIOS.html - (.html adjunta al ejecutar este ANEXO).
Estética minimalista blanca (definida en `core.css`).
Reglas de comportamiento:
- Layout 2 paneles: sidebar izquierda (240px fija) + panel principal derecho (fluido).
- Sidebar con 10 secciones clickeables: Sub-Cajas · Categorías · Márgenes · Proveedores · Botones Rápidos · Moneda · Negocio · Periféricos · Usuarios · Auditoría.
- Panel principal con header + badge de estado + contenido dinámico por vista.
- Sin scroll de página.
- Desviación de la maqueta = devolución.

COMPORTAMIENTO (Reglas de negocio)
REGLA TRANSVERSAL DE AUDITORÍA: en las 9 vistas de datos de este anexo (Sub-Cajas, Categorías, Márgenes, Proveedores, Botones Rápidos, Moneda, Negocio, Periféricos, Usuarios), CADA "Guardado instantáneo" ejecuta dos escrituras en el mismo paso: (1) persiste el cambio en su clave `pos_*` correspondiente, y (2) invoca `NUCLEO.registrarCambioConfig({modulo:'CONFIG', seccion, campo, valorAnterior, valorNuevo, userId: NUCLEO.getUsuarioActivo().id})`. Esto aplica también a acciones de alta/baja (ej. agregar/eliminar un proveedor, un usuario, una categoría), no solo a edición de campos existentes.

VISTA SUB-CAJAS (específica de Cigarrillos)
- ÚNICA POLÍTICA CONFIGURABLE: `printSubCajaTicketOnClose` (SÍ/NO).
- MARCAS HABILITADAS: tabla `selectedBrands` con columnas MARCA | PRECIO SUELTO | HABILITAR SUELTO | X.
- AGREGAR MARCA: abre modal con productos ACTIVOS de categoría "Cigarrillos".
- PRECIO SUELTO: input manual; si vacío, default visual `roundCurrency(precio/20)`.
- X (eliminar): quita de `selectedBrands` y desactiva `ventaSuelta` / `priceLoose` en `pos_products`.
- Guardado instantáneo: cada cambio persiste inmediatamente en `pos_subcajas`.

VISTA CATEGORÍAS (gestión dinámica)
- TABLA: ID | NOMBRE | PRODUCTOS ASOCIADOS | EDITAR | X.
- AGREGAR CATEGORÍA: modal con input NOMBRE + botón GUARDAR.
- EDITAR: cambia el nombre de la categoría. Invoca `NUCLEO.renombrarCategoria(oldName, newName)` para actualizar `pos_products.category` en todos los productos asociados de forma segura.
- X (eliminar): SOLO si no hay productos asociados; si hay, toast "No se puede eliminar: hay N productos usando esta categoría".
- CATEGORÍA ESPECIAL "Cigarrillos": NO se puede eliminar ni renombrar (regla fija del sistema para el split automático).
- Guardado instantáneo: cada cambio persiste en `pos_categories`.
- NÚCLEO: `pos_categories` se inicializa vacío; CONFIG es el dueño de gestionarlas.
- NOTA DE PUESTA EN MARCHA: La categoría "Cigarrillos" no se crea automáticamente por el sistema. Su creación manual en esta vista es un paso obligatorio y previo para habilitar la lógica de sub-caja de cigarrillos en CAJA.

VISTA MÁRGENES (márgenes mínimos por categoría)
- TABLA: CATEGORÍA | MARGEN MÍNIMO (%) | EDITAR.
- MARGEN DEFAULT: 35% (se muestra al pie de la tabla como "Margen default para nuevas categorías").
- EDITAR: input numérico por categoría; validación: mínimo 0%, máximo 100%.
- CATEGORÍA ESPECIAL "Cigarrillos": NO tiene margen mínimo (pérdida real = precio < costo); se muestra con badge "EXCLUIDO".
- Guardado instantáneo: cada cambio persiste en `pos_min_margins`.
- NÚCLEO: `checkLoss()` lee `pos_min_margins[category]` en vez de usar `DEFAULT_MIN_MARGIN` fijo.

VISTA PROVEEDORES (gestión de proveedores)
- TABLA: Nombre | Rubro | CUIT | Días Visita | Días Entrega | Tipo Factura | Días Crédito | Acciones.
- FORMULARIO DE ALTA/EDICIÓN:
  - Nombre / Razón Social (obligatorio).
  - Rubro (texto, obligatorio, ej: "Bebidas", "Limpieza", "Almacén"). Usado por COMPRAS para identificar rápidamente el tipo de proveedor en su tabla de selección.
  - CUIT (formato XX-XXXXXXXX-X, validación de dígitos verificadores).
  - Teléfono (opcional).
  - Email (opcional, validación de formato).
  - WhatsApp (opcional).
  - Días de Visita (checkbox múltiple: Lunes a Domingo). Cuándo toma el pedido.
  - Días de Entrega (checkbox múltiple: igual). Cuándo trae la mercadería.
  - Formas de Pago (checkbox múltiple: Efectivo, Transferencia, Cuenta Corriente).
  - Tipo de Factura (select: A, B, X). Determina si se aplica 70% o 50% al costo. Nota: Es el tipo por defecto del proveedor; COMPRAS permite override por factura individual.
  - Días de Crédito (input numérico, default 0 = contado).
- BAJA LÓGICA: flag `activo: false`. NO se puede eliminar si tiene pedidos (`pos_purchase_orders`) o facturas (`pos_invoices`) asociadas.
- Guardado instantáneo: cada cambio persiste en `pos_suppliers`.

VISTA BOTONES RÁPIDOS (actualizada)
- Formulario: NOMBRE + PRECIO + UNIDAD (select: 1 unidad, 1 kg, 100 gr, 1 litro) + botón [VINCULAR PRODUCTO].
- [VINCULAR PRODUCTO]: abre modal con lista de productos ACTIVOS de INVENTARIO; al seleccionar, guarda el `code` del producto en `linkedProductCode` del botón rápido. Si el botón ya tenía un producto vinculado, muestra el nombre actual y permite cambiarlo o quitar el vínculo.
- Tabla: # | NOMBRE | PRECIO | UNIDAD | PRODUCTO VINCULADO | X.
- Máximo 21 botones.
- AGREGAR/EDITAR: si el nombre ya existe, actualiza precio, unidad y vínculo; si no, crea nuevo.
- Guardado instantáneo: cada cambio persiste en `pos_quick_buttons`.
- CAJA los lee: si el botón tiene `linkedProductCode`, descuenta stock del producto real; si no, se comporta como venta suelta (dummy en memoria).

VISTA MONEDA
- Campos editables: código ISO (default ARS), símbolo (default $), múltiplo de redondeo (default 100).
- Demo en vivo: muestra ejemplo de redondeo.
- Denominaciones: lista de billetes/monedas en circulación (default [100, 200, 500, 1000, 2000, 5000, 10000]).
- Denominaciones editables: agregar/remover como tags; se ordenan ascendente automáticamente.
- Guardado instantáneo: cada cambio persiste en `pos_moneda`.

VISTA NEGOCIO (datos fiscales del negocio)
- Campos editables:
  - Razón social (texto, obligatorio para tickets fiscales).
  - CUIT (texto, formato XX-XXXXXXXX-X, validación de dígitos verificadores).
  - Dirección (texto).
  - Teléfono (texto, opcional).
  - Email (texto, validación de formato, opcional).
  - Inicio de actividades (fecha, opcional).
- PREVIEW DEL TICKET: muestra cómo se verá el header del ticket con los datos del negocio.
- Guardado instantáneo: cada cambio persiste en `pos_business`.
- NÚCLEO: `getTicketHTML()` lee `pos_business` para el header del ticket (reemplaza "NEURORA POS — KIOSCO" fijo).

VISTA PERIFÉRICOS (configuración de hardware y sistema)
- IMPRESORA:
  - Tipo: select (Térmica ESC/POS, Matricial, Inyección de tinta, PDF virtual).
  - Modelo: texto (ej: "EPSON TM-T20", "Xprinter XP-58").
  - Puerto: select (USB, COM1-COM9, LPT1, Red).
  - Ancho de papel: select (58mm, 80mm, A4).
  - Impresión automática post-cobro (`autoPrintTicket`): toggle SÍ/NO (default NO). Si es SÍ, CAJA imprime directo tras cobrar; si es NO, muestra preview.
  - Botón [PROBAR IMPRESIÓN]: imprime ticket de prueba.
- AVISO DE BACKUP: al entrar a CONFIG, si `NUCLEO.shouldRemindBackup()` retorna `true` (3+ días desde el último backup), se muestra un banner "No hacés un backup hace X días" con botón [BACKUP AHORA] que invoca `backupJSON()`.
- LECTOR DE CÓDIGOS:
  - Tipo: select (USB HID, Serie RS232, Bluetooth).
  - Prefijo: texto (ej: algunos lectores agregan caracteres al inicio).
  - Sufijo: texto (ej: algunos lectores agregan Enter al final).
  - Botón [PROBAR LECTURA]: abre modal que escucha el lector y muestra el código leído.
- CAJÓN DE DINERO (opcional):
  - Habilitado: toggle SÍ/NO.
  - Comando de apertura: texto (ej: comando ESC/POS específico).
  - Momento de apertura: select (Al abrir caja, Al cobrar, Al cerrar caja, Manual).
- Guardado instantáneo: cada cambio persiste en `pos_peripherals` (hardware) y `pos_config` (`autoPrintTicket`).
- NÚCLEO: `printTicket()` lee `pos_peripherals.printer` para configurar la impresión. CAJA lee `pos_config.autoPrintTicket` para el flujo post-cobro.

VISTA USUARIOS (se desarrolla al último)
- TABLA: ID | NOMBRE | ROL | PIN | ÚLTIMO ACCESO | EDITAR | X.
- AGREGAR USUARIO: modal con NOMBRE + ROL (select: Admin, Cajero) + PIN (4-6 dígitos).
- EDITAR: cambia nombre, rol o PIN.
- X (eliminar): NO se puede eliminar el último usuario Admin; si hay otros Admin, sí se puede eliminar.
- LOGIN: al abrir el sistema, modal de login con selector de usuario + input PIN.
- SESIÓN ACTIVA: muestra usuario logueado en la topbar (reemplaza "Cajero: N/A").
- Guardado instantáneo: cada cambio persiste en `pos_users`.

VISTA AUDITORÍA (solo lectura — trazabilidad del sistema)
- TABLA: Fecha | Usuario | Módulo | Sección | Campo | Valor Anterior | Valor Nuevo, ordenada por fecha descendente (más reciente primero).
- FILTROS: por usuario (select con usuarios de `pos_users`), por rango de fechas, por sección.
- Fuente de datos: `pos_config_audit_log` (ver REGLA TRANSVERSAL DE AUDITORÍA al inicio de este §4). Esta vista es EXCLUSIVAMENTE de lectura: no tiene formulario de alta ni acciones de edición/eliminación (el log de auditoría no se puede alterar desde la UI).
- NOTA: esta vista muestra únicamente cambios de CONFIGURACIÓN. No incluye ventas, cierres, movimientos de stock ni facturas — esos historiales viven en sus propios módulos (CAJA, INVENTARIO, COMPRAS respectivamente) y no se centralizan aquí para no violar el principio de propiedad de datos de cada anexo.

INTEGRACIÓN
Emite eventos: (Ninguno por ahora).
Escucha eventos: (Ninguno por ahora).
Llama funciones del NÚCLEO: `setProductCigConfig`, `renombrarCategoria`, `roundCurrency`, `normCategory`, `normText`, `money`, `esc`, `toast`, `backupJSON`, `shouldRemindBackup`, `runChecks`, `printTicket`, `registrarCambioConfig`, `getUsuarioActivo`.
Alimenta a: CAJA (botones rápidos vinculados, marcas habilitadas, precios sueltos, `autoPrintTicket`), CIERRE (política de ticket de sub-caja), INVENTARIO (categorías dinámicas), COMPRAS (proveedores — CONFIG es dueño exclusivo del ABM en `pos_suppliers`; COMPRAS solo lee), NÚCLEO (márgenes, datos del negocio, periféricos, usuarios).

CSS
PROPIO: `.config-*` (layout, sidebar, secciones, tablas, formularios, tarjetas de sistema).
CONGELADO: todo lo demás de `core.css`.

CHECKLIST DE REGRESIÓN
[ ] Sidebar muestra 10 secciones activas.
[ ] Cualquier guardado instantáneo (en cualquiera de las 9 vistas de datos) → además de persistir en su clave `pos_*`, invoca `registrarCambioConfig()` y aparece una fila nueva en Auditoría.
[ ] Auditoría → filtro por usuario funciona.
[ ] Auditoría → filtro por rango de fechas funciona.
[ ] Auditoría → la vista es de solo lectura (no hay botón de edición ni de borrado de filas).
[ ] Categorías → AGREGAR → persiste en `pos_categories`; INVENTARIO lo muestra en dropdown.
[ ] Categorías → EDITAR nombre → invoca `renombrarCategoria()` y actualiza `pos_products.category` en productos asociados.
[ ] Categorías → X en categoría con productos → toast "No se puede eliminar".
[ ] Categorías → X en categoría "Cigarrillos" → toast "No se puede eliminar ni renombrar".
[ ] Márgenes → EDITAR margen de categoría → persiste en `pos_min_margins`.
[ ] Márgenes → categoría "Cigarrillos" muestra badge "EXCLUIDO".
[ ] Proveedores → AGREGAR proveedor con días de visita/entrega/tipo factura → persiste en `pos_suppliers`.
[ ] Proveedores → campo Rubro obligatorio → persiste en `pos_suppliers` y es leído por COMPRAS en su tabla de selección.
[ ] Proveedores → X en proveedor con pedidos o facturas → toast "No se puede eliminar".
[ ] Botones Rápidos → AGREGAR con producto vinculado → persiste `linkedProductCode` en `pos_quick_buttons`.
[ ] Botones Rápidos → CAJA hace click en botón con vínculo → descuenta stock del producto real.
[ ] Botones Rápidos → CAJA hace click en botón sin vínculo → no descuenta stock (venta suelta).
[ ] Negocio → editar razón social/CUIT/dirección → persiste en `pos_business`; preview del ticket actualiza.
[ ] Periféricos → seleccionar tipo de impresora → persiste en `pos_peripherals`.
[ ] Periféricos → toggle `autoPrintTicket` → persiste en `pos_config`; CAJA lee el nuevo valor.
[ ] Periféricos → [PROBAR IMPRESIÓN] → imprime ticket de prueba.
[ ] Usuarios → AGREGAR usuario con PIN → persiste en `pos_users`.
[ ] Usuarios → X en último Admin → toast "No se puede eliminar".
[ ] Sub-Cajas → toggle `printSubCajaTicketOnClose` persiste en `pos_subcajas`.
[ ] Moneda → editar código/símbolo/múltiplo → persiste en `pos_moneda`, demo recalcula.
[ ] Sistema → BACKUP JSON → descarga archivo JSON con todas las claves `pos_*`.
[ ] Sistema → si pasaron 3+ días sin backup, banner de aviso llama `shouldRemindBackup()` y ofrece [BACKUP AHORA].
[ ] ESC → vuelve a CAJA desde cualquier vista.

RESTRICCIONES NEGATIVAS
- NO escribir directamente en `pos_products` (usar `setProductCigConfig` y `renombrarCategoria` del NÚCLEO para las excepciones permitidas).
- NO dar de baja productos del inventario desde Sub-Cajas.
- NO tocar el DOM de la barra superior.
- NO usar librerías externas.
- NO crear funciones de reporte.
- NO eliminar la categoría "Cigarrillos".
- NO permitir margen mínimo para "Cigarrillos".
- NO eliminar el último usuario Admin.
- NO eliminar proveedores con pedidos o facturas asociadas (usar baja lógica).
- NO editar ni eliminar entradas de `pos_config_audit_log` desde la UI (la Vista Auditoría es exclusivamente de lectura).
- NO escribir en `pos_config_audit_log` directamente (usar `NUCLEO.registrarCambioConfig()`).

BLINDAJE VISUAL
NAMESPACING: `.config-*`. PROHIBIDO `.caja-*`, `.inv-*`, `.rep-*`, `.compras-*`, `.fin-*`, `.alert-*`.
CORE.CSS: PROHIBIDO modificar.
LAYOUT: `height: 100%` de `#moduleContainer`. PROHIBIDO `calc(100vh - Xpx)`.
TOPBAR: se genera dinámicamente. PROHIBIDO tocar el HTML.
ESTÉTICA: minimalista blanca. Referencia: MAQUETA_CONFIG.

APARCADO
- Configuración avanzada de impuestos (IVA, IIBB).
- Integración con AFIP (facturación electrónica).
- Multi-sucursal (gestión de varias ubicaciones).