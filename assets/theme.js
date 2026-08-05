'use strict';

// Pharis Academy — modo oscuro/claro. Debe cargarse en <head>, ANTES del
// primer paint (no en defer/al final del body) — así el atributo
// data-theme queda estampado en <html> antes de que el navegador pinte
// cualquier color, evitando el flash de tema incorrecto (FOUC) que
// ocurriría si esto corriera después del render inicial.
const AcademyTheme = {
  STORAGE_KEY: 'academy_theme',

  /** 'dark' | 'light' | null (null = sigue el sistema operativo). */
  getStored() {
    return localStorage.getItem(this.STORAGE_KEY);
  },

  /** Aplica el tema guardado, o no toca nada si el usuario nunca eligió
   * uno manualmente (así el CSS deja que prefers-color-scheme decida). */
  apply() {
    const stored = this.getStored();
    if (stored === 'dark' || stored === 'light') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  },

  /** Tema efectivo ahora mismo, para dibujar el ícono correcto del toggle. */
  current() {
    const stored = this.getStored();
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  },

  toggle() {
    const next = this.current() === 'dark' ? 'light' : 'dark';
    localStorage.setItem(this.STORAGE_KEY, next);
    document.documentElement.setAttribute('data-theme', next);
    this.syncToggleUI();
  },

  /** Actualiza el ícono/texto de cualquier botón con [data-theme-toggle]
   * presente en la página actual. Se llama tras aplicar el tema inicial
   * y tras cada toggle. */
  syncToggleUI() {
    const isLight = this.current() === 'light';
    document.querySelectorAll('[data-theme-toggle]').forEach(btn => {
      const icon = btn.querySelector('i');
      if (icon) icon.className = isLight ? 'ph ph-sun' : 'ph ph-moon';
      const label = btn.querySelector('[data-theme-label]');
      if (label) label.textContent = isLight ? 'Modo claro' : 'Modo oscuro';
    });
  },
};

AcademyTheme.apply();

// syncToggleUI() necesita que el DOM del botón exista — a diferencia de
// apply(), que debe correr antes del paint, esto puede esperar a
// DOMContentLoaded sin causar flash (el color de fondo ya quedó bien).
document.addEventListener('DOMContentLoaded', () => {
  AcademyTheme.syncToggleUI();
});

// Delegación de eventos en `document`, no listeners por botón: cubre tanto
// los [data-theme-toggle] estáticos del HTML (login/register) como los
// que AcademyAuth.renderUserMenu() (api.js) inyecta dinámicamente después
// — sin esto, el botón del dropdown de usuario quedaba con 2 listeners
// (uno de acá + uno agregado a mano en renderUserMenu), y cada click
// disparaba toggle() dos veces, cancelándose entre sí cada 2 clicks.
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-theme-toggle]')) AcademyTheme.toggle();
});
