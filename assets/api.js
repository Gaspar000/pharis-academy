'use strict';

// Pharis Academy — cliente de la API (pharis-api, prefijo /academy).
// Cambia API_BASE si despliegas pharis-api en otra URL.
const API_BASE = 'https://pharis-api-production.up.railway.app';

const AcademyAuth = {
  TOKEN_KEY: 'academy_token',
  USER_KEY: 'academy_user',

  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },
  getUser() {
    const raw = localStorage.getItem(this.USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  setSession(token, user) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  },
  clearSession() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  },
  isLoggedIn() {
    return !!this.getToken();
  },
  /** Redirige a login si no hay sesión. Llamar al inicio de páginas privadas. */
  requireAuth() {
    if (!this.isLoggedIn()) {
      window.location.href = 'login.html';
    }
  },
  /** Redirige a la app si ya hay sesión. Llamar en login/register. */
  redirectIfLoggedIn() {
    if (this.isLoggedIn()) {
      window.location.href = 'index.html';
    }
  },
  logout() {
    this.clearSession();
    window.location.href = 'login.html';
  },
  /** Mergea `partial` sobre el user guardado y refresca localStorage sin
   * pedir un nuevo login — usado tras PATCH /academy/me, ya que el JWT
   * solo lleva id/email/rol y nunca se re-emite en este flujo. */
  updateUser(partial) {
    const current = this.getUser();
    if (!current) return;
    this.setSession(this.getToken(), { ...current, ...partial });
  },

  /**
   * Dibuja el chip de usuario + dropdown (nombre/correo, modo oscuro,
   * salir) dentro de `container`. Único lugar del sitio con esas 2
   * acciones — antes vivían sueltas en sidebar/topbar de cada página.
   * Requiere sesión activa (llamar después de requireAuth()).
   */
  renderUserMenu(container) {
    const user = this.getUser();
    if (!user || !container) return;

    container.className = 'user-menu';
    container.innerHTML = `
      <button class="user-chip" id="userMenuTrigger">
        ${user.nombre} <i class="ph ph-caret-down"></i>
      </button>
      <div class="user-dropdown">
        <div class="user-dropdown-header">
          <div class="user-dropdown-name-row">
            <div class="user-dropdown-name">${user.nombre}</div>
            <span class="role-chip">${user.rol}</span>
          </div>
          <div class="user-dropdown-email">${user.email}</div>
        </div>
        <div class="user-dropdown-item theme-row">
          <span data-theme-label>Modo oscuro</span>
          <button class="theme-switch" data-theme-toggle aria-label="Cambiar tema">
            <span class="theme-switch-thumb"></span>
          </button>
        </div>
        <a class="user-dropdown-item" href="perfil.html">
          <i class="ph ph-user"></i> Ver perfil
        </a>
        <button class="user-dropdown-item danger" id="userMenuLogout">
          <i class="ph ph-sign-out"></i> Salir
        </button>
      </div>
    `;

    const trigger = container.querySelector('#userMenuTrigger');
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      container.classList.toggle('open');
    });
    container.querySelector('#userMenuLogout').addEventListener('click', () => this.logout());

    // Cierra al hacer click fuera — un solo listener global por menú
    // renderizado, no por página (evita duplicarlo si esto se llama más
    // de una vez en el futuro).
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) container.classList.remove('open');
    });

    // El click del botón de tema lo maneja la delegación global de
    // theme.js (document.addEventListener('click', ...)) — no hace falta
    // engancharlo acá aparte, eso duplicaba el toggle (2 clicks lógicos
    // por 1 click real, y el tema quedaba sin cambiar la mitad de las
    // veces). Solo hay que sincronizar el ícono/label del botón recién
    // creado con el tema actual. typeof-check en vez de `window.`:
    // AcademyTheme es un `const` de script clásico, no queda colgado de
    // `window` (a diferencia de una declaración con `var`).
    if (typeof AcademyTheme !== 'undefined') {
      AcademyTheme.syncToggleUI();
    }
  },

  /**
   * Dibuja el botón de notificaciones (campana) + panel desplegable dentro
   * de `container`, y carga el historial real vía GET /academy/notifications
   * — se consulta una sola vez al llamar esta función (mismo criterio que
   * el resto de Academy: sin polling, ver academy-gamification.js en
   * pharis-api). El punto rojo en la campana refleja `noLeidas`; se marcan
   * todas como leídas al abrir el dropdown (no hay selección individual).
   */
  renderNotifMenu(container) {
    if (!container) return;

    container.className = 'notif-menu';
    container.innerHTML = `
      <button class="notif-trigger" id="notifMenuTrigger" aria-label="Notificaciones">
        <i class="ph ph-bell"></i>
        <span class="notif-badge" id="notifBadge" style="display:none;"></span>
      </button>
      <div class="notif-dropdown">
        <div class="notif-dropdown-title">Notificaciones</div>
        <div class="notif-dropdown-empty" id="notifDropdownEmpty">Cargando...</div>
        <div id="notifDropdownList"></div>
      </div>
    `;

    const trigger = container.querySelector('#notifMenuTrigger');
    let noLeidasPendientes = false;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      container.classList.toggle('open');
      if (container.classList.contains('open') && noLeidasPendientes) {
        noLeidasPendientes = false;
        document.getElementById('notifBadge').style.display = 'none';
        // Best-effort — si falla, la próxima carga de página las vuelve a
        // marcar (no hay pérdida real, solo el badge tarda un poco más en
        // apagarse en algún caso raro de red).
        academyFetch('/academy/notifications/marcar-leidas', { method: 'POST', body: '{}' }).catch(() => {});
      }
    });
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) container.classList.remove('open');
    });

    academyFetch('/academy/notifications').then(data => {
      noLeidasPendientes = data.noLeidas > 0;
      if (noLeidasPendientes) {
        const badge = document.getElementById('notifBadge');
        badge.textContent = data.noLeidas > 9 ? '9+' : String(data.noLeidas);
        badge.style.display = 'flex';
      }

      const empty = document.getElementById('notifDropdownEmpty');
      const list = document.getElementById('notifDropdownList');
      if (!data.notifications.length) {
        empty.textContent = 'Sin notificaciones por el momento.';
        return;
      }
      empty.style.display = 'none';
      const ICONO_POR_TIPO = { 'logro': 'ph-medal', 'curso-completado': 'ph-trophy' };
      list.innerHTML = data.notifications.map(n => `
        <div class="notif-item ${n.leidaAt ? '' : 'is-unread'}">
          <i class="ph ${ICONO_POR_TIPO[n.tipo] || 'ph-bell'}"></i>
          <div>
            <div class="notif-item-titulo">${n.titulo}</div>
            <div class="notif-item-mensaje">${n.mensaje}</div>
          </div>
        </div>
      `).join('');
    }).catch(() => {
      // No bloquea la página — mismo criterio que loadNews en index.html.
      document.getElementById('notifDropdownEmpty').textContent = 'No se pudieron cargar las notificaciones.';
    });
  },
};

/**
 * Llama a la API de Academy. Agrega el Bearer token si hay sesión.
 * Lanza un Error con el mensaje del backend si la respuesta no es 2xx.
 */
async function academyFetch(path, options = {}) {
  const token = AcademyAuth.getToken();
  // Content-Type solo si hay body: Fastify rechaza con
  // FST_ERR_CTP_EMPTY_JSON_BODY un POST sin cuerpo que igual declara
  // application/json (ej. el toggle de /academy/courses/:slug/guardar).
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error('No se pudo conectar con el servidor. Revisa tu conexión.');
  }

  if (res.status === 401) {
    AcademyAuth.clearSession();
    window.location.href = 'login.html';
    throw new Error('Sesión expirada.');
  }

  let data = null;
  try { data = await res.json(); } catch { /* respuesta sin cuerpo */ }

  if (!res.ok) {
    throw new Error((data && data.error) || `Error del servidor (${res.status})`);
  }
  return data;
}
