const express = require('express');
const router = express.Router();
const { stringify } = require('csv-stringify/sync');
const dayjs = require('dayjs');

function requireAuth(req, res, next) {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

router.get('/csv', requireAuth, (req, res) => {
  const items = req.session.billingItems || [];

  if (!items.length) {
    return res.status(400).json({ error: 'No billing entries to export' });
  }

  // Rocket Matter CSV format
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

module.exports = router;
