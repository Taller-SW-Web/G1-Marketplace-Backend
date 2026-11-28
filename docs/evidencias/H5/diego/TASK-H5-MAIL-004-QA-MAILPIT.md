# TASK-H5-MAIL-004 · Pruebas de correos en clientes (Mailpit) y en texto plano

**Fecha de ejecución:** 24 de noviembre de 2026\
**Responsable:** @DiesmEsp (Diego Espinoza)\
**Revisor asignado:** @saire22 (Fernando Saire)\
**Issue de origen:** [Backend #323](https://github.com/Taller-SW-Web/G1-Marketplace-Backend/issues/323)\
**Issue vinculado:** [Frontend #156](https://github.com/Taller-SW-Web/G1-Marketplace-Frontend/issues/156) (@GiulianoMaPe)\
**Especificación técnica:** `F-033 Generar plantilla de correo` · `C-001` · `C-002` · Gates `G-MAIL`, `I-02`, `I-05`

---

## 1. Resumen de Ejecución y Alcance

Se ejecutaron pruebas integrales de renderizado, compatibilidad y seguridad sobre las plantillas de correo comercial entregadas en el paquete de Frontend #156:
- **C-001**: Correo de confirmación de pedido (`PED-DEMO-0241`). Asunto: *"Tu pedido PED-DEMO-0241 fue confirmado"*.
- **C-002**: Correo de actualización de despacho (`PED-DEMO-0241`). Asunto: *"Actualización de tu pedido PED-DEMO-0241: En camino"*.

Ambos correos fueron transmitidos a través del servidor SMTP de **Mailpit** (levantado en contenedor Docker `axllent/mailpit:latest` en puertos `1025` SMTP y `8025` Web UI) como mensajes MIME multiparte (`multipart/alternative`), evaluando la parte `text/html` y la parte `text/plain`.

---

## 2. Declaración Metodológica: Datos Simulados vs. Flujo Integrado

> **DECLARACIÓN OFICIAL:** Se probó con **DATOS SIMULADOS (Fixtures estáticos entregados por Frontend en FE #156)**.

### Justificación Técnica y Normativa del Proyecto:
1. **Origen de los artefactos:** Las plantillas emplean el pedido de demostración `PED-DEMO-0241` y enlaces en el dominio de prueba reservado `marketplace.example.invalid`.
2. **Estado del Backend:** El backend de notificaciones no tiene aún activado el adaptador hacia un proveedor SMTP externo en producción ni la conexión con eventos reales de Ventas (`I-02`/`I-05`), los cuales se encuentran acotados bajo el gate `G-MAIL`.
3. **Cumplimiento de políticas institucionales:**
   > *"No cerrar un gate con mocks ni sustituir evidencia por la asignación. Registrar bloqueos sólo en la frontera afectada; continuar diseño, implementación y pruebas propias."*

   Por ende, se valida y acredita el gate **"Implementado con datos de prueba"**, dejando explícito que el gate **"Integrado con otro módulo"** permanece pendiente de la integración end-to-end con los servicios externos reales.

---

## 3. Matriz de Resultados de Criterios de Aceptación

| Criterio / Caso de Prueba | Resultado | Observaciones Técnicas |
|---|:---:|---|
| **Renderizado HTML Desktop (700px / 1280px)** | **APROBADO** | Ancho acotado a 600px centrado. Contenedor con borde superior `#1B1812`, tipografía del sistema legible, espaciados consistentes y paleta de colores institucional. |
| **Renderizado HTML Mobile (390px)** | **APROBADO** | La tabla fluida y los estilos inline se adaptan al viewport estrecho sin desbordes horizontales ni pérdida de legibilidad en botones y totales. |
| **Lectura con Imágenes Bloqueadas** | **APROBADO** | Al bloquear o fallar la carga del logotipo (`logo-ink.png`), se despliega correctamente el texto alternativo `alt="Inka Athletics"`. Todos los datos del pedido (código, artículos, montos, fechas, estados) y los botones CTA permanecen 100% legibles y accionables sin degradación de funcionalidad. |
| **Versión en Texto Plano (`text/plain`)** | **APROBADO** | La pestaña "Text" de Mailpit valida la presencia de todo el contenido relevante en orden semántico equivalente, con URLs directas visibles y ausencia de código HTML o entidades no interpretadas. |
| **Validación de Enlaces y Configuración de Prueba** | **APROBADO** | Los enlaces apuntan a `https://marketplace.example.invalid/mis-pedidos` (con `target="_blank"`). No se transmiten tokens temporales, contraseñas ni PII en la query string. El uso de `.invalid` cumple con RFC 2606 para pruebas seguras. |
| **Preheaders en Bandeja de Entrada** | **APROBADO** | Mailpit extrae e indexa los preheaders en los snippets de la lista de correos (*"Tu compra está confirmada..."* y *"Consulta el estado y la fecha estimada..."*). |

---

## 4. Estado de los Gates de Evidencia Separada

- [x] **Diseñado:** Especificaciones `C-001`, `C-002` y `F-033` verificadas contra los requerimientos de UI y marca.
- [x] **Implementado con datos de prueba:** Pruebas completas en servidor Mailpit (Docker), con capturas de pantalla de Desktop, Mobile, Texto Plano, Imágenes Bloqueadas y Enlaces.
- [ ] **Integrado con otro módulo:** *Pendiente / Justificado:* La integración real con eventos de Ventas (`I-02`/`I-05`) y envío externo SMTP pertenece a la frontera del gate `G-MAIL`.
- [ ] **Probado en el despliegue:** *Pendiente:* Requiere despliegue con servicio SMTP real.

---

## 5. Galería de Capturas de Evidencia

Las capturas están almacenadas en el repositorio en `docs/evidencias/H5/diego/capturas/`:

1. `01-mailpit-inbox.png` — Bandeja de entrada de Mailpit con ambos correos, emisores, asuntos y preheaders.
2. `02-c001-desktop-imagenes-bloqueadas.png` — C-001 en vista Desktop con imágenes bloqueadas (alt text visible y contenido intacto).
3. `03-c001-texto-plano.png` — C-001 pestaña de texto plano en Mailpit.
4. `04-c001-headers-mime.png` — C-001 inspección de cabeceras RFC 5322 y MIME `multipart/alternative`.
5. `05-c001-desktop-con-logo.png` — C-001 vista Desktop completa con logo de Inka Athletics.
6. `06-c001-mobile-390px.png` — C-001 vista responsive Mobile (390px).
7. `07-c002-desktop-imagenes-bloqueadas.png` — C-002 en vista Desktop con imágenes bloqueadas.
8. `08-c002-texto-plano.png` — C-002 pestaña de texto plano en Mailpit.
9. `09-c002-headers-mime.png` — C-002 inspección de cabeceras y estructura MIME.
10. `10-c002-desktop-con-logo.png` — C-002 vista Desktop completa con logo.
11. `11-c002-mobile-390px.png` — C-002 vista responsive Mobile (390px).
