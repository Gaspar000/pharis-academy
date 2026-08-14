'use strict';

// Pharis Academy, cliente de la API (pharis-api, prefijo /academy).
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
   * pedir un nuevo login, usado tras PATCH /academy/me, ya que el JWT
   * solo lleva id/email/rol y nunca se re-emite en este flujo. */
  updateUser(partial) {
    const current = this.getUser();
    if (!current) return;
    this.setSession(this.getToken(), { ...current, ...partial });
  },

  /**
   * Dibuja el chip de usuario + dropdown (nombre/correo, modo oscuro,
   * salir) dentro de `container`. Único lugar del sitio con esas 2
   * acciones, antes vivían sueltas en sidebar/topbar de cada página.
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
        <!-- El modal de bienvenida era la ÚNICA explicación de qué es
             Academy en todo el sitio, y se borraba del sessionStorage antes
             de mostrarse: quien lo cerraba sin leer no podía recuperarlo.
             Solo aparece en index.html, que es donde vive el modal. -->
        <a class="user-dropdown-item" href="index.html#que-es">
          <i class="ph ph-question"></i> ¿Qué es Pharis Academy?
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

    // Cierra al hacer click fuera, un solo listener global por menú
    // renderizado, no por página (evita duplicarlo si esto se llama más
    // de una vez en el futuro).
    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) container.classList.remove('open');
    });

    // El click del botón de tema lo maneja la delegación global de
    // theme.js (document.addEventListener('click', ...)), no hace falta
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
   *, se consulta una sola vez al llamar esta función (mismo criterio que
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
        // Best-effort, si falla, la próxima carga de página las vuelve a
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
      const ICONO_POR_TIPO = { 'logro': 'ph-medal', 'curso-completado': 'ph-trophy', 'curso-terminado': 'ph-graduation-cap' };
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
      // No bloquea la página, mismo criterio que loadNews en index.html.
      document.getElementById('notifDropdownEmpty').textContent = 'No se pudieron cargar las notificaciones.';
    });
  },

  /**
   * Toast global de 3s, mismo lenguaje visual que .slide-toast (curso.html)
   * pero portátil: inyecta su propio nodo la primera vez que se llama, no
   * depende de que la página ya tenga un elemento en el HTML. Reusa el
   * mismo nodo en llamadas siguientes (evita duplicar <div>s).
   */
  _toastEl: null,
  _toastTimeout: null,
  mostrarToast(mensaje) {
    if (!this._toastEl) {
      this._toastEl = document.createElement('div');
      this._toastEl.className = 'academy-toast';
      document.body.appendChild(this._toastEl);
    }
    this._toastEl.textContent = mensaje;
    this._toastEl.classList.add('is-visible');
    clearTimeout(this._toastTimeout);
    this._toastTimeout = setTimeout(() => this._toastEl.classList.remove('is-visible'), 3000);
  },

  /**
   * Barra de navegación inferior para móvil. Bajo 900px el sidebar se
   * oculta por completo (ver home.css) y hasta ahora NO había ningún
   * reemplazo: el usuario perdía Overview, Cursos, Dashboard y Accede a
   * Pharis, y desde perfil.html —que no tiene breadcrumb— no había forma
   * de volver salvo el botón atrás del navegador.
   *
   * Se construye clonando los links del sidebar en vez de duplicar el
   * markup en las 6 páginas: así el nav móvil hereda automáticamente
   * cualquier cambio del sidebar (links nuevos, el Dashboard que solo se
   * muestra a profesores, el candado del gate) sin poder desincronizarse.
   * Llamar DESPUÉS de mostrar/ocultar links por rol y de aplicarGateSidebar.
   */
  renderNavMovil() {
    if (document.querySelector('.wf-mobile-nav')) return;
    const links = document.querySelectorAll('.wf-sidebar .wf-nav a');
    if (!links.length) return;

    const nav = document.createElement('nav');
    nav.className = 'wf-mobile-nav';
    nav.setAttribute('aria-label', 'Navegación principal');

    links.forEach(link => {
      // Respeta los links ocultos por rol (Dashboard con display:none para
      // alumnos) — se consulta el estilo inline porque el nodo puede no
      // estar aún en un layout calculado.
      if (link.style.display === 'none') return;

      const a = document.createElement('a');
      a.href = link.getAttribute('href');
      if (link.classList.contains('active')) a.classList.add('active');
      if (link.classList.contains('is-locked')) a.classList.add('is-locked');

      const iconoOriginal = link.querySelector('i.icon');
      const icono = document.createElement('i');
      icono.className = iconoOriginal ? iconoOriginal.className : 'ph ph-circle';
      icono.setAttribute('aria-hidden', 'true');

      const etiqueta = document.createElement('span');
      // textContent del link incluye el ícono (que no aporta texto) y el
      // label; trim alcanza porque el ícono es un <i> vacío.
      etiqueta.textContent = link.textContent.trim();

      a.appendChild(icono);
      a.appendChild(etiqueta);

      // El gate bloquea igual que en el sidebar: mismo mensaje, misma
      // prevención de navegación.
      if (link.classList.contains('is-locked')) {
        a.setAttribute('aria-disabled', 'true');
        a.addEventListener('click', (e) => {
          e.preventDefault();
          this.mostrarToast('Abre el curso introductorio y recorre sus diapositivas para desbloquearlo.');
        });
      }

      nav.appendChild(a);
    });

    document.body.appendChild(nav);
  },

  /**
   * Gate de "Accede a Pharis" en el sidebar — llamar después de
   * requireAuth() en cada página. El link se habilita si se completó
   * CUALQUIERA de los dos cursos introductorios (App/Extensión O
   * Dashboard), sin importar el rol de la cuenta — un profesor que
   * completa el curso de alumnos igual desbloquea App/Extensión, y
   * viceversa. Dentro de acceso.html cada sección se atenúa por separado
   * según su propio gate específico (ver interceptarSiBloqueado). Fue un
   * bug real, no diseño: antes esto decidía por rol (profesor → solo
   * mirar desbloqueadoDashboard), dejando el link bloqueado para un
   * profesor que ya había completado el curso de alumnos. Silencioso ante
   * error de red: si el fetch falla, el link queda como estaba (sin
   * gate) — un timeout acá no debe bloquear el acceso a Academy entero.
   */
  async aplicarGateSidebar() {
    const link = document.querySelector('.wf-nav a[href="acceso.html"]');
    if (!link) return;

    let acceso;
    try {
      acceso = await academyFetch('/academy/me/acceso');
    } catch {
      // Falla abierto (sin gate), pero el nav móvil se arma igual: sin él
      // el usuario en móvil se queda sin ninguna navegación.
      this.renderNavMovil();
      return;
    }

    if (acceso.desbloqueadoApp || acceso.desbloqueadoDashboard) {
      this.renderNavMovil();
      return;
    }

    link.classList.add('is-locked');
    // Candado explícito: antes el único indicio era un gris más apagado, que
    // no se lee como "bloqueado" hasta que el usuario clickea y recibe el
    // toast. Se agrega junto al texto sin tocar el ícono de la izquierda,
    // que identifica la sección.
    if (!link.querySelector('.nav-lock-icon')) {
      const lock = document.createElement('i');
      lock.className = 'ph ph-lock-simple nav-lock-icon';
      lock.setAttribute('aria-hidden', 'true');
      link.appendChild(lock);
    }
    link.setAttribute('aria-disabled', 'true');
    link.addEventListener('click', (e) => {
      e.preventDefault();
      this.mostrarToast('Abre el curso introductorio y recorre sus diapositivas para desbloquearlo.');
    });

    // Después de aplicar el candado, para que el nav móvil lo herede.
    this.renderNavMovil();
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
