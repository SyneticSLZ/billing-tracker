const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { getEmails, getCalendarEvents, getCallRecords, getTeamsMessages, getEmailBody } = require('../utils/graph');
const {
  extractBillingInfo,
  emailsToBillingItems,
  eventsToBillingItems,
  teamsMessagesToBillingItems,
  callLogsToBillingItems,
  formatEntry
} = require('../utils/billing');

const upload = multer({ storage: multer.memoryStorage() });

function requireAuth(req, res, next) {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated. Please log in first.' });
  }
  next();
}

router.post('/fetch', requireAuth, async (req, res) => {
  const { startDate, endDate, emailLimit, chatLimit, messagesPerChat } = req.body;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' });
  }

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendProgress = (message, percent) => {
      res.write(`data: ${JSON.stringify({ type: 'progress', message, percent })}\n\n`);
    };

    const token = req.session.accessToken;

    sendProgress('Fetching emails from Outlook...', 15);
    const emails = await getEmails(token, startDate, endDate, emailLimit || 250);

    sendProgress(`Found ${emails.length} emails. Fetching calendar & Teams meetings...`, 35);
    const events = await getCalendarEvents(token, startDate, endDate);

    sendProgress(`Found ${events.length} meetings. Fetching Teams chat messages...`, 55);
    const teamsMessages = await getTeamsMessages(token, startDate, endDate, chatLimit || 50, messagesPerChat || 50);

    sendProgress(`Found ${teamsMessages.length} Teams messages. Fetching call records...`, 70);
    const callRecords = await getCallRecords(token, startDate, endDate);

    sendProgress('Extracting billing information with AI...', 80);

    let allItems = [
      ...emailsToBillingItems(emails),
      ...eventsToBillingItems(events),
      ...teamsMessagesToBillingItems(teamsMessages),
    ];

    allItems = await extractBillingInfo(allItems);
    allItems = allItems.map(formatEntry);

    // Store raw data for drill-downs
    req.session.rawData = {
      emails,
      events,
      teamsMessages,
      callRecords
    };
    req.session.billingItems = allItems;

    sendProgress('Done!', 100);
    res.write(`data: ${JSON.stringify({ type: 'complete', items: allItems, count: allItems.length })}\n\n`);
    res.end();

  } catch (err) {
    console.error('Fetch error:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

router.post('/upload-calls', requireAuth, upload.single('calllog'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const csvText = req.file.buffer.toString('utf-8');
    const rows = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });
    let items = callLogsToBillingItems(rows);
    items = await extractBillingInfo(items);
    items = items.map(formatEntry);
    const existing = req.session.billingItems || [];
    req.session.billingItems = [...existing, ...items];

    // Store raw call data
    if (!req.session.rawData) req.session.rawData = {};
    req.session.rawData.uploadedCalls = rows;

    res.json({ success: true, added: items.length, total: req.session.billingItems.length, items });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to parse call log: ' + err.message });
  }
});

router.put('/entry/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  if (!req.session.billingItems) return res.status(404).json({ error: 'No billing items in session' });
  const idx = req.session.billingItems.findIndex(item => item.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Entry not found' });
  req.session.billingItems[idx] = { ...req.session.billingItems[idx], ...req.body };
  res.json({ success: true, item: req.session.billingItems[idx] });
});

router.delete('/entry/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  if (!req.session.billingItems) return res.status(404).json({ error: 'No items' });
  req.session.billingItems = req.session.billingItems.filter(item => item.id !== id);
  res.json({ success: true, remaining: req.session.billingItems.length });
});

router.get('/entries', requireAuth, (req, res) => {
  res.json({ items: req.session.billingItems || [] });
});

router.delete('/entries', requireAuth, (req, res) => {
  req.session.billingItems = [];
  req.session.rawData = {};
  res.json({ success: true });
});

// ─── RAW DATA ENDPOINTS ───

router.get('/raw/emails', requireAuth, (req, res) => {
  const emails = req.session.rawData?.emails || [];
  const page = parseInt(req.query.page) || 1;
  const pageSize = parseInt(req.query.pageSize) || 50;
  const start = (page - 1) * pageSize;
  const paginated = emails.slice(start, start + pageSize);
  res.json({
    items: paginated,
    total: emails.length,
    page,
    pageSize,
    totalPages: Math.ceil(emails.length / pageSize)
  });
});

router.get('/raw/emails/:id/body', requireAuth, async (req, res) => {
  try {
    const token = req.session.accessToken;
    const body = await getEmailBody(token, req.params.id);
    res.json({ body });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch email body: ' + err.message });
  }
});

router.get('/raw/events', requireAuth, (req, res) => {
  const events = req.session.rawData?.events || [];
  res.json({ items: events, total: events.length });
});

router.get('/raw/teams', requireAuth, (req, res) => {
  const messages = req.session.rawData?.teamsMessages || [];
  // Group by chatId
  const grouped = {};
  messages.forEach(msg => {
    const chatId = msg.chatId || 'unknown';
    if (!grouped[chatId]) {
      grouped[chatId] = {
        chatId,
        topic: msg.chatTopic || 'Teams Chat',
        chatType: msg.chatType,
        messages: []
      };
    }
    grouped[chatId].messages.push(msg);
  });
  res.json({ chats: Object.values(grouped), totalMessages: messages.length });
});

router.get('/raw/calls', requireAuth, (req, res) => {
  const calls = req.session.rawData?.callRecords || [];
  const uploadedCalls = req.session.rawData?.uploadedCalls || [];
  res.json({ callRecords: calls, uploadedCalls, total: calls.length + uploadedCalls.length });
});

router.get('/clients', requireAuth, (req, res) => {
  const items = req.session.billingItems || [];
  const clientMap = {};

  items.forEach(item => {
    const client = item.client || 'UNKNOWN';
    if (!clientMap[client]) {
      clientMap[client] = {
        client,
        totalEntries: 0,
        totalHours: 0,
        breakdown: {
          email: { count: 0, hours: 0 },
          teams: { count: 0, hours: 0 },
          meeting: { count: 0, hours: 0 },
          call: { count: 0, hours: 0 }
        }
      };
    }

    const c = clientMap[client];
    c.totalEntries++;
    c.totalHours += item.durationHours || 0.1;

    const type = (item.type || '').toLowerCase();
    if (type.includes('email')) {
      c.breakdown.email.count++;
      c.breakdown.email.hours += item.durationHours || 0.1;
    } else if (type.includes('teams message')) {
      c.breakdown.teams.count++;
      c.breakdown.teams.hours += item.durationHours || 0.1;
    } else if (type.includes('meeting')) {
      c.breakdown.meeting.count++;
      c.breakdown.meeting.hours += item.durationHours || 0.1;
    } else if (type.includes('call')) {
      c.breakdown.call.count++;
      c.breakdown.call.hours += item.durationHours || 0.1;
    }
  });

  const clients = Object.values(clientMap)
    .map(c => ({ ...c, totalHours: parseFloat(c.totalHours.toFixed(1)) }))
    .sort((a, b) => b.totalHours - a.totalHours);

  res.json({ clients, totalClients: clients.length });
});

router.get('/clients/:name', requireAuth, (req, res) => {
  const items = req.session.billingItems || [];
  const clientName = decodeURIComponent(req.params.name);
  const clientItems = items.filter(item => item.client === clientName);
  res.json({ client: clientName, items: clientItems, total: clientItems.length });
});

module.exports = router;
