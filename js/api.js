/**
 * api.js — Capa de comunicación con Google Apps Script
 * ─────────────────────────────────────────────────────
 * PASO 1: Despliega Code.gs en Apps Script
 * PASO 2: Copia la URL del despliegue aquí abajo
 */

// ⚙️  CAMBIA ESTO por tu URL de Google Apps Script desplegado
const GAS_URL = 'https://script.google.com/macros/s/PEGA_TU_URL_AQUI/exec';

const API = {
  async call(action, params = {}) {
    // Si no está configurado, usamos modo local
    if (GAS_URL.includes('PEGA_TU_URL')) {
      return { success: false, error: 'GAS_NO_CONFIGURADO' };
    }
    try {
      const res = await fetch(GAS_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'text/plain' },
        body:    JSON.stringify({ action, ...params })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      console.warn('[API]', action, e.message);
      return { success: false, error: e.message };
    }
  },

  // Auth
  register: (nombre, correo, contrasena) =>
    API.call('register', { nombre, correo, contrasena }),
  login: (correo, contrasena) =>
    API.call('login', { correo, contrasena }),
  getUser: (userId) =>
    API.call('getUser', { userId }),
  updateUser: (userId, nombre) =>
    API.call('updateUser', { userId, nombre }),

  // Progreso
  saveProgress: (userId, leccionId, completada, porcentaje, xpObtenido) =>
    API.call('saveProgress', { userId, leccionId, completada, porcentaje, xpObtenido }),
  getProgress: (userId) =>
    API.call('getProgress', { userId }),
  saveAnswer: (userId, preguntaId, esCorrecta, modo) =>
    API.call('saveAnswer', { userId, preguntaId, esCorrecta, modo }),
  updateXP: (userId, xp) =>
    API.call('updateXP', { userId, xp }),
  checkStreak: (userId) =>
    API.call('checkStreak', { userId }),
  getStats: (userId) =>
    API.call('getStats', { userId }),

  // Insignias
  getUserBadges: (userId) =>
    API.call('getUserBadges', { userId }),
  earnBadge: (userId, badgeId) =>
    API.call('earnBadge', { userId, badgeId }),

  // Referencias
  saveRef: (userId, data) =>
    API.call('saveRef', { userId, ...data }),
  getRefs: (userId) =>
    API.call('getRefs', { userId }),

  // Setup
  initSheets: () => API.call('initSheets'),

  // ── Helpers locales (fallback sin GAS) ───────────────
  isConfigured() {
    return !GAS_URL.includes('PEGA_TU_URL');
  }
};
