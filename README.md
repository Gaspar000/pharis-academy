# Pharis Academy

Plataforma educativa privada y minimalista para alojar los cursos de Pharis. No es un LMS completo: es un sitio estático (HTML/CSS/JS vanilla) que consume el backend de `pharis-api` bajo el prefijo `/academy`.

Se despliega en GitHub Pages como `gaspar000.github.io/pharis-academy`.

## Stack

- **Frontend**: HTML/CSS/JS vanilla, sin build step (mismo enfoque que `pharis-landing`).
- **Backend**: reutiliza `pharis-api` (Fastify + PostgreSQL en Railway), rutas nuevas bajo `/academy`.
- **Auth**: JWT propio (`academy_users`), independiente del sistema de auth de la app de escritorio de Pharis.
- **Calificación automática**: Claude Haiku 4.5 evalúa cada actividad subida contra una rúbrica fija.

## Estructura

```
pharis-academy/
├── index.html          # Home, lista de cursos (requiere sesión)
├── login.html
├── register.html
├── curso.html           # Vista de curso + subir actividad
├── assets/
│   ├── styles.css        # Tokens visuales (fondo #020617, acento #508ff8)
│   └── api.js             # Cliente fetch + manejo de sesión (localStorage)
└── academy-schema.sql    # Tablas nuevas para pharis-api (referencia)
```

## Despliegue en GitHub Pages

1. Crea el repo en GitHub (público, para Pages gratis):
   ```
   gh repo create gaspar000/pharis-academy --public --source=. --remote=origin --push
   ```
   O manualmente en github.com/new con el nombre `pharis-academy`, luego:
   ```
   git remote add origin https://github.com/gaspar000/pharis-academy.git
   git push -u origin main
   ```

2. En GitHub → Settings → Pages: Source = `Deploy from a branch`, Branch = `main` / `(root)`.

3. El sitio queda disponible en `https://gaspar000.github.io/pharis-academy/`.

No hay build step, GitHub Pages sirve los `.html` tal cual.

## Backend (pharis-api)

### 1. Aplicar las tablas nuevas

Corre la migración de `pharis-api` (ya incluye las tablas de Academy):
```
cd pharis-api
npm run migrate
```
O ejecuta `academy-schema.sql` directamente contra la base de Railway si prefieres no correr toda la migración.

### 2. Variable de entorno nueva

Agrega en Railway (o `.env` local de `pharis-api`):
```
ACADEMY_JWT_SECRET=<64 hex chars, genera con: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
```
Si se omite, cae a `JWT_SECRET` (no recomendado en producción, mezclaría los tokens de Academy con los de la app de escritorio).

### 3. CORS

Si `NODE_ENV=production` en Railway, agrega el origen de GitHub Pages a `ALLOWED_ORIGINS`:
```
ALLOWED_ORIGINS=https://gaspar000.github.io,...
```

Para probar el frontend local contra el backend real de Railway (en vez de mockear
`/academy/*`), agrega también `http://localhost:3000`, y sirve siempre con ese
puerto fijo (`npx serve -l 3000` desde `pharis-academy`, no `npx serve` a secas):
la comparación de origen es un string exacto, así que un puerto aleatorio (el que
`serve` elige por defecto si 3000 está ocupado) nunca va a matchear.
```
ALLOWED_ORIGINS=https://gaspar000.github.io,http://localhost:3000
```

### 4. Rutas nuevas

Todas bajo `pharis-api/src/routes/academy.js`, montadas en `src/index.js`:

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/academy/register` | código de invitación | Registro: nombre, email, password, código |
| POST | `/academy/login` | sin auth | Login, devuelve JWT propio de Academy |
| GET | `/academy/courses` | JWT Academy | Lista de cursos (placeholders) |
| POST | `/academy/submit` | JWT Academy | Sube actividad (base64) y la evalúa con Claude Haiku |

`GET /academy/dashboard` sigue existiendo en `pharis-api` pero ya no lo consume nada en este repo — no hay ninguna vista de dashboard propia de Academy, ni un link en el sidebar hacia ella. `acceso.html` sí tiene una sección "Dashboard de profesor" (solo visible con `rol: profesor`) con un botón que abre `pharis-api-production.up.railway.app/dashboard-v2`, un sistema completamente distinto (el dashboard real de profesor de Pharis).

### Registro por invitación (código de un solo uso)

El registro es privado: **no hay auto-registro libre**. `/academy/register` exige un `codigo` válido y sin usar, y fija el rol inicial (`estudiante`/`profesor`) según ese código. El rol puede cambiarse después libremente desde Perfil (`PATCH /academy/me`).

Para generar un código:
```
cd pharis-api
npm run academy:invite -- "Nombre del destinatario" estudiante
npm run academy:invite -- "Nombre del destinatario" profesor
```
Imprime un código de ~8 caracteres. Compártelo por un canal de confianza (WhatsApp, correo), queda ligado a `destinatario` para poder rastrear qué cuenta corresponde a quién, y se invalida automáticamente tras el primer registro exitoso.

## Cambiar el backend que consume el frontend

Si despliegas `pharis-api` en otra URL, edita `API_BASE` en [assets/api.js](assets/api.js).

## Pendiente / próximos pasos

- **Contenido real de los cursos**: `curso.html` y el catálogo en `pharis-api/src/lib/academy-courses.js` usan placeholders (`slidesEmbedUrl: null`). Para activar las diapositivas, pega la URL de embed de Google Slides (o un visor de PDF) en `slidesEmbedUrl` de cada curso.
- **Historial de entregas del alumno**: `curso.html` solo muestra las entregas hechas en la sesión actual del navegador (no hay `GET /academy/mis-entregas` todavía).
- **Recuperación de contraseña**: no implementada, fuera de alcance de esta primera versión.
