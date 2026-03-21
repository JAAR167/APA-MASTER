// ═══════════════════════════════════════════════════════════════════
//  APA MASTER — Google Apps Script Backend
//  Configuración: Ejecutar como "yo", acceso "cualquier persona"
// ═══════════════════════════════════════════════════════════════════

const SS = SpreadsheetApp.getActiveSpreadsheet();

const SHEETS = {
  USERS:    'usuarios',
  PROGRESS: 'progreso',
  ANSWERS:  'respuestas',
  BADGES:   'insignias',
  REFS:     'referencias',
};

// ── Entry points ──────────────────────────────────────────────────
function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    const result = route(p);
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({success:false, error:err.message}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({success:true, message:'APA Master API activa'}))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Router ────────────────────────────────────────────────────────
function route(p) {
  switch(p.action) {
    case 'register':      return registerUser(p);
    case 'login':         return loginUser(p);
    case 'getUser':       return getUser(p);
    case 'updateUser':    return updateUser(p);
    case 'saveProgress':  return saveProgress(p);
    case 'getProgress':   return getProgress(p);
    case 'saveAnswer':    return saveAnswer(p);
    case 'updateXP':      return updateXP(p);
    case 'checkStreak':   return checkStreak(p);
    case 'getStats':      return getStats(p);
    case 'getUserBadges': return getUserBadges(p);
    case 'earnBadge':     return earnBadge(p);
    case 'saveRef':       return saveRef(p);
    case 'getRefs':       return getRefs(p);
    case 'initSheets':    return initSheets();
    default: return {success:false, error:'Accion desconocida: '+p.action};
  }
}

// ── Helpers ───────────────────────────────────────────────────────
function getSheet(name) {
  return SS.getSheetByName(name);
}

function getRows(name) {
  const sh = getSheet(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const data = sh.getRange(2, 1, sh.getLastRow()-1, sh.getLastColumn()).getValues();
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  return data.map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function appendRow(name, obj) {
  const sh = getSheet(name);
  if (!sh) return;
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.appendRow(headers.map(h => obj[h] !== undefined ? obj[h] : ''));
}

function updateRow(name, field, value, updates) {
  const sh = getSheet(name);
  if (!sh || sh.getLastRow() < 2) return;
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const fieldIdx = headers.indexOf(field);
  if (fieldIdx < 0) return;
  const data = sh.getRange(2, 1, sh.getLastRow()-1, sh.getLastColumn()).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][fieldIdx]) === String(value)) {
      Object.entries(updates).forEach(([k, v]) => {
        const ci = headers.indexOf(k);
        if (ci >= 0) sh.getRange(i+2, ci+1).setValue(v);
      });
      return;
    }
  }
}

function findRow(name, field, value) {
  const rows = getRows(name);
  return rows.find(r => String(r[field]) === String(value)) || null;
}

function hashPw(pw) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, pw);
  return bytes.map(b => ('0'+(b & 0xFF).toString(16)).slice(-2)).join('');
}

function newId() {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2,6);
}

// ── AUTH ──────────────────────────────────────────────────────────
function registerUser({nombre, correo, contrasena}) {
  if (!nombre || !correo || !contrasena)
    return {success:false, error:'Todos los campos son obligatorios'};
  const rows = getRows(SHEETS.USERS);
  if (rows.find(u => u.correo === correo))
    return {success:false, error:'Ese correo ya está registrado'};
  const user = {
    id:            newId(),
    nombre:        nombre.trim(),
    correo:        correo.trim().toLowerCase(),
    pw_hash:       hashPw(contrasena),
    xp_total:      0,
    racha_actual:  0,
    ultimo_acceso: '',
    fecha_registro: new Date().toISOString(),
  };
  appendRow(SHEETS.USERS, user);
  const safe = Object.assign({}, user); delete safe.pw_hash;
  return {success:true, data:safe};
}

function loginUser({correo, contrasena}) {
  if (!correo || !contrasena) return {success:false, error:'Ingresa correo y contraseña'};
  const user = findRow(SHEETS.USERS, 'correo', correo.trim().toLowerCase());
  if (!user) return {success:false, error:'Correo o contraseña incorrectos'};
  if (user.pw_hash !== hashPw(contrasena)) return {success:false, error:'Correo o contraseña incorrectos'};
  const safe = Object.assign({}, user); delete safe.pw_hash;
  return {success:true, data:safe};
}

function getUser({userId}) {
  const user = findRow(SHEETS.USERS, 'id', userId);
  if (!user) return {success:false, error:'Usuario no encontrado'};
  const safe = Object.assign({}, user); delete safe.pw_hash;
  return {success:true, data:safe};
}

function updateUser({userId, nombre}) {
  if (!nombre) return {success:false, error:'Nombre vacío'};
  updateRow(SHEETS.USERS, 'id', userId, {nombre: nombre.trim()});
  return {success:true};
}

// ── RACHA ─────────────────────────────────────────────────────────
function checkStreak({userId}) {
  const user = findRow(SHEETS.USERS, 'id', userId);
  if (!user) return {success:false, error:'No encontrado'};
  const today = new Date().toISOString().split('T')[0];
  const last  = user.ultimo_acceso ? String(user.ultimo_acceso).split('T')[0] : null;
  let racha   = parseInt(user.racha_actual) || 0;
  if (!last || last !== today) {
    if (last) {
      const diff = Math.round((new Date(today) - new Date(last)) / 86400000);
      racha = diff === 1 ? racha + 1 : 1;
    } else { racha = 1; }
    updateRow(SHEETS.USERS, 'id', userId, {
      racha_actual:  racha,
      ultimo_acceso: new Date().toISOString()
    });
  }
  return {success:true, data:{racha}};
}

// ── PROGRESO ──────────────────────────────────────────────────────
function saveProgress({userId, leccionId, completada, porcentaje, xpObtenido}) {
  const rows = getRows(SHEETS.PROGRESS);
  const existing = rows.find(r => String(r.id_usuario)===String(userId) && String(r.id_leccion)===String(leccionId));
  if (existing) {
    updateRow(SHEETS.PROGRESS, 'id_leccion', leccionId, {
      completada, porcentaje,
      xp_obtenido: xpObtenido || 0,
      fecha: new Date().toISOString()
    });
  } else {
    appendRow(SHEETS.PROGRESS, {
      id:          newId(),
      id_usuario:  userId,
      id_leccion:  leccionId,
      completada,
      porcentaje,
      xp_obtenido: xpObtenido || 0,
      fecha:       new Date().toISOString()
    });
  }
  return {success:true};
}

function getProgress({userId}) {
  const rows = getRows(SHEETS.PROGRESS).filter(r => String(r.id_usuario) === String(userId));
  return {success:true, data:rows};
}

// ── XP ────────────────────────────────────────────────────────────
function updateXP({userId, xp}) {
  const user = findRow(SHEETS.USERS, 'id', userId);
  if (!user) return {success:false, error:'No encontrado'};
  const newXP = (parseInt(user.xp_total) || 0) + (parseInt(xp) || 0);
  updateRow(SHEETS.USERS, 'id', userId, {xp_total: newXP});
  return {success:true, data:{xp_total: newXP}};
}

// ── RESPUESTAS ────────────────────────────────────────────────────
function saveAnswer({userId, preguntaId, esCorrecta, modo}) {
  appendRow(SHEETS.ANSWERS, {
    id:          newId(),
    id_usuario:  userId,
    id_pregunta: preguntaId,
    es_correcta: esCorrecta,
    modo:        modo || 'leccion',
    fecha:       new Date().toISOString()
  });
  return {success:true};
}

function getStats({userId}) {
  const rows   = getRows(SHEETS.ANSWERS).filter(r => String(r.id_usuario) === String(userId));
  const total   = rows.length;
  const correct = rows.filter(r => r.es_correcta === true || r.es_correcta === 'TRUE').length;
  const prec    = total ? Math.round(correct / total * 100) : 0;
  return {success:true, data:{total, correct, precision: prec}};
}

// ── INSIGNIAS ─────────────────────────────────────────────────────
function getUserBadges({userId}) {
  const rows = getRows(SHEETS.BADGES).filter(r => String(r.id_usuario) === String(userId));
  return {success:true, data:rows};
}

function earnBadge({userId, badgeId}) {
  const rows = getRows(SHEETS.BADGES);
  if (rows.find(r => String(r.id_usuario)===String(userId) && String(r.id_insignia)===String(badgeId)))
    return {success:true}; // ya tiene
  appendRow(SHEETS.BADGES, {
    id:           newId(),
    id_usuario:   userId,
    id_insignia:  badgeId,
    fecha:        new Date().toISOString()
  });
  return {success:true};
}

// ── REFERENCIAS ───────────────────────────────────────────────────
function saveRef({userId, tipo, autor, titulo, anio, sitio, url, referencia}) {
  appendRow(SHEETS.REFS, {
    id:         newId(),
    id_usuario: userId,
    tipo, autor, titulo, anio, sitio, url, referencia,
    fecha:      new Date().toISOString()
  });
  return {success:true};
}

function getRefs({userId}) {
  const rows = getRows(SHEETS.REFS)
    .filter(r => String(r.id_usuario) === String(userId))
    .sort((a,b) => new Date(b.fecha) - new Date(a.fecha))
    .slice(0, 20);
  return {success:true, data:rows};
}

// ── INICIALIZAR HOJAS ─────────────────────────────────────────────
function initSheets() {
  const cfg = {
    [SHEETS.USERS]:    ['id','nombre','correo','pw_hash','xp_total','racha_actual','ultimo_acceso','fecha_registro'],
    [SHEETS.PROGRESS]: ['id','id_usuario','id_leccion','completada','porcentaje','xp_obtenido','fecha'],
    [SHEETS.ANSWERS]:  ['id','id_usuario','id_pregunta','es_correcta','modo','fecha'],
    [SHEETS.BADGES]:   ['id','id_usuario','id_insignia','fecha'],
    [SHEETS.REFS]:     ['id','id_usuario','tipo','autor','titulo','anio','sitio','url','referencia','fecha'],
  };
  Object.entries(cfg).forEach(([name, headers]) => {
    let sh = SS.getSheetByName(name) || SS.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1,1,1,headers.length).setValues([headers])
        .setFontWeight('bold').setBackground('#1A2538').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
  });
  return {success:true, message:'Hojas listas!'};
}
