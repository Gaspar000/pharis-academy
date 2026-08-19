'use strict';

// Pharis Academy, cliente de la API (pharis-api, prefijo /academy).
// Cambia API_BASE si despliegas pharis-api en otra URL.
const API_BASE = 'https://pharis-api-production.up.railway.app';

// Paleta fija (no CSS var — se necesita el hex real para el hash, y estos
// tonos ya están calibrados para contraste con texto blanco encima en
// ambos temas). El índice sale de un hash simple del nombre, así que el
// mismo usuario tiene siempre el mismo color entre sesiones y páginas sin
// guardar nada en la DB.
const AVATAR_COLORS = ['#508ff8', '#34a17c', '#c2703d', '#8a5cd6', '#c0447a', '#3d97a8'];

function avatarColor(nombre) {
  let hash = 0;
  for (let i = 0; i < nombre.length; i++) hash = (hash * 31 + nombre.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function avatarIniciales(nombre) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  const primeras = partes.length > 1 ? [partes[0], partes[partes.length - 1]] : [partes[0]];
  return primeras.map(p => p[0].toUpperCase()).join('');
}

/** Avatar redondo con iniciales — `size` es 'sm' (chip/topbar) o 'lg' (dropdown/perfil).
 * Un nombre de puros espacios (falsy solo cubre '', null, undefined) debe
 * normalizarse ACÁ antes de tocar avatarColor/avatarIniciales — si no, el
 * trim().split() de avatarIniciales sobre un string ya vacío tras el trim
 * revienta con TypeError al leer partes[0][0] de un array vacío. */
function avatarHtml(nombre, size = 'sm') {
  const safe = (nombre || '').trim() || '?';
  return `<div class="user-avatar user-avatar-${size}" style="background:${avatarColor(safe)}">${escapeHtml(avatarIniciales(safe))}</div>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Modal de confirmación propio — reemplaza window.confirm() nativo (única
 * excepción visual del sitio, que usa .wf-panel/.error-box en todo el
 * resto de la UI). Devuelve una Promise<boolean>: true si el usuario
 * confirmó, false si canceló, cerró con Escape, o clickeó el backdrop.
 *
 * Accesibilidad: role="alertdialog" + aria-modal, foco atrapado con Tab
 * entre los 2 botones (loop, no se escapa al resto de la página mientras
 * está abierto), foco inicial en "Cancelar" (la acción menos destructiva
 * por defecto), y el foco vuelve al elemento que abrió el modal al
 * cerrarse — sin esto, alguien navegando por teclado perdería su lugar
 * en la página después de cerrar el diálogo.
 */
// Un solo diálogo a la vez a nivel de módulo — sin esto, un doble clic
// rápido en el botón que abre el modal (antes de que el primer await
// resuelva) apila dos overlays y registra dos listeners de keydown en
// document. Cerrar el segundo (el visible, tapa al primero) no limpia el
// primero: queda un overlay "fantasma" que reaparece, con su listener de
// Tab/Escape filtrado en document indefinidamente. Abrir un diálogo
// nuevo mientras uno está activo lo cierra primero (como cancelado),
// nunca los apila.
let cerrarDialogoActivo = null;

function confirmDialog({ titulo, mensaje, textoConfirmar = 'Confirmar', textoCancelar = 'Cancelar', peligroso = true }) {
  if (cerrarDialogoActivo) cerrarDialogoActivo();

  return new Promise((resolve) => {
    const disparador = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
      <div class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirmDialogTitle" aria-describedby="confirmDialogMsg">
        <div class="confirm-dialog-title" id="confirmDialogTitle">${escapeHtml(titulo)}</div>
        <p class="confirm-dialog-msg" id="confirmDialogMsg">${escapeHtml(mensaje)}</p>
        <div class="confirm-dialog-actions">
          <button type="button" class="btn btn-secondary" data-action="cancel">${escapeHtml(textoCancelar)}</button>
          <button type="button" class="btn ${peligroso ? 'btn-danger' : 'btn-primary'}" data-action="confirm">${escapeHtml(textoConfirmar)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const cancelBtn = overlay.querySelector('[data-action="cancel"]');
    const confirmBtn = overlay.querySelector('[data-action="confirm"]');
    const focusables = [cancelBtn, confirmBtn];

    function cerrar(resultado) {
      overlay.remove();
      document.removeEventListener('keydown', onKeydown);
      cerrarDialogoActivo = null;
      // Vuelve el foco a quien abrió el modal — si ese elemento ya no
      // existe (ej. la fila se re-renderizó), no falla, simplemente no
      // mueve el foco a ningún lado.
      if (disparador && document.contains(disparador)) disparador.focus();
      resolve(resultado);
    }
    cerrarDialogoActivo = () => cerrar(false);

    function onKeydown(e) {
      if (e.key === 'Escape') { cerrar(false); return; }
      if (e.key !== 'Tab') return;
      // Foco atrapado: Tab/Shift+Tab solo circula entre los 2 botones,
      // nunca se escapa al resto de la página mientras el modal está abierto.
      const idx = focusables.indexOf(document.activeElement);
      e.preventDefault();
      const siguiente = e.shiftKey
        ? focusables[(idx <= 0 ? focusables.length : idx) - 1]
        : focusables[(idx + 1) % focusables.length];
      siguiente.focus();
    }

    overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(false); });
    cancelBtn.addEventListener('click', () => cerrar(false));
    confirmBtn.addEventListener('click', () => cerrar(true));
    document.addEventListener('keydown', onKeydown);

    cancelBtn.focus();
  });
}

/** Cierra cualquier dropdown de topbar (usuario/notificaciones) distinto de
 * `except` — sin esto, abrir uno mientras el otro ya está abierto los deja
 * a ambos superpuestos en pantalla al mismo tiempo. */
function closeOtherTopbarMenus(except) {
  document.querySelectorAll('.user-menu.open, .notif-menu.open').forEach(el => {
    if (el !== except) el.classList.remove('open');
  });
}

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
   * pedir un nuevo login, usado tras PATCH /academy/me. El JWT lleva
   * id/email/rol/tokenVersion en su payload — si `partial` viene de una
   * respuesta que cambió el rol, PATCH /academy/me también reemite el
   * token (token_version sube) y lo pasa acá como `token`; sin
   * reemplazarlo, este dispositivo seguiría mandando el JWT viejo y
   * requireAcademyAuth lo rechazaría en la siguiente request por
   * desajuste de tokenVersion. */
  updateUser(partial, token) {
    const current = this.getUser();
    if (!current) return;
    this.setSession(token || this.getToken(), { ...current, ...partial });
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
        ${avatarHtml(user.nombre, 'sm')}
        ${escapeHtml(user.nombre)} <i class="ph ph-caret-down"></i>
      </button>
      <div class="user-dropdown">
        <div class="user-dropdown-header">
          ${avatarHtml(user.nombre, 'lg')}
          <div class="user-dropdown-header-text">
            <div class="user-dropdown-name-row">
              <div class="user-dropdown-name">${escapeHtml(user.nombre)}</div>
              <span class="role-chip">${escapeHtml(user.rol)}</span>
            </div>
          </div>
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
      const abriendo = !container.classList.contains('open');
      closeOtherTopbarMenus(container);
      container.classList.toggle('open', abriendo);
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
   * Rellena el card motivacional del sidebar (`.wf-sidebar-promo-text` /
   * `.wf-sidebar-promo-sub` dentro de `container`) con copy propio según el
   * rol del usuario logueado — antes era el mismo texto de alumno fijo en
   * el HTML de las 6 páginas, ahora viene de acá para no mantener el copy
   * en dos lugares. El markup del `.wf-sidebar-promo-art` (la ilustración)
   * no lo toca, sigue siendo un div vacío pintado por CSS.
   */
  renderSidebarPromo(container) {
    const user = this.getUser();
    if (!user || !container) return;

    const copy = user.rol === 'profesor'
      ? {
          texto: 'Cada minuto que Pharis te devuelve es un minuto más para lo que de verdad importa: tus alumnos.',
          sub: 'Enseñar con más tiempo, no con más prisa.',
        }
      : {
          texto: 'Cada pregunta que le haces a Pharis te acerca a entenderlo de verdad.',
          sub: 'Tu tutor, siempre a un clic.',
        };

    const textoEl = container.querySelector('.wf-sidebar-promo-text');
    const subEl = container.querySelector('.wf-sidebar-promo-sub');
    if (textoEl) textoEl.textContent = copy.texto;
    if (subEl) subEl.textContent = copy.sub;

    // Imagen del card — la de alumnos queda fija en CSS (.wf-sidebar-promo-art,
    // sin tocar), esto solo la sobrescribe inline para profesores. Recorte
    // calibrado contra las dimensiones reales de esta imagen (768x1024,
    // vertical) en un contenedor cuadrado: cover con top:0% deja ver la
    // tiza completa + las 2 figuras iluminadas, sin cortar la punta de la
    // tiza como sí pasaba con posiciones más bajas.
    if (user.rol === 'profesor') {
      const artEl = container.querySelector('.wf-sidebar-promo-art');
      if (artEl) {
        artEl.style.backgroundImage = "url('https://pub-8dbbde7f94954173b9eaa1e10f3a0aa0.r2.dev/assets/Image-Card%20-%20Dato2.png')";
        artEl.style.backgroundPosition = 'center 0%';
      }
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
      const abriendo = !container.classList.contains('open');
      closeOtherTopbarMenus(container);
      container.classList.toggle('open', abriendo);
      if (abriendo && noLeidasPendientes) {
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
      // role="status" (no "alert"): estos toasts son informativos, no
      // errores urgentes — se anuncian sin interrumpir lo que el lector
      // de pantalla esté leyendo. Puesto una sola vez acá, al crear el
      // nodo — el textContent se reemplaza en llamadas siguientes sin
      // recrear el elemento, y el cambio de contenido de un nodo que YA
      // tiene role="status" en el DOM se sigue anunciando cada vez.
      this._toastEl.setAttribute('role', 'status');
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
      // Dashboard apunta a un dominio externo (pharis-api-production, no
      // esta SPA) con target="_blank" en el sidebar — sin clonar también
      // target/rel acá, el nav móvil abriría ese link en la misma pestaña
      // y perdería la sesión de Academy en curso.
      if (link.target) a.target = link.target;
      if (link.rel) a.rel = link.rel;
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
