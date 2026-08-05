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
        ${user.nombre} · ${user.rol} <i class="ph ph-caret-down"></i>
      </button>
      <div class="user-dropdown">
        <div class="user-dropdown-header">
          <div class="user-dropdown-name">${user.nombre}</div>
          <div class="user-dropdown-email">${user.email}</div>
        </div>
        <button class="user-dropdown-item" data-theme-toggle>
          <i class="ph ph-moon"></i> <span data-theme-label>Modo oscuro</span>
        </button>
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
};

/**
 * Llama a la API de Academy. Agrega el Bearer token si hay sesión.
 * Lanza un Error con el mensaje del backend si la respuesta no es 2xx.
 */
async function academyFetch(path, options = {}) {
  const token = AcademyAuth.getToken();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
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
