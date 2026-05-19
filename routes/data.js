const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { getEmails, getEmailsFromSubfolders, getInboxSubfolders, getMailboxOverview, getCalendarEvents, getCallRecords, getTeamsMessages, getEmailBody } = require('../utils/graph');
const { parseRMKey, matchSubfolderToClient } = require('../utils/rmkey');
const {
  extractBillingInfo,
  applyRMKeyMapping,
  detectDuplicates,
  emailsToBillingItems,
  eventsToBillingItems,
  teamsMessagesToBillingItems,
  callLogsToBillingItems,
  formatEntry,
  applyInternalFilter,
  applyMeetingInviteFilter,
  consolidateEmails
} = require('../utils/billing');

const upload = multer({ storage: multer.memoryStorage() });

function requireAuth(req, res, next) {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated. Please log in first.' });
  }
  next();
}

// ─── RM KEY MANAGEMENT ───

/**
 * Upload and parse RM Key Excel file.
 * Stores parsed data in session for use during fetch & export.
 */
router.post('/rmkey/upload', requireAuth, upload.single('rmkey'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const rmKeyData = await parseRMKey(req.file.buffer);
    req.session.rmKeyData = rmKeyData;
    req.session.rmKeyFileName = req.file.originalname;
    res.json({
      success: true,
      clientCount: rmKeyData.clients.length,
      clients: rmKeyData.clients.map(c => ({
        clientName: c.clientName,
        matterKey: c.matterKey,
        rate: c.rate
      }))
    });
  } catch (err) {
    console.error('RM Key parse error:', err);
    res.status(500).json({ error: 'Failed to parse RM Key file: ' + err.message });
  }
});

/**
 * Get current RM Key status and data.
 */
router.get('/rmkey', requireAuth, (req, res) => {
  const rmKeyData = req.session.rmKeyData;
  if (!rmKeyData) {
    return res.json({ loaded: false });
  }
  res.json({
    loaded: true,
    fileName: req.session.rmKeyFileName || 'Unknown',
    clientCount: rmKeyData.clients.length,
    clients: rmKeyData.clients.map(c => ({
      clientName: c.clientName,
      matterKey: c.matterKey,
      rate: c.rate
    }))
  });
});

/**
 * Clear RM Key data from session.
 */
router.delete('/rmkey', requireAuth, (req, res) => {
  req.session.rmKeyData = null;
  req.session.rmKeyFileName = null;
  res.json({ success: true });
});

// ─── MAILBOX OVERVIEW ───

router.get('/mailbox-overview', requireAuth, async (req, res) => {
  try {
    const token = req.session.accessToken;
    const overview = await getMailboxOverview(token);
    res.json(overview);
  } catch (err) {
    console.error('Mailbox overview error:', err);
    res.status(500).json({ error: 'Failed to fetch mailbox overview: ' + err.message });
  }
});

// ─── MANUAL RM KEY ───

router.post('/rmkey/manual', requireAuth, express.json(), (req, res) => {
  const { clients } = req.body;
  if (!Array.isArray(clients)) {
    return res.status(400).json({ error: 'clients must be an array' });
  }
  const { normalize } = require('../utils/rmkey');
  const filteredClients = clients.filter(c => c.clientName && c.clientName.trim()).map(c => ({
    clientName: c.clientName.trim(),
    matterKey: (c.matterKey || '').trim(),
    rate: parseFloat(c.rate) || 0,
  }));
  const exactMap = {};
  const normalizedMap = {};
  filteredClients.forEach(c => {
    exactMap[c.clientName] = c;
    normalizedMap[normalize(c.clientName)] = c;
  });
  const rmKeyData = { clients: filteredClients, exactMap, normalizedMap };
  req.session.rmKeyData = rmKeyData;
  req.session.rmKeyFileName = 'Manual Entry';
  res.json({
    success: true,
    clientCount: rmKeyData.clients.length,
    clients: rmKeyData.clients,
  });
});

// ─── INBOX SUBFOLDERS ───

/**
 * List all Inbox subfolders (client folders) and show RM Key match status.
 */
router.get('/subfolders', requireAuth, async (req, res) => {
  try {
    const token = req.session.accessToken;
    const subfolders = await getInboxSubfolders(token);
    const rmKeyData = req.session.rmKeyData;

    const result = subfolders.map(f => {
      const match = rmKeyData ? matchSubfolderToClient(f.displayName, rmKeyData) : null;
      return {
        id: f.id,
        displayName: f.displayName,
        totalItemCount: f.totalItemCount,
        matched: !!match,
        matchedClient: match?.clientName || null,
        matterKey: match?.matterKey || null,
        rate: match?.rate || null,
      };
    });

    res.json({
      subfolders: result,
      total: result.length,
      matched: result.filter(r => r.matched).length,
      unmatched: result.filter(r => !r.matched).length,
    });
  } catch (err) {
    console.error('Subfolder fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch subfolders: ' + err.message });
  }
});

// ─── MAIN FETCH (MODIFIED FOR SUBFOLDER FLOW) ───

router.post('/fetch', requireAuth, async (req, res) => {
  const { startDate, endDate, emailLimit, chatLimit, messagesPerChat, selectedFolders } = req.body;
  // Default ON: combine same-day same-subject email into one entry.
  const consolidate = req.body.groupEmailsByThread !== false;
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' });
  }

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const token = req.session.accessToken;
    const rmKeyData = req.session.rmKeyData || null;

    const sendEvent = (eventData) => {
      res.write(`data: ${JSON.stringify(eventData)}\n\n`);
    };

    // ── Phase 1: Fetch from sources ──
    sendEvent({ type: 'progress', message: 'Fetching emails from Inbox subfolders...', percent: 10, phase: 'fetch', source: 'emails' });

    // Use new subfolder-based fetch
    const { emails, subfolders } = await getEmailsFromSubfolders(
      token, startDate, endDate,
      emailLimit || 250,
      selectedFolders || null  // null = all subfolders
    );
    sendEvent({
      type: 'source-done',
      source: 'emails',
      count: emails.length,
      message: `Found ${emails.length} emails from ${subfolders.length} subfolders`,
      percent: 25,
      subfolderCount: subfolders.length
    });

    sendEvent({ type: 'progress', message: 'Fetching calendar & Teams meetings...', percent: 30, phase: 'fetch', source: 'meetings' });
    const events = await getCalendarEvents(token, startDate, endDate);
    sendEvent({ type: 'source-done', source: 'meetings', count: events.length, message: `Found ${events.length} meetings`, percent: 40 });

    sendEvent({ type: 'progress', message: 'Fetching Teams chat messages...', percent: 45, phase: 'fetch', source: 'teams' });
    const teamsMessages = await getTeamsMessages(token, startDate, endDate, chatLimit || 50, messagesPerChat || 50);
    sendEvent({ type: 'source-done', source: 'teams', count: teamsMessages.length, message: `Found ${teamsMessages.length} Teams messages`, percent: 55 });

    sendEvent({ type: 'progress', message: 'Checking call records...', percent: 58, phase: 'fetch', source: 'calls' });
    const callRecords = await getCallRecords(token, startDate, endDate);
    sendEvent({ type: 'source-done', source: 'calls', count: callRecords.length, message: `Found ${callRecords.length} call records`, percent: 62 });

    // ── Phase 2: Convert to billing items ──
    let allItems = [
      ...emailsToBillingItems(emails),
      ...eventsToBillingItems(events),
      ...teamsMessagesToBillingItems(teamsMessages),
    ];

    // ── Phase 2.5: Apply RM Key mapping (subfolder name → client) ──
    if (rmKeyData) {
      sendEvent({ type: 'progress', message: 'Mapping subfolders to RM Key clients...', percent: 63, phase: 'mapping' });
      allItems = applyRMKeyMapping(allItems, rmKeyData);
      const matched = allItems.filter(i => i.rmKeyMatched).length;
      const unmatched = allItems.filter(i => !i.rmKeyMatched).length;
      sendEvent({
        type: 'progress',
        message: `RM Key: ${matched} matched, ${unmatched} unmatched`,
        percent: 64,
        phase: 'mapping'
      });
    }

    // ── Phase 2.6: Non-destructive filters + consolidation ──
    // Items are flagged (billingExcluded / consolidatedInto), never dropped,
    // so everything stays visible in the UI and is reversible before export.
    sendEvent({ type: 'progress', message: 'Filtering internal & meeting email...', percent: 64, phase: 'filter' });
    allItems = applyInternalFilter(allItems, req.session.internalAddresses);
    allItems = applyMeetingInviteFilter(allItems);
    const excludedCount = allItems.filter(i => i.billingExcluded).length;

    if (consolidate) {
      allItems = consolidateEmails(allItems);
      const combinedCount = allItems.filter(i => i.isConsolidated).length;
      sendEvent({
        type: 'progress',
        message: `${excludedCount} flagged non-billable; ${combinedCount} combined email entries`,
        percent: 64,
        phase: 'filter'
      });
    } else {
      sendEvent({ type: 'progress', message: `${excludedCount} flagged non-billable`, percent: 64, phase: 'filter' });
    }

    const totalItems = allItems.length;
    sendEvent({ type: 'progress', message: `Processing ${totalItems} items with AI (descriptions only)...`, percent: 65, phase: 'ai', totalItems });

    // ── Phase 3: AI extraction (descriptions only when RM Key is loaded) ──
    allItems = await extractBillingInfo(allItems, (processed, total, batchItems) => {
      const aiPct = 65 + Math.round((processed / total) * 30);
      const formattedBatch = batchItems.map(formatEntry);
      sendEvent({
        type: 'ai-batch',
        processed,
        total,
        percent: aiPct,
        message: `AI processing: ${processed}/${total} items`,
        items: formattedBatch
      });
    }, rmKeyData);

    allItems = allItems.map(formatEntry);

    // ── Phase 4: Detect potential duplicates ──
    allItems = detectDuplicates(allItems);

    // Store data for drill-downs and export
    req.session.rawData = { emails, events, teamsMessages, callRecords };
    req.session.billingItems = allItems;

    sendEvent({ type: 'progress', message: 'Done!', percent: 100, phase: 'done' });
    sendEvent({
      type: 'complete',
      items: allItems,
      count: allItems.length,
      rmKeyLoaded: !!rmKeyData,
    });
    res.end();

  } catch (err) {
    console.error('Fetch error:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

// ─── CALL LOG UPLOAD ───

router.post('/upload-calls', requireAuth, upload.single('calllog'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const csvText = req.file.buffer.toString('utf-8');
    const rows = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });
    let items = callLogsToBillingItems(rows);

    const rmKeyData = req.session.rmKeyData || null;
    if (rmKeyData) {
      items = applyRMKeyMapping(items, rmKeyData);
    }

    items = await extractBillingInfo(items, null, rmKeyData);
    items = items.map(formatEntry);
    const existing = req.session.billingItems || [];
    req.session.billingItems = [...existing, ...items];

    if (!req.session.rawData) req.session.rawData = {};
    req.session.rawData.uploadedCalls = rows;

    res.json({ success: true, added: items.length, total: req.session.billingItems.length, items });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Failed to parse call log: ' + err.message });
  }
});

// ─── CRUD ENDPOINTS ───

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
  const grouped = {};
  messages.forEach(msg => {
    const chatId = msg.chatId || 'unknown';
    if (!grouped[chatId]) {
      grouped[chatId] = { chatId, topic: msg.chatTopic || 'Teams Chat', chatType: msg.chatType, messages: [] };
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
        matterKey: item.matterKey || null,
        rate: item.rate || null,
        totalEntries: 0,
        totalHours: 0,
        breakdown: { email: { count: 0, hours: 0 }, teams: { count: 0, hours: 0 }, meeting: { count: 0, hours: 0 }, call: { count: 0, hours: 0 } }
      };
    }

    const c = clientMap[client];
    c.totalEntries++;
    c.totalHours += item.durationHours || 0.1;

    const type = (item.type || '').toLowerCase();
    if (type.includes('email')) { c.breakdown.email.count++; c.breakdown.email.hours += item.durationHours || 0.1; }
    else if (type.includes('teams message')) { c.breakdown.teams.count++; c.breakdown.teams.hours += item.durationHours || 0.1; }
    else if (type.includes('meeting')) { c.breakdown.meeting.count++; c.breakdown.meeting.hours += item.durationHours || 0.1; }
    else if (type.includes('call')) { c.breakdown.call.count++; c.breakdown.call.hours += item.durationHours || 0.1; }
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
