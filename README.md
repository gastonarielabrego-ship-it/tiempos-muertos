# Tiempos Muertos Operativos - Dashboard

Dashboard web para analizar tiempos muertos operativos de un depósito/picking.

## Stack

- **Frontend**: Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui
- **Database**: SQLite via Prisma ORM (local o Turso cloud)
- **Deploy**: Vercel (gratis) + Turso (gratis, 9GB)

## Funcionalidades

- Carga de archivos Excel (.xlsx) con datos de escaneos
- Al cargar un nuevo Excel, se **borran los datos anteriores** automáticamente
- Detección de tiempos muertos (gaps > 5 minutos entre escaneos)
- Asignación de turnos por primer pikeo del día:
  - **TM** (Mañana): 6:00 - 13:59
  - **TT** (Tarde): 14:00 - 21:59
  - **TN** (Noche): 22:00 - 5:59
- Filtros por operador y turno
- Ranking de operadores por suma de tiempo muerto
- Detalle de gaps por operador (pickeo previo/posterior, transición de zona)
- Tabla de primer y último pikeo por colaborador/día

## Deploy en Vercel + Turso (ambos gratis)

### 1. Crear base de datos en Turso

1. Ir a [turso.tech](https://turso.tech) y crearse una cuenta (gratis con GitHub)
2. Crear una base de datos:
   ```bash
   # Instalar Turso CLI
   curl -sSfL https://get.tur.so/install.sh | bash

   # Login
   turso auth login

   # Crear base de datos
   turso db create tiempos-muertos

   # Obtener la URL de conexión
   turso db show tiempos-muertos --url

   # Crear token de autenticación
   turso db tokens create tiempos-muertos
   ```

3. Aplicar el schema de Prisma:
   ```bash
   # Apuntar al .env con la URL de Turso
   export DATABASE_URL="libsql://tiempos-muertos-tu-usuario.turso.io"
   export DATABASE_AUTH_TOKEN="tu-token-aqui"

   # Crear las tablas
   npx prisma db push
   ```

### 2. Subir a GitHub

```bash
# Crear repo en GitHub (desde github.com, boton "New repository")
# Luego:
git remote add origin https://github.com/TU_USUARIO/tiempos-muertos.git
git push -u origin main
```

### 3. Deploy en Vercel

1. Ir a [vercel.com](https://vercel.com) y loguearse con GitHub
2. "Add New Project" → importar el repo de GitHub
3. En **Environment Variables** agregar:
   - `DATABASE_URL` = `libsql://tiempos-muertos-tu-usuario.turso.io`
   - `DATABASE_AUTH_TOKEN` = `tu-token-de-turso`
4. Click "Deploy"

Listo! La app queda en `https://tiempos-muertos.vercel.app`

### Variables de entorno

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DATABASE_URL` | URL de la base de datos | `libsql://db-name-org.turso.io` o `file:./db/custom.db` |
| `DATABASE_AUTH_TOKEN` | Token de Turso (solo para Turso) | `eyJ...` |

## Desarrollo local

```bash
npm install
npx prisma db push    # Crear tablas
npx prisma generate  # Generar cliente
npm run dev          # Iniciar en http://localhost:3000
```