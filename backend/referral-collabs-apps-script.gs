/**
 * MiNI BRoKER — REFERRAL + COLLABS backend (NEW, SEPARATE script).
 *
 * This is a brand-new Apps Script Web App. It is NOT the WhiteList script.
 * The existing WhiteList Sheet and its bound Apps Script must stay untouched.
 *
 * SETUP
 *  1. Create a NEW Google Sheet (e.g. "MiNI BRoKER — Referral + Collabs").
 *  2. Extensions > Apps Script (this binds the script to that new Sheet, so no
 *     Spreadsheet ID has to be entered anywhere).
 *  3. Paste this file in, save.
 *  4. Deploy > New deployment > Web app
 *       Execute as:     Me
 *       Who has access: Anyone
 *  5. Copy the /exec URL and paste it into the website's Tweaks panel field
 *     "Referral + Collabs web app URL".
 *
 * Two tabs are created automatically on first call:
 *
 * REFERRALS
 *   A Timestamp            F Referred Wallet
 *   B Referral Code        G Referral Status (Pending | Completed | Invalid)
 *   C Referrer X Username  H Valid Referral (YES | NO)
 *   D Referrer Wallet      I Total Valid Referrals
 *   E Referred X Username  J GTD Eligible (YES | NO)
 *
 * COLLABS  (filled in by hand by the project owner)
 *   A Serial   B Collab Name   C X Username   D Profile Image URL
 *   E Post Link   F Status (Active | Inactive)
 *
 * A referral only becomes valid when the referred participant COMPLETES the
 * whole WhiteList flow — the website calls completeReferral at that moment.
 * Clicks and unfinished registrations are never written as valid.
 */

var REF_SHEET = 'REFERRALS';
var COLLAB_SHEET = 'COLLABS';
var REF_HEADERS = [
  'Timestamp', 'Referral Code', 'Referrer X Username', 'Referrer Wallet',
  'Referred X Username', 'Referred Wallet', 'Referral Status',
  'Valid Referral', 'Total Valid Referrals', 'GTD Eligible'
];
var COLLAB_HEADERS = [
  'Serial', 'Collab Name', 'X Username', 'Profile Image URL', 'Post Link', 'Status'
];
var GTD_TARGET = 3;
var CODE_CHARS = 'ACDEFHJKLMNPQRTUVWXY34679'; // no 0/O, 1/I, 2/Z, 5/S, 8/B, G

/* ------------------------------------------------------------------ routing */

function doGet(e) {
  var p = (e && e.parameter) || {};
  var action = String(p.action || '').toLowerCase();
  try {
    if (action === 'collabs') return out_({ status: 'success', collabs: listCollabs_() });
    if (action === 'status') return out_(referralStatus_(String(p.code || '').toUpperCase()));
    return out_({ status: 'error', message: 'unknown action' });
  } catch (err) {
    return out_({ status: 'error', message: String(err) });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var action = String(data.action || '').toLowerCase();
    if (action === 'createcode') {
      return out_(createCode_(data.xUsername, data.walletAddress));
    }
    if (action === 'completereferral') {
      return out_(completeReferral_(data));
    }
    return out_({ status: 'error', message: 'unknown action' });
  } catch (err) {
    return out_({ status: 'error', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------------------------------------- referrals */

/**
 * Issues (or returns) the 6-character code owned by one participant.
 * A participant's own code lives on their first REFERRALS row; a row with an
 * empty "Referred" pair is the code-issue row and never counts as a referral.
 */
function createCode_(xUsername, wallet) {
  var sh = sheet_(REF_SHEET, REF_HEADERS);
  var user = String(xUsername || '').trim();
  var w = String(wallet || '').trim();
  if (!user && !w) return { status: 'error', message: 'missing identity' };

  var rows = body_(sh);
  for (var i = 0; i < rows.length; i++) {
    if (sameWallet_(rows[i][3], w) || sameUser_(rows[i][2], user)) {
      var code = String(rows[i][1]).toUpperCase();
      var st = referralStatus_(code);
      st.status = 'success';
      st.code = code;
      return st;
    }
  }

  var fresh = uniqueCode_(sh);
  sh.appendRow([new Date(), fresh, user, w, '', '', 'Pending', 'NO', 0, 'NO']);
  return { status: 'success', code: fresh, validReferrals: 0, target: GTD_TARGET, gtdEligible: false };
}

function completeReferral_(d) {
  var sh = sheet_(REF_SHEET, REF_HEADERS);
  var code = String(d.referralCode || '').toUpperCase().trim();
  var refUser = String(d.referredXUsername || '').trim();
  var refWallet = String(d.referredWallet || '').trim();
  if (!/^[A-Z0-9]{6}$/.test(code)) return { status: 'error', message: 'bad code' };
  if (!refWallet && !refUser) return { status: 'error', message: 'missing referred identity' };

  var rows = body_(sh);
  var owner = null;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][1]).toUpperCase() === code) { owner = rows[i]; break; }
  }
  if (!owner) return { status: 'error', message: 'unknown code' };

  // Self-referral: never counts.
  if (sameWallet_(owner[3], refWallet) || sameUser_(owner[2], refUser)) {
    sh.appendRow([new Date(), code, owner[2], owner[3], refUser, refWallet, 'Invalid', 'NO', countValid_(sh, code), gtdFlag_(sh, code)]);
    return { status: 'invalid', reason: 'self-referral' };
  }

  // Duplicate: the same referred participant may only ever count once.
  for (var j = 0; j < rows.length; j++) {
    var isReferralRow = String(rows[j][4]).trim() || String(rows[j][5]).trim();
    if (!isReferralRow) continue;
    if (sameWallet_(rows[j][5], refWallet) || sameUser_(rows[j][4], refUser)) {
      return { status: 'duplicate', validReferrals: countValid_(sh, code), target: GTD_TARGET };
    }
  }

  sh.appendRow([new Date(), code, owner[2], owner[3], refUser, refWallet, 'Completed', 'YES', 0, 'NO']);
  syncTotals_(sh, code);
  var valid = countValid_(sh, code);
  return { status: 'success', validReferrals: valid, target: GTD_TARGET, gtdEligible: valid >= GTD_TARGET };
}

function referralStatus_(code) {
  if (!/^[A-Z0-9]{6}$/.test(String(code || ''))) return { status: 'error', message: 'bad code' };
  var sh = sheet_(REF_SHEET, REF_HEADERS);
  var valid = countValid_(sh, code);
  return {
    status: 'success',
    code: code,
    validReferrals: valid,
    target: GTD_TARGET,
    gtdEligible: valid >= GTD_TARGET
  };
}

function countValid_(sh, code) {
  var rows = body_(sh), n = 0;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][1]).toUpperCase() !== String(code).toUpperCase()) continue;
    if (String(rows[i][7]).trim().toUpperCase() === 'YES') n++;
  }
  return n;
}

function gtdFlag_(sh, code) { return countValid_(sh, code) >= GTD_TARGET ? 'YES' : 'NO'; }

/** Rewrites columns I/J for every row belonging to one code. */
function syncTotals_(sh, code) {
  var rows = body_(sh);
  var valid = countValid_(sh, code);
  var flag = valid >= GTD_TARGET ? 'YES' : 'NO';
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][1]).toUpperCase() !== String(code).toUpperCase()) continue;
    sh.getRange(i + 2, 9, 1, 2).setValues([[valid, flag]]);
  }
}

function uniqueCode_(sh) {
  var rows = body_(sh);
  var taken = {};
  for (var i = 0; i < rows.length; i++) taken[String(rows[i][1]).toUpperCase()] = true;
  for (var t = 0; t < 200; t++) {
    var c = '';
    for (var k = 0; k < 6; k++) c += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
    if (!taken[c]) return c;
  }
  throw new Error('could not allocate a unique referral code');
}

/* ---------------------------------------------------------------- collabs */

function listCollabs_() {
  var sh = sheet_(COLLAB_SHEET, COLLAB_HEADERS);
  var rows = body_(sh);
  var list = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var name = String(r[1] || '').trim();
    if (!name) continue;
    if (String(r[5] || '').trim().toLowerCase() !== 'active') continue;
    list.push({
      serial: Number(r[0]) || i + 1,
      name: name,
      username: String(r[2] || '').trim(),
      image: String(r[3] || '').trim(),
      post: String(r[4] || '').trim()
    });
  }
  list.sort(function (a, b) { return a.serial - b.serial; });
  return list;
}

/* --------------------------------------------------------------- helpers */

function sheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.appendRow(headers);
  return sh;
}

function body_(sh) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
}

function sameWallet_(a, b) {
  a = String(a || '').trim().toLowerCase();
  b = String(b || '').trim().toLowerCase();
  return !!a && a === b;
}

function sameUser_(a, b) {
  a = String(a || '').trim().toLowerCase().replace(/^@/, '');
  b = String(b || '').trim().toLowerCase().replace(/^@/, '');
  return !!a && a === b;
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
