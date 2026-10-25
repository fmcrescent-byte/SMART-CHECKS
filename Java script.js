// ==========================================================
//  CRESCENT PATROL · CBRE  —  Code.gs
//  CONFIG (all optional — everything is auto-created)
// ==========================================================
const APP_VERSION = '2026.10-ppm-features';
const MASTER_FOLDER_ID = '1eE5gDffmy1w-dGjQm3dLmyHF_agjpD64';   // <- paste your Drive "master folder" ID here (or set Script Property MASTER_FOLDER_ID)
const SHEET_ID         = '1WJRmTx_Pd6OBKN4RuwduRs8X6nqHfbxCrLJOmlSH30Q';   // <- PASTE THE ID OF THE SPREADSHEET THAT HOLDS YOUR "Users" TAB (the long text between /d/ and /edit in its URL). Strongly recommended.
const TOKEN_DAYS       = 30;   // how long a sign-in stays valid on a phone
const SPREADSHEET_PROP = 'SPREADSHEET_ID';
// Pending rounds: 'team' = a checkpoint is done for today once ANYONE scans it; 'mine' = each technician must scan every checkpoint themselves.
const PENDING_SCOPE = 'team';
const SETUP_FLAG = 'SETUP_DONE';   // Script Property written by setup(). While it is TRUE, setup() refuses to delete anything.

const SCHEMAS = {
  Users:       ['email', 'name', 'role', 'department', 'active', 'pin', 'mustChange', 'depts'],   // depts = departments this user can see (comma list, empty = all). email = login ID (any unique text). PIN only, no password.
  Equipment:   ['id', 'name', 'category', 'floors', 'photoRequired', 'active', 'createdAt', 'department', 'tower', 'posterModel'],   // tower = A/B/C (shown on the poster), posterModel = 1 | 2 | 5 (QR poster design chosen by the admin)
  Checkpoints: ['id', 'equipmentId', 'equipmentName', 'floor', 'task', 'photoRequired', 'qrUrl', 'checklist', 'department'],
  ScanLog:     ['timestamp', 'email', 'userName', 'checkpointId', 'equipmentId', 'equipmentName', 'floor', 'task', 'status', 'notes', 'photoUrl', 'checklist'],
  Settings:    ['key', 'value'],
  Departments: ['name', 'directScan', 'active'],   // directScan TRUE = checkpoints of this department can be scanned with NO login (security rounds)
  Towers:      ['name', 'label', 'floors', 'color', 'active', 'sort'],   // name = 1-2 letters/digits shown on posters (A, B, C...), floors = "G, 1-25, Terrace"
  Issues:      ['id', 'createdAt', 'checkpointId', 'equipmentName', 'floor', 'reportedBy', 'reportedByName', 'summary', 'beforePhotoUrl', 'status', 'assignedTo', 'assignedName', 'resolvedAt', 'resolvedBy', 'resolvedByName', 'afterPhotoUrl', 'resolution', 'seenCount', 'lastSeen'],
  PPMTasks:    ['id', 'name', 'equipmentId', 'equipmentName', 'department', 'location', 'everyWeeks', 'startWeek', 'checklist', 'photoRequired', 'active', 'createdAt', 'notes', 'estMins', 'assignedTo', 'highRisk'],   // planned preventive maintenance: repeats every N weeks from startWeek (1-52)
  PPMLog:      ['id', 'timestamp', 'year', 'dueWeek', 'taskId', 'taskName', 'equipmentName', 'location', 'department', 'doneBy', 'doneByName', 'status', 'notes', 'checklist', 'photoUrl', 'reviewStatus', 'reviewBy', 'reviewByName', 'reviewAt', 'reviewNote', 'risk', 'permit', 'parts', 'review2By', 'review2ByName', 'review2At'],
  Parts:       ['id', 'name', 'unit', 'stock', 'minStock', 'active'],   // spare parts / materials used on PPM
  Leave:       ['id', 'userId', 'userName', 'from', 'to', 'note'],
  Audit:       ['timestamp', 'user', 'action', 'target', 'detail'],
  PPMTemplates: ['id', 'name', 'department', 'everyWeeks', 'startWeek', 'checklist', 'photoRequired', 'estMins', 'notes', 'highRisk']   // reusable PPM task forms
};

const DEFAULT_DEPTS = [['Security', 'TRUE', 'TRUE'], ['Electrical', 'FALSE', 'TRUE'], ['Plumbing', 'FALSE', 'TRUE'], ['HVAC', 'FALSE', 'TRUE'], ['Housekeeping', 'FALSE', 'TRUE'], ['Lifts', 'FALSE', 'TRUE'], ['Fire & Safety', 'FALSE', 'TRUE']];

// ==========================================
// 1. INITIALIZATION & AUTO-SETUP
// ==========================================
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.diag) return diagPage_();
  try {
    try { getSpreadsheet(); } catch (se) { Logger.log('Auto-setup: ' + se.message); }
    const t = HtmlService.createTemplateFromFile('Index'), a = loadAssets_();
    t.LOGO = a.logo || ''; t.BG = a.bg || ''; t.TOWER = a.tower || ''; t.USER_OPTIONS = loginOptionsHtml_();
    const ui = getUi_();
    t.UI_JSON = JSON.stringify(ui).replace(/</g, '\\u003c'); t.UI_CSS = uiCss_(ui); t.UI_FONT = uiFontLink_(ui);
    return t.evaluate()
      .setTitle((ui.appTitle || 'Crescent Patrol') + ' · CBRE')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
  } catch (err) { Logger.log('doGet failed: ' + err); return errorPage_(err); }
}

/** The name dropdown is written straight into the page by the server, so it shows even if the page script never runs. */
function loginOptionsHtml_() {
  const head = '<option value="">Select your name</option>';
  try {
    const r = listLoginUsers();
    if (!r.ok) return head;
    return head + r.staff.slice().sort((a, b) => a.name.localeCompare(b.name)).map(x => '<option value="' + h_(x.id) + '">' + h_(x.name) + '</option>').join('');
  } catch (e) { return head; }
}

const DIAG_STYLE_ = '<style>body{font-family:Arial,sans-serif;background:#06130f;color:#0b1f1a;margin:0;padding:20px}.box{max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:22px}h2{margin:0 0 10px;color:#03694f}li{margin:6px 0}.ok{color:#04753f}.bad{color:#b42318}.b{display:inline-block;margin:8px 8px 0 0;padding:10px 16px;background:#03694f;color:#fff;border-radius:10px;text-decoration:none}</style>';
function pageUrl_() { try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; } }
function errorPage_(err) {
  const url = pageUrl_();
  return HtmlService.createHtmlOutput(DIAG_STYLE_ + '<div class="box"><h2>The app could not start</h2><p>' + h_((err && err.message) || err) + '</p>' +
    (url ? '<a class="b" href="' + h_(url) + '" target="_top">Try again</a><a class="b" href="' + h_(url + '?diag=1') + '" target="_top">Server check</a>' : '') + '</div>')
    .setTitle('Crescent Patrol').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
/** Open  <web app url>?diag=1  to see exactly what the server sees (sheet, users, logo) without any app script involved. */
function diagPage_() {
  const rows = [], chk = (label, fn) => { try { rows.push('<li class="ok">OK &nbsp;<b>' + h_(label) + '</b>: ' + h_(fn()) + '</li>'); } catch (e) { rows.push('<li class="bad">FAIL <b>' + h_(label) + '</b>: ' + h_(e.message) + '</li>'); } };
  chk('Version', () => APP_VERSION);
  chk('SHEET_ID in Code.gs', () => { if (!SHEET_ID) throw new Error('EMPTY - paste your spreadsheet ID into SHEET_ID, otherwise the app may read a different spreadsheet than the one you are looking at'); return SHEET_ID; });
  let ss = null;
  chk('Spreadsheet used by the app', () => { ss = openSpreadsheet_(); return ss.getName() + ' - ' + ss.getUrl(); });
  chk('Users tab headers', () => { const sh = ss.getSheetByName('Users'); if (!sh) throw new Error('no tab named "Users"'); return sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].join(' | '); });
  chk('Users shown on the login screen', () => { const r = listLoginUsers(); if (!r.ok) throw new Error(r.error); if (!r.staff.length) throw new Error('0 users (every row needs a Name, and Active must not be FALSE)'); return r.staff.length + ' - ' + r.staff.map(x => x.name).join(', '); });
  chk('Logo + background (Assets.html)', () => { const a = getAssets(); if (!a.ok) throw new Error(a.error); return 'logo ' + a.logo.length + ' chars, background ' + a.bg.length + ' chars, poster photo ' + (a.tower || '').length + ' chars'; });
  const url = pageUrl_();
  return HtmlService.createHtmlOutput(DIAG_STYLE_ + '<div class="box"><h2>Server check</h2><ul>' + rows.join('') + '</ul>' + (url ? '<a class="b" href="' + h_(url) + '" target="_top">Open the app</a>' : '') + '</div>')
    .setTitle('Crescent Patrol - check').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Sheet resolution only (no setup work): SHEET_ID const -> saved property -> bound sheet -> create new. */
function openSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  let ss = null;
  const tryOpen = id => { try { return id ? SpreadsheetApp.openById(id) : null; } catch (e) { return null; } };
  ss = tryOpen(SHEET_ID) || tryOpen(props.getProperty(SPREADSHEET_PROP));
  if (!ss) { try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; } }
  if (!ss) ss = SpreadsheetApp.create('PatrolSystemDB_Live');
  if (props.getProperty(SPREADSHEET_PROP) !== ss.getId()) props.setProperty(SPREADSHEET_PROP, ss.getId());
  return ss;
}

/** Used by every API call. Non-destructive: only creates what is missing. */
function getSpreadsheet() {
  const ss = openSpreadsheet_();
  ensureSetup_(ss);
  return ss;
}

/** Header names (lower-case) that are accepted for each Users column. Order = priority. */
const USER_ALIASES = {
  email:      ['email', 'id', 'user id', 'userid', 'login', 'staff id', 'employee id', 'emp id', 'username', 'user name'],
  name:       ['name', 'full name', 'fullname', 'staff name', 'employee name', 'employee', 'user', 'guard name'],
  role:       ['role', 'type', 'position', 'designation'],
  department: ['department', 'dept', 'team', 'section'],
  active:     ['active', 'status', 'enabled'],
  pin:        ['pin', 'pin code', 'pincode', 'passcode', 'password', 'pass', 'code'],
  mustChange: ['mustchange', 'must change', 'must change pin', 'mustchangepin'],
  depts:      ['depts', 'departments', 'dept access', 'visible departments', 'access']
};
const USER_LABELS = { email: 'ID', name: 'Name', role: 'Role', department: 'Department', active: 'Active', pin: 'PIN', mustChange: 'MustChange', depts: 'Depts' };
function normHdr_(h) { return String(h == null ? '' : h).trim().toLowerCase().replace(/[\s_\-]+/g, ' '); }
/** Only the columns whose header really exists in the sheet (matched by name, not by position). */
function userIdxStrict_(hdr) {
  const low = hdr.map(normHdr_), ix = {}, used = {};
  // name first, so "username"/"user name" go to the name column only when there is no real ID column
  ['pin', 'name', 'email', 'role', 'department', 'depts', 'active', 'mustChange'].forEach(k => {
    for (let n = 0; n < USER_ALIASES[k].length; n++) {
      const i = low.indexOf(USER_ALIASES[k][n]);
      if (i >= 0 && !used[i]) { ix[k] = i; used[i] = true; break; }
    }
  });
  return ix;
}
/** Users column map read from the sheet's own headers; any column still unknown falls back to the standard position. */
function userIdx_(hdr) {
  const ix = userIdxStrict_(hdr);
  SCHEMAS.Users.forEach((h, i) => { if (ix[h] === undefined) ix[h] = i; });
  return ix;
}

/** Creates any missing tab, writes headers, appends missing columns, makes sure an admin exists. Never deletes data. */
function ensureSetup_(ss, force) {
  const cache = CacheService.getScriptCache(), key = 'setup_v12_' + ss.getId();
  if (!force && cache.get(key)) return;

  Object.keys(SCHEMAS).forEach(name => {
    const want = SCHEMAS[name], label = k => (name === 'Users' ? USER_LABELS[k] : k);
    let sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) {
      sh.getRange(1, 1, 1, want.length).setValues([want.map(label)]);
    } else {
      const have = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
      const haveL = have.map(x => x.trim().toLowerCase());
      let missing;
      if (name === 'Users') { const st = userIdxStrict_(have); missing = want.filter(h => st[h] === undefined); }
      else missing = want.filter(h => haveL.indexOf(h.toLowerCase()) === -1);
      if (missing.length) sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing.map(label)]);
    }
    const hdr = sh.getRange(1, 1, 1, sh.getLastColumn());
    hdr.setFontWeight('bold').setBackground('#03694f').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  });

  // ---- Users: PIN column as plain text (keeps leading zeros) + default admin ----
  const users = ss.getSheetByName('Users');
  let ud = users.getDataRange().getValues(), ui = userIdx_(ud[0]);
  try { users.getRange(2, ui.pin + 1, Math.max(users.getMaxRows() - 1, 1), 1).setNumberFormat('@'); } catch (e) {}
  const anyUser = ud.slice(1).some(r => uid_(r, ui) || String(r[ui.name] || '').trim());
  if (!anyUser) {
    const row = new Array(Math.max(users.getLastColumn(), SCHEMAS.Users.length)).fill('');
    const put = (k, v) => { row[ui[k]] = v; };
    put('email', 'ADMIN-001'); put('name', 'System Admin'); put('role', 'admin'); put('department', 'General'); put('active', 'TRUE'); put('mustChange', 'FALSE');
    users.appendRow(row);
    users.getRange(users.getLastRow(), ui.pin + 1).setNumberFormat('@').setValue('1425');
  }

  // ---- Departments: seed once ----
  const dsh = ss.getSheetByName('Departments');
  if (dsh.getLastRow() < 2) dsh.getRange(2, 1, DEFAULT_DEPTS.length, 3).setValues(DEFAULT_DEPTS);
  try { dsh.getRange('B:C').setNumberFormat('@'); } catch (e) {}

  const def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) { try { ss.deleteSheet(def); } catch (e) {} }

  try { getMasterFolder_(); } catch (e) { /* Drive permission issue: surfaced when a photo is uploaded */ }
  cache.put(key, '1', 21600);
}

// ==========================================
// SETUP  (run from the Apps Script editor)
// ==========================================
/**
 * setup()  -> FIRST TIME: asks for permissions, DELETES every tab in the spreadsheet, recreates all tabs + headers,
 *             creates the admin  "System Admin" / PIN 1425, and marks setup as completed.
 *          -> ALREADY DONE: deletes NOTHING. Only reports "Setup already completed" (and quietly repairs anything missing).
 * To deliberately wipe and rebuild everything again, run forceResetSetup().
 */
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(SETUP_FLAG) === 'TRUE') {
    let info = '';
    try {                      // non-destructive self-check / repair
      const ss = openSpreadsheet_();
      ensureSetup_(ss, true);
      const d = ss.getSheetByName('Users').getDataRange().getValues(), ix = userIdx_(d[0]);
      const n = d.slice(1).filter(r => uid_(r, ix) && String(r[ix.name] || '').trim() && isActive_(r[ix.active])).length;
      info = '\nSpreadsheet: ' + ss.getUrl() + '\nActive users: ' + n;
    } catch (e) { info = '\n(Check failed: ' + e.message + ')'; }
    const msg = 'SETUP ALREADY COMPLETED - nothing was deleted.' + info +
      '\n\nTo wipe everything and start again on purpose, run forceResetSetup().';
    Logger.log(msg);
    return msg;
  }
  return buildFresh_();
}

/** DANGER: wipes every tab and rebuilds from scratch (owner only). Drive photos / PDFs are not touched. */
function forceResetSetup() {
  PropertiesService.getScriptProperties().deleteProperty(SETUP_FLAG);
  return buildFresh_();
}

function buildFresh_() {
  const me = Session.getEffectiveUser().getEmail(), active = Session.getActiveUser().getEmail();
  if (me && active && me !== active) throw new Error('Owner only');
  authorizeAll();
  const ss = openSpreadsheet_();
  const tmp = ss.insertSheet('__reset__' + Date.now());
  ss.getSheets().forEach(s => { if (s.getSheetId() !== tmp.getSheetId()) ss.deleteSheet(s); });
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  CacheService.getScriptCache().removeAll(['setup_v7_' + ss.getId(), 'setup_v8_' + ss.getId(), 'setup_v9_' + ss.getId(), 'setup_v10_' + ss.getId(), 'setup_v11_' + ss.getId(), 'setup_v12_' + ss.getId(), 'settings_v1', 'ui_v1', 'ft_v1']);
  ensureSetup_(ss, true);
  ss.deleteSheet(tmp);
  PropertiesService.getScriptProperties().setProperty(SETUP_FLAG, 'TRUE');
  const d = ss.getSheetByName('Users').getDataRange().getValues(), ix = userIdx_(d[0]);
  const admin = d.slice(1).filter(r => String(r[ix.role]).toLowerCase() === 'admin')[0];
  const msg = 'SETUP COMPLETE (all sheets were deleted and recreated).\nSheets: ' + Object.keys(SCHEMAS).join(', ') +
    '\nAdmin: ' + (admin ? admin[ix.name] + '  |  PIN ' + admin[ix.pin] : 'NOT CREATED') + '\nSpreadsheet: ' + ss.getUrl() +
    (SHEET_ID ? '' : '\n\nIMPORTANT - paste this into SHEET_ID at the top of Code.gs, then redeploy:\n' + ss.getId()) + '\n\nNow deploy a NEW VERSION of the web app and sign in.';
  Logger.log(msg);
  return msg;
}

// ---------- Drive folders ----------
function getMasterFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = MASTER_FOLDER_ID || props.getProperty('MASTER_FOLDER_ID');
  let master = null;
  if (id) { try { master = DriveApp.getFolderById(id); } catch (e) { master = null; } }
  if (!master) {
    const auto = props.getProperty('MASTER_FOLDER_AUTO');
    if (auto) { try { master = DriveApp.getFolderById(auto); } catch (e) { master = null; } }
    if (!master) { master = DriveApp.createFolder('Crescent Patrol - Master'); props.setProperty('MASTER_FOLDER_AUTO', master.getId()); }
  }
  childFolder_(master, 'PatrolPhotos');
  childFolder_(master, 'Reports');
  return master;
}
function childFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
/** MasterFolder / PatrolPhotos / 2026-10 */
function getPhotoFolder_() {
  const month = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
  return childFolder_(childFolder_(getMasterFolder_(), 'PatrolPhotos'), month);
}

/** Logo + background come from the file Assets.html (two hidden <div id="logo"> / <div id="bg"> blocks). */
function loadAssets_() {
  let html;
  try { html = HtmlService.createTemplateFromFile('Assets').getRawContent(); }          // raw file text, nothing evaluated
  catch (e1) { html = HtmlService.createHtmlOutputFromFile('Assets').getContent(); }
  const pick = id => { const m = html.match(new RegExp('<div id="' + id + '"[^>]*>([\\s\\S]*?)</div>')); return m ? m[1].replace(/\s+/g, '') : ''; };
  return { logo: pick('logo'), bg: pick('bg'), tower: pick('tower') };
}
function getAssets() {
  try {
    const a = loadAssets_();
    if (!a.logo && !a.bg) return { ok: false, error: 'Assets.html has no logo/bg blocks' };
    return { ok: true, logo: a.logo, bg: a.bg, tower: a.tower };
  } catch (e) { return { ok: false, error: 'Assets.html file is missing' }; }
}

function getWebAppUrl() { return ScriptApp.getService().getUrl(); }
function superAdmin_(token) { const u = getUser(token); return (u && !u.mustChange && u.role === 'admin') ? u : null; }
function isAdmin_(u) { return !!u && !u.mustChange && (u.role === 'admin' || u.role === 'manager'); }

// ==========================================
// 2. AUTHENTICATION (single login for everyone)
// ==========================================
/** Every row of the Users sheet that has a name and is not disabled. Never returns PINs. */
function listLoginUsers() {
  try {
    const data = getSpreadsheet().getSheetByName('Users').getDataRange().getValues();
    const idx = userIdx_(data[0]), staff = [];
    for (let i = 1; i < data.length; i++) {
      const r = data[i], name = String(r[idx.name] || '').trim(), id = uid_(r, idx);
      if (!name || !id || !isActive_(r[idx.active])) continue;
      const pn = r[idx.pin] != null ? String(r[idx.pin]).trim() : '';
      staff.push({ id: id, email: id, name: name, dept: String(r[idx.department] || '').trim() || 'General',
                   role: String(r[idx.role] || '').trim().toLowerCase(), needsPassword: false, pinLen: pn.length });
    }
    return { ok: true, staff: staff };
  } catch (err) { return { ok: false, error: err.message }; }
}
function listSecurityStaff() { return listLoginUsers(); }

/** Login = pick name + PIN. The PIN is compared with the PIN column of the Users sheet. 5 wrong tries -> 5 minute pause. */
function unifiedLogin(id, secret) {
  try {
    const data = getSpreadsheet().getSheetByName('Users').getDataRange().getValues();
    const idx = userIdx_(data[0]), cache = CacheService.getScriptCache(), lk = 'fail_' + id;
    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      if (uid_(r, idx).toLowerCase() !== String(id).trim().toLowerCase()) continue;
      if (!isActive_(r[idx.active])) return { ok: false, error: 'Account disabled' };
      const fails = Number(cache.get(lk) || 0);
      if (fails >= 5) return { ok: false, error: 'Too many attempts. Try again in 5 minutes.' };
      const stored = r[idx.pin] != null ? String(r[idx.pin]).trim() : '';
      if (!stored) return { ok: false, error: 'No PIN in the sheet for this user.' };
      if (stored !== String(secret || '').trim()) { cache.put(lk, String(fails + 1), 300); return { ok: false, error: 'Incorrect PIN' }; }
      cache.remove(lk);
      const role = String(r[idx.role] || '').trim().toLowerCase();
      const must = String(r[idx.mustChange]).toUpperCase() === 'TRUE';
      const user = { email: uid_(r, idx), name: String(r[idx.name] || '').trim(), role: role, dept: String(r[idx.department] || '').trim() || 'General', mustChange: must, depts: parseDepts_(r[idx.depts]) };
      return { ok: true, token: makeToken_(user.email), user: user };
    }
    return { ok: false, error: 'User not found' };
  } catch (err) { return { ok: false, error: err.message }; }
}
function login(email, password) { return unifiedLogin(email, password); }                 // backward compatible
function loginAsSecurity(email, pin) { return unifiedLogin(email, pin); }                  // backward compatible

/** Lets a signed-in user set their own 4-digit PIN. Clears the first-login flag. */
function changePin(token, newPin) {
  const u = getUser(token);
  if (!u) return { ok: false, error: 'Unauthorized' };
  const pin = String(newPin || '').trim();
  if (!/^\d{4}$/.test(pin)) return { ok: false, error: 'PIN must be exactly 4 digits' };
  if (pin === '1234' || /^(\d)\1+$/.test(pin)) return { ok: false, error: 'Choose a PIN that is not 1234 or one repeated digit' };
  try {
    const sh = getSpreadsheet().getSheetByName('Users'), d = sh.getDataRange().getValues(), ix = userIdx_(d[0]);
    for (let i = 1; i < d.length; i++) {
      if (uid_(d[i], ix).toLowerCase() !== String(u.email).toLowerCase()) continue;
      const pc = sh.getRange(i + 1, ix.pin + 1); pc.setNumberFormat('@'); pc.setValue(pin);
      if (ix.mustChange !== undefined) sh.getRange(i + 1, ix.mustChange + 1).setValue('FALSE');
      const nu = { email: u.email, name: u.name, role: u.role, dept: u.dept || 'General', mustChange: false, depts: u.depts || [] };
      dropUserCache_(u.email);
      return { ok: true, user: nu };
    }
    return { ok: false, error: 'User not found' };
  } catch (err) { return { ok: false, error: err.message }; }
}

function whoami(token) {
  const u = getUser(token);
  return u ? { ok: true, user: u } : { ok: false };
}
function logout(token) { return { ok: true }; }       // tokens are stateless: the phone simply forgets it

// ==========================================
// 3. QUICK SCAN (PRE-LOGIN) & SCAN LOGGING
// ==========================================
function verifyQuickScan(cpId) {
  try {
    const ss = getSpreadsheet(), data = ss.getSheetByName('Checkpoints').getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === cpId) {
        const dept = deptOfCheckpoint_(ss, data[i]);
        return { ok: true, checkpoint: { id: data[i][0], equipmentName: data[i][2], floor: data[i][3], task: data[i][4], photoRequired: String(data[i][5]).toUpperCase() === 'TRUE', checklist: parseList_(data[i][7]), department: dept, direct: isDirectDept_(dept) } };
      }
    }
    return { ok: false, error: 'Invalid Checkpoint QR.' };
  } catch (err) { return { ok: false, error: err.message }; }
}

/** Department of a checkpoint row: its own column, else the department of its equipment. */
function deptOfCheckpoint_(ss, row) {
  const own = String(row[8] == null ? '' : row[8]).trim();
  if (own) return own;
  try {
    const ed = ss.getSheetByName('Equipment').getDataRange().getValues(), ei = hdrIdx_(ed[0]);
    const r = findRow_(ed, ei.id, row[1]);
    return r > 0 && ei.department !== undefined ? String(ed[r][ei.department] || '').trim() : '';
  } catch (e) { return ''; }
}
function deptRows_() {
  const sh = getSpreadsheet().getSheetByName('Departments'), lr = sh.getLastRow();
  if (lr < 2) return [];
  return sh.getRange(2, 1, lr - 1, 3).getValues().filter(r => String(r[0]).trim())
    .map(r => ({ name: String(r[0]).trim(), directScan: String(r[1]).toUpperCase() === 'TRUE', active: String(r[2]).toUpperCase() !== 'FALSE' }));
}
function isDirectDept_(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return false;
  return deptRows_().some(d => d.name.toLowerCase() === n && d.directScan && d.active);
}
function cleanDept_(v) {
  const n = String(v || '').trim().toLowerCase();
  if (!n) return '';
  const hit = deptRows_().filter(d => d.name.toLowerCase() === n)[0];
  return hit ? hit.name : '';
}

/** Tower letter shown on the QR poster (A, B, C ...). Empty = poster shows the floor instead. */
function cleanTower_(v) { const t = String(v || '').trim().toUpperCase().slice(0, 2); return /^[A-Z0-9]{1,2}$/.test(t) ? t : ''; }
/** QR poster design the admin picked: only models 1, 2 and 5 exist. */
function cleanModel_(v) { const m = String(v || '').trim(); return ['1', '2', '5'].indexOf(m) >= 0 ? m : ''; }

/** "G, 1-50, B1-B2, Terrace"  ->  ['G','1','2',...,'50','B1','B2','Terrace']  (max 300) */
function expandFloors_(v) {
  const src = Array.isArray(v) ? v.join(',') : String(v || ''), out = [], seen = {};
  src.split(/[,;\n]+/).forEach(tok => {
    tok = tok.trim(); if (!tok) return;
    const m = tok.match(/^([A-Za-z]*)\s*(\d+)\s*(?:-|\u2013|to)\s*([A-Za-z]*)\s*(\d+)$/i);
    let list = [tok];
    if (m && (!m[3] || m[3].toUpperCase() === m[1].toUpperCase())) {
      let a = Number(m[2]), b = Number(m[4]); if (a > b) { const t = a; a = b; b = t; }
      if (b - a < 300) { list = []; for (let n = a; n <= b; n++) list.push(m[1].toUpperCase() + n); }
    }
    list.forEach(f => { const k = f.toLowerCase(); if (!seen[k]) { seen[k] = 1; out.push(f); } });
  });
  return out.slice(0, 300);
}

function quickLoginAndScan(email, pin, cpId) {
  const loginRes = unifiedLogin(email, pin);
  if (!loginRes.ok) return loginRes;
  const scanRes = recordScan(loginRes.token, { checkpointId: cpId, status: 'OK', notes: 'Direct Scan Login' });
  if (!scanRes.ok) return scanRes;
  return { ok: true, token: loginRes.token, user: loginRes.user };
}

/** Photo -> Drive (shared view link). Throws on failure. */
function savePhoto_(photoData, tag) {
  const parts = String(photoData).split(',');
  const contentType = parts[0].match(/data:(.*?);/)[1];
  const bytes = Utilities.base64Decode(parts[1]);
  const blob = Utilities.newBlob(bytes, contentType, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss') + '_' + String(tag).replace(/[^\w-]/g, '') + '.jpg');
  const file = getPhotoFolder_().createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
  catch (se) { try { file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); } catch (se2) {} }
  return file.getUrl();
}

/** Last N rows of ScanLog as light objects (chronological). Fast: never reads the whole sheet. */
function recentScans_(maxRows) {
  const sh = getSpreadsheet().getSheetByName('ScanLog'), lr = sh.getLastRow(), lc = sh.getLastColumn();
  if (lr < 2) return [];
  const si = hdrIdx_(sh.getRange(1, 1, 1, lc).getValues()[0]);
  const start = Math.max(2, lr - maxRows + 1);
  return sh.getRange(start, 1, lr - start + 1, lc).getValues().map(r => {
    const d = r[si.timestamp] instanceof Date ? r[si.timestamp] : new Date(r[si.timestamp]);
    return { t: d.getTime(), email: String(r[si.email]).toLowerCase(), userName: r[si.userName], cp: r[si.checkpointId],
             equipmentName: r[si.equipmentName], floor: String(r[si.floor]), status: String(r[si.status]).toUpperCase() };
  }).filter(x => !isNaN(x.t));
}

function recordScan(token, payload) {
  const user = getUser(token);
  if (!user) return { ok: false, error: 'Unauthorized' };
  return recordScanCore_(user, payload);
}

/** NO LOGIN. Works only for checkpoints whose department has "direct scan" switched on (e.g. Security). Everything else needs a signed-in user. */
function recordDirectScan(payload) {
  try {
    payload = payload || {};
    const ss = getSpreadsheet(), cpData = ss.getSheetByName('Checkpoints').getDataRange().getValues();
    let found = null;
    for (let i = 1; i < cpData.length; i++) if (cpData[i][0] === payload.checkpointId) { found = cpData[i]; break; }
    if (!found) return { ok: false, error: 'Checkpoint not found in DB.' };
    if (!isDirectDept_(deptOfCheckpoint_(ss, found))) return { ok: false, error: 'Login is required for this checkpoint.' };
    const cache = CacheService.getScriptCache(), n = Number(cache.get('direct_rate') || 0);
    if (n >= 120) return { ok: false, error: 'Too many scans right now. Try again in a minute.' };
    cache.put('direct_rate', String(n + 1), 60);
    payload.offline = false; payload.clientTime = '';
    return recordScanCore_({ email: 'DIRECT-SCAN', name: 'Security (direct scan)', role: 'security', dept: 'Security' }, payload);
  } catch (err) { return { ok: false, error: err.message }; }
}

function recordScanCore_(user, payload) {
  try {
    const ss = getSpreadsheet(), S = getSettings_();
    const cpData = ss.getSheetByName('Checkpoints').getDataRange().getValues();
    let found = null;
    for (let i = 1; i < cpData.length; i++) {
      if (cpData[i][0] === payload.checkpointId) { found = cpData[i]; break; }
    }
    if (!found) return { ok: false, error: 'Checkpoint not found in DB.' };
    if (getFeatures_().block && user.depts && user.depts.length && !isAdmin_(user)) {
      const dd = deptOfCheckpoint_(ss, found);
      if (!inScope_(userScope_(user), dd)) return { ok: false, error: 'This checkpoint belongs to ' + dd + ' - not one of your departments.' };
    }

    // time of the scan: phone time only for scans saved offline (sane window), otherwise now
    let when = new Date();
    if (payload.offline && payload.clientTime) {
      const ct = Number(payload.clientTime);
      if (ct > Date.now() - 3 * 86400000 && ct <= Date.now() + 60000) when = new Date(ct);
    }

    // duplicate-scan guard (Settings: off / warn / block)
    const dupMs = Number(S.dupMinutes) * 60000;
    if (S.dupMode !== 'off' && dupMs > 0 && (S.dupMode === 'block' || (!payload.confirmDuplicate && !payload.offline))) {
      const last = recentScans_(800).filter(x => x.cp === found[0]).pop();
      if (last && Math.abs(when.getTime() - last.t) < dupMs) {
        const mins = Math.max(1, Math.round(Math.abs(when.getTime() - last.t) / 60000));
        return { ok: false, duplicate: true, mode: S.dupMode,
          error: 'Already scanned ' + mins + ' min ago by ' + last.userName + (S.dupMode === 'block' ? '. Try again after ' + S.dupMinutes + ' minutes.' : '.') };
      }
    }

    let photoUrl = '';
    if (payload.photoData && payload.photoName) {
      try { photoUrl = savePhoto_(payload.photoData, payload.checkpointId); }
      catch (pe) { return { ok: false, error: 'Photo upload failed: ' + pe.message }; }
    }

    // photo requirement applies to everyone
    if (String(found[5]).toUpperCase() === 'TRUE' && !photoUrl) {
      return { ok: false, error: 'Photo is required for this checkpoint.' };
    }

    // checklist: every point must be answered; answers marked "bad" force status ISSUE.
    // Answers are validated against the checkpoint's own definition (never trusting the client).
    let status = String(payload.status || 'OK').toUpperCase(), notes = payload.notes || '', ck = '', issueText = '';
    const def = parseList_(found[7]);
    if (def.length) {
      const given = payload.checklist || [], results = [];
      for (let i = 0; i < def.length; i++) {
        const g = given.filter(x => String(x.t) === def[i].t)[0];
        const opt = g ? def[i].opts.filter(o => o.l === g.a)[0] : null;
        if (!opt) return { ok: false, error: 'Answer every checklist point' };
        results.push({ t: def[i].t, a: opt.l, bad: opt.bad });
      }
      const bad = results.filter(r => r.bad);
      if (bad.length) { status = 'ISSUE'; issueText = bad.map(r => r.t + ' - ' + r.a).join('; '); notes = (notes ? notes + ' | ' : '') + 'Issues: ' + issueText; }
      ck = JSON.stringify(results);
    }
    if (payload.offline) notes = (notes ? notes + ' | ' : '') + 'Logged offline';
    ss.getSheetByName('ScanLog').appendRow([
      when, user.email, user.name,
      found[0], found[1], found[2], found[3], found[4],
      status, notes, photoUrl, ck
    ]);
    if (status === 'ISSUE') {
      try { logIssue_(ss, user, found, issueText || String(payload.notes || 'Issue reported'), photoUrl, when); } catch (ie) { /* never block the scan */ }
    }
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}

/** Every phone can pre-load the checkpoint definitions so scanning keeps working without signal. */
function getCheckpointCache(token) {
  if (!getUser(token)) return { ok: false, error: 'Unauthorized' };
  try {
    const d = getSpreadsheet().getSheetByName('Checkpoints').getDataRange().getValues();
    const items = [];
    for (let i = 1; i < d.length; i++) {
      if (!d[i][0]) continue;
      items.push({ id: d[i][0], equipmentName: d[i][2], floor: String(d[i][3]), task: d[i][4], photoRequired: String(d[i][5]).toUpperCase() === 'TRUE', checklist: parseList_(d[i][7]) });
    }
    return { ok: true, items: items };
  } catch (err) { return { ok: false, error: err.message }; }
}

// ==========================================
// 4. ADMIN FUNCTIONS
// ==========================================
function listEquipment(token) {
  if (!getUser(token)) return { ok: false, error: 'Unauthorized' };
  const data = getSpreadsheet().getSheetByName('Equipment').getDataRange().getValues();
  if (data.length < 2) return { ok: true, items: [] };
  const idx = {}; data[0].forEach((k,i)=>idx[k]=i);
  const items = data.slice(1).map(r => ({
    id: r[idx.id], name: r[idx.name], category: r[idx.category], department: idx.department !== undefined ? String(r[idx.department] || '') : '',
    floors: String(r[idx.floors]||'').split(',').map(s=>s.trim()).filter(Boolean),
    photoRequired: String(r[idx.photoRequired]).toUpperCase()==='TRUE',
    tower: idx.tower !== undefined ? String(r[idx.tower] || '') : '',
    posterModel: idx.posterModel !== undefined ? String(r[idx.posterModel] || '') : ''
  }));
  return { ok: true, items };
}

/** Builds checkpoint rows (one per floor) so 50 floors are written to the sheet in ONE call. Skips ids that already exist. */
function makeCpRows_(cs, eqId, name, dept, floors, task, photo, checklist) {
  const have = {};
  if (cs.getLastRow() > 1) cs.getRange(2, 1, cs.getLastRow() - 1, 1).getValues().forEach(r => { have[r[0]] = 1; });
  const url = getWebAppUrl(), rows = [], skipped = [];
  floors.forEach(floor => {
    const id = cpId_(eqId, floor);
    if (have[id]) { skipped.push(floor); return; }
    have[id] = 1;
    rows.push([id, eqId, name, floor, task || ('Inspect ' + name), photo ? 'TRUE' : 'FALSE', url + '?cp=' + encodeURIComponent(id), JSON.stringify(checklist || []), dept]);
  });
  return { rows: rows, skipped: skipped };
}
function writeCpRows_(cs, rows) {
  if (!rows.length) return;
  const start = cs.getLastRow() + 1;
  cs.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
}

function addEquipment_core(token, payload) {
  const u = getUser(token);
  if (!isAdmin_(u)) return { ok: false, error: 'Admin only' };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    payload = payload || {};
    const ss = getSpreadsheet(), eqSheet = ss.getSheetByName('Equipment'), cpSheet = ss.getSheetByName('Checkpoints');
    const name = String(payload.name || '').trim();
    if (!name) return { ok: false, error: 'Name is required' };
    const floors = expandFloors_(payload.floors);
    if (!floors.length) return { ok: false, error: 'Add at least one floor (example: G, 1-50)' };
    const dept = cleanDept_(payload.department);
    const id = (payload.id && String(payload.id).trim()) ? String(payload.id).trim() : 'EQ-' + Utilities.getUuid().slice(0, 6).toUpperCase();
    const photo = !!payload.photoRequired;
    const eh = hdrIdx_(eqSheet.getRange(1, 1, 1, eqSheet.getLastColumn()).getValues()[0]);
    const erow = new Array(eqSheet.getLastColumn()).fill('');
    const put = (k, v) => { if (eh[k] !== undefined) erow[eh[k]] = v; };
    put('id', id); put('name', name); put('category', payload.category || ''); put('floors', floors.join(','));
    put('photoRequired', photo ? 'TRUE' : 'FALSE'); put('active', 'TRUE'); put('createdAt', new Date()); put('department', dept);
    put('tower', cleanTower_(payload.tower)); put('posterModel', cleanModel_(payload.posterModel) || '1');
    eqSheet.appendRow(erow);
    const made = makeCpRows_(cpSheet, id, name, dept, floors, payload.task, photo, cleanList_(payload.checklist));
    writeCpRows_(cpSheet, made.rows);
    return { ok: true, equipmentId: id, checkpoints: made.rows.map(r => r[0]) };
  } catch (err) { return { ok: false, error: err.message }; }
  finally { lock.releaseLock(); }
}

/** Add many floors to an existing equipment at once. Task, checklist and photo rule are copied from its first checkpoint. */
function addFloors(token, p) {
  if (!adminOnly_(token)) return { ok: false, error: 'Admin only' };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    p = p || {};
    const ss = getSpreadsheet(), ed = ss.getSheetByName('Equipment').getDataRange().getValues(), ei = hdrIdx_(ed[0]);
    const er = findRow_(ed, ei.id, p.equipmentId);
    if (er < 0) return { ok: false, error: 'Equipment not found' };
    const floors = expandFloors_(p.floors);
    if (!floors.length) return { ok: false, error: 'Type the floors to add (example: 1-50)' };
    const cs = ss.getSheetByName('Checkpoints'), cd = cs.getDataRange().getValues(), ci = hdrIdx_(cd[0]);
    let task = '', list = [], photo = String(ed[er][ei.photoRequired]).toUpperCase() === 'TRUE';
    for (let i = 1; i < cd.length; i++) if (cd[i][ci.equipmentId] === p.equipmentId) { task = cd[i][ci.task]; list = parseList_(cd[i][ci.checklist]); break; }
    const dept = ei.department !== undefined ? String(ed[er][ei.department] || '') : '';
    const made = makeCpRows_(cs, p.equipmentId, ed[er][ei.name], dept, floors, task, photo, list);
    writeCpRows_(cs, made.rows);
    syncFloors_(ss, p.equipmentId);
    return { ok: true, added: made.rows.length, skipped: made.skipped.length };
  } catch (err) { return { ok: false, error: err.message }; }
  finally { lock.releaseLock(); }
}

function listCheckpoints(token) {
  if (!getUser(token)) return { ok: false, error: 'Unauthorized' };
  const ss = getSpreadsheet();
  const data = ss.getSheetByName('Checkpoints').getDataRange().getValues();
  if (data.length < 2) return { ok: true, items: [] };
  const idx = {}; data[0].forEach((k,i)=>idx[k]=i);
  const last = {};
  const sl = ss.getSheetByName('ScanLog').getDataRange().getValues();
  for (let i = 1; i < sl.length; i++) {
    const t = sl[i][0] instanceof Date ? sl[i][0].getTime() : new Date(sl[i][0]).getTime();
    if (!last[sl[i][3]] || t > last[sl[i][3]]) last[sl[i][3]] = t;
  }
  const items = data.slice(1).map(r => ({
    id: r[idx.id], equipmentId: r[idx.equipmentId], equipmentName: r[idx.equipmentName],
    floor: r[idx.floor], task: r[idx.task], department: idx.department !== undefined ? String(r[idx.department] || '') : '',
    photoRequired: String(r[idx.photoRequired]).toUpperCase()==='TRUE', qrUrl: r[idx.qrUrl],
    checklist: parseList_(r[idx.checklist]),
    lastScan: last[r[idx.id]] ? new Date(last[r[idx.id]]).toISOString() : null
  }));
  return { ok: true, items };
}

function deleteEquipment_core(token, id) {
  const u = getUser(token);
  if (!isAdmin_(u)) return { ok: false, error: 'Admin only' };
  audit_(u, 'equipment.delete', id, '');
  const ss = getSpreadsheet();
  const eqSheet = ss.getSheetByName('Equipment');
  const eqData = eqSheet.getDataRange().getValues();
  for (let i = 1; i < eqData.length; i++) {
    if (eqData[i][0] === id) { eqSheet.deleteRow(i+1); break; }
  }
  const cpSheet = ss.getSheetByName('Checkpoints');
  const cpData = cpSheet.getDataRange().getValues();
  for (let i = cpData.length - 1; i >= 1; i--) {
    if (cpData[i][1] === id) cpSheet.deleteRow(i+1);
  }
  return { ok: true };
}

/** Signed token = base64(userId|expiry).HMAC. Survives cache expiry; a disabled/deleted user is locked out within 5 minutes. */
function secret_() {
  const p = PropertiesService.getScriptProperties();
  let k = p.getProperty('APP_TOKEN_SECRET_V1');
  if (!k) { k = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('APP_TOKEN_SECRET_V1', k); }
  return k;
}
function sign_(payload) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, secret_())); }
function makeToken_(id) {
  const payload = Utilities.base64EncodeWebSafe(String(id) + '|' + (Date.now() + TOKEN_DAYS * 86400000), Utilities.Charset.UTF_8);
  return payload + '.' + sign_(payload);
}
function userCacheKey_(id) { return 'u_' + String(id).toLowerCase().slice(0, 200); }
function dropUserCache_(id) { try { CacheService.getScriptCache().remove(userCacheKey_(id)); } catch (e) {} }
function userFromSheet_(id) {
  const data = getSpreadsheet().getSheetByName('Users').getDataRange().getValues(), ix = userIdx_(data[0]);
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (uid_(r, ix).toLowerCase() !== String(id).toLowerCase()) continue;
    if (!isActive_(r[ix.active])) return null;
    return { email: uid_(r, ix), name: String(r[ix.name] || '').trim(), role: String(r[ix.role] || '').trim().toLowerCase(),
             dept: String(r[ix.department] || '').trim() || 'General', mustChange: String(r[ix.mustChange]).toUpperCase() === 'TRUE', depts: parseDepts_(r[ix.depts]) };
  }
  return null;
}
function getUser(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 2 || sign_(parts[0]) !== parts[1]) return null;
    const d = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString(), cut = d.lastIndexOf('|');
    if (cut < 1 || Number(d.slice(cut + 1)) < Date.now()) return null;
    const id = d.slice(0, cut), cache = CacheService.getScriptCache(), raw = cache.get(userCacheKey_(id));
    if (raw) return JSON.parse(raw);
    const u = userFromSheet_(id);
    if (u) cache.put(userCacheKey_(id), JSON.stringify(u), 300);
    return u;
  } catch (e) { return null; }
}

// ==========================================
// 5. SCAN LOG + ANALYTICS (admin: all scans, guards: own scans only)
// ==========================================
function getScanLog(token, filters) {
  const user = getUser(token);
  if (!user) return { ok: false, error: 'Unauthorized' };
  filters = filters || {};
  const ss = getSpreadsheet();
  const tz = Session.getScriptTimeZone();
  const data = ss.getSheetByName('ScanLog').getDataRange().getValues();
  const cpTotal = Math.max(0, ss.getSheetByName('Checkpoints').getLastRow() - 1);
  const empty = { totalScans: 0, users: 0, totalCheckpoints: cpTotal, missed: cpTotal, issues: 0, equipmentChart: {}, guards: [], trend: lastDays_(7, [], tz) };
  if (data.length < 2) return { ok: true, items: [], analytics: Object.assign(empty, extraStats_(ss, [], filters, tz)) };

  const idx = {}; data[0].forEach((k,i)=>idx[k]=i);
  let items = data.slice(1).map(r => ({
    timestamp: r[idx.timestamp] instanceof Date ? r[idx.timestamp].toISOString() : r[idx.timestamp],
    email: r[idx.email], userName: r[idx.userName],
    checkpointId: r[idx.checkpointId], equipmentName: r[idx.equipmentName],
    floor: r[idx.floor], status: r[idx.status], notes: r[idx.notes], photoUrl: r[idx.photoUrl], checklist: r[idx.checklist] || ''
  }));
  if (!isAdmin_(user)) items = items.filter(it => it.email === user.email);

  const trend = lastDays_(7, items, tz);
  const extra = extraStats_(ss, items, filters, tz);   // round compliance + open issues (overview only)

  if (filters.from) { const t = new Date(filters.from).getTime(); items = items.filter(it => new Date(it.timestamp).getTime() >= t); }
  if (filters.to)   { const t = new Date(filters.to).getTime() + 86399999; items = items.filter(it => new Date(it.timestamp).getTime() <= t); }

  const eqScans = {}, guardMap = {};
  items.forEach(it => {
    eqScans[it.equipmentName] = (eqScans[it.equipmentName] || 0) + 1;
    guardMap[it.email] = guardMap[it.email] || { name: it.userName, count: 0 };
    guardMap[it.email].count++;
  });
  const scannedCps = new Set(items.map(it => it.checkpointId)).size;

  return {
    ok: true,
    items: items.slice(-Math.min(Math.max(Number(filters.limit) || 500, 1), 2000)).reverse(),
    analytics: {
      totalScans: items.length,
      users: Object.keys(guardMap).length,
      totalCheckpoints: cpTotal,
      missed: Math.max(0, cpTotal - scannedCps),
      issues: items.filter(it => String(it.status).toUpperCase() === 'ISSUE').length,
      equipmentChart: eqScans,
      guards: Object.keys(guardMap).map(k => guardMap[k]).sort((a,b)=>b.count-a.count),
      trend: trend,
      rounds: extra.rounds, openIssues: extra.openIssues
    }
  };
}

function lastDays_(n, items, tz) {
  const out = [];
  for (let d = n - 1; d >= 0; d--) {
    const day = new Date(Date.now() - d * 86400000);
    out.push({ key: Utilities.formatDate(day, tz, 'yyyy-MM-dd'), label: Utilities.formatDate(day, tz, 'EEE'), count: 0 });
  }
  items.forEach(it => {
    const k = Utilities.formatDate(new Date(it.timestamp), tz, 'yyyy-MM-dd');
    const hit = out.find(o => o.key === k);
    if (hit) hit.count++;
  });
  return out;
}

// ==========================================
// 6. USER MANAGEMENT (admin)
// ==========================================
function listUsers(token) {
  if (!superAdmin_(token)) return { ok: false, error: 'Admin only' };
  try {
    const data = getSpreadsheet().getSheetByName('Users').getDataRange().getValues(), idx = userIdx_(data[0]);
    const dm = deptMap_();
    return { ok: true, users: data.slice(1).filter(r => uid_(r, idx)).map(r => ({
      id: uid_(r, idx), name: String(r[idx.name] || ''), department: String(r[idx.department] || '').trim() || 'General',
      role: String(r[idx.role]).trim().toLowerCase(), active: isActive_(r[idx.active]), depts: parseDepts_(r[idx.depts], dm),
      mustChange: String(r[idx.mustChange]).toUpperCase() === 'TRUE' })) };
  } catch (err) { return { ok: false, error: err.message }; }
}

/** Admin adds a user: name + department + PIN (+ role). The internal ID is generated; no email needed. */
function addGuard_core(token, p) {
  if (!superAdmin_(token)) return { ok: false, error: 'Admin only' };
  p = p || {};
  const name = String(p.name || '').trim(), secret = String(p.secret || p.pin || '').trim();
  if (!name) return { ok: false, error: 'Name is required' };
  if (!/^\d{4}$/.test(secret)) return { ok: false, error: 'PIN must be exactly 4 digits (numbers only)' };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const sh = getSpreadsheet().getSheetByName('Users'), data = sh.getDataRange().getValues(), ix = userIdx_(data[0]);
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][ix.name]).trim().toLowerCase() === name.toLowerCase())
        return { ok: false, error: 'That name already exists' };
    }
    const id = 'U-' + Utilities.getUuid().slice(0, 6).toUpperCase(), row = new Array(data[0].length).fill('');
    const put = (k, v) => { if (ix[k] !== undefined) row[ix[k]] = v; };
    put('email', id); put('name', name); put('role', ['manager', 'supervisor'].indexOf(p.role) >= 0 ? p.role : 'security'); put('department', cleanDept_(p.department));
    put('depts', (parseDepts_(p.depts).length ? parseDepts_(p.depts) : parseDepts_(p.department)).join(',')); put('active', 'TRUE'); put('mustChange', 'FALSE');
    sh.appendRow(row);
    sh.getRange(sh.getLastRow(), ix.pin + 1).setNumberFormat('@').setValue(secret);
    return { ok: true, id: id };
  } catch (err) { return { ok: false, error: err.message }; }
  finally { lock.releaseLock(); }
}

function userRow_(id) {
  const sh = getSpreadsheet().getSheetByName('Users'), data = sh.getDataRange().getValues(), ix = userIdx_(data[0]);
  for (let i = 1; i < data.length; i++) if (uid_(data[i], ix) === String(id)) return { sh: sh, row: i + 1, ix: ix, data: data[i] };
  return null;
}
function setUserActive_core(token, id, active) {
  const u = superAdmin_(token);
  if (!u) return { ok: false, error: 'Admin only' };
  if (String(id).toLowerCase() === String(u.email).toLowerCase()) return { ok: false, error: "You can't disable your own account" };
  const r = userRow_(id); if (!r) return { ok: false, error: 'User not found' };
  r.sh.getRange(r.row, r.ix.active + 1).setValue(active ? 'TRUE' : 'FALSE');
  audit_(u, active ? 'user.enable' : 'user.disable', r.data[r.ix.name], '');
  dropUserCache_(id);
  return { ok: true };
}
/** Admin sets a new PIN for someone who forgot theirs. */
function resetUserPin_core(token, id, pin) {
  if (!superAdmin_(token)) return { ok: false, error: 'Admin only' };
  pin = String(pin || '').trim();
  if (!/^\d{4}$/.test(pin)) return { ok: false, error: 'PIN must be exactly 4 digits' };
  const r = userRow_(id); if (!r) return { ok: false, error: 'User not found' };
  r.sh.getRange(r.row, r.ix.pin + 1).setNumberFormat('@').setValue(pin);
  audit_(getUser(token), 'user.pin-reset', r.data[r.ix.name], '');
  if (r.ix.mustChange !== undefined) r.sh.getRange(r.row, r.ix.mustChange + 1).setValue('FALSE');
  CacheService.getScriptCache().remove('fail_' + id); dropUserCache_(id);
  return { ok: true };
}

// ==========================================
// 6a. TOWERS + FLOORS (developer)
// ==========================================
function towerRows_() {
  const sh = getSpreadsheet().getSheetByName('Towers'), lr = sh.getLastRow();
  if (lr < 2) return [];
  return sh.getRange(2, 1, lr - 1, 6).getValues().filter(r => String(r[0]).trim()).map((r, i) => ({
    name: String(r[0]).trim().toUpperCase(), label: String(r[1] || '').trim(), floors: String(r[2] || '').trim(),
    color: /^#[0-9a-f]{6}$/i.test(String(r[3] || '').trim()) ? String(r[3]).trim() : '', active: String(r[4]).toUpperCase() !== 'FALSE',
    sort: Number(r[5]) || (i + 1) })).sort((a, b) => a.sort - b.sort);
}
/** Everybody who is signed in can read the towers (the Equipment form needs them). */
function listTowers(token) {
  if (!getUser(token)) return { ok: false, error: 'Unauthorized' };
  try {
    const ss = getSpreadsheet(), ed = ss.getSheetByName('Equipment').getDataRange().getValues(), ei = hdrIdx_(ed[0]), use = {};
    if (ei.tower !== undefined) ed.slice(1).forEach(r => { const t = String(r[ei.tower] || '').trim().toUpperCase(); if (t) use[t] = (use[t] || 0) + 1; });
    const items = towerRows_().map(t => { const f = expandFloors_(t.floors); return Object.assign(t, { floorList: f, floorCount: f.length, equipment: use[t.name] || 0 }); });
    return { ok: true, items: items };
  } catch (err) { return { ok: false, error: err.message }; }
}
/** Add a tower or change it. Same name = update. oldName lets you rename. */
function saveTower(token, p) {
  if (!superAdmin_(token)) return { ok: false, error: 'Admin only' };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    p = p || {};
    const name = cleanTower_(p.name);
    if (!name) return { ok: false, error: 'Tower code must be 1-2 letters or digits (A, B, C, 1...)' };
    const floors = expandFloors_(p.floors);
    if (!floors.length) return { ok: false, error: 'Add the floors of this tower (example: B1-B2, G, 1-25, Terrace)' };
    const label = String(p.label || '').trim().slice(0, 40), color = /^#[0-9a-f]{6}$/i.test(String(p.color || '')) ? String(p.color) : '';
    const sh = getSpreadsheet().getSheetByName('Towers'), d = sh.getDataRange().getValues();
    const old = String(p.oldName || p.name).trim().toUpperCase(), active = p.active === false ? 'FALSE' : 'TRUE';
    let row = -1, clash = -1;
    for (let i = 1; i < d.length; i++) { const n = String(d[i][0]).trim().toUpperCase(); if (n === old) row = i + 1; if (n === name) clash = i + 1; }
    if (clash > 0 && row > 0 && clash !== row) return { ok: false, error: 'A tower with the code ' + name + ' already exists' };
    if (row < 0 && clash > 0) row = clash;
    if (row > 0) {
      sh.getRange(row, 1, 1, 5).setValues([[name, label, p.floors && Array.isArray(p.floors) ? p.floors.join(', ') : String(p.floors), color, active]]);
      if (old !== name) renameTowerOnEquipment_(old, name);
      return { ok: true, updated: true, floors: floors.length };
    }
    sh.appendRow([name, label, String(p.floors), color, active, d.length]);
    return { ok: true, updated: false, floors: floors.length };
  } catch (err) { return { ok: false, error: err.message }; }
  finally { lock.releaseLock(); }
}
function renameTowerOnEquipment_(from, to) {
  const es = getSpreadsheet().getSheetByName('Equipment'), ed = es.getDataRange().getValues(), ei = hdrIdx_(ed[0]);
  if (ei.tower === undefined) return;
  for (let i = 1; i < ed.length; i++) if (String(ed[i][ei.tower]).trim().toUpperCase() === from) es.getRange(i + 1, ei.tower + 1).setValue(to);
}
function deleteTower(token, name) {
  if (!superAdmin_(token)) return { ok: false, error: 'Admin only' };
  try {
    const key = String(name || '').trim().toUpperCase(), ss = getSpreadsheet();
    const ed = ss.getSheetByName('Equipment').getDataRange().getValues(), ei = hdrIdx_(ed[0]);
    if (ei.tower !== undefined && ed.slice(1).some(r => String(r[ei.tower]).trim().toUpperCase() === key)) return { ok: false, error: 'Equipment is still linked to this tower. Move it first, or just switch the tower off.' };
    const sh = ss.getSheetByName('Towers'), d = sh.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) if (String(d[i][0]).trim().toUpperCase() === key) { sh.deleteRow(i + 1); return { ok: true }; }
    return { ok: false, error: 'Tower not found' };
  } catch (err) { return { ok: false, error: err.message }; }
}

// ==========================================
// 6c. APPEARANCE + LOGIN ANIMATION (developer, stored in Settings as ui_*)
// ==========================================
const UI_DEFAULTS = {
  appTitle: 'Crescent Patrol', tagline: 'Smart Patrol System', loginTitle: 'Sign in',
  loginSub: 'Select your name, then type your 4-digit PIN. You are signed in automatically.', welcomeMsg: 'Welcome back',
  accent: '#03694f', accent2: '#0a8f6a', gold: '#d6b46a', radius: '16', cardOpacity: '96', font: 'Outfit',
  anim: 'full', loginFx: 'aurora', pinStyle: 'dots', splash: 'TRUE', splashStyle: 'ring', density: 'comfy', sidebar: 'dark'
};
const UI_ENUMS = { font: ['Outfit', 'Poppins', 'Manrope', 'Sora', 'Space Grotesk'], anim: ['full', 'reduced', 'off'], loginFx: ['aurora', 'orbs', 'spotlight', 'off'],
  pinStyle: ['dots', 'plain'], splash: ['TRUE', 'FALSE'], splashStyle: ['ring', 'curtain', 'burst'], density: ['comfy', 'compact'], sidebar: ['dark', 'glass'] };
function getUi_() {
  const cache = CacheService.getScriptCache(), c = cache.get('ui_v1');
  if (c) { try { return JSON.parse(c); } catch (e) {} }
  const U = {}; Object.keys(UI_DEFAULTS).forEach(k => U[k] = UI_DEFAULTS[k]);
  try {
    const sh = getSpreadsheet().getSheetByName('Settings');
    if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => { const k = String(r[0]); if (k.indexOf('ui_') === 0 && (k.slice(3) in UI_DEFAULTS) && String(r[1]) !== '') U[k.slice(3)] = String(r[1]); });
  } catch (e) {}
  cache.put('ui_v1', JSON.stringify(U), 300);
  return U;
}
function hexOk_(v) { return /^#[0-9a-f]{6}$/i.test(String(v || '')); }
function uiCss_(u) {
  const c = (v, d) => hexOk_(v) ? v : d, r = Math.min(28, Math.max(6, Number(u.radius) || 16)), o = Math.min(100, Math.max(60, Number(u.cardOpacity) || 96)) / 100;
  return ':root{--g:' + c(u.accent, '#03694f') + ';--g2:' + c(u.accent2, '#0a8f6a') + ';--gold:' + c(u.gold, '#d6b46a') + ';--r:' + r + 'px;--card:rgba(255,255,255,' + o + ');--fh:\'' + (UI_ENUMS.font.indexOf(u.font) >= 0 ? u.font : 'Outfit') + '\',\'Outfit\',sans-serif}';
}
function uiFontLink_(u) {
  const f = UI_ENUMS.font.indexOf(u.font) >= 0 ? u.font : 'Outfit';
  return f === 'Outfit' ? '' : '<link href="https://fonts.googleapis.com/css2?family=' + encodeURIComponent(f).replace(/%20/g, '+') + ':wght@500;600;700&display=swap" rel="stylesheet">';
}
/** Public: the login screen needs it before anyone is signed in. No secrets in here. */
function getUiSettings() { try { return { ok: true, ui: getUi_(), defaults: UI_DEFAULTS }; } catch (e) { return { ok: false, error: e.message }; } }
function saveUiSettings(token, p) {
  if (!superAdmin_(token)) return { ok: false, error: 'Admin only' };
  try {
    p = p || {};
    const U = {}, txt = (k, max) => { U[k] = String(p[k] == null ? UI_DEFAULTS[k] : p[k]).replace(/[\r\n]+/g, ' ').trim().slice(0, max) || UI_DEFAULTS[k]; };
    txt('appTitle', 30); txt('tagline', 40); txt('loginTitle', 30); txt('loginSub', 140); txt('welcomeMsg', 30);
    ['accent', 'accent2', 'gold'].forEach(k => { U[k] = hexOk_(p[k]) ? String(p[k]).toLowerCase() : UI_DEFAULTS[k]; });
    const rad = Number(p.radius); U.radius = String(rad >= 6 && rad <= 28 ? Math.round(rad) : 16);
    const op = Number(p.cardOpacity); U.cardOpacity = String(op >= 60 && op <= 100 ? Math.round(op) : 96);
    Object.keys(UI_ENUMS).forEach(k => { const v = String(p[k] == null ? UI_DEFAULTS[k] : p[k]); U[k] = UI_ENUMS[k].indexOf(v) >= 0 ? v : UI_DEFAULTS[k]; });
    const sh = getSpreadsheet().getSheetByName('Settings');
    sh.getRange('B:B').setNumberFormat('@');
    const data = sh.getDataRange().getValues();
    Object.keys(U).forEach(k => {
      let row = -1; for (let i = 1; i < data.length; i++) if (data[i][0] === 'ui_' + k) { row = i + 1; break; }
      if (row < 0) { sh.appendRow(['ui_' + k, U[k]]); data.push(['ui_' + k, U[k]]); } else sh.getRange(row, 2).setValue(U[k]);
    });
    CacheService.getScriptCache().remove('ui_v1');
    return { ok: true, ui: U };
  } catch (err) { return { ok: false, error: err.message }; }
}
function resetUiSettings(token) {
  if (!superAdmin_(token)) return { ok: false, error: 'Admin only' };
  return saveUiSettings(token, UI_DEFAULTS);
}

// ==========================================
// 6b. DEPARTMENTS (developer / admin)
// ==========================================
function listDepartments(token) {
  if (!getUser(token)) return { ok: false, error: 'Unauthorized' };
  try { return { ok: true, items: deptRows_() }; } catch (err) { return { ok: false, error: err.message }; }
}
/** Add a department or change it (direct-scan switch / active). */
function saveDepartment(token, p) {
  if (!superAdmin_(token)) return { ok: false, error: 'Admin only' };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    p = p || {};
    const name = String(p.name || '').trim().replace(/\s+/g, ' ');
    if (!name) return { ok: false, error: 'Department name is required' };
    if (name.length > 40) return { ok: false, error: 'Keep the name under 40 characters' };
    const sh = getSpreadsheet().getSheetByName('Departments'), d = sh.getDataRange().getValues();
    const direct = p.directScan ? 'TRUE' : 'FALSE', active = p.active === false ? 'FALSE' : 'TRUE';
    for (let i = 1; i < d.length; i++) {
      if (String(d[i][0]).trim().toLowerCase() === name.toLowerCase()) { sh.getRange(i + 1, 2, 1, 2).setValues([[direct, active]]); audit_(getUser(token), 'dept.update', name, 'direct=' + direct + ' active=' + active); return { ok: true, updated: true }; }
    }
    sh.appendRow([name, direct, active]);
    audit_(getUser(token), 'dept.add', name, '');
    return { ok: true, updated: false };
  } catch (err) { return { ok: false, error: err.message }; }
  finally { lock.releaseLock(); }
}
function deleteDepartment(token, name) {
  if (!superAdmin_(token)) return { ok: false, error: 'Admin only' };
  try {
    const ss = getSpreadsheet(), key = String(name || '').trim().toLowerCase();
    const ed = ss.getSheetByName('Equipment').getDataRange().getValues(), ei = hdrIdx_(ed[0]);
    if (ei.department !== undefined && ed.slice(1).some(r => String(r[ei.department]).trim().toLowerCase() === key)) return { ok: false, error: 'Some equipment still uses this department. Move it first, or just switch the department off.' };
    const ud = ss.getSheetByName('Users').getDataRange().getValues(), ui = userIdx_(ud[0]);
    if (ud.slice(1).some(r => String(r[ui.department]).trim().toLowerCase() === key)) return { ok: false, error: 'Some users are in this department. Switch it off instead.' };
    const sh = ss.getSheetByName('Departments'), d = sh.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) if (String(d[i][0]).trim().toLowerCase() === key) { sh.deleteRow(i + 1); return { ok: true }; }
    return { ok: false, error: 'Department not found' };
  } catch (err) { return { ok: false, error: err.message }; }
}

// ==========================================
// 7. EDIT EQUIPMENT / CHECKPOINTS / CHECKLISTS (admin & manager)
// ==========================================
const DEFAULT_OPTS = [{ l: 'OK', bad: false }, { l: 'Not OK', bad: true }];
function normItem_(x) {
  if (typeof x === 'string') x = { t: x };
  const t = String((x && x.t) || '').trim(); if (!t) return null;
  let o = ((x && x.opts) || []).map(p => ({ l: String(p.l || '').trim(), bad: !!p.bad })).filter(p => p.l);
  if (o.length < 2) o = DEFAULT_OPTS.map(p => ({ l: p.l, bad: p.bad }));
  return { t: t, opts: o };
}
function cleanList_(a) { return (Array.isArray(a) ? a : []).map(normItem_).filter(Boolean); }
function parseList_(v) { try { return cleanList_(JSON.parse(v || '[]')); } catch (e) { return []; } }
function hdrIdx_(row) {
  const m = {}; row.forEach((k, i) => { m[String(k).trim()] = i; });
  const low = {}; row.forEach((k, i) => { low[String(k).trim().toLowerCase()] = i; });
  Object.keys(SCHEMAS).forEach(t => SCHEMAS[t].forEach(h => { if (m[h] === undefined && low[h.toLowerCase()] !== undefined) m[h] = low[h.toLowerCase()]; }));
  return m;
}
/** A user's login ID: the ID column, or the name when a row was typed in by hand without an ID. */
function uid_(r, ix) { return String(r[ix.email] == null ? '' : r[ix.email]).trim() || String(r[ix.name] == null ? '' : r[ix.name]).trim(); }
function isActive_(v) { return String(v).trim().toUpperCase() !== 'FALSE'; }
function adminOnly_(token) { const u = getUser(token); return isAdmin_(u) ? u : null; }
function findRow_(data, col, val) { for (let i = 1; i < data.length; i++) if (String(data[i][col]) === String(val)) return i; return -1; }
function setCells_(sh, row, idx, obj) {
  Object.keys(obj).forEach(k => { if (idx[k] !== undefined) sh.getRange(row + 1, idx[k] + 1).setValue(obj[k]); });
}
function cpId_(eqId, floor) { return eqId + '-' + String(floor).trim().replace(/\s+/g, '_'); }
function syncFloors_(ss, eqId) {      // equipment.floors = floors of its checkpoints
  const cp = ss.getSheetByName('Checkpoints').getDataRange().getValues(), ci = hdrIdx_(cp[0]);
  const floors = [];
  for (let i = 1; i < cp.length; i++) if (cp[i][ci.equipmentId] === eqId) floors.push(String(cp[i][ci.floor]));
  const es = ss.getSheetByName('Equipment'), ed = es.getDataRange().getValues(), ei = hdrIdx_(ed[0]);
  const r = findRow_(ed, ei.id, eqId);
  if (r > 0) es.getRange(r + 1, ei.floors + 1).setValue(floors.join(','));
}

function updateEquipment_core(token, id, p) {
  if (!adminOnly_(token)) return { ok: false, error: 'Admin only' };
  try {
    const ss = getSpreadsheet();
    const es = ss.getSheetByName('Equipment'), ed = es.getDataRange().getValues(), ei = hdrIdx_(ed[0]);
    const r = findRow_(ed, ei.id, id);
    if (r < 0) return { ok: false, error: 'Equipment not found' };
    if (!p.name || !String(p.name).trim()) return { ok: false, error: 'Name is required' };
    const photo = p.photoRequired ? 'TRUE' : 'FALSE';
    const dept = p.department === undefined ? null : cleanDept_(p.department);
    const extra = {};
    if (p.tower !== undefined) extra.tower = cleanTower_(p.tower);
    if (p.posterModel !== undefined) extra.posterModel = cleanModel_(p.posterModel);
    setCells_(es, r, ei, Object.assign({ name: String(p.name).trim(), category: p.category || '', photoRequired: photo }, dept === null ? {} : { department: dept }, extra));
    // propagate to this equipment's checkpoints
    const cs = ss.getSheetByName('Checkpoints'), cd = cs.getDataRange().getValues(), ci = hdrIdx_(cd[0]);
    for (let i = 1; i < cd.length; i++) if (cd[i][ci.equipmentId] === id) setCells_(cs, i, ci, Object.assign({ equipmentName: String(p.name).trim(), photoRequired: photo }, dept === null ? {} : { department: dept }));
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}

/** Admin clicked a poster model (1, 2 or 5) in the QR Codes tab: remember it for this equipment. Optional tower letter. */
function setPosterModel(token, equipmentId, model, tower) {
  if (!adminOnly_(token)) return { ok: false, error: 'Admin only' };
  try {
    const m = cleanModel_(model);
    if (!m) return { ok: false, error: 'Poster model must be 1, 2 or 5' };
    const es = getSpreadsheet().getSheetByName('Equipment'), ed = es.getDataRange().getValues(), ei = hdrIdx_(ed[0]);
    const r = findRow_(ed, ei.id, equipmentId);
    if (r < 0) return { ok: false, error: 'Equipment not found' };
    const obj = { posterModel: m };
    if (tower !== undefined && tower !== null) obj.tower = cleanTower_(tower);
    setCells_(es, r, ei, obj);
    return { ok: true, posterModel: m };
  } catch (err) { return { ok: false, error: err.message }; }
}

function addCheckpoint(token, p) {
  if (!adminOnly_(token)) return { ok: false, error: 'Admin only' };
  try {
    const ss = getSpreadsheet();
    const ed = ss.getSheetByName('Equipment').getDataRange().getValues(), ei = hdrIdx_(ed[0]);
    const er = findRow_(ed, ei.id, p.equipmentId);
    if (er < 0) return { ok: false, error: 'Equipment not found' };
    const floor = String(p.floor || '').trim();
    if (!floor) return { ok: false, error: 'Floor / location is required' };
    const id = cpId_(p.equipmentId, floor);
    const cs = ss.getSheetByName('Checkpoints'), cd = cs.getDataRange().getValues(), ci = hdrIdx_(cd[0]);
    if (findRow_(cd, ci.id, id) > 0) return { ok: false, error: 'A checkpoint for that floor already exists' };
    const name = ed[er][ei.name];
    cs.appendRow([id, p.equipmentId, name, floor, p.task || ('Inspect ' + name), p.photoRequired ? 'TRUE' : 'FALSE',
                  getWebAppUrl() + '?cp=' + encodeURIComponent(id), JSON.stringify(cleanList_(p.checklist)), ei.department !== undefined ? String(ed[er][ei.department] || '') : '']);
    syncFloors_(ss, p.equipmentId);
    return { ok: true, id: id };
  } catch (err) { return { ok: false, error: err.message }; }
}

function updateCheckpoint(token, id, p) {
  if (!adminOnly_(token)) return { ok: false, error: 'Admin only' };
  try {
    const ss = getSpreadsheet();
    const cs = ss.getSheetByName('Checkpoints'), cd = cs.getDataRange().getValues(), ci = hdrIdx_(cd[0]);
    const r = findRow_(cd, ci.id, id);
    if (r < 0) return { ok: false, error: 'Checkpoint not found' };
    const floor = String(p.floor || '').trim();
    if (!floor) return { ok: false, error: 'Floor / location is required' };
    // the id (and printed QR) never changes, only the label
    setCells_(cs, r, ci, { floor: floor, task: p.task || '', photoRequired: p.photoRequired ? 'TRUE' : 'FALSE', checklist: JSON.stringify(cleanList_(p.checklist)) });
    syncFloors_(ss, cd[r][ci.equipmentId]);
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}

function deleteCheckpoint_core(token, id) {
  if (!adminOnly_(token)) return { ok: false, error: 'Admin only' };
  try {
    const ss = getSpreadsheet();
    const cs = ss.getSheetByName('Checkpoints'), cd = cs.getDataRange().getValues(), ci = hdrIdx_(cd[0]);
    const r = findRow_(cd, ci.id, id);
    if (r < 0) return { ok: false, error: 'Checkpoint not found' };
    const eqId = cd[r][ci.equipmentId];
    cs.deleteRow(r + 1);
    syncFloors_(ss, eqId);
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}

// ==========================================
// 9. PDF REPORT: PHOTO FETCH (admin / manager)
// ==========================================
function photoIdSet_() {
  const sh = getSpreadsheet().getSheetByName('ScanLog'), lr = sh.getLastRow(), set = {};
  if (lr < 2) return set;
  const col = hdrIdx_(sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]).photoUrl;
  if (col === undefined) return set;
  sh.getRange(2, col + 1, lr - 1, 1).getValues().forEach(r => {
    const m = String(r[0] || '').match(/[-\w]{25,}/);
    if (m) set[m[0]] = true;
  });
  return set;
}
/** Returns {fileId: dataUrl} for up to 8 patrol photos. Only files that are logged in ScanLog can be read. */
function getPhotoData(token, ids) {
  if (!adminOnly_(token)) return { ok: false, error: 'Admin only' };
  try {
    const allowed = photoIdSet_(), photos = {};
    (ids || []).slice(0, 8).forEach(id => {
      if (!allowed[id]) return;
      try {
        const blob = DriveApp.getFileById(id).getBlob(), bytes = blob.getBytes();
        if (bytes.length > 3 * 1024 * 1024) return;
        photos[id] = 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(bytes);
      } catch (e) { /* file removed or no access: the PDF links it instead */ }
    });
    return { ok: true, photos: photos };
  } catch (err) { return { ok: false, error: err.message }; }
}

// ==========================================
// 10. SETTINGS (Settings sheet, cached 5 min)
// ==========================================
const SETTING_DEFAULTS = { roundTimes: '', windowMinutes: '60', dupMode: 'warn', dupMinutes: '10', reportEnabled: 'FALSE', reportHour: '18', reportEmails: '' };

function getSettings_() {
  const cache = CacheService.getScriptCache(), c = cache.get('settings_v1');
  if (c) { try { return JSON.parse(c); } catch (e) {} }
  const S = {}; Object.keys(SETTING_DEFAULTS).forEach(k => S[k] = SETTING_DEFAULTS[k]);
  try {
    const sh = getSpreadsheet().getSheetByName('Settings');
    if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => { if (r[0] in SETTING_DEFAULTS) S[r[0]] = String(r[1] == null ? '' : r[1]); });
  } catch (e) {}
  cache.put('settings_v1', JSON.stringify(S), 300);
  return S;
}

/** "8:00, 12:00 16:30" -> ['08:00','12:00','16:30'] */
function parseTimes_(str) {
  const out = {};
  String(str || '').split(/[,;\s]+/).forEach(t => {
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (m && +m[1] < 24 && +m[2] < 60) out[('0' + m[1]).slice(-2) + ':' + m[2]] = 1;
  });
  return Object.keys(out).sort();
}

function getSettings(token) {
  if (!adminOnly_(token)) return { ok: false, error: 'Admin only' };
  return { ok: true, settings: getSettings_() };
}

function saveSettings_core(token, p) {
  if (!adminOnly_(token)) return { ok: false, error: 'Admin only' };
  try {
    p = p || {};
    const times = parseTimes_(p.roundTimes);
    if (String(p.roundTimes || '').trim() && !times.length) return { ok: false, error: 'Round times must look like 08:00, 12:00, 16:00 (24-hour)' };
    const win = Number(p.windowMinutes);
    if (!(win >= 5 && win <= 720)) return { ok: false, error: 'Time allowed per round must be 5 to 720 minutes' };
    const dmin = Number(p.dupMinutes);
    if (!(dmin >= 1 && dmin <= 240)) return { ok: false, error: 'Duplicate window must be 1 to 240 minutes' };
    const hour = Number(p.reportHour);
    if (!(hour >= 0 && hour <= 23)) return { ok: false, error: 'Report hour must be 0 to 23' };
    const emails = String(p.reportEmails || '').split(/[,;\s]+/).filter(Boolean);
    if (emails.some(e => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) return { ok: false, error: 'One of the report emails is not valid' };
    if (p.reportEnabled && !emails.length) return { ok: false, error: 'Add at least one email for the daily report' };
    const S = {
      roundTimes: times.join(','), windowMinutes: String(win),
      dupMode: ['off', 'warn', 'block'].indexOf(p.dupMode) >= 0 ? p.dupMode : 'warn', dupMinutes: String(dmin),
      reportEnabled: p.reportEnabled ? 'TRUE' : 'FALSE', reportHour: String(hour), reportEmails: emails.join(',')
    };
    const sh = getSpreadsheet().getSheetByName('Settings');
    sh.getRange('B:B').setNumberFormat('@');
    const data = sh.getDataRange().getValues();
    Object.keys(S).forEach(k => {
      let row = -1;
      for (let i = 1; i < data.length; i++) if (data[i][0] === k) { row = i + 1; break; }
      if (row < 0) sh.appendRow([k, S[k]]); else sh.getRange(row, 2).setValue(S[k]);
    });
    CacheService.getScriptCache().remove('settings_v1');
    audit_(getUser(token), 'settings.save', 'rounds/report settings', '');
    let warn = '';
    try { applyReportTrigger_(S); } catch (e) { warn = 'Saved, but the daily schedule could not be set (' + e.message + '). Run authorizeAll once from the script editor.'; }
    return { ok: true, settings: S, warn: warn };
  } catch (err) { return { ok: false, error: err.message }; }
}

function applyReportTrigger_(S) {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'sendDailyReport').forEach(t => ScriptApp.deleteTrigger(t));
  if (S.reportEnabled === 'TRUE') ScriptApp.newTrigger('sendDailyReport').timeBased().everyDays(1).atHour(Number(S.reportHour)).create();
}

/** Run ONCE from the script editor: asks for every permission the app needs (Sheets, Drive, Mail, Triggers). */
function authorizeAll() {
  MailApp.getRemainingDailyQuota();
  ScriptApp.getProjectTriggers();
  DriveApp.getRootFolder();
  CacheService.getScriptCache().get('x');
  LockService.getScriptLock();
  openSpreadsheet_();
  return 'Authorized.';
}

// ==========================================
// 11. TIMED ROUNDS (technician view + admin compliance)
// ==========================================
function dayKey_(ms, tz) { return Utilities.formatDate(new Date(ms), tz, 'yyyy-MM-dd'); }
function slotMs_(key, hhmm, tz) { return Utilities.parseDate(key + ' ' + hhmm, tz, 'yyyy-MM-dd HH:mm').getTime(); }
function dayEndMs_(key, tz) { return Utilities.parseDate(key + ' 23:59:59', tz, 'yyyy-MM-dd HH:mm:ss').getTime() + 1000; }
/** A round runs from its start time until the next round starts (last one until midnight). */
function roundWindows_(key, slots, tz) {
  return slots.map((s, i) => ({ label: s, start: slotMs_(key, s, tz), end: i + 1 < slots.length ? slotMs_(key, slots[i + 1], tz) : dayEndMs_(key, tz) }));
}

function getMyRounds(token) {
  const user = getUser(token);
  if (!user) return { ok: false, error: 'Unauthorized' };
  try {
    const ss = getSpreadsheet(), tz = Session.getScriptTimeZone(), S = getSettings_(), slots = parseTimes_(S.roundTimes);
    const now = Date.now(), key = dayKey_(now, tz), me = String(user.email).toLowerCase();
    const cd = ss.getSheetByName('Checkpoints').getDataRange().getValues(), ci = hdrIdx_(cd[0]), cps = [];
    const scope = userScope_(user), eqD = scope ? eqDeptMap_() : {};
    for (let i = 1; i < cd.length; i++) {
      if (!cd[i][ci.id]) continue;
      if (scope && !inScope_(scope, (ci.department !== undefined ? String(cd[i][ci.department] || '').trim() : '') || eqD[cd[i][ci.equipmentId]] || '')) continue;
      cps.push({ id: cd[i][ci.id], equipmentName: cd[i][ci.equipmentName], floor: String(cd[i][ci.floor]), task: cd[i][ci.task] || '' });
    }
    const scans = recentScans_(1500).filter(x => dayKey_(x.t, tz) === key);
    const counts = x => PENDING_SCOPE === 'team' || x.email === me;
    const recent = scans.filter(x => x.email === me).reverse().slice(0, 8)
      .map(x => ({ timestamp: new Date(x.t).toISOString(), equipmentName: x.equipmentName, floor: x.floor, status: x.status }));

    let mode = 'daily', round = null, next = null, winStart = slotMs_(key, '00:00', tz), winEnd = now + 1;
    const missed = [];
    if (slots.length) {
      const W = roundWindows_(key, slots, tz); let cur = -1;
      W.forEach((w, i) => { if (w.start <= now) cur = i; });
      if (cur < 0) { mode = 'before'; next = slots[0]; winStart = winEnd = 0; }
      else {
        mode = 'timed';
        const w = W[cur], dl = Math.min(w.start + Number(S.windowMinutes) * 60000, w.end);
        round = { label: w.label, deadline: Utilities.formatDate(new Date(dl), tz, 'HH:mm'), overdue: now > dl };
        next = cur + 1 < W.length ? slots[cur + 1] : null;
        winStart = w.start; winEnd = w.end;
        for (let j = 0; j < cur; j++) {
          const cov = {};
          scans.forEach(x => { if (counts(x) && x.t >= W[j].start && x.t < W[j].end) cov[x.cp] = 1; });
          const miss = cps.filter(c => !cov[c.id]).length;
          if (miss) missed.push({ label: W[j].label, count: miss });
        }
      }
    }
    const covered = {};
    if (mode !== 'before') scans.forEach(x => { if (counts(x) && x.t >= winStart && x.t < winEnd) covered[x.cp] = 1; });
    const overdue = !!(round && round.overdue);
    const pending = mode === 'before' ? [] : cps.filter(c => !covered[c.id]).map(c => { c.overdue = overdue; return c; })
      .sort((a, b) => String(a.equipmentName).localeCompare(String(b.equipmentName)) || a.floor.localeCompare(b.floor, undefined, { numeric: true }));
    return { ok: true, mode: mode, total: cps.length, done: mode === 'before' ? 0 : cps.length - pending.length,
             pending: pending, round: round, next: next, missed: missed, recent: recent };
  } catch (err) { return { ok: false, error: err.message }; }
}

/** Admin overview: today's rounds + last 7 days compliance per round time. */
function roundStats_(items, cpIds, S, tz) {
  const slots = parseTimes_(S.roundTimes);
  if (!slots.length) return { enabled: false };
  const now = Date.now(), total = Object.keys(cpIds).length, since = now - 8 * 86400000, ev = [];
  items.forEach(it => { const t = new Date(it.timestamp).getTime(); if (t >= since && cpIds[it.checkpointId]) ev.push({ t: t, cp: it.checkpointId }); });
  const stat = {}; slots.forEach(s => stat[s] = { expected: 0, full: 0, partial: 0, none: 0, sum: 0 });
  const today = [];
  for (let d = 0; d < 7; d++) {
    const key = dayKey_(now - d * 86400000, tz);
    roundWindows_(key, slots, tz).forEach(w => {
      if (w.start > now) { if (d === 0) today.push({ label: w.label, status: 'upcoming', done: 0, total: total }); return; }
      const cov = {}; ev.forEach(e => { if (e.t >= w.start && e.t < w.end) cov[e.cp] = 1; });
      const n = Object.keys(cov).length, ended = now >= w.end;
      if (d === 0) today.push({ label: w.label, status: ended ? (n >= total ? 'done' : 'missed') : 'current', done: n, total: total });
      if (ended && total) { const x = stat[w.label]; x.expected++; x.sum += n / total; if (n >= total) x.full++; else if (n > 0) x.partial++; else x.none++; }
    });
  }
  return { enabled: true, today: today, slots: slots.map(s => ({ label: s, expected: stat[s].expected, full: stat[s].full, partial: stat[s].partial, none: stat[s].none, avg: stat[s].expected ? Math.round(stat[s].sum / stat[s].expected * 100) : null })) };
}

function extraStats_(ss, items, filters, tz) {
  if (!filters || !filters.rounds) return {};
  const ids = {}, cs = ss.getSheetByName('Checkpoints');
  if (cs.getLastRow() > 1) cs.getRange(2, 1, cs.getLastRow() - 1, 1).getValues().forEach(r => { if (r[0]) ids[r[0]] = 1; });
  return { rounds: roundStats_(items, ids, getSettings_(), tz), openIssues: countOpenIssues_() };
}

// ==========================================
// 12. ISSUE FOLLOW-UP (Issues sheet)
// ==========================================
function logIssue_(ss, user, found, summary, photoUrl, when) {
  const sh = ss.getSheetByName('Issues'), d = sh.getDataRange().getValues(), ix = hdrIdx_(d[0]);
  for (let i = 1; i < d.length; i++) {      // already an unresolved issue for this checkpoint? just count the repeat
    if (d[i][ix.checkpointId] === found[0] && String(d[i][ix.status]) !== 'RESOLVED') {
      sh.getRange(i + 1, ix.seenCount + 1).setValue((Number(d[i][ix.seenCount]) || 1) + 1);
      sh.getRange(i + 1, ix.lastSeen + 1).setValue(when || new Date());
      return;
    }
  }
  sh.appendRow(['ISS-' + Utilities.getUuid().slice(0, 6).toUpperCase(), when || new Date(), found[0], found[2], found[3], user.email, user.name,
    summary, photoUrl || '', 'OPEN', '', '', '', '', '', '', '', 1, when || new Date()]);
}

function countOpenIssues_() {
  try {
    const sh = getSpreadsheet().getSheetByName('Issues'), lr = sh.getLastRow();
    if (lr < 2) return 0;
    const col = hdrIdx_(sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]).status;
    return sh.getRange(2, col + 1, lr - 1, 1).getValues().filter(r => r[0] && String(r[0]) !== 'RESOLVED').length;
  } catch (e) { return 0; }
}

function iso_(v) { return v instanceof Date ? v.toISOString() : (v || ''); }

/** admin: all (filter status: ACTIVE | OPEN | IN_PROGRESS | RESOLVED | ''), technician: only issues assigned to them. */
function listIssues(token, f) {
  const u = getUser(token);
  if (!u) return { ok: false, error: 'Unauthorized' };
  try {
    f = f || {};
    const d = getSpreadsheet().getSheetByName('Issues').getDataRange().getValues();
    if (d.length < 2) return { ok: true, items: [] };
    const ix = hdrIdx_(d[0]), sup = isSup_(u), admin = isAdmin_(u) || sup, me = String(u.email).toLowerCase();
    let items = d.slice(1).filter(r => r[ix.id]).map(r => ({
      id: r[ix.id], createdAt: iso_(r[ix.createdAt]), checkpointId: r[ix.checkpointId], equipmentName: r[ix.equipmentName], floor: String(r[ix.floor]),
      reportedByName: r[ix.reportedByName], summary: r[ix.summary], beforePhotoUrl: r[ix.beforePhotoUrl], status: String(r[ix.status] || 'OPEN'),
      assignedTo: r[ix.assignedTo], assignedName: r[ix.assignedName], resolvedAt: iso_(r[ix.resolvedAt]), resolvedByName: r[ix.resolvedByName],
      afterPhotoUrl: r[ix.afterPhotoUrl], resolution: r[ix.resolution], seenCount: Number(r[ix.seenCount]) || 1
    }));
    if (sup) { const sc = userScope_(u), cm = cpDeptMap_(); items = items.filter(i => inScope_(sc, cm[i.checkpointId])); }
    if (!admin) items = items.filter(i => String(i.assignedTo).toLowerCase() === me && i.status !== 'RESOLVED');
    else if (f.status === 'ACTIVE') items = items.filter(i => i.status !== 'RESOLVED');
    else if (f.status) items = items.filter(i => i.status === f.status);
    items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return { ok: true, items: items.slice(0, 500) };
  } catch (err) { return { ok: false, error: err.message }; }
}

function issueRow_(id) {
  const sh = getSpreadsheet().getSheetByName('Issues'), d = sh.getDataRange().getValues(), ix = hdrIdx_(d[0]);
  for (let i = 1; i < d.length; i++) if (String(d[i][ix.id]) === String(id)) return { sh: sh, row: i + 1, ix: ix, data: d[i] };
  return null;
}
function setIssue_(r, obj) { Object.keys(obj).forEach(k => { if (r.ix[k] !== undefined) r.sh.getRange(r.row, r.ix[k] + 1).setValue(obj[k]); }); }

function assignIssue_core(token, id, email) {
  if (!supOrAdmin_(token)) return { ok: false, error: 'Supervisor or admin only' };
  try {
    const r = issueRow_(id); if (!r) return { ok: false, error: 'Issue not found' };
    if (!email) { setIssue_(r, { assignedTo: '', assignedName: '', status: 'OPEN' }); return { ok: true }; }
    const ud = getSpreadsheet().getSheetByName('Users').getDataRange().getValues(), ui = userIdx_(ud[0]);
    for (let i = 1; i < ud.length; i++) {
      if (uid_(ud[i], ui).toLowerCase() === String(email).toLowerCase() && isActive_(ud[i][ui.active])) {
        setIssue_(r, { assignedTo: ud[i][ui.email], assignedName: ud[i][ui.name], status: 'IN_PROGRESS' });
        return { ok: true };
      }
    }
    return { ok: false, error: 'User not found or disabled' };
  } catch (err) { return { ok: false, error: err.message }; }
}

/** Assigned technician (or an admin) closes the issue. "After" photo is mandatory except for admins. */
function resolveIssue_core(token, id, p) {
  const u = getUser(token);
  if (!u) return { ok: false, error: 'Unauthorized' };
  try {
    p = p || {};
    const r = issueRow_(id); if (!r) return { ok: false, error: 'Issue not found' };
    const admin = isAdmin_(u);
    if (!admin && String(r.data[r.ix.assignedTo]).toLowerCase() !== String(u.email).toLowerCase()) return { ok: false, error: 'This issue is not assigned to you' };
    if (String(r.data[r.ix.status]) === 'RESOLVED') return { ok: false, error: 'Already resolved' };
    let after = '';
    if (p.photoData) { try { after = savePhoto_(p.photoData, 'fix_' + id); } catch (e) { return { ok: false, error: 'Photo upload failed: ' + e.message }; } }
    if (!after && !admin) return { ok: false, error: 'An "after" photo is required' };
    setIssue_(r, { status: 'RESOLVED', resolvedAt: new Date(), resolvedBy: u.email, resolvedByName: u.name, afterPhotoUrl: after, resolution: String(p.note || '').slice(0, 500) });
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}

function reopenIssue(token, id) {
  if (!adminOnly_(token)) return { ok: false, error: 'Admin only' };
  try {
    const r = issueRow_(id); if (!r) return { ok: false, error: 'Issue not found' };
    const assigned = !!r.data[r.ix.assignedTo];
    setIssue_(r, { status: assigned ? 'IN_PROGRESS' : 'OPEN', resolvedAt: '', resolvedBy: '', resolvedByName: '', afterPhotoUrl: '', resolution: '' });
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}

// ==========================================
// 13. DAILY EMAIL REPORT (PDF, saved to Drive/Reports + emailed)
// ==========================================
function h_(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function sendDailyReport() { return buildAndSendReport_(); }                    // time-driven trigger
function sendReportNow(token) {                                                  // "Send test report" button
  if (!adminOnly_(token)) return { ok: false, error: 'Admin only' };
  return buildAndSendReport_();
}

function buildAndSendReport_() {
  try {
    const ss = getSpreadsheet(), tz = Session.getScriptTimeZone(), S = getSettings_();
    const to = String(S.reportEmails || '').split(',').filter(Boolean);
    if (!to.length) return { ok: false, error: 'Add at least one recipient email first' };
    const now = Date.now(), from = now - 86400000, fmt = (t, f) => Utilities.formatDate(new Date(t), tz, f);

    // last 24h of scans (newest first)
    const sh = ss.getSheetByName('ScanLog'), lr = sh.getLastRow(), lc = sh.getLastColumn(), rows = [];
    if (lr > 1) {
      const si = hdrIdx_(sh.getRange(1, 1, 1, lc).getValues()[0]), start = Math.max(2, lr - 2999);
      sh.getRange(start, 1, lr - start + 1, lc).getValues().forEach(r => {
        const t = (r[si.timestamp] instanceof Date ? r[si.timestamp] : new Date(r[si.timestamp])).getTime();
        if (isNaN(t) || t < from) return;
        rows.push({ t: t, userName: r[si.userName], cp: r[si.checkpointId], equipmentName: r[si.equipmentName], floor: String(r[si.floor]), status: String(r[si.status]).toUpperCase(), notes: r[si.notes], photoUrl: r[si.photoUrl], checklist: r[si.checklist] });
      });
      rows.sort((a, b) => b.t - a.t);
    }
    const nIssue = rows.filter(r => r.status === 'ISSUE').length, nOk = rows.length - nIssue, guards = {};
    rows.forEach(r => guards[r.userName] = 1);

    const ids = {}, cs = ss.getSheetByName('Checkpoints');
    if (cs.getLastRow() > 1) cs.getRange(2, 1, cs.getLastRow() - 1, 1).getValues().forEach(r => { if (r[0]) ids[r[0]] = 1; });
    const R = roundStats_(rows.map(r => ({ timestamp: r.t, checkpointId: r.cp })), ids, S, tz);
    const iss = (listIssuesInternal_() || []).filter(i => i.status !== 'RESOLVED'), ppmHtml = ppmReportHtml_();

    const roundsHtml = R.enabled ? '<p style="margin:10px 0 4px"><b>Rounds today</b></p><p style="margin:0 0 10px">' + R.today.map(t =>
      '<span style="display:inline-block;margin:0 6px 4px 0;padding:3px 9px;border-radius:9px;background:' + (t.status === 'done' ? '#d9f7e8' : t.status === 'missed' ? '#fde4e4' : '#fff1d6') + '">' + h_(t.label) + ' ' + (t.status === 'upcoming' ? 'upcoming' : t.status === 'done' ? 'complete' : (t.status === 'missed' ? 'missed ' : 'in progress ') + t.done + '/' + t.total) + '</span>').join('') + '</p>' : '';
    const issuesHtml = iss.length ? '<p style="margin:10px 0 4px"><b>Open issues (' + iss.length + ')</b></p><ul style="margin:0 0 10px;padding-left:18px">' + iss.slice(0, 15).map(i =>
      '<li>' + h_(i.equipmentName) + ' · ' + h_(i.floor) + ' — ' + h_(i.summary) + ' <i>(' + (i.assignedName ? 'assigned to ' + h_(i.assignedName) : 'unassigned') + ')</i></li>').join('') + '</ul>' : '<p style="margin:10px 0">No open issues.</p>';
    const kpi = (n, l, c) => '<td align="center" style="padding:10px;border:1px solid #dde7e2"><div style="font-size:20px;font-weight:bold;color:' + c + '">' + n + '</div><div style="font-size:10px;color:#5d6f69">' + l + '</div></td>';
    const kpiHtml = '<table width="100%" cellspacing="0" style="margin:10px 0"><tr>' + kpi(rows.length, 'Total scans', '#03694f') + kpi(nOk, 'OK', '#0a8f6a') + kpi(nIssue, 'Issues', '#e5484d') + kpi(Object.keys(guards).length, 'Guards', '#2563eb') + kpi(rows.filter(r => r.photoUrl).length, 'With photo', '#7c3aed') + '</tr></table>';
    const period = fmt(from, 'dd MMM HH:mm') + ' to ' + fmt(now, 'dd MMM yyyy HH:mm');

    const cards = withPhotos => { let used = 0; return rows.map(r => {
      let img = '';
      if (withPhotos && r.photoUrl && used < 30) {
        const m = String(r.photoUrl).match(/[-\w]{25,}/);
        if (m) { try { const b = DriveApp.getFileById(m[0]).getBlob(), by = b.getBytes(); if (by.length < 3 * 1024 * 1024) { img = '<img src="data:' + (b.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(by) + '" width="150">'; used++; } } catch (e) {} }
      }
      let ck = ''; try { ck = JSON.parse(r.checklist || '[]').map(c => '<div style="color:' + (c.bad ? '#b42318' : '#0b1f1a') + '">' + (c.bad ? '✗ ' : '✓ ') + h_(c.t) + ': ' + h_(c.a) + '</div>').join(''); } catch (e) {}
      const bad = r.status === 'ISSUE';
      return '<table width="100%" cellspacing="0" cellpadding="6" style="border:1px solid #dde7e2;margin-bottom:6px;page-break-inside:avoid"><tr>' +
        (img ? '<td width="160" valign="top">' + img + '</td>' : '') +
        '<td valign="top"><b style="font-size:12px">' + h_(r.equipmentName) + ' · ' + h_(r.floor) + '</b> <span style="background:' + (bad ? '#fde4e4;color:#b42318' : '#d9f7e8;color:#04753f') + ';padding:1px 7px;font-size:9px"><b>' + (bad ? 'ISSUE' : 'OK') + '</b></span><br>' +
        '<span style="color:#5d6f69">' + fmt(r.t, 'dd MMM yyyy HH:mm') + ' | ' + h_(r.userName) + '</span>' +
        (r.notes && r.notes !== 'App scan' ? '<br>' + h_(r.notes) : '') + (ck ? '<div style="margin-top:3px;font-size:10px">' + ck + '</div>' : '') +
        (r.photoUrl && !img ? '<br><a href="' + h_(r.photoUrl) + '">View photo</a>' : '') + '</td></tr></table>';
    }).join(''); };

    const doc = withPhotos => '<html><body style="font-family:Arial,Helvetica,sans-serif;color:#0b1f1a;font-size:11px">' +
      '<table width="100%" cellspacing="0" cellpadding="12" style="background:#03694f;color:#fff"><tr><td><b style="font-size:18px">Crescent Patrol · CBRE</b><br>Patrol report</td><td align="right">' + period + '</td></tr></table>' +
      kpiHtml + roundsHtml + ppmHtml + issuesHtml + '<p style="margin:14px 0 6px;font-size:13px"><b>Scan details (' + rows.length + ')</b></p>' + (cards(withPhotos) || '<p>No scans in this period.</p>') + '</body></html>';

    const name = 'Patrol_Report_' + fmt(now, 'yyyy-MM-dd_HHmm');
    let pdf = null, note = '';
    try { pdf = HtmlService.createHtmlOutput(doc(true)).getBlob().getAs('application/pdf').setName(name + '.pdf'); }
    catch (e1) { try { pdf = HtmlService.createHtmlOutput(doc(false)).getBlob().getAs('application/pdf').setName(name + '.pdf'); note = ' (photos left out: report was too large)'; } catch (e2) { note = ' (PDF could not be created: ' + e2.message + ')'; } }
    let link = '';
    if (pdf) { try { link = childFolder_(getMasterFolder_(), 'Reports').createFile(pdf).getUrl(); } catch (e) {} }

    const body = '<div style="font-family:Arial,sans-serif;font-size:13px;color:#0b1f1a"><h2 style="color:#03694f;margin:0 0 4px">Crescent Patrol · CBRE</h2><div style="color:#5d6f69">' + period + '</div>' +
      kpiHtml + roundsHtml + ppmHtml + issuesHtml + (link ? '<p><a href="' + link + '">Open the full PDF in Drive</a></p>' : '') + (note ? '<p style="color:#9a6200">' + h_(note) + '</p>' : '') + '</div>';
    const attach = pdf && pdf.getBytes().length < 20 * 1024 * 1024 ? [pdf] : [];
    MailApp.sendEmail({ to: to.join(','), subject: 'Patrol report · ' + fmt(now, 'dd MMM yyyy') + ' · ' + rows.length + ' scans, ' + nIssue + ' issues', htmlBody: body, attachments: attach, name: 'Crescent Patrol' });
    return { ok: true, sent: to.length, scans: rows.length, message: 'Report sent to ' + to.join(', ') + (attach.length ? '' : ' (without attachment)') + note };
  } catch (err) { return { ok: false, error: err.message }; }
}

function listIssuesInternal_() {
  try {
    const d = getSpreadsheet().getSheetByName('Issues').getDataRange().getValues();
    if (d.length < 2) return [];
    const ix = hdrIdx_(d[0]);
    return d.slice(1).filter(r => r[ix.id]).map(r => ({ equipmentName: r[ix.equipmentName], floor: String(r[ix.floor]), summary: r[ix.summary], status: String(r[ix.status] || 'OPEN'), assignedName: r[ix.assignedName] }));
  } catch (e) { return []; }
}


// ==========================================
// DIAGNOSTIC (run from the editor: checkLogin) - shows exactly what the login screen will see
// ==========================================
function checkLogin() {
  const ss = openSpreadsheet_(), sh = ss.getSheetByName('Users');
  const out = ['Spreadsheet the app uses: ' + ss.getUrl()];
  if (!sh) { out.push('There is NO tab called "Users" in this spreadsheet.'); Logger.log(out.join('\n')); return out.join('\n'); }
  const d = sh.getDataRange().getValues(), hdr = d[0] || [], ix = userIdx_(hdr), st = userIdxStrict_(hdr);
  out.push('Headers in row 1: ' + hdr.join(' | '));
  ['email', 'name', 'role', 'department', 'active', 'pin'].forEach(k => out.push('  ' + k + ' -> ' + (st[k] !== undefined ? 'column ' + (st[k] + 1) + ' ("' + hdr[st[k]] + '")' : 'NOT FOUND (using column ' + (ix[k] + 1) + ')')));
  const r = listLoginUsers();
  out.push(r.ok ? 'Users shown in the login list (' + r.staff.length + '): ' + r.staff.map(x => x.name + ' [pin ' + x.pinLen + ' digits]').join(', ') : 'ERROR: ' + r.error);
  const a = getAssets();
  out.push('Logo/background: ' + (a.ok ? 'OK (' + a.logo.length + ' / ' + a.bg.length + ' chars)' : 'FAILED - ' + a.error));
  Logger.log(out.join('\n'));
  return out.join('\n');
}

// ==========================================================
// 14. MULTI-DEPARTMENT USERS + SUPERVISOR ROLE
//     users.depts = comma list of departments the user can see. EMPTY = all departments.
//     admin / manager always see everything.
// ==========================================================
const PPM_BACKLOG_WEEKS = 4;   // how many weeks back a missed PPM stays on the technician's "Overdue" list

function deptMap_() { const m = {}; deptRows_().forEach(d => { m[d.name.toLowerCase()] = d.name; }); return m; }
function parseDepts_(v, map) {
  map = map || deptMap_();
  const src = Array.isArray(v) ? v.join(',') : String(v == null ? '' : v), seen = {}, out = [];
  src.split(/[,;|]+/).forEach(x => { const k = x.trim().toLowerCase(); if (k && map[k] && !seen[k]) { seen[k] = 1; out.push(map[k]); } });
  return out;
}
/** null = sees every department, otherwise array of lower-case department names */
function userScope_(u) { if (!u || isAdmin_(u)) return null; return (u.depts && u.depts.length) ? u.depts.map(d => String(d).toLowerCase()) : null; }
function inScope_(scope, dept) { const d = String(dept || '').trim().toLowerCase(); return !scope || !d || scope.indexOf(d) >= 0; }
function isSup_(u) { return !!u && !u.mustChange && u.role === 'supervisor'; }
function supOrAdmin_(token) { const u = getUser(token); return (isAdmin_(u) || isSup_(u)) ? u : null; }
function eqDeptMap_() {
  const m = {};
  try {
    const ed = getSpreadsheet().getSheetByName('Equipment').getDataRange().getValues(), ei = hdrIdx_(ed[0]);
    if (ei.department !== undefined) ed.slice(1).forEach(r => { m[r[ei.id]] = String(r[ei.department] || '').trim(); });
  } catch (e) {}
  return m;
}
/** {checkpointId: department} (checkpoint's own department, else its equipment's) */
function cpDeptMap_() {
  const m = {}, eq = eqDeptMap_(), cd = getSpreadsheet().getSheetByName('Checkpoints').getDataRange().getValues(), ci = hdrIdx_(cd[0]);
  for (let i = 1; i < cd.length; i++) if (cd[i][ci.id]) m[cd[i][ci.id]] = (ci.department !== undefined ? String(cd[i][ci.department] || '').trim() : '') || eq[cd[i][ci.equipmentId]] || '';
  return m;
}

/** Admin (developer tab): create OR edit a user. p.id present = edit. PIN optional when editing. */
function saveUser_core(token, p) {
  const me = superAdmin_(token);
  if (!me) return { ok: false, error: 'Admin only' };
  p = p || {};
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const name = String(p.name || '').trim();
    if (!name) return { ok: false, error: 'Name is required' };
    const ROLES = ['security', 'supervisor', 'manager', 'admin'], r0 = String(p.role || '').toLowerCase();
    const role = ROLES.indexOf(r0) >= 0 ? r0 : 'security';
    const map = deptMap_(), depts = parseDepts_(p.depts, map);
    const dept = map[String(p.department || '').trim().toLowerCase()] || depts[0] || '';
    const sh = getSpreadsheet().getSheetByName('Users'), data = sh.getDataRange().getValues(), ix = userIdx_(data[0]);
    let row = -1;
    if (p.id) for (let i = 1; i < data.length; i++) if (uid_(data[i], ix) === String(p.id)) { row = i; break; }
    if (p.id && row < 0) return { ok: false, error: 'User not found' };
    for (let i = 1; i < data.length; i++) if (i !== row && String(data[i][ix.name]).trim().toLowerCase() === name.toLowerCase()) return { ok: false, error: 'That name already exists' };
    const pin = String(p.pin || '').trim();
    if (row < 0 && !/^\d{4}$/.test(pin)) return { ok: false, error: 'PIN must be exactly 4 digits (numbers only)' };
    if (pin && !/^\d{4}$/.test(pin)) return { ok: false, error: 'PIN must be exactly 4 digits (numbers only)' };
    const active = p.active === false ? 'FALSE' : 'TRUE', must = p.mustChange ? 'TRUE' : 'FALSE';

    if (row >= 0) {
      const id = uid_(data[row], ix), wasAdmin = String(data[row][ix.role]).trim().toLowerCase() === 'admin';
      if (id.toLowerCase() === String(me.email).toLowerCase() && (role !== 'admin' || active === 'FALSE')) return { ok: false, error: "You can't remove your own admin access" };
      if (wasAdmin && (role !== 'admin' || active === 'FALSE')) {
        const others = data.slice(1).filter((r, i) => (i + 1) !== row && String(r[ix.role]).trim().toLowerCase() === 'admin' && isActive_(r[ix.active])).length;
        if (!others) return { ok: false, error: 'Keep at least one active admin' };
      }
      const set = (k, v) => { if (ix[k] !== undefined) sh.getRange(row + 1, ix[k] + 1).setValue(v); };
      set('name', name); set('role', role); set('department', dept); set('depts', depts.join(',')); set('active', active); set('mustChange', must);
      if (pin) { sh.getRange(row + 1, ix.pin + 1).setNumberFormat('@').setValue(pin); CacheService.getScriptCache().remove('fail_' + id); }
      dropUserCache_(id);
      audit_(me, 'user.update', name, 'role=' + role + ' depts=' + depts.join('/') + (pin ? ' PIN changed' : ''));
      return { ok: true, id: id, updated: true };
    }
    const id = 'U-' + Utilities.getUuid().slice(0, 6).toUpperCase(), nr = new Array(Math.max(data[0].length, SCHEMAS.Users.length)).fill('');
    const put = (k, v) => { if (ix[k] !== undefined) nr[ix[k]] = v; };
    put('email', id); put('name', name); put('role', role); put('department', dept); put('depts', depts.join(',')); put('active', active); put('mustChange', must);
    sh.appendRow(nr);
    sh.getRange(sh.getLastRow(), ix.pin + 1).setNumberFormat('@').setValue(pin);
    audit_(me, 'user.add', name, 'role=' + role + ' depts=' + depts.join('/'));
    return { ok: true, id: id, updated: false };
  } catch (err) { return { ok: false, error: err.message }; }
  finally { lock.releaseLock(); }
}

function deleteUser_core(token, id) {
  const me = superAdmin_(token);
  if (!me) return { ok: false, error: 'Admin only' };
  try {
    if (String(id).toLowerCase() === String(me.email).toLowerCase()) return { ok: false, error: "You can't delete your own account" };
    const r = userRow_(id); if (!r) return { ok: false, error: 'User not found' };
    if (String(r.data[r.ix.role]).trim().toLowerCase() === 'admin') {
      const all = r.sh.getDataRange().getValues(), n = all.slice(1).filter(x => String(x[r.ix.role]).trim().toLowerCase() === 'admin' && isActive_(x[r.ix.active])).length;
      if (n <= 1) return { ok: false, error: 'Keep at least one active admin' };
    }
    audit_(me, 'user.delete', r.data[r.ix.name], ''); r.sh.deleteRow(r.row); dropUserCache_(id);
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}

/** People a supervisor/admin can assign issues to (same departments). */
function listTeam(token) {
  const u = supOrAdmin_(token);
  if (!u) return { ok: false, error: 'Supervisor only' };
  try {
    const scope = userScope_(u), map = deptMap_(), d = getSpreadsheet().getSheetByName('Users').getDataRange().getValues(), ix = userIdx_(d[0]), out = [];
    d.slice(1).forEach(r => {
      const id = uid_(r, ix), name = String(r[ix.name] || '').trim(), role = String(r[ix.role] || '').trim().toLowerCase();
      if (!id || !name || !isActive_(r[ix.active]) || (role !== 'security' && role !== 'supervisor')) return;
      const dp = parseDepts_(r[ix.depts], map), prim = String(r[ix.department] || '').trim(), list = dp.length ? dp : (prim ? [prim] : []);
      if (scope && list.length && !list.some(x => scope.indexOf(x.toLowerCase()) >= 0)) return;
      out.push({ id: id, name: name, role: role, depts: list });
    });
    out.sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, items: out };
  } catch (err) { return { ok: false, error: err.message }; }
}

// ==========================================================
// 15. FEATURE SWITCHES (admin): every feature can be switched on/off from Developer > Features.
//     To add a feature later: add ONE line to FEATURE_DEFS (a "reserved" slot can simply be renamed), then use  getFeatures_().yourKey  in the code.
//     k = key, i = icon, t = title, d = description, g = group, def = default (true/false), needs = another feature that must be on first
// ==========================================================
const FEATURE_DEFS = [
  { k: 'ppm',       i: '🛠', g: 'Core',        t: 'PPM · Planned preventive maintenance', d: 'Paperless PPM: tasks repeat every N weeks, technicians complete the checklist on the phone.' },
  { k: 'calendar',  i: '📅', g: 'Core',        t: '52-week calendar',        d: 'Year planner showing planned, done and missed PPM for every week.', needs: 'ppm' },
  { k: 'signoff',   i: '✅', g: 'Core',        t: 'Supervisor sign-off',     d: 'Completed PPM waits for a supervisor to approve (or send back with a reason).', needs: 'ppm', def: true },
  { k: 'assign',    i: '👤', g: 'Core',        t: 'Task assignment',         d: 'Give a PPM task to one technician. If they are on leave, their team sees it.', needs: 'ppm' },
  { k: 'templates', i: '📋', g: 'Core',        t: 'Task templates',          d: 'Save a PPM task form as a template and reuse it for new tasks.', needs: 'ppm' },
  { k: 'permit',    i: '🔐', g: 'Safety',      t: 'Permit to work',          d: 'High-risk tasks need a permit number plus isolation, lock-out and area-safe confirmation.', needs: 'ppm' },
  { k: 'twostep',   i: '✍️', g: 'Safety',      t: 'Two-step approval',       d: 'High-risk PPM needs two different supervisors to sign off.', needs: 'ppm' },
  { k: 'block',     i: '🚧', g: 'Safety',      t: 'Department scan restriction', d: 'People can only scan checkpoints of their own departments.' },
  { k: 'leave',     i: '🏖', g: 'Operations',  t: 'Leave roster',            d: 'Supervisors record who is on leave; their assigned tasks move to the team.' },
  { k: 'parts',     i: '📦', g: 'Operations',  t: 'Spare parts inventory',   d: 'Technicians record parts used; stock is deducted and low stock is flagged.', needs: 'ppm' },
  { k: 'qrhint',    i: '🔎', g: 'Operations',  t: 'QR task hints',           d: 'Scanning a round checkpoint also shows PPM due on the same equipment.', needs: 'ppm' },
  { k: 'offline',   i: '📴', g: 'Operations',  t: 'Offline PPM queue',       d: 'PPM finished without signal is kept on the phone and sent automatically later.', needs: 'ppm' },
  { k: 'stats',     i: '📊', g: 'Insights',    t: 'Compliance statistics',   d: 'On-time, late and missed PPM by department, month and technician.', needs: 'ppm' },
  { k: 'audit',     i: '🧾', g: 'Insights',    t: 'Audit trail',             d: 'Logs who changed users, tasks, parts, leave and settings.' },
  { k: 'ics',       i: '⬇️', g: 'Insights',    t: 'Calendar export (.ics)',  d: 'Download the PPM plan to Google / Outlook / phone calendar.', needs: 'calendar' },
  { k: 'alerts',    i: '⏰', g: 'E-mail',      t: 'Reminder e-mails',        d: 'Daily digest: overdue PPM, late sign-offs, unassigned issues, low stock.' },
  { k: 'report',    i: '📧', g: 'E-mail',      t: 'PPM in the daily report', d: 'Adds a PPM summary to the daily e-mail report.', needs: 'ppm' },
  { k: 'r1', reserved: true, i: '🔒', g: 'Reserved for future', t: 'Reserved slot 1', d: 'Kept free for a future feature.' },
  { k: 'r2', reserved: true, i: '🔒', g: 'Reserved for future', t: 'Reserved slot 2', d: 'Kept free for a future feature.' },
  { k: 'r3', reserved: true, i: '🔒', g: 'Reserved for future', t: 'Reserved slot 3', d: 'Kept free for a future feature.' }
];

/** effective switches (a feature whose "needs" is off is off too) */
function getFeatures_() {
  const cache = CacheService.getScriptCache(), c = cache.get('ft_v2');
  if (c) { try { return JSON.parse(c); } catch (e) {} }
  const raw = {}, F = {};
  try {
    const sh = getSpreadsheet().getSheetByName('Settings');
    if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(r => { raw[String(r[0])] = String(r[1] == null ? '' : r[1]); });
  } catch (e) {}
  FEATURE_DEFS.forEach(d => {
    if (d.reserved) return;
    const v = String(raw['ft_' + d.k] || '').toUpperCase();
    F[d.k] = d.def ? v !== 'FALSE' : v === 'TRUE';
    if (d.needs && !F[d.needs]) F[d.k] = false;
  });
  F.alertEmails = String(raw.ft_alertEmails || ''); F.alertHour = Number(raw.ft_alertHour) || 8;
  cache.put('ft_v2', JSON.stringify(F), 300);
  return F;
}
function featOff_(k) { return getFeatures_()[k] ? null : { ok: false, error: 'This feature is switched off by the admin' }; }
function setSetting_(k, v) { setSettings_({ [k]: v }); }
function setSettings_(obj) {
  const sh = getSpreadsheet().getSheetByName('Settings'), d = sh.getDataRange().getValues();
  sh.getRange('B:B').setNumberFormat('@');
  Object.keys(obj).forEach(k => {
    let r = -1; for (let i = 1; i < d.length; i++) if (d[i][0] === k) { r = i; break; }
    if (r >= 0) sh.getRange(r + 1, 2).setValue(obj[k]); else { sh.appendRow([k, obj[k]]); d.push([k, obj[k]]); }
  });
}
function getFeatures(token) {
  if (!getUser(token)) return { ok: false, error: 'Unauthorized' };
  try {
    const F = Object.assign({}, getFeatures_()), adm = !!superAdmin_(token);
    if (!adm) delete F.alertEmails;
    return adm ? { ok: true, features: F, defs: FEATURE_DEFS } : { ok: true, features: F };
  } catch (e) { return { ok: false, error: e.message }; }
}
/** Partial save: only the keys present in p are changed (so every switch can be saved on its own). */
function saveFeatures(token, p) {
  const me = superAdmin_(token);
  if (!me) return { ok: false, error: 'Admin only' };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    p = p || {};
    const cur = getFeatures_(), w = {}, changed = [];
    const em = String(p.alertEmails !== undefined ? p.alertEmails : cur.alertEmails).split(/[,;\s]+/).filter(Boolean);
    if (em.some(e => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) return { ok: false, error: 'One of the alert e-mails is not valid' };
    if ((p.alerts !== undefined ? !!p.alerts : cur.alerts) && !em.length) return { ok: false, error: 'Add at least one e-mail in "Reminder e-mail settings" first' };
    FEATURE_DEFS.forEach(d => { if (!d.reserved && p[d.k] !== undefined) { w['ft_' + d.k] = p[d.k] ? 'TRUE' : 'FALSE'; changed.push(d.k + '=' + (p[d.k] ? 'on' : 'off')); } });
    if (p.alertEmails !== undefined) { w.ft_alertEmails = em.join(','); changed.push('alertEmails'); }
    if (p.alertHour !== undefined) { w.ft_alertHour = String(Math.min(23, Math.max(0, Math.round(Number(p.alertHour)) || 8))); changed.push('alertHour'); }
    if (Object.keys(w).length) setSettings_(w);
    CacheService.getScriptCache().remove('ft_v2');
    const F = getFeatures_(); let warn = '';
    if (p.alerts !== undefined || p.alertHour !== undefined) { try { applyAlertTrigger_(F); } catch (e) { warn = 'Saved, but the schedule could not be set (' + e.message + '). Run authorizeAll once from the script editor.'; } }
    audit_(me, 'features.save', 'features', changed.join(' '));
    return { ok: true, features: F, warn: warn };
  } catch (err) { return { ok: false, error: err.message }; }
  finally { lock.releaseLock(); }
}

// ==========================================================
// 16. PPM  (planned preventive maintenance, paperless)
//     A task repeats every N weeks from a start week (ISO weeks 1-52). Technicians complete the checklist on the phone,
//     supervisors sign it off, the 52-week calendar shows planned / done / missed.
// ==========================================================
function isoWeek_(d, tz) {
  const s = Utilities.formatDate(d, tz, 'yyyy-MM-dd').split('-').map(Number), dt = new Date(Date.UTC(s[0], s[1] - 1, s[2])), day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const y = dt.getUTCFullYear(), w = Math.ceil(((dt - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return { year: y, week: Math.min(52, Math.max(1, w)) };
}
function dueWeeks_(t) { const out = []; for (let w = t.startWeek; w <= 52; w += t.everyWeeks) out.push(w); return out; }

function ppmTaskRows_() {
  const sh = getSpreadsheet().getSheetByName('PPMTasks'), d = sh.getDataRange().getValues();
  if (d.length < 2) return [];
  const ix = hdrIdx_(d[0]);
  return d.slice(1).filter(r => r[ix.id]).map(r => ({
    id: String(r[ix.id]), name: String(r[ix.name] || ''), equipmentId: String(r[ix.equipmentId] || ''), equipmentName: String(r[ix.equipmentName] || ''),
    department: String(r[ix.department] || '').trim(), location: String(r[ix.location] || ''),
    everyWeeks: Math.min(52, Math.max(1, Number(r[ix.everyWeeks]) || 1)), startWeek: Math.min(52, Math.max(1, Number(r[ix.startWeek]) || 1)),
    checklist: parseList_(r[ix.checklist]), photoRequired: String(r[ix.photoRequired]).toUpperCase() === 'TRUE', active: isActive_(r[ix.active]),
    notes: String(r[ix.notes] || ''), estMins: Number(r[ix.estMins]) || 0,
    assignedTo: String(r[ix.assignedTo] || '').trim(), highRisk: String(r[ix.highRisk]).toUpperCase() === 'TRUE'
  }));
}
function ppmLogRows_() {
  const sh = getSpreadsheet().getSheetByName('PPMLog'), lr = sh.getLastRow();
  if (lr < 2) return [];
  const lc = sh.getLastColumn(), ix = hdrIdx_(sh.getRange(1, 1, 1, lc).getValues()[0]);
  return sh.getRange(2, 1, lr - 1, lc).getValues().map((r, i) => ({
    row: i + 2, id: String(r[ix.id] || ''), t: iso_(r[ix.timestamp]), year: Number(r[ix.year]), week: Number(r[ix.dueWeek]), taskId: String(r[ix.taskId]),
    taskName: r[ix.taskName], equipmentName: r[ix.equipmentName], location: String(r[ix.location] || ''), department: String(r[ix.department] || ''),
    doneBy: r[ix.doneBy], doneByName: r[ix.doneByName], status: String(r[ix.status]).toUpperCase(), notes: r[ix.notes], checklist: r[ix.checklist],
    photoUrl: r[ix.photoUrl], review: String(r[ix.reviewStatus] || ''), reviewByName: r[ix.reviewByName], reviewAt: iso_(r[ix.reviewAt]), reviewNote: r[ix.reviewNote],
    reviewBy: String(r[ix.reviewBy] || ''), risk: String(r[ix.risk] || ''), permit: String(r[ix.permit] || ''), parts: String(r[ix.parts] || ''), review2ByName: r[ix.review2ByName]
  })).filter(x => x.id);
}
/** latest record per task+week of a year (a redo after a rejection replaces the rejected one) */
function ppmDoneMap_(year, rows) { const m = {}; (rows || ppmLogRows_()).forEach(x => { if (x.year === year) m[x.taskId + '|' + x.week] = x; }); return m; }
function ppmBrief_(t) { return { id: t.id, name: t.name, equipmentId: t.equipmentId, highRisk: t.highRisk, assignedTo: t.assignedTo, equipmentName: t.equipmentName, location: t.location, department: t.department, everyWeeks: t.everyWeeks, photoRequired: t.photoRequired, estMins: t.estMins, notes: t.notes, checklist: t.checklist }; }

function listPpmTasks(token) {
  const u = getUser(token);
  if (!u) return { ok: false, error: 'Unauthorized' };
  try {
    const scope = userScope_(u), adm = isAdmin_(u);
    let items = ppmTaskRows_();
    if (!adm) items = items.filter(t => t.active && inScope_(scope, t.department));
    return { ok: true, items: items.map(t => Object.assign(ppmBrief_(t), { startWeek: t.startWeek, active: t.active, dueCount: dueWeeks_(t).length })) };
  } catch (err) { return { ok: false, error: err.message }; }
}

/** Create (several locations at once) or update one task. */
function savePpmTask(token, p) {
  if (!superAdmin_(token)) return { ok: false, error: 'Admin only' };
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    p = p || {};
    const name = String(p.name || '').trim();
    if (!name) return { ok: false, error: 'Task name is required' };
    const every = Math.round(Number(p.everyWeeks)), start = Math.round(Number(p.startWeek) || 1);
    if (!(every >= 1 && every <= 52)) return { ok: false, error: 'Repeat every must be 1 to 52 weeks' };
    if (!(start >= 1 && start <= 52)) return { ok: false, error: 'Start week must be 1 to 52' };
    const ss = getSpreadsheet(), sh = ss.getSheetByName('PPMTasks');
    let eqName = '';
    if (p.equipmentId) {
      const ed = ss.getSheetByName('Equipment').getDataRange().getValues(), ei = hdrIdx_(ed[0]), r = findRow_(ed, ei.id, p.equipmentId);
      if (r > 0) eqName = String(ed[r][ei.name]);
    }
    const dept = cleanDept_(p.department), list = JSON.stringify(cleanList_(p.checklist)), photo = p.photoRequired ? 'TRUE' : 'FALSE';
    const mins = Math.max(0, Math.min(600, Math.round(Number(p.estMins) || 0))), notes = String(p.notes || '').slice(0, 400);
    const asg = String(p.assignedTo || '').trim(), risk = p.highRisk ? 'TRUE' : 'FALSE';
    if (p.id) {
      const d = sh.getDataRange().getValues(), ix = hdrIdx_(d[0]), r = findRow_(d, ix.id, p.id);
      if (r < 0) return { ok: false, error: 'Task not found' };
      setCells_(sh, r, ix, { name: name, equipmentId: p.equipmentId || '', equipmentName: eqName, department: dept, location: String(p.location || p.locations || '').split(/[\n;]+/)[0].trim(),
        everyWeeks: every, startWeek: start, checklist: list, photoRequired: photo, notes: notes, estMins: mins, assignedTo: (getFeatures_().assign ? asg : d[r][ix.assignedTo]), highRisk: ((getFeatures_().permit || getFeatures_().twostep) ? risk : d[r][ix.highRisk]) });
      audit_(getUser(token), 'ppm.task.update', name, 'every ' + every + ' wk');
      return { ok: true, updated: true, created: 0 };
    }
    const locs = String(p.locations || '').split(/[\n;,]+/).map(s => s.trim()).filter(Boolean), places = locs.length ? locs.slice(0, 60) : [''];
    const rows = places.map(loc => ['PPM-' + Utilities.getUuid().slice(0, 6).toUpperCase(), name, p.equipmentId || '', eqName, dept, loc, every, start, list, photo, 'TRUE', new Date(), notes, mins, getFeatures_().assign ? asg : '', (getFeatures_().permit || getFeatures_().twostep) ? risk : 'FALSE']);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    audit_(getUser(token), 'ppm.task.add', name, rows.length + ' task(s), every ' + every + ' wk');
    return { ok: true, updated: false, created: rows.length };
  } catch (err) { return { ok: false, error: err.message }; }
  finally { lock.releaseLock(); }
}
function setPpmTaskActive(token, id, active) {
  if (!superAdmin_(token)) return { ok: false, error: 'Admin only' };
  try {
    const sh = getSpreadsheet().getSheetByName('PPMTasks'), d = sh.getDataRange().getValues(), ix = hdrIdx_(d[0]), r = findRow_(d, ix.id, id);
    if (r < 0) return { ok: false, error: 'Task not found' };
    sh.getRange(r + 1, ix.active + 1).setValue(active ? 'TRUE' : 'FALSE');
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}
function deletePpmTask(token, id) {
  if (!superAdmin_(token)) return { ok: false, error: 'Admin only' };
  try {
    const sh = getSpreadsheet().getSheetByName('PPMTasks'), d = sh.getDataRange().getValues(), ix = hdrIdx_(d[0]), r = findRow_(d, ix.id, id);
    if (r < 0) return { ok: false, error: 'Task not found' };
    audit_(getUser(token), 'ppm.task.delete', d[r][ix.name], ''); sh.deleteRow(r + 1);   // history in PPMLog is kept
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}

/** Technician / supervisor: PPM due this week + recent overdue (only their departments). */
function getMyPpm(token) {
  const u = getUser(token);
  if (!u) return { ok: false, error: 'Unauthorized' };
  try {
    const F = getFeatures_();
    if (!F.ppm) return { ok: true, enabled: false };
    const tz = Session.getScriptTimeZone(), cur = isoWeek_(new Date(), tz), scope = userScope_(u);
    const me = String(u.email).toLowerCase(), lv = leaveToday_(), seeAll = isAdmin_(u) || isSup_(u);
    const tasks = ppmTaskRows_().filter(t => t.active && inScope_(scope, t.department) && (!F.assign || !t.assignedTo || seeAll || t.assignedTo.toLowerCase() === me || lv[t.assignedTo.toLowerCase()])), done = ppmDoneMap_(cur.year);
    const due = [], over = [];
    tasks.forEach(t => dueWeeks_(t).forEach(w => {
      const rec = done[t.id + '|' + w];
      if (w === cur.week) due.push(Object.assign(ppmBrief_(t), { dueWeek: w, done: !!rec, review: rec ? rec.review : '', status: rec ? rec.status : '', reviewNote: rec ? rec.reviewNote : '' }));
      else if (w < cur.week && w >= cur.week - PPM_BACKLOG_WEEKS && (!rec || rec.review === 'REJECTED'))
        over.push(Object.assign(ppmBrief_(t), { dueWeek: w, weeksLate: cur.week - w, rejected: !!rec, reviewNote: rec ? rec.reviewNote : '' }));
    }));
    const byName = (a, b) => String(a.name).localeCompare(String(b.name)) || String(a.location).localeCompare(String(b.location), undefined, { numeric: true });
    due.sort((a, b) => (a.done - b.done) || byName(a, b)); over.sort((a, b) => b.weeksLate - a.weeksLate || byName(a, b));
    return { ok: true, enabled: true, calendar: F.calendar, signoff: F.signoff, year: cur.year, week: cur.week, due: due, overdue: over,
             total: due.length, doneCount: due.filter(x => x.done && x.review !== 'REJECTED').length };
  } catch (err) { return { ok: false, error: err.message }; }
}

/** Technician completes a PPM checklist. Never trusts the client: answers are checked against the task's own checklist. */
function submitPpm(token, p) {
  const u = getUser(token);
  if (!u) return { ok: false, error: 'Unauthorized' };
  const lock = LockService.getScriptLock(); lock.waitLock(15000);
  try {
    p = p || {};
    const F = getFeatures_();
    if (!F.ppm) return { ok: false, error: 'PPM is switched off' };
    const ss = getSpreadsheet(), tz = Session.getScriptTimeZone(), cur = isoWeek_(new Date(), tz);
    const t = ppmTaskRows_().filter(x => x.id === String(p.taskId))[0];
    if (!t || !t.active) return { ok: false, error: 'Task not found or switched off' };
    if (!inScope_(userScope_(u), t.department)) return { ok: false, error: 'This task is not in your department' };
    const week = Math.round(Number(p.dueWeek)), year = cur.year;
    if (dueWeeks_(t).indexOf(week) < 0) return { ok: false, error: 'This task is not planned for week ' + week };
    if (week > cur.week) return { ok: false, error: 'Week ' + week + ' has not started yet' };
    const prev = ppmDoneMap_(year)[t.id + '|' + week];
    if (prev && prev.review !== 'REJECTED') return { ok: false, error: 'Already completed for week ' + week };

    let permitJson = '', partsJson = '';
    if (t.highRisk && F.permit) {
      const pr = p.permit || {};
      if (!String(pr.no || '').trim() || pr.isolated !== true || pr.loto !== true || pr.area !== true) return { ok: false, error: 'High-risk task: enter the permit number and confirm isolation, lock-out and area safe.' };
      permitJson = JSON.stringify({ no: String(pr.no).trim().slice(0, 40), isolated: true, loto: true, area: true });
    }
    let photoUrl = '';
    if (p.photoData) { try { photoUrl = savePhoto_(p.photoData, 'ppm_' + t.id); } catch (e) { return { ok: false, error: 'Photo upload failed: ' + e.message }; } }
    if (t.photoRequired && !photoUrl) return { ok: false, error: 'Photo is required for this task.' };

    let status = 'DONE', notes = String(p.notes || '').slice(0, 500), ck = '', issueText = '';
    if (p.offline) notes = (notes ? notes + ' | ' : '') + 'Logged offline';
    if (t.checklist.length) {
      const given = p.checklist || [], results = [];
      for (let i = 0; i < t.checklist.length; i++) {
        const g = given.filter(x => String(x.t) === t.checklist[i].t)[0], opt = g ? t.checklist[i].opts.filter(o => o.l === g.a)[0] : null;
        if (!opt) return { ok: false, error: 'Answer every checklist point' };
        results.push({ t: t.checklist[i].t, a: opt.l, bad: opt.bad });
      }
      const bad = results.filter(r => r.bad);
      if (bad.length) { status = 'ISSUE'; issueText = bad.map(r => r.t + ' - ' + r.a).join('; '); notes = (notes ? notes + ' | ' : '') + 'Issues: ' + issueText; }
      ck = JSON.stringify(results);
    }
    const used = F.parts ? (Array.isArray(p.parts) ? p.parts : []).slice(0, 20) : [];
    if (used.length) { const ur = usePartsLocked_(used); if (ur.error) return { ok: false, error: ur.error }; partsJson = JSON.stringify(ur.list); }
    const ct = p.offline && p.clientTime ? new Date(p.clientTime).getTime() : 0, when = (ct && ct <= Date.now() && Date.now() - ct < 14 * 86400000) ? new Date(ct) : new Date(), id = 'PL-' + Utilities.getUuid().slice(0, 8).toUpperCase();
    ss.getSheetByName('PPMLog').appendRow([id, when, year, week, t.id, t.name, t.equipmentName, t.location, t.department, u.email, u.name, status, notes, ck, photoUrl,
      (F.signoff || (t.highRisk && F.twostep)) ? 'PENDING' : 'NOT_REQUIRED', '', '', '', '', t.highRisk ? 'HIGH' : '', permitJson, partsJson, '', '', '']);
    if (status === 'ISSUE') { try { logIssue_(ss, u, ['PPM-' + t.id, t.equipmentId, t.equipmentName || t.name, t.location || 'PPM'], 'PPM: ' + (issueText || notes), photoUrl, when); } catch (ie) {} }
    return { ok: true, status: status, signoff: F.signoff };
  } catch (err) { return { ok: false, error: err.message }; }
  finally { lock.releaseLock(); }
}

/** 52-week calendar: one row per task, one cell per week. */
function getPpmCalendar(token, year) {
  const u = getUser(token);
  if (!u) return { ok: false, error: 'Unauthorized' };
  try {
    const F = getFeatures_();
    if (!F.ppm || !F.calendar) return { ok: false, error: 'The 52-week calendar is switched off' };
    const tz = Session.getScriptTimeZone(), cur = isoWeek_(new Date(), tz), y = Math.min(cur.year + 1, Math.max(cur.year - 3, Math.round(Number(year)) || cur.year));
    const scope = userScope_(u), done = ppmDoneMap_(y), tot = []; for (let w = 0; w <= 52; w++) tot.push({ p: 0, d: 0 });
    const rows = ppmTaskRows_().filter(t => t.active && inScope_(scope, t.department)).map(t => {
      const cells = {};
      dueWeeks_(t).forEach(w => {
        const rec = done[t.id + '|' + w], past = y < cur.year || (y === cur.year && w < cur.week), now = y === cur.year && w === cur.week;
        let s = 'plan';
        if (rec && rec.review !== 'REJECTED') s = rec.status === 'ISSUE' ? 'issue' : 'done';
        else if (past) s = 'missed'; else if (now) s = 'due';
        cells[w] = s; tot[w].p++; if (s === 'done' || s === 'issue') tot[w].d++;
      });
      return { id: t.id, name: t.name, location: t.location, department: t.department, everyWeeks: t.everyWeeks, startWeek: t.startWeek, cells: cells };
    }).sort((a, b) => String(a.department).localeCompare(b.department) || String(a.name).localeCompare(b.name) || String(a.location).localeCompare(b.location, undefined, { numeric: true }));
    return { ok: true, year: y, curYear: cur.year, curWeek: y === cur.year ? cur.week : 0, rows: rows, totals: tot };
  } catch (err) { return { ok: false, error: err.message }; }
}

/** Supervisor / admin: PPM records (status 'PENDING' = waiting for sign-off, '' = latest of everything). */
function listPpmLog(token, f) {
  const u = supOrAdmin_(token);
  if (!u) return { ok: false, error: 'Supervisor only' };
  try {
    f = f || {};
    const scope = userScope_(u);
    let rows = ppmLogRows_().filter(x => inScope_(scope, x.department));
    if (f.status === 'PENDING') rows = rows.filter(x => x.review === 'PENDING' || x.review === 'APPROVED_1');
    rows.sort((a, b) => String(b.t).localeCompare(String(a.t)));
    return { ok: true, items: rows.slice(0, Math.min(200, Number(f.limit) || 60)).map(x => ({ id: x.id, t: x.t, year: x.year, week: x.week, taskName: x.taskName, equipmentName: x.equipmentName,
      location: x.location, department: x.department, doneByName: x.doneByName, status: x.status, notes: x.notes, checklist: x.checklist, photoUrl: x.photoUrl,
      review: x.review, reviewByName: x.reviewByName, reviewAt: x.reviewAt, reviewNote: x.reviewNote,
      risk: x.risk, permit: x.permit, parts: x.parts, reviewBy: x.reviewBy, review2ByName: x.review2ByName })) };
  } catch (err) { return { ok: false, error: err.message }; }
}
function reviewPpm(token, id, decision, note) {
  const u = supOrAdmin_(token);
  if (!u) return { ok: false, error: 'Supervisor only' };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    decision = String(decision).toUpperCase();
    if (decision !== 'APPROVED' && decision !== 'REJECTED') return { ok: false, error: 'Decision must be approve or reject' };
    note = String(note || '').trim().slice(0, 300);
    if (decision === 'REJECTED' && !note) return { ok: false, error: 'Write a short reason so the technician can redo it' };
    const rec = ppmLogRows_().filter(x => x.id === String(id))[0];
    if (!rec) return { ok: false, error: 'Record not found' };
    if (!inScope_(userScope_(u), rec.department)) return { ok: false, error: 'Not your department' };
    if (String(rec.doneBy).toLowerCase() === String(u.email).toLowerCase() && !isAdmin_(u)) return { ok: false, error: 'You cannot sign off your own work' };
    const sh = getSpreadsheet().getSheetByName('PPMLog'), ix = hdrIdx_(sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]), now = new Date();
    if (decision === 'APPROVED' && rec.risk === 'HIGH' && getFeatures_().twostep) {              // high-risk: two different people must sign
      if (rec.review === 'PENDING') setCells_(sh, rec.row - 1, ix, { reviewStatus: 'APPROVED_1', reviewBy: u.email, reviewByName: u.name, reviewAt: now, reviewNote: note });
      else if (rec.review === 'APPROVED_1') {
        if (String(rec.reviewBy).toLowerCase() === String(u.email).toLowerCase()) return { ok: false, error: 'A different person must give the 2nd sign-off' };
        setCells_(sh, rec.row - 1, ix, { reviewStatus: 'APPROVED', review2By: u.email, review2ByName: u.name, review2At: now });
      } else return { ok: false, error: 'Already reviewed' };
    } else setCells_(sh, rec.row - 1, ix, { reviewStatus: decision, reviewBy: u.email, reviewByName: u.name, reviewAt: now, reviewNote: note });
    audit_(u, 'ppm.review', rec.taskName + (rec.location ? ' · ' + rec.location : ''), decision + (note ? ': ' + note : ''));
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
  finally { lock.releaseLock(); }
}

// ==========================================================
// 17. SUPERVISOR BOARD
// ==========================================================
function getSupervisorBoard(token) {
  const u = supOrAdmin_(token);
  if (!u) return { ok: false, error: 'Supervisor only' };
  try {
    const ss = getSpreadsheet(), tz = Session.getScriptTimeZone(), scope = userScope_(u), key = dayKey_(Date.now(), tz), F = getFeatures_();
    const cm = cpDeptMap_(), perDept = {}, cpIn = {};
    Object.keys(cm).forEach(id => {
      const d = cm[id] || 'General';
      if (!inScope_(scope, cm[id])) return;
      cpIn[id] = d; (perDept[d] = perDept[d] || { dept: d, total: 0, done: 0, issues: 0 }).total++;
    });
    const seen = {}, byUser = {};
    recentScans_(1500).filter(x => dayKey_(x.t, tz) === key && cpIn[x.cp]).forEach(x => {
      if (!seen[x.cp]) { seen[x.cp] = 1; perDept[cpIn[x.cp]].done++; }
      if (x.status === 'ISSUE') perDept[cpIn[x.cp]].issues++;
      const b = byUser[x.email] = byUser[x.email] || { name: x.userName, count: 0, last: 0 }; b.count++; b.last = Math.max(b.last, x.t);
    });
    let ppm = null;
    if (F.ppm) {
      const cur = isoWeek_(new Date(), tz), tasks = ppmTaskRows_().filter(t => t.active && inScope_(scope, t.department)), rows = ppmLogRows_(), done = ppmDoneMap_(cur.year, rows);
      let due = 0, dn = 0, over = 0;
      tasks.forEach(t => dueWeeks_(t).forEach(w => {
        const rec = done[t.id + '|' + w], ok = rec && rec.review !== 'REJECTED';
        if (w === cur.week) { due++; if (ok) dn++; } else if (w < cur.week && w >= cur.week - PPM_BACKLOG_WEEKS && !ok) over++;
      }));
      ppm = { week: cur.week, due: due, done: dn, overdue: over, pending: rows.filter(x => (x.review === 'PENDING' || x.review === 'APPROVED_1') && inScope_(scope, x.department)).length };
    }
    let open = 0, unassigned = 0;
    const isd = ss.getSheetByName('Issues').getDataRange().getValues();
    if (isd.length > 1) {
      const ii = hdrIdx_(isd[0]);
      isd.slice(1).forEach(r => { if (!r[ii.id] || String(r[ii.status]) === 'RESOLVED') return; if (!inScope_(scope, cm[r[ii.checkpointId]])) return; open++; if (!r[ii.assignedTo]) unassigned++; });
    }
    const depts = Object.keys(perDept).map(k => perDept[k]).sort((a, b) => a.dept.localeCompare(b.dept));
    const tot = depts.reduce((s, d) => s + d.total, 0), dn2 = depts.reduce((s, d) => s + d.done, 0);
    return { ok: true, scope: scope ? u.depts : ['All departments'], rounds: { total: tot, done: dn2 }, depts: depts, ppm: ppm, openIssues: open, unassigned: unassigned,
      team: Object.keys(byUser).map(k => ({ name: byUser[k].name, count: byUser[k].count, last: new Date(byUser[k].last).toISOString() })).sort((a, b) => b.count - a.count) };
  } catch (err) { return { ok: false, error: err.message }; }
}

// ==========================================================
// 18. AUDIT TRAIL · LEAVE ROSTER · SPARE PARTS · PPM STATS · ALERTS
// ==========================================================
function audit_(u, action, target, detail) {
  if (!getFeatures_().audit) return;
  try { getSpreadsheet().getSheetByName('Audit').appendRow([new Date(), u ? (u.name + ' (' + u.email + ')') : 'system', action, String(target || ''), String(detail || '').slice(0, 300)]); } catch (e) {}
}
function listAudit(token, f) {
  if (!superAdmin_(token)) return { ok: false, error: 'Admin only' };
  try {
    f = f || {};
    const sh = getSpreadsheet().getSheetByName('Audit'), lr = sh.getLastRow(), q = String(f.q || '').toLowerCase();
    if (lr < 2) return { ok: true, items: [] };
    const start = Math.max(2, lr - 799);
    let items = sh.getRange(start, 1, lr - start + 1, 5).getValues().map(r => ({ t: iso_(r[0]), user: r[1], action: r[2], target: r[3], detail: r[4] })).reverse();
    if (q) items = items.filter(i => (i.user + ' ' + i.action + ' ' + i.target + ' ' + i.detail).toLowerCase().indexOf(q) >= 0);
    return { ok: true, items: items.slice(0, 300) };
  } catch (err) { return { ok: false, error: err.message }; }
}

// ---------- leave roster ----------
function ymd_(v) { return v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(v || '').trim().slice(0, 10); }
function leaveRows_() {
  const sh = getSpreadsheet().getSheetByName('Leave'), lr = sh.getLastRow();
  if (lr < 2) return [];
  return sh.getRange(2, 1, lr - 1, 6).getValues().filter(r => r[0]).map(r => ({ id: String(r[0]), userId: String(r[1]), userName: String(r[2]), from: ymd_(r[3]), to: ymd_(r[4]), note: String(r[5] || '') }));
}
/** {lower-case user id: true} for everybody on leave today */
function leaveToday_() { const t = ymd_(new Date()), m = {}; if (!getFeatures_().leave) return m; leaveRows_().forEach(l => { if (l.from <= t && t <= l.to) m[l.userId.toLowerCase()] = true; }); return m; }
function listLeave(token) { const off_ = featOff_('leave'); if (off_) return off_;
  if (!supOrAdmin_(token)) return { ok: false, error: 'Supervisor only' };
  try { const t = ymd_(new Date()); return { ok: true, items: leaveRows_().filter(l => l.to >= t).sort((a, b) => a.from.localeCompare(b.from)), today: leaveToday_() }; } catch (err) { return { ok: false, error: err.message }; }
}
function saveLeave(token, p) { const off_ = featOff_('leave'); if (off_) return off_;
  const u = supOrAdmin_(token);
  if (!u) return { ok: false, error: 'Supervisor only' };
  try {
    p = p || {};
    const re = /^\d{4}-\d{2}-\d{2}$/;
    if (!re.test(p.from) || !re.test(p.to)) return { ok: false, error: 'Pick the from and to dates' };
    if (p.from > p.to) return { ok: false, error: '"To" is before "From"' };
    const ud = getSpreadsheet().getSheetByName('Users').getDataRange().getValues(), ix = userIdx_(ud[0]);
    const row = ud.slice(1).filter(r => uid_(r, ix) === String(p.userId))[0];
    if (!row) return { ok: false, error: 'User not found' };
    const sh = getSpreadsheet().getSheetByName('Leave'); sh.getRange('D:E').setNumberFormat('@');
    sh.appendRow(['LV-' + Utilities.getUuid().slice(0, 6).toUpperCase(), p.userId, String(row[ix.name]), p.from, p.to, String(p.note || '').slice(0, 100)]);
    audit_(u, 'leave.add', row[ix.name], p.from + ' to ' + p.to);
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}
function deleteLeave(token, id) { const off_ = featOff_('leave'); if (off_) return off_;
  const u = supOrAdmin_(token);
  if (!u) return { ok: false, error: 'Supervisor only' };
  try {
    const sh = getSpreadsheet().getSheetByName('Leave'), d = sh.getDataRange().getValues();
    for (let i = 1; i < d.length; i++) if (String(d[i][0]) === String(id)) { sh.deleteRow(i + 1); audit_(u, 'leave.delete', d[i][2], ''); return { ok: true }; }
    return { ok: false, error: 'Not found' };
  } catch (err) { return { ok: false, error: err.message }; }
}

// ---------- spare parts / materials ----------
function partRows_() {
  if (!getFeatures_().parts) return [];
  const sh = getSpreadsheet().getSheetByName('Parts'), lr = sh.getLastRow();
  if (lr < 2) return [];
  return sh.getRange(2, 1, lr - 1, 6).getValues().filter(r => r[0]).map((r, i) => ({ row: i + 2, id: String(r[0]), name: String(r[1]), unit: String(r[2] || 'pcs'), stock: Number(r[3]) || 0, minStock: Number(r[4]) || 0, active: isActive_(r[5]) }));
}
function listParts(token) { const off_ = featOff_('parts'); if (off_) return off_;
  if (!getUser(token)) return { ok: false, error: 'Unauthorized' };
  try { return { ok: true, items: partRows_().map(p => ({ id: p.id, name: p.name, unit: p.unit, stock: p.stock, minStock: p.minStock, active: p.active, low: p.minStock > 0 && p.stock <= p.minStock })) }; } catch (err) { return { ok: false, error: err.message }; }
}
function savePart(token, p) { const off_ = featOff_('parts'); if (off_) return off_;
  const u = superAdmin_(token);
  if (!u) return { ok: false, error: 'Admin only' };
  try {
    p = p || {};
    const name = String(p.name || '').trim().slice(0, 60); if (!name) return { ok: false, error: 'Part name is required' };
    const unit = String(p.unit || 'pcs').trim().slice(0, 10) || 'pcs', stock = Math.max(0, Number(p.stock) || 0), min = Math.max(0, Number(p.minStock) || 0), act = p.active === false ? 'FALSE' : 'TRUE';
    const sh = getSpreadsheet().getSheetByName('Parts'), row = p.id ? partRows_().filter(x => x.id === p.id)[0] : null;
    if (row) sh.getRange(row.row, 2, 1, 5).setValues([[name, unit, stock, min, act]]);
    else sh.appendRow(['PT-' + Utilities.getUuid().slice(0, 5).toUpperCase(), name, unit, stock, min, act]);
    audit_(u, row ? 'part.update' : 'part.add', name, 'stock ' + stock);
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}
function adjustPart(token, id, delta) { const off_ = featOff_('parts'); if (off_) return off_;
  const u = supOrAdmin_(token);
  if (!u) return { ok: false, error: 'Supervisor only' };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const r = partRows_().filter(x => x.id === id)[0]; if (!r) return { ok: false, error: 'Part not found' };
    const ns = Math.max(0, r.stock + (Number(delta) || 0));
    getSpreadsheet().getSheetByName('Parts').getRange(r.row, 4).setValue(ns);
    audit_(u, 'part.stock', r.name, r.stock + ' -> ' + ns);
    return { ok: true, stock: ns };
  } catch (err) { return { ok: false, error: err.message }; }
  finally { lock.releaseLock(); }
}
function deletePart(token, id) { const off_ = featOff_('parts'); if (off_) return off_;
  const u = superAdmin_(token);
  if (!u) return { ok: false, error: 'Admin only' };
  try { const r = partRows_().filter(x => x.id === id)[0]; if (!r) return { ok: false, error: 'Part not found' }; getSpreadsheet().getSheetByName('Parts').deleteRow(r.row); audit_(u, 'part.delete', r.name, ''); return { ok: true }; } catch (err) { return { ok: false, error: err.message }; }
}
/** Called with the script lock held. Checks stock for every line first, then deducts. */
function usePartsLocked_(used) {
  const rows = partRows_(), sh = getSpreadsheet().getSheetByName('Parts'), list = [], need = {};
  for (let i = 0; i < used.length; i++) {
    const q = Number(used[i].qty), r = rows.filter(x => x.id === String(used[i].id))[0];
    if (!r || !(q > 0) || q > 10000) return { error: 'Check the material list' };
    need[r.id] = (need[r.id] || 0) + q;
    if (need[r.id] > r.stock) return { error: 'Not enough stock of ' + r.name + ' (only ' + r.stock + ' ' + r.unit + ' left)' };
    list.push({ id: r.id, name: r.name, unit: r.unit, qty: q });
  }
  Object.keys(need).forEach(id => { const r = rows.filter(x => x.id === id)[0]; sh.getRange(r.row, 4).setValue(r.stock - need[id]); });
  return { list: list };
}

// ---------- PPM compliance stats ----------
function weekMonthIdx_(y, w) { const d = new Date(Date.UTC(y, 0, 4)).getUTCDay() || 7; return new Date(Date.UTC(y, 0, 4 - (d - 1) + (w - 1) * 7) + 3 * 86400000).getUTCMonth(); }
function getPpmStats(token) { const off_ = featOff_('stats'); if (off_) return off_;
  const u = supOrAdmin_(token);
  if (!u) return { ok: false, error: 'Supervisor only' };
  try {
    const tz = Session.getScriptTimeZone(), cur = isoWeek_(new Date(), tz), scope = userScope_(u), MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const tasks = ppmTaskRows_().filter(t => t.active && inScope_(scope, t.department)), rows = ppmLogRows_(), done = ppmDoneMap_(cur.year, rows);
    const dept = {}, miss = {}, tech = {}, month = MN.map(m => ({ m: m, planned: 0, onTime: 0, late: 0, missed: 0 }));
    tasks.forEach(t => dueWeeks_(t).forEach(w => {
      if (w > cur.week) return;
      const rec = done[t.id + '|' + w], ok = rec && rec.review !== 'REJECTED';
      if (w === cur.week && !ok) return;
      const dk = t.department || 'Any', D = dept[dk] = dept[dk] || { dept: dk, planned: 0, onTime: 0, late: 0, missed: 0 }, M = month[weekMonthIdx_(cur.year, w)];
      D.planned++; M.planned++;
      if (!ok) { D.missed++; M.missed++; const k = t.name + (t.location ? ' · ' + t.location : ''); miss[k] = (miss[k] || 0) + 1; }
      else { const rw = isoWeek_(new Date(rec.t), tz), on = rw.year === cur.year && rw.week <= w; if (on) { D.onTime++; M.onTime++; } else { D.late++; M.late++; } }
    }));
    rows.filter(r => r.year === cur.year && inScope_(scope, r.department)).forEach(r => { const x = tech[r.doneByName] = tech[r.doneByName] || { name: r.doneByName, done: 0, issues: 0, rejected: 0 }; x.done++; if (r.status === 'ISSUE') x.issues++; if (r.review === 'REJECTED') x.rejected++; });
    return { ok: true, year: cur.year, week: cur.week, depts: Object.keys(dept).map(k => dept[k]).sort((a, b) => a.dept.localeCompare(b.dept)), months: month.filter(m => m.planned),
      techs: Object.keys(tech).map(k => tech[k]).sort((a, b) => b.done - a.done), missedTop: Object.keys(miss).map(k => ({ task: k, count: miss[k] })).sort((a, b) => b.count - a.count).slice(0, 10) };
  } catch (err) { return { ok: false, error: err.message }; }
}

/** PPM block used by the daily PDF/email report */
function ppmReportHtml_() {
  try {
    { const FR = getFeatures_(); if (!FR.ppm || !FR.report) return ''; }
    const tz = Session.getScriptTimeZone(), cur = isoWeek_(new Date(), tz), tasks = ppmTaskRows_().filter(t => t.active), rows = ppmLogRows_(), done = ppmDoneMap_(cur.year, rows), D = {};
    tasks.forEach(t => dueWeeks_(t).forEach(w => {
      const k = t.department || 'Any', x = D[k] = D[k] || { due: 0, done: 0, over: 0 }, rec = done[t.id + '|' + w], ok = rec && rec.review !== 'REJECTED';
      if (w === cur.week) { x.due++; if (ok) x.done++; } else if (w < cur.week && w >= cur.week - PPM_BACKLOG_WEEKS && !ok) x.over++;
    }));
    const pend = rows.filter(r => r.review === 'PENDING' || r.review === 'APPROVED_1').length, low = partRows_().filter(p => p.active && p.minStock > 0 && p.stock <= p.minStock);
    const td = (s, st) => '<td style="padding:4px 8px;border:1px solid #dde7e2;' + (st || '') + '">' + s + '</td>';
    return '<p style="margin:10px 0 4px"><b>PPM · week ' + cur.week + '</b> — ' + pend + ' awaiting sign-off</p><table cellspacing="0" style="border-collapse:collapse;font-size:11px;margin-bottom:8px"><tr style="background:#eef7f3"><td style="padding:4px 8px"><b>Department</b></td><td style="padding:4px 8px"><b>Done / due</b></td><td style="padding:4px 8px"><b>Overdue</b></td></tr>' +
      (Object.keys(D).map(k => '<tr>' + td(h_(k)) + td(D[k].done + ' / ' + D[k].due) + td(D[k].over, D[k].over ? 'color:#b42318;font-weight:bold' : '') + '</tr>').join('') || '<tr><td colspan="3" style="padding:4px 8px">No PPM planned</td></tr>') + '</table>' +
      (low.length ? '<p style="margin:4px 0 8px;color:#9a6200"><b>Low stock:</b> ' + low.map(p => h_(p.name) + ' (' + p.stock + ' ' + h_(p.unit) + ')').join(', ') + '</p>' : '');
  } catch (e) { return ''; }
}

// ---------- reminders (daily e-mail digest, time-driven trigger) ----------
function applyAlertTrigger_(F) {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'sendAlerts').forEach(t => ScriptApp.deleteTrigger(t));
  if (F.alerts) ScriptApp.newTrigger('sendAlerts').timeBased().everyDays(1).atHour(Number(F.alertHour) || 8).create();
}
function sendAlerts() { return buildAlerts_(false); }
function sendAlertsNow(token) { if (!superAdmin_(token)) return { ok: false, error: 'Admin only' }; return buildAlerts_(true); }
function buildAlerts_(force) {
  try {
    const F = getFeatures_(), to = String(F.alertEmails || '').split(',').filter(Boolean);
    if (!to.length) return { ok: false, error: 'Add at least one alert e-mail first' };
    const tz = Session.getScriptTimeZone(), cur = isoWeek_(new Date(), tz), sec = [];
    if (F.ppm) {
      const rows = ppmLogRows_(), done = ppmDoneMap_(cur.year, rows), over = [];
      ppmTaskRows_().filter(t => t.active).forEach(t => dueWeeks_(t).forEach(w => { const rec = done[t.id + '|' + w]; if (w < cur.week && w >= cur.week - PPM_BACKLOG_WEEKS && (!rec || rec.review === 'REJECTED')) over.push(t.name + (t.location ? ' · ' + t.location : '') + ' (' + (t.department || 'Any') + ', ' + (cur.week - w) + ' wk late)'); }));
      if (over.length) sec.push('<b>Overdue PPM (' + over.length + ')</b><ul>' + over.slice(0, 25).map(x => '<li>' + h_(x) + '</li>').join('') + '</ul>');
      const stale = rows.filter(r => (r.review === 'PENDING' || r.review === 'APPROVED_1') && Date.now() - new Date(r.t).getTime() > 86400000);
      if (stale.length) sec.push('<b>Waiting for sign-off more than 24 h (' + stale.length + ')</b><ul>' + stale.slice(0, 20).map(r => '<li>' + h_(r.taskName) + ' · ' + h_(r.doneByName) + (r.risk === 'HIGH' ? ' · HIGH RISK' : '') + '</li>').join('') + '</ul>');
    }
    const un = (listIssuesInternal_() || []).filter(i => i.status !== 'RESOLVED' && !i.assignedName);
    if (un.length) sec.push('<b>Unassigned issues (' + un.length + ')</b><ul>' + un.slice(0, 20).map(i => '<li>' + h_(i.equipmentName) + ' · ' + h_(i.floor) + ' — ' + h_(i.summary) + '</li>').join('') + '</ul>');
    const low = partRows_().filter(p => p.active && p.minStock > 0 && p.stock <= p.minStock);
    if (low.length) sec.push('<b>Low stock</b><ul>' + low.map(p => '<li>' + h_(p.name) + ': ' + p.stock + ' ' + h_(p.unit) + ' (min ' + p.minStock + ')</li>').join('') + '</ul>');
    if (!sec.length && !force) return { ok: true, sent: 0, message: 'Nothing to report' };
    MailApp.sendEmail({ to: to.join(','), subject: 'Crescent Patrol alerts · ' + Utilities.formatDate(new Date(), tz, 'dd MMM yyyy'), name: 'Crescent Patrol',
      htmlBody: '<div style="font-family:Arial,sans-serif;font-size:13px"><h3 style="color:#03694f">Crescent Patrol · reminders</h3>' + (sec.join('') || '<p>Nothing needs attention. 👍</p>') + '</div>' });
    return { ok: true, sent: to.length, message: 'Alert sent to ' + to.join(', ') };
  } catch (err) { return { ok: false, error: err.message }; }
}

/** PPM due on the equipment of a scanned checkpoint (shown next to the normal round) */
function getPpmForCheckpoint(token, cpId) { const off_ = featOff_('qrhint'); if (off_) return off_;
  if (!getUser(token)) return { ok: false, error: 'Unauthorized' };
  try {
    const cd = getSpreadsheet().getSheetByName('Checkpoints').getDataRange().getValues(), ci = hdrIdx_(cd[0]), r = findRow_(cd, ci.id, cpId);
    if (r < 0) return { ok: true, items: [] };
    const eq = String(cd[r][ci.equipmentId]), m = getMyPpm(token);
    if (!m.ok || !m.enabled) return { ok: true, items: [] };
    const items = m.due.map(t => Object.assign(t, { kind: 'due' })).concat(m.overdue.map(t => Object.assign(t, { kind: 'over' }))).filter(t => t.equipmentId === eq && (!t.done || t.review === 'REJECTED' || t.rejected));
    return { ok: true, items: items };
  } catch (err) { return { ok: false, error: err.message }; }
}

// ==========================================================
// 19. PPM TEMPLATES  ·  CALENDAR EXPORT (.ics)
// ==========================================================
function tplRows_() {
  const sh = getSpreadsheet().getSheetByName('PPMTemplates'), d = sh.getDataRange().getValues();
  if (d.length < 2) return [];
  const ix = hdrIdx_(d[0]);
  return d.slice(1).map((r, i) => ({ r: r, row: i + 2 })).filter(x => x.r[ix.id]).map(x => ({
    row: x.row, id: String(x.r[ix.id]), name: String(x.r[ix.name] || ''), department: String(x.r[ix.department] || ''),
    everyWeeks: Number(x.r[ix.everyWeeks]) || 4, startWeek: Number(x.r[ix.startWeek]) || 1, checklist: parseList_(x.r[ix.checklist]),
    photoRequired: String(x.r[ix.photoRequired]).toUpperCase() === 'TRUE', estMins: Number(x.r[ix.estMins]) || 0, notes: String(x.r[ix.notes] || ''),
    highRisk: String(x.r[ix.highRisk]).toUpperCase() === 'TRUE'
  }));
}
function listPpmTemplates(token) {
  const off = featOff_('templates'); if (off) return off;
  if (!superAdmin_(token)) return { ok: false, error: 'Admin only' };
  try { return { ok: true, items: tplRows_().map(t => { delete t.row; return t; }) }; } catch (err) { return { ok: false, error: err.message }; }
}
function savePpmTemplate(token, p) {
  const off = featOff_('templates'); if (off) return off;
  const me = superAdmin_(token); if (!me) return { ok: false, error: 'Admin only' };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    p = p || {};
    const name = String(p.name || '').trim().slice(0, 80); if (!name) return { ok: false, error: 'Template name is required' };
    const every = Math.round(Number(p.everyWeeks)), start = Math.round(Number(p.startWeek) || 1);
    if (!(every >= 1 && every <= 52) || !(start >= 1 && start <= 52)) return { ok: false, error: 'Repeat and start week must be 1 to 52' };
    const vals = [name, cleanDept_(p.department), every, start, JSON.stringify(cleanList_(p.checklist)), p.photoRequired ? 'TRUE' : 'FALSE',
      Math.max(0, Math.min(600, Math.round(Number(p.estMins) || 0))), String(p.notes || '').slice(0, 400), p.highRisk ? 'TRUE' : 'FALSE'];
    const sh = getSpreadsheet().getSheetByName('PPMTemplates'), ex = tplRows_().filter(t => t.name.toLowerCase() === name.toLowerCase())[0];
    if (ex) sh.getRange(ex.row, 2, 1, vals.length).setValues([vals]);
    else sh.appendRow(['TP-' + Utilities.getUuid().slice(0, 6).toUpperCase()].concat(vals));
    audit_(me, ex ? 'template.update' : 'template.add', name, '');
    return { ok: true, updated: !!ex };
  } catch (err) { return { ok: false, error: err.message }; }
  finally { lock.releaseLock(); }
}
function deletePpmTemplate(token, id) {
  const off = featOff_('templates'); if (off) return off;
  const me = superAdmin_(token); if (!me) return { ok: false, error: 'Admin only' };
  try {
    const t = tplRows_().filter(x => x.id === String(id))[0]; if (!t) return { ok: false, error: 'Template not found' };
    getSpreadsheet().getSheetByName('PPMTemplates').deleteRow(t.row); audit_(me, 'template.delete', t.name, '');
    return { ok: true };
  } catch (err) { return { ok: false, error: err.message }; }
}

/** All planned PPM of the person (their departments, their own assigned tasks) as an all-day-per-week calendar file. */
function getPpmIcs(token, year) {
  const u = getUser(token); if (!u) return { ok: false, error: 'Unauthorized' };
  const F = getFeatures_(); if (!(F.ppm && F.calendar && F.ics)) return { ok: false, error: 'Calendar export is switched off' };
  try {
    const tz = Session.getScriptTimeZone(), cur = isoWeek_(new Date(), tz), y = Math.min(cur.year + 1, Math.max(cur.year - 1, Math.round(Number(year)) || cur.year));
    const scope = userScope_(u), me = String(u.email).toLowerCase(), seeAll = isAdmin_(u) || isSup_(u);
    const tasks = ppmTaskRows_().filter(t => t.active && inScope_(scope, t.department) && (!F.assign || !t.assignedTo || seeAll || t.assignedTo.toLowerCase() === me));
    const esc = s => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/[,;]/g, '\\$&').replace(/\r?\n/g, '\\n');
    const day = d => Utilities.formatDate(d, 'UTC', 'yyyyMMdd'), stamp = Utilities.formatDate(new Date(), 'UTC', "yyyyMMdd'T'HHmmss'Z'");
    const mon = w => { const d = new Date(Date.UTC(y, 0, 4)).getUTCDay() || 7; return new Date(Date.UTC(y, 0, 4 - (d - 1) + (w - 1) * 7)); };
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Crescent Patrol//PPM//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:PPM ' + y];
    tasks.forEach(t => dueWeeks_(t).forEach(w => {
      const a = mon(w), b = new Date(a.getTime() + 7 * 86400000);
      L.push('BEGIN:VEVENT', 'UID:' + t.id + '-' + y + '-W' + w + '@crescent-patrol', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + day(a), 'DTEND;VALUE=DATE:' + day(b),
        'SUMMARY:' + esc('PPM: ' + t.name + (t.location ? ' · ' + t.location : '')), 'DESCRIPTION:' + esc('Week ' + w + (t.department ? ' · ' + t.department : '') + (t.notes ? '\n' + t.notes : '')), 'END:VEVENT');
    }));
    L.push('END:VCALENDAR');
    return { ok: true, name: 'PPM-' + y + '.ics', ics: L.join('\r\n'), count: L.filter(x => x === 'BEGIN:VEVENT').length };
  } catch (err) { return { ok: false, error: err.message }; }
}

// ==========================================================
// 20. AUDIT WRAPPERS — user, equipment, checkpoint, issue and settings changes are logged when the Audit trail feature is on
// ==========================================================
function saveUser(token, p) { const r = saveUser_core(token, p); if (r && r.ok) audit_(getUser(token), 'user.save', String((p && (p.name || p.id)) || ''), ''); return r; }
function deleteUser(token, id) { const r = deleteUser_core(token, id); if (r && r.ok) audit_(getUser(token), 'user.delete', String(id), ''); return r; }
function resetUserPin(token, id, pin) { const r = resetUserPin_core(token, id, pin); if (r && r.ok) audit_(getUser(token), 'user.pin-reset', String(id), ''); return r; }
function setUserActive(token, id, active) { const r = setUserActive_core(token, id, active); if (r && r.ok) audit_(getUser(token), 'user.active', String(id), String(!!active)); return r; }
function addGuard(token, p) { const r = addGuard_core(token, p); if (r && r.ok) audit_(getUser(token), 'user.add', String((p && p.name) || ''), ''); return r; }
function addEquipment(token, p) { const r = addEquipment_core(token, p); if (r && r.ok) audit_(getUser(token), 'equipment.add', String((p && p.name) || ''), ''); return r; }
function updateEquipment(token, id, p) { const r = updateEquipment_core(token, id, p); if (r && r.ok) audit_(getUser(token), 'equipment.update', String(id), ''); return r; }
function deleteEquipment(token, id) { const r = deleteEquipment_core(token, id); if (r && r.ok) audit_(getUser(token), 'equipment.delete', String(id), ''); return r; }
function deleteCheckpoint(token, id) { const r = deleteCheckpoint_core(token, id); if (r && r.ok) audit_(getUser(token), 'checkpoint.delete', String(id), ''); return r; }
function assignIssue(token, id, email) { const r = assignIssue_core(token, id, email); if (r && r.ok) audit_(getUser(token), 'issue.assign', String(id), String(email || 'unassigned')); return r; }
function resolveIssue(token, id, p) { const r = resolveIssue_core(token, id, p); if (r && r.ok) audit_(getUser(token), 'issue.resolve', String(id), ''); return r; }
function saveSettings(token, p) { const r = saveSettings_core(token, p); if (r && r.ok) audit_(getUser(token), 'settings.save', 'settings', ''); return r; }

/* ===== JSON API for the page when it is hosted outside Apps Script (live camera works there) ===== */
const API_ALLOW_ = ["getCamStatus", "saveCamPermission", "listCamAccess", "requestCamAgain", "addCheckpoint", "addEquipment", "addFloors", "addGuard", "adjustPart", "assignIssue", "changePin", "deleteCheckpoint", "deleteDepartment", "deleteEquipment", "deleteLeave", "deletePart", "deletePpmTask", "deletePpmTemplate", "deleteTower", "deleteUser", "getAssets", "getFeatures", "getMyPpm", "getMyRounds", "getPhotoData", "getPpmCalendar", "getPpmForCheckpoint", "getPpmIcs", "getPpmStats", "getScanLog", "getSupervisorBoard", "listAudit", "listCheckpoints", "listDepartments", "listEquipment", "listIssues", "listLeave", "listLoginUsers", "listParts", "listPpmLog", "listPpmTasks", "listPpmTemplates", "listTeam", "listTowers", "listUsers", "logout", "recordDirectScan", "recordScan", "resetUiSettings", "resetUserPin", "reviewPpm", "saveDepartment", "saveFeatures", "saveLeave", "savePart", "savePpmTask", "savePpmTemplate", "saveTower", "saveUiSettings", "saveUser", "sendAlertsNow", "setPosterModel", "setPpmTaskActive", "setUserActive", "submitPpm", "unifiedLogin", "updateCheckpoint", "updateEquipment", "verifyQuickScan", "whoami", "getUiSettings"];
function doPost(e) {
  const out = o => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fn = String(req.fn || '');
    if (API_ALLOW_.indexOf(fn) < 0) return out({ ok: false, error: 'Unknown function: ' + fn });
    const f = globalThis[fn];
    if (typeof f !== 'function') return out({ ok: false, error: 'Not available: ' + fn });
    return out({ ok: true, v: f.apply(null, Array.isArray(req.args) ? req.args : []) });
  } catch (err) { return out({ ok: false, error: String(err && err.message || err) }); }
}

/* ===== Camera permission tracking: one row per user + device ===== */
function camSheet_() {
  const ss = getSpreadsheet();
  let sh = ss.getSheetByName('CameraAccess');
  if (!sh) { sh = ss.insertSheet('CameraAccess'); sh.appendRow(['User ID', 'Name', 'Device ID', 'Device', 'Status', 'Updated', 'Ask again']); sh.setFrozenRows(1); }
  return sh;
}
function camRow_(d, uid, dev) { for (let i = 1; i < d.length; i++) if (String(d[i][0]) === String(uid) && String(d[i][2]) === String(dev)) return i; return -1; }
function getCamStatus(token, deviceId) {
  const u = getUser(token); if (!u) return { ok: false, error: 'Unauthorized' };
  try {
    const d = camSheet_().getDataRange().getValues(), i = camRow_(d, u.email, String(deviceId || '').slice(0, 60));
    if (i < 0) return { ok: true, status: '', ask: false };
    return { ok: true, status: String(d[i][4] || ''), ask: String(d[i][6]).toUpperCase() === 'TRUE' };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
}
function saveCamPermission(token, deviceId, device, status) {
  const u = getUser(token); if (!u) return { ok: false, error: 'Unauthorized' };
  status = ['granted', 'denied', 'unavailable'].indexOf(status) >= 0 ? status : 'denied';
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(8000);
    const sh = camSheet_(), d = sh.getDataRange().getValues(), dev = String(deviceId || '').slice(0, 60);
    const row = [u.email, u.name, dev, String(device || '').slice(0, 80), status, new Date(), 'FALSE'], i = camRow_(d, u.email, dev);
    if (i < 0) sh.appendRow(row); else sh.getRange(i + 1, 1, 1, 7).setValues([row]);
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
  finally { try { lock.releaseLock(); } catch (x) { } }
}
function listCamAccess(token) {
  if (!adminOnly_(token)) return { ok: false, error: 'Admin only' };
  try {
    const d = camSheet_().getDataRange().getValues(), tz = Session.getScriptTimeZone(), rows = [];
    for (let i = 1; i < d.length; i++) {
      if (!d[i][0]) continue;
      const t = d[i][5] instanceof Date ? Utilities.formatDate(d[i][5], tz, 'dd MMM yyyy HH:mm') : String(d[i][5] || '');
      rows.push({ id: String(d[i][0]), name: String(d[i][1]), deviceId: String(d[i][2]), device: String(d[i][3]), status: String(d[i][4]), updated: t, ask: String(d[i][6]).toUpperCase() === 'TRUE' });
    }
    return { ok: true, rows: rows };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
}
function requestCamAgain(token, userId, deviceId) {
  if (!adminOnly_(token)) return { ok: false, error: 'Admin only' };
  try {
    const sh = camSheet_(), d = sh.getDataRange().getValues();
    let n = 0;
    for (let i = 1; i < d.length; i++) if (String(d[i][0]) === String(userId) && (!deviceId || String(d[i][2]) === String(deviceId))) { sh.getRange(i + 1, 7).setValue('TRUE'); n++; }
    return { ok: true, count: n };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
}
