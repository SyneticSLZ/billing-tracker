const express = require('express');
const router = express.Router();
const { stringify } = require('csv-stringify/sync');
const ExcelJS = require('exceljs');
const dayjs = require('dayjs');

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
  const items = req.session.billingItems || [];

  if (!items.length) {
    return res.status(400).json({ error: 'No billing entries to export' });
  }

  const rows = items.map(item => ({
    'Client': item.client || '',
    'Date': item.date || '',
    'Start Time': item.startFormatted || '',
    'End Time': item.endFormatted || '',
    'Duration (Hours)': item.durationHours || 0.1,
    'Activity Description': item.activityDescription || '',
    'Type': item.type || '',
    'Source': item.source || ''
  }));

  const csv = stringify(rows, { header: true });
  const filename = `rocket-matter-billing-${dayjs().format('YYYY-MM-DD')}.csv`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

/**
 * NextGen Financial Import XLSX export.
 * Generates a workbook matching the Financial_Import_Sample.xlsx format.
 * Only populates the "Time" sheet with billing entries.
 *
 * Time sheet columns:
 *   A: Time-Key          (blank)
 *   B: Matter-Key         (from RM Key lookup)
 *   C: Client Name        (from RM Key / subfolder)
 *   D: Matter Name        (blank)
 *   E: Date               (MM/DD/YYYY)
 *   F: Timekeeper-Name    (from settings or default)
 *   G: Rate               (from RM Key lookup)
 *   H: ActivityCode       (blank)
 *   I: TaskCode           (blank)
 *   J: Task-Name          (blank)
 *   K: Description        (AI-generated activity description)
 *   L: Notes              (blank)
 *   M: Billing-Type       ("Billable")
 *   N: Billed-Hours       (blank)
 *   O: Billed-Minutes     (blank)
 *   P: Total-Billed-Hours (duration rounded to 0.1h)
 *   Q: Tax1               (blank)
 *   R: Tax2               (blank)
 *   S: Amount             (blank)
 */
router.get('/xlsx', requireAuth, async (req, res) => {
  const items = req.session.billingItems || [];
  const rmKeyData = req.session.rmKeyData || null;

  if (!items.length) {
    return res.status(400).json({ error: 'No billing entries to export' });
  }

  // Default timekeeper — can be overridden via query param
  const timekeeperName = req.query.timekeeper || req.session.timekeeperName || 'Mark Paxton';

  try {
    const workbook = new ExcelJS.Workbook();

    // ── Time Sheet ──
    const timeSheet = workbook.addWorksheet('Time');

    // Headers (matching Financial_Import_Sample.xlsx exactly)
    const headers = [
      'Time-Key',
      'Matter-Key',
      'Client Name',
      'Matter Name',
      'Date',
      'Timekeeper-Name',
      'Rate',
      'ActivityCode',
      'TaskCode',
      'Task-Name',
      'Description',
      'Notes',
      'Billing-Type',
      'Billed-Hours',
      'Billed-Minutes',
      'Total-Billed-Hours',
      'Tax1',
      'Tax2',
      'Amount'
    ];

    const headerRow = timeSheet.addRow(headers);

    // Style headers — yellow background for required fields
    const requiredCols = [2, 7]; // Matter-Key (B), Rate (G)
    const condRequiredCols = [10, 11]; // Task-Name (J), Description (K)

    headerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, size: 10, name: 'Arial' };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = {
        top: { style: 'thin' },
        bottom: { style: 'thin' },
        left: { style: 'thin' },
        right: { style: 'thin' }
      };
      if (requiredCols.includes(colNumber)) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
      } else if (condRequiredCols.includes(colNumber)) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } };
      }
    });

    // Set column widths
    timeSheet.columns = [
      { width: 12 }, // A: Time-Key
      { width: 12 }, // B: Matter-Key
      { width: 30 }, // C: Client Name
      { width: 20 }, // D: Matter Name
      { width: 14 }, // E: Date
      { width: 22 }, // F: Timekeeper-Name
      { width: 10 }, // G: Rate
      { width: 14 }, // H: ActivityCode
      { width: 12 }, // I: TaskCode
      { width: 20 }, // J: Task-Name
      { width: 50 }, // K: Description
      { width: 20 }, // L: Notes
      { width: 14 }, // M: Billing-Type
      { width: 14 }, // N: Billed-Hours
      { width: 14 }, // O: Billed-Minutes
      { width: 18 }, // P: Total-Billed-Hours
      { width: 10 }, // Q: Tax1
      { width: 10 }, // R: Tax2
      { width: 12 }, // S: Amount
    ];

    // Add data rows — only items with an RM Key match get Matter-Key and Rate
    items.forEach(item => {
      // Parse date for Excel date format
      let excelDate = null;
      if (item.date) {
        const parts = item.date.split('/');
        if (parts.length === 3) {
          excelDate = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
        }
      }

      const row = timeSheet.addRow([
        null,                                           // A: Time-Key (blank)
        item.matterKey || null,                         // B: Matter-Key
        item.client || '',                              // C: Client Name
        null,                                           // D: Matter Name (blank)
        excelDate || item.date || '',                   // E: Date
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
      ]);

      // Format date column as MM/DD/YYYY
      const dateCell = row.getCell(5);
      if (excelDate) {
        dateCell.numFmt = 'MM/DD/YYYY';
      }

      // Style data rows
      row.eachCell((cell) => {
        cell.font = { size: 10, name: 'Arial' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
        };
      });
    });

    // ── Expense Sheet (empty, for template compliance) ──
    const expenseSheet = workbook.addWorksheet('Expense');
    const expenseHeaders = [
      'Expense-Key', 'Matter-Key', 'Client Name', 'Matter Name',
      'Timekeeper-Name', 'Billing-Type', 'Date', 'Quantity',
      'Price', 'Tax1-Rate', 'Tax2-Rate', 'ExpenseCode',
      'Expense-Name', 'Description', 'Notes', 'Amount'
    ];
    const expHeaderRow = expenseSheet.addRow(expenseHeaders);
    expHeaderRow.eachCell((cell) => {
      cell.font = { bold: true, size: 10, name: 'Arial' };
    });

    // Generate filename
    const filename = `nextgen-financial-import-${dayjs().format('YYYY-MM-DD')}.xlsx`;

    // Send as download
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

module.exports = router;
