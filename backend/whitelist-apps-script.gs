/**
 * MiNI BRoKER — WhiteList backend (EXISTING bound script — extend, do not recreate).
 *
 * This file is the reference source for the EXISTING Apps Script that is already
 * bound to the WhiteList Google Sheet. Do NOT create a new Sheet or a new Apps
 * Script project. Paste/merge this into the existing bound script, then redeploy
 * the SAME web app (Deploy > Manage deployments > edit > New version) so the
 * live /exec URL is preserved.
 *
 * Deployment settings (required, or writes fail silently):
 *   Execute as:      Me
 *   Who has access:  Anyone
 *
 * Sheet columns (A-D already existed; E-K added in STEP 3 Final Corrections):
 *   A Timestamp (auto)      F Social Card Color
 *   B X Username            G Social Card Status ("Generated")
 *   C Wallet Address        H Social Post Link
 *   D Comment Link          I Status ("Verified")
 *   E Social Card Image     J GTD ("YES")
 *                           K Entry Number (auto sequential)
 */

var HEADERS = [
  'Timestamp', 'X Username', 'Wallet Address', 'Comment Link',
  'Social Card Image', 'Social Card Color', 'Social Card Status',
  'Social Post Link', 'Status', 'GTD', 'Entry Number'
];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    ensureHeaders_(sheet);

    var data = JSON.parse(e.postData.contents);
    var wallet = String(data.walletAddress || '').trim();
    if (!wallet) return ok_({ status: 'error', message: 'missing wallet' });

    // Duplicate protection — primary comparison on wallet address (server-side).
    if (walletExists_(sheet, wallet)) {
      return ok_({ status: 'duplicate' });
    }

    var entryNumber = Math.max(0, sheet.getLastRow() - 1) + 1;
    sheet.appendRow([
      new Date(),
      String(data.xUsername || '').trim(),
      wallet,
      String(data.commentLink || '').trim(),
      String(data.socialCardImage || ''),
      String(data.socialCardColor || ''),
      data.socialCardImage ? 'Generated' : '',
      String(data.socialPostLink || '').trim(),
      'Verified',
      'YES',
      entryNumber
    ]);
    return ok_({ status: 'success', entryNumber: entryNumber });
  } catch (err) {
    return ok_({ status: 'error', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    return;
  }
  // Extend an existing A-D / A-G sheet up to K without touching existing data.
  var width = sheet.getLastColumn();
  if (width < HEADERS.length) {
    sheet.getRange(1, width + 1, 1, HEADERS.length - width)
         .setValues([HEADERS.slice(width)]);
  }
}

function walletExists_(sheet, wallet) {
  var last = sheet.getLastRow();
  if (last < 2) return false;
  var col = sheet.getRange(2, 3, last - 1, 1).getValues();
  var target = wallet.toLowerCase();
  for (var i = 0; i < col.length; i++) {
    if (String(col[i][0]).trim().toLowerCase() === target) return true;
  }
  return false;
}

function ok_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
