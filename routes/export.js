const express = require('express');
const router = express.Router();
const path = require('path');
const { stringify } = require('csv-stringify/sync');
const ExcelJS = require('exceljs');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

// Official NextGen / Rocket Matter import template, vendored from the
// "Financial Import Sample.xlsx" provided by the firm. The export loads this
// workbook so the output matches it exactly (instructions tab, List, version,
// Expense sheet, Time headers/styling) — only Time data rows are written.
const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'Financial Import Sample.xlsx');

// Items flagged billingExcluded (internal/admin email, meeting invites, or
// rolled-up children of a consolidated entry) are never written to an export.
function exportableItems(session) {
  return (session.billingItems || []).filter(i => i.billingExcluded !== true);
}

function requireAuth(req, res, next) {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

/**
 * Legacy CSV export (Rocket Matter format).
 */
router.get('/csv', requireAuth, (req, res) => {
  const items = exportableItems(req.session);

  if (!items.length) {
    return res.status(400).json({ error: 'No billing entries to export' });
  }

  const rows = items.map(item => ({
    'Client': item.client || '',
    'Date': item.date || '',
    'Start Time (EST)': item.startFormatted || '',
    'End Time (EST)': item.endFormatted || '',
    'Duration (Hours)': item.durationHours || 0.1,
    'Activity Description': item.activityDescription || '',
    'Type': item.type || '',
    'Source': item.source || '',
    'Matter Key': item.matterKey || '',
    'Rate': item.rate || '',
    'Possible Duplicate': item.possibleDuplicate ? 'Yes' : '',
  }));

  const csv = stringify(rows, { header: true });
  const filename = `rocket-matter-billing-${dayjs().format('YYYY-MM-DD')}.csv`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

/**
 * NextGen Financial Import XLSX export.
 *
 * Loads the vendored official template (TEMPLATE_PATH) and writes billing
 * entries into the existing "Time" sheet starting at row 2. The header row,
 * the "1. Data Entry Instructions" / "2. Data Import Instructions" tabs, the
 * "List" validation sheet, the "version" sheet, and the "Expense" sheet are
 * all preserved exactly as shipped — so the output matches the sample
 * byte-for-byte except for the Time data rows. No manual copy/paste needed.
 *
 * Time sheet columns (A–S, headers already in the template):
 *   A Time-Key(blank)  B Matter-Key  C Client Name  D Matter Name(blank)
 *   E Date(MM/DD/YYYY) F Timekeeper-Name  G Rate  H ActivityCode(blank)
 *   I TaskCode(blank)  J Task-Name(blank)  K Description  L Notes(blank)
 *   M Billing-Type     N Billed-Hours(blank)  O Billed-Minutes(blank)
 *   P Total-Billed-Hours  Q Tax1(blank)  R Tax2(blank)  S Amount(blank)
 */
router.get('/xlsx', requireAuth, async (req, res) => {
  const items = exportableItems(req.session);

  if (!items.length) {
    return res.status(400).json({ error: 'No billing entries to export' });
  }

  // Default timekeeper — can be overridden via query param
  const timekeeperName = req.query.timekeeper || req.session.timekeeperName || 'Mark Paxton';

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(TEMPLATE_PATH);

    const timeSheet = workbook.getWorksheet('Time');
    if (!timeSheet) {
      return res.status(500).json({ error: 'Import template is missing its "Time" sheet' });
    }

    // The template ships with one sample data row (row 2). We overwrite the
    // Time sheet from row 2 down with real data; every one of the 19 columns
    // is written explicitly (null for blank cells) so the sample row — and
    // any stale data from a prior write — is fully replaced. Rows below the
    // data stay blank; the NextGen importer skips rows with no Matter-Key /
    // Total-Billed-Hours. Other sheets are never touched.
    const lastDataRow = Math.max(timeSheet.actualRowCount, items.length + 1);

    items.forEach((item, i) => {
      // Format date as a plain MM/DD/YYYY string to avoid Excel timezone drift
      let dateStr = '';
      if (item.startTime) {
        dateStr = dayjs(item.startTime).tz('America/New_York').format('MM/DD/YYYY');
      } else if (item.date) {
        // item.date is already MM/DD/YYYY from billing.js
        dateStr = item.date;
      }

      const values = [
        null,                                           // A: Time-Key (blank)
        item.matterKey || null,                         // B: Matter-Key
        item.client || '',                              // C: Client Name
        null,                                           // D: Matter Name (blank)
        dateStr,                                        // E: Date (MM/DD/YYYY string)
        timekeeperName,                                 // F: Timekeeper-Name
        item.rate || null,                              // G: Rate
        null,                                           // H: ActivityCode
        null,                                           // I: TaskCode
        null,                                           // J: Task-Name
        item.activityDescription || item.subject || '', // K: Description
        null,                                           // L: Notes
        'Billable',                                     // M: Billing-Type
        null,                                           // N: Billed-Hours
        null,                                           // O: Billed-Minutes
        item.durationHours || 0.1,                      // P: Total-Billed-Hours
        null,                                           // Q: Tax1
        null,                                           // R: Tax2
        null,                                           // S: Amount
      ];

      const row = timeSheet.getRow(i + 2);
      values.forEach((v, c) => { row.getCell(c + 1).value = v; });
      row.commit();
    });

    // Clear any rows that the template's sample data occupied beyond our data
    // (defensive — the shipped template only has the single sample row 2).
    for (let r = items.length + 2; r <= lastDataRow; r++) {
      const row = timeSheet.getRow(r);
      for (let c = 1; c <= 19; c++) row.getCell(c).value = null;
      row.commit();
    }

    const filename = `nextgen-financial-import-${dayjs().format('YYYY-MM-DD')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    console.error('XLSX export error:', err);
    res.status(500).json({ error: 'Failed to generate XLSX: ' + err.message });
  }
});

/**
 * Update default timekeeper name for exports.
 */
router.post('/settings/timekeeper', requireAuth, (req, res) => {
  const { timekeeperName } = req.body;
  if (!timekeeperName) return res.status(400).json({ error: 'timekeeperName is required' });
  req.session.timekeeperName = timekeeperName;
  res.json({ success: true, timekeeperName });
});

/**
 * Internal / non-billable addresses for the Karisha↔Mark admin-email filter.
 * Comma / semicolon / newline separated; each token is a full address
 * ("mark@firm.com") or a domain ("firm.com" / "@firm.com"). Editable anytime
 * from the Settings panel — no code change needed to update.
 */
router.get('/settings/internal', requireAuth, (req, res) => {
  res.json({ internalAddresses: req.session.internalAddresses || '' });
});

router.post('/settings/internal', requireAuth, (req, res) => {
  const { internalAddresses } = req.body;
  req.session.internalAddresses = typeof internalAddresses === 'string' ? internalAddresses : '';
  res.json({ success: true, internalAddresses: req.session.internalAddresses });
});

module.exports = router;
