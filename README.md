# 🛒 Canal Marketplace Multicanal

> **Corte Diego H4 — 28/10/2026:** [implementación, entregas y revisión](docs/DIEGO-H4-ENTREGAS.md). Favoritos conserva el producto al agregar al carrito; CSAT y G6 nuevos permanecen sujetos a aprobación y pruebas REAL. Pruebas de BD únicamente en PostgreSQL 16 desechable mediante `npm run test:diego:isolated`; esto amplía la restricción histórica de BD sólo para ese entorno aislado. No acredita despliegue ni cierre automático de issues.

> **Entorno actual solicitado: Docker local.** Render queda como referencia futura. Consultar [Docker H3](docs/DOCKER-H3.md) para levantar los tres servicios. No se ha desplegado en Render.

> **Resolución vigente del PR #15:** [conflictos, decisiones y registro para auditoría](docs/evidencias/h3/resolucion-conflictos-pr15.md).
> Restricción del usuario: no operar sobre bases de datos. CI actual sin PostgreSQL,
> migraciones ni pruebas con escrituras reales. Favoritos no agrega cambios de esquema;
> la migración de checkout en el repositorio procede de develop.

> **Ampliación vigente de favoritos:** [lectura y agregar al carrito conservando favorito](docs/H3-FAVORITOS-INTEGRACION.md),
> [handoff actualizado](docs/FAVORITOS-FRONTEND-HANDOFF.md) y [evidencia](docs/evidencias/h3/integracion-frontend.md).
> Sin tabla de movimientos ni migraciones nuevas; identidad/catalogo/comercio sandbox.
> La descripción del corte F-036/F-038 que sigue se conserva como contexto histórico.

> **Corte backend H3 de Diego:** [guía de ejecución y contrato](docs/H3-DIEGO-USO.md) y [evidencia local](docs/evidencias/h3/diego-backend.md). El archivo `PLAN-H3-DIEGO-BACKEND.md` es una guía local no versionada. Favoritos F-036/F-038: identidad y elegibilidad MOCK; persistencia PostgreSQL real local. Integración externa y revisión pendientes. El catálogo vigente F-001–F-040 y su reparto están en el repositorio SPECS; las referencias SPEC-01–SPEC-08 de las secciones históricas siguientes no gobiernan el reparto actual.

> **Taller de Software Web — Grupo 1 (G1)**  
> Plataforma e-commerce multicanal orientada a microservicios desarrollada bajo la metodología **Spec-Driven Development (SDD)**.

---

## 👥 Integrantes del Equipo

A continuación se detalla el equipo de desarrollo, roles y responsabilidades técnicas asignadas en el proyecto:

| # | Integrante | Rol Principal | Módulo / SPEC Asignado |
| :-: | :--- | :--- | :--- |
| 1 | **Espinoza Picón, Diego Steven Martin** | 🧭 Jefe de Proyecto / QA | [`SPEC-06`: Seguimiento e Historial de Pedidos](./SPECS/SPEC-06-EP-SHP-Seguimiento-y-Pedidos.md) |
| 2 | **Garcia Lescano, Leonidas** | 🏛️ Arquitecto de Software | [`SPEC-02`: Vitrina y Exploración del Catálogo](./SPECS/SPEC-02-EP-VEC-Vitrina-y-Exploracion-Catalogo.md) |
| 3 | **Luque Mestanza, Jorge Alonso** | ⚙️ Backend Developer | [`SPEC-08`: Gestión de Favoritos y Lista de Deseos](./SPECS/SPEC-08-EP-FAV-Gestion-de-Favoritos.md) |
| 4 | **Macchiavelo Perez, Giuliano** | 🎨 Diseñador UX/UI & Frontend | [`SPEC-05`: Transacción y Realización de Checkout](./SPECS/SPEC-05-EP-TRX-Checkout-y-Pago.md) |
| 5 | **Malca Agüero, Sebastían Matías** | 📝 Documentador & Frontend | [`SPEC-04`: Carrito de Compras](./SPECS/SPEC-04-EP-ITC-Carrito-y-Favoritos.md) |
| 6 | **Morales Usca, Andres Fernando** | 🔒 DevOps & Seguridad | [`SPEC-01`: Gestión de Accesos del Cliente](./SPECS/SPEC-01-EP-GAC-Gestion-de-Accesos.md) |
| 7 | **Saire Tello, Fernando Jose** | ☁️ QA & Cloud Specialist | [`SPEC-07`: Sistema de Notificaciones](./SPECS/SPEC-07-EP-SNT-Sistema-de-Notificaciones.md) |
| 8 | **Segovia Valencia, Jim Bryan Jordan** | 📋 Product Owner | [`SPEC-03`: Detalle y Disponibilidad de Producto](./SPECS/SPEC-03-EP-DDP-Detalle-y-Disponibilidad-Producto.md) |

---

## 📖 Descripción del Proyecto

El **Canal Marketplace Multicanal** es la interfaz digital y capa de orquestación de comercio electrónico que conecta a clientes finales con el ecosistema de microservicios de la organización (Seguridad, Catálogo de Productos, Ventas, Despacho y Notificaciones).

### Objetivos Clave
- **Experiencia de Usuario Fluida:** Vitrina de productos reactiva, navegación ágil, checkout intuitivo y gestión de lista de deseos.
- **Arquitectura Desacoplada:** Comunicación con servicios externos a través de contratos REST estrictamente tipados y adaptadores de integración (Capa D).
- **Persistencia Aislada:** Cero acceso cruzado a bases de datos ajenas; persistencia local autónoma para sesiones efímeras (carrito y deseos).
- **Garantía de Calidad:** Especificaciones técnicas rigurosas (SDD) acompañadas de escenarios de prueba BDD en formato Gherkin.

---

## 📐 Metodología Spec-Driven Development (SDD)

El proyecto adopta **Spec-Driven Development (SDD)**, donde cada Épica de negocio cuenta con un documento de diseño de software ejecutable (**SPEC**) que actúa como la **única fuente de verdad (*Single Source of Truth*)**.

```mermaid
flowchart LR
    A["Requerimiento de Negocio / Épica"] --> B["SPEC Técnico (SDD)"]
    B --> C["Desarrollo Frontend / Backend"]
    B --> D["Pruebas Automatizadas BDD"]
    C --> E["Incremento de Software"]
    D --> E
    E --> F["Definition of Done (DoD)"]
```

### Catálogo de Especificaciones Técnicas

| Código | Épica | Nombre de la Especificación | HUs | PH | Responsable | Documento |
| :---: | :---: | :--- | :---: | :---: | :--- | :---: |
| **`SPEC-01`** | `EP-GAC` | Gestión de Accesos del Cliente | 3 | 11 | Andrés Morales | [Ver SPEC](./SPECS/SPEC-01-EP-GAC-Gestion-de-Accesos.md) |
| **`SPEC-02`** | `EP-VEC` | Vitrina y Exploración del Catálogo | 4 | 13 | Leonidas Garcia | [Ver SPEC](./SPECS/SPEC-02-EP-VEC-Vitrina-y-Exploracion-Catalogo.md) |
| **`SPEC-03`** | `EP-DDP` | Detalle y Disponibilidad de Producto | 4 | 11 | Jim Segovia | [Ver SPEC](./SPECS/SPEC-03-EP-DDP-Detalle-y-Disponibilidad-Producto.md) |
| **`SPEC-04`** | `EP-ITC` | Intención de Transacción y Carrito de Compras | 2 | 8 | Sebastián Malca | [Ver SPEC](./SPECS/SPEC-04-EP-ITC-Carrito-y-Favoritos.md) |
| **`SPEC-05`** | `EP-TRX` | Transacción y Realización de Checkout | 3 | 13 | Giuliano Macchiavelo | [Ver SPEC](./SPECS/SPEC-05-EP-TRX-Checkout-y-Pago.md) |
| **`SPEC-06`** | `EP-SHP` | Seguimiento e Historial de Pedidos | 3 | 11 | Diego Espinoza | [Ver SPEC](./SPECS/SPEC-06-EP-SHP-Seguimiento-y-Pedidos.md) |
| **`SPEC-07`** | `EP-SNT` | Sistema de Notificaciones por Correo | 3 | 13 | Fernando Saire | [Ver SPEC](./SPECS/SPEC-07-EP-SNT-Sistema-de-Notificaciones.md) |
| **`SPEC-08`** | `EP-FAV` | Gestión de Favoritos y Lista de Deseos | 3 | 11 | Alonso Luque | [Ver SPEC](./SPECS/SPEC-08-EP-FAV-Gestion-de-Favoritos.md) |
| **TOTAL** | **8 Épicas** | **Solución Integral Marketplace** | **25** | **91** | **8 Integrantes** | [Catálogo SPECS](./SPECS/README.md) |

---

## 🛠️ Stack Tecnológico

| Capa | Tecnologías |
| :--- | :--- |
| **Frontend** | Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Zustand, React Hook Form, Zod |
| **Backend** | NestJS, TypeScript, class-validator, Axios, Prisma ORM |
| **Persistencia** | PostgreSQL (Dockerizado) / Prisma Schema |
| **Integraciones** | Mock Adapters (`axios-mock-adapter`), Resend Email API, Microservicios externos (Seguridad, Productos, Ventas, Despacho) |
| **Testing & Calidad** | Jest, Supertest, Playwright, Gherkin BDD |

---

## Backend NestJS

El servidor del backend usa NestJS con TypeScript, Express y Prisma. Node.js 22 es la versión base (`.node-version`). Las rutas `/` y `/health` comprueban la disponibilidad de PostgreSQL; `/ready` es alias de readiness y `/live` verifica el proceso sin consultar la base de datos. Render usa `/live` como health check para no reiniciar el servicio durante una interrupción de PostgreSQL.

### Desarrollo local

1. Instala Node.js 22 y PostgreSQL local (o inicia el servicio PostgreSQL de `docker-compose.yml`).
2. Copia `.env.example` a `.env` y ajusta `DATABASE_URL` y `CORS_ORIGINS` según tu entorno.
3. Instala y compila:

   ```bash
   npm ci
   npm run build
   ```

4. Ejecuta el servidor y las pruebas:

   ```bash
   npm run start:dev
   npm test
   npm run test:e2e
   ```

Para probar endpoints protegidos mientras `USE_MOCKS=true`, inicia el emisor JWT local en otra terminal:

```bash
npm run mock:auth
```

El emisor sólo escucha en `127.0.0.1:4010`, genera una clave RS256 efímera al iniciar y publica su JWKS en `/jwks`. Obtén un token de fixture con `http://127.0.0.1:4010/token?user=default` o `?user=empty`; envíalo como `Authorization: Bearer <access_token>`. `default` y `empty` corresponden a los titulares de prueba con direcciones precargadas y sin direcciones. Al reiniciar el emisor, los tokens anteriores dejan de ser válidos. Este servidor no conecta con Seguridad, no debe exponerse en red ni usarse en producción; la validación JWT del BFF permanece activa.

Las pruebas Jest usan SWC para transformar TypeScript; el build de producción NestJS usa `tsc`.

`DATABASE_URL` es obligatorio al arrancar. `CORS_ORIGINS` acepta orígenes separados por coma; en Render debe configurarse en el dashboard antes de permitir llamadas desde el frontend. Las migraciones siguen gestionándose con `prisma migrate deploy` durante el arranque del servicio; este setup no cambia el esquema ni las migraciones.

### F-028 — historial de pedidos (corte local H3)

El endpoint `GET /api/v1/orders/me?page=0&pageSize=10` se puede ejecutar localmente con una fixture sintética. Para habilitarla, establece `ORDERS_SOURCE=mock` y selecciona un principal fijo del servidor con `ORDERS_MOCK_CUSTOMER_ID=customer-demo-001` (también existen `customer-demo-002` y `customer-demo-empty`). No se acepta identidad del cliente por header/query/body; en particular, `clienteId` no es un parámetro válido. Sin fuente/principal configurados, el endpoint responde no disponible; `mock` se rechaza en producción. Las respuestas llevan `X-Orders-Source` y `Cache-Control: no-store`.

Este modo no valida JWT y no integra Ventas; el principal fijo sólo permite renderizar una cuenta sintética de demostración y no representa autenticación ni una prueba de autorización real. No se guardan pedidos en Prisma. La integración I-03 con `GET /api/v1/pedidos/me` queda pendiente de homologación y prueba autorizada.

---

## 📋 Convenciones y Contribución

1. **Spec-First:** Antes de implementar cualquier cambio funcional en el código, la modificación debe reflejarse y validarse en su correspondiente documento `SPEC`.
2. **Branching:** Cada integrante trabaja sobre ramas asociadas a su módulo (e.g. `feat/SPEC-0X-nombre-historia`).
3. **Definition of Done:** Cada entrega debe cumplir con los criterios de aceptación BDD, tipado estricto, manejo de errores HTTP y cobertura de pruebas estipulada en su SPEC.


## Catálogo H3 (F-006/F-007)

CatalogModule integra inicio/búsqueda en este baseline NestJS, sin otro servidor HTTP ni cambios a Prisma/health/Render. Consultar [ejecución y pruebas](docs/CATALOGO-S1.md) y [elementos compartidos](docs/ELEMENTOS-COMPARTIDOS.md).

El modo MOCK acredita avance parcial. Las asignaciones vigentes están en la matriz punta a punta de G1-Marketplace-SPECS; la migración no reasigna bloques ni cierra integración real/H3. Los cambios se publican sólo en la rama de Giuliano, sin modificar main/develop ni abrir PR.

## Adaptación a develop y preparación de despliegue — 16/10/2026

Se incorpora el carrito del develop actual sin sustituir el catálogo. Se restaura el arranque Render y se elimina la identidad de prueba automática del proxy de carrito. Consultar [preparación y límites del despliegue](docs/DESPLIEGUE-H3.md). Los PR existentes siguen en draft hacia develop; no se publica ni se modifica main/develop.

## Preparacion de integracion G6 — H3

[Guia de integracion G6](docs/INTEGRACION-G6-H3.md): ensayo HTTP local (`npm run test:g6:contract`), comprobacion de lecturas REAL (`npm run check:g6`) y override Docker opcional. La demo habitual sigue en MOCK; el despliegue, acceso y datos efectivos de G6 se verifican por separado.

## Configuración de autenticación en Render

El servicio requiere `AUTH_ISSUER` y `AUTH_JWKS_URL` como variables de entorno. En `render.yaml` quedan marcadas como `sync: false`: deben configurarse con los valores del issuer y el endpoint JWKS entregados por Seguridad/Ops; no usar los valores locales de `.env.example` en producción. El despliegue falla de forma cerrada si faltan o no corresponden al token recibido.

## Conexión parcial G6 — demo H3 (17/10/2026)

La [guía G6 H3](docs/INTEGRACION-G6-H3.md) explica la demo REAL en localhost:3300 y el modo temporal sin JWT. Categorías ya responde; productos seguía devolviendo 503 en el corte público registrado. Verificar cada ruta antes de exponer.
