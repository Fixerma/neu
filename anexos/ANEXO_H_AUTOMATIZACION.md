ANEXO H — FICHA DE MÓDULO: AUTOMATIZACIÓN (CONGELADO)

1. PROPÓSITO
Motor transversal de alertas y salud del negocio, para prevenir pérdidas o falta de liquidez que el dueño no siempre tiene presentes. No bloquea la operatoria: las alertas son informativas y el dueño puede ignorarlas (marcarlas como leídas).

2. CONTRATO DE DATOS
ESCRIBE: nada directamente.
LLAMA (servicios exclusivos del NÚCLEO): `NUCLEO.registrarAlerta()`, `NUCLEO.marcarAlertaLeida()`.
LEE: `pos_products`, `pos_sales`, `pos_suppliers`, `pos_purchase_orders`, `pos_finanzas_reservas`, `pos_finanzas_gastos`, `pos_cierres`, `pos_alerts_log`.
PROHIBIDO ESCRIBIR (directo): todas las claves transaccionales, incluido `pos_alerts_log` (siempre vía servicios del NÚCLEO).

3. VISUAL
Referencia: MAQUETA_AUTOMATIZACION (imagen adjunta al ejecutar este ANEXO).
Estética minimalista blanca (definida en `core.css`).
Reglas de comportamiento:
- Ícono 🔔 en el slot reservado por el NÚCLEO (topbar, entre solapas y badge de estado).
- Badge rojo con conteo de alertas ALTA no leídas.
- Click en ícono → abre dropdown de tarjetas de alertas (no leídas).
- Click en "Marcar como leída" en una tarjeta → desaparece del dropdown, queda en el log (`pos_alerts_log` con `leida: true`).
- El ícono de campana se actualiza cada vez que se cambia de pestaña o se ejecuta una acción crítica.
- Sin scroll de página.
- Desviación de la maqueta = devolución.

4. COMPORTAMIENTO (Reglas de negocio)

LAS 4 ALERTAS IMPLEMENTADAS:

4.1 Margen Erosionado (Severidad: ALTA)
- Desencadenante: Evento `pos:facturaRecibida` (emitido por COMPRAS).
- Lógica: Lee `itemsConMargenErosionado[]` del payload. Si el array no está vacío, genera una alerta ALTA por cada ítem.
- AUTOMATIZACIÓN NO recalcula márgenes; solo lee el array provisto por COMPRAS (fuente única de verdad).
- Deduplicar: no generar alerta duplicada si ya existe una alerta no leída del mismo tipo + misma fecha + mismo producto.

4.2 Flujo de Caja / Liquidez (Severidad: ALTA)
- Desencadenante: Al entrar a FINANZAS o al abrir la app (máximo 1 vez por día).
- Lógica: Compara reservas que vencen en ≤3 días (desde `pos_finanzas_reservas` con estado `activa`) vs. Efectivo Disponible (calculado igual que el Dashboard de FINANZAS: montoApertura de `pos_ciclo_actual` + ventas efectivo del ciclo − subcaja cigarrillos − reservas activas).
- Si las reservas que vencen superan el efectivo disponible → alerta ALTA.
- Deduplicar: no generar más de 1 alerta de liquidez por día.

4.3 Sugerencia de Compra Inteligente (Severidad: MEDIA)
- Desencadenante: Background diario o al entrar a COMPRAS.
- Lógica: Cruza ventas de los últimos 30 días (`pos_sales`) + stock actual vs. mínimo (`pos_products`) + días de entrega del proveedor (`pos_suppliers`). Si un producto activo tiene stock ≤ mínimo y no hay pedidos pendientes (`pos_purchase_orders`) para ese producto → alerta MEDIA.
- Deduplicar: no generar alerta duplicada si ya existe una no leída del mismo tipo + mismo producto en los últimos 7 días.

4.4 Control de Caja Chica (Severidad: BAJA)
- Desencadenante: Evento `pos:cierreRealizado` (emitido por CAJA al confirmar arqueo).
- Lógica: Evalúa los últimos 3 cierres (`pos_cierres`). Si los 3 tienen diferencia negativa (faltante) → alerta BAJA.
- Deduplicar: no generar más de 1 alerta de caja chica por cierre.

5. MECANISMO DE PERSISTENCIA
- Las alertas calculadas en tiempo real (al ocurrir el evento desencadenante) o periódicas (liquidez, 1x/día) se persisten vía `NUCLEO.registrarAlerta({tipo, severidad, mensaje, moduloDestino, fecha, leida:false})`.
- El dropdown muestra solo alertas con `leida: false`.
- Marcar como leída: `NUCLEO.marcarAlertaLeida(alertaId, userId)` → actualiza `leida: true` y `leidaPor: userId` en `pos_alerts_log`.
- Para procesos automáticos sin sesión activa (ej. alertas periódicas de liquidez), se usa `userId: 'sistema'`.

6. INTEGRACIÓN
Escucha eventos:
- `pos:facturaRecibida` → si `itemsConMargenErosionado` no está vacío, genera alertas ALTAS (§4.1).
- `pos:cierreRealizado` → evalúa los últimos cierres para generar alerta BAJA de caja chica (§4.4).
Transversal a todos los módulos: lee de CAJA, INVENTARIO, CONFIG, COMPRAS, FINANZAS.
No bloquea la operatoria: el dueño puede ignorar las alertas (se marcan como leídas).
El ícono de campana se actualiza cada vez que se cambia de pestaña o se ejecuta una acción crítica.
Llama funciones del NÚCLEO: `registrarAlerta`, `marcarAlertaLeida`, `getCicloAbierto`, `getVentasPorMetodo`, `getVentasSubCajaDelCiclo`, `getUsuarioActivo`, `today`, `nowISO`, `getData`, `on`, `toast`.

7. CSS
PROPIO: `.alert-*` (dropdown, tarjetas de alerta, badge, ícono de campana).
CONGELADO: todo lo demás de `core.css`.

8. CHECKLIST DE REGRESIÓN
[ ] Ícono 🔔 visible en el slot de la topbar.
[ ] Badge rojo muestra conteo correcto de alertas ALTA no leídas.
[ ] Click en ícono → abre dropdown con tarjetas de alertas no leídas.
[ ] Click en "Marcar como leída" → tarjeta desaparece del dropdown.
[ ] Alerta de Margen Erosionado (ALTA): se dispara al recibir evento `pos:facturaRecibida` con `itemsConMargenErosionado` no vacío.
[ ] Alerta de Liquidez (ALTA): se dispara al entrar a FINANZAS o abrir la app (1x/día) si reservas que vencen en ≤3 días superan efectivo disponible.
[ ] Alerta de Compra Inteligente (MEDIA): se dispara diariamente o al entrar a COMPRAS si hay productos con stock ≤ mínimo sin pedidos pendientes.
[ ] Alerta de Caja Chica (BAJA): se dispara al recibir evento `pos:cierreRealizado` si los últimos 3 cierres tienen diferencia negativa.
[ ] Deduplicación: no se generan alertas duplicadas (mismo tipo + fecha + producto/proveedor).
[ ] Alertas persisten vía `NUCLEO.registrarAlerta()`, nunca escribe directo en `pos_alerts_log`.
[ ] Marcar como leída persiste vía `NUCLEO.marcarAlertaLeida(id, userId)`.
[ ] Procesos automáticos sin sesión usan `userId: 'sistema'`.
[ ] AUTOMATIZACIÓN no recalcula márgenes erosionados (lee el array del payload de COMPRAS).
[ ] Badge se actualiza al cambiar de pestaña.
[ ] ESC → cierra el dropdown de alertas si está abierto.

9. RESTRICCIONES NEGATIVAS
- NO tener solapa propia en la topbar (solo ícono de campana + dropdown).
- NO bloquear la operatoria (las alertas son informativas, no obligatorias).
- NO escribir directamente en `pos_alerts_log` (usar `NUCLEO.registrarAlerta()` y `NUCLEO.marcarAlertaLeida()`).
- NO recalcular márgenes erosionados (COMPRAS ya lo calcula y lo envía en el payload).
- NO modificar datos transaccionales (solo lee y calcula).
- NO tocar el DOM de la topbar (solo agregar el ícono de campana en el slot reservado).
- NO usar librerías externas.
- NO crear funciones de reporte (eso es REPORTES).

10. BLINDAJE VISUAL
NAMESPACING: `.alert-*`. PROHIBIDO `.caja-*`, `.inv-*`, `.config-*`, `.rep-*`, `.compras-*`, `.fin-*`.
CORE.CSS: PROHIBIDO modificar.
LAYOUT: `height: 100%` de `#moduleContainer`. PROHIBIDO `calc(100vh - Xpx)`.
TOPBAR: se genera dinámicamente. PROHIBIDO tocar el HTML (solo inyectar contenido en el slot de campana reservado por el NÚCLEO).
ESTÉTICA: minimalista blanca. Referencia: MAQUETA_AUTOMATIZACION.

11. APARCADO
- Alertas por vencimiento de productos (futuro, cuando se defina la lógica exacta).
- Notificaciones push fuera del navegador (futuro).
- Alertas por email/WhatsApp (futuro).