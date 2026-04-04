const OpenAI = require('openai');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const fs = require('fs');
const path = require('path');
const { matchSubfolderToClient } = require('./rmkey');
dayjs.extend(utc);
dayjs.extend(timezone);

// Load domain-to-client mapping (legacy, kept for backward compat)
function getClientDomainMap() {
  try {
    const filePath = path.join(__dirname, '..', 'client-domains.json');
    const raw = fs.readFileSync(filePath, 'utf-8');
    const map = JSON.parse(raw);
    delete map._comment;
    return map;
  } catch {
    return {};
  }
}

function matchClientByDomain(emailAddress) {
  if (!emailAddress) return '';
  const domain = emailAddress.split('@')[1]?.toLowerCase();
  if (!domain) return '';
  const map = getClientDomainMap();
  return map[domain] || '';
}

let openaiClient = null;
function getOpenAI() {
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

function roundToTenthHour(minutes) {
  return Math.ceil(minutes / 6) / 10;
}

function getDurationMinutes(start, end) {
  return Math.round((new Date(end) - new Date(start)) / 60000);
}

function formatEntry(entry) {
  const start = dayjs(entry.startTime).tz('America/New_York');
  const end = dayjs(entry.endTime).tz('America/New_York');
  const durationMins = getDurationMinutes(entry.startTime, entry.endTime);
  return {
    ...entry,
    date: start.format('MM/DD/YYYY'),
    startFormatted: start.format('h:mm A'),
    endFormatted: end.format('h:mm A'),
    durationHours: roundToTenthHour(durationMins),
    durationMinutes: durationMins
  };
}

/**
 * Apply RM Key client mapping to billing items.
 * Uses the subfolder name (item.folderName / rawClient) to look up
 * Matter-Key and Rate from the RM Key data.
 * Items that don't match get flagged as UNKNOWN.
 */
function applyRMKeyMapping(items, rmKeyData) {
  if (!rmKeyData) return items;

  return items.map(item => {
    // The subfolder name is stored in rawClient (set during emailsToBillingItems)
    const subfolderName = item.folderName || item.rawClient || '';
    const match = matchSubfolderToClient(subfolderName, rmKeyData);

    if (match) {
      return {
        ...item,
        client: match.clientName,
        matterKey: match.matterKey,
        rate: match.rate,
        rmKeyMatched: true,
      };
    }

    // No match — keep original rawClient or mark unknown
    return {
      ...item,
      client: subfolderName || item.rawClient || 'UNKNOWN - No RM Key match',
      matterKey: null,
      rate: null,
      rmKeyMatched: false,
    };
  });
}

/**
 * Extract billing descriptions using AI.
 * When rmKeyData is provided, AI only generates descriptions (client is already known).
 * When rmKeyData is null, AI also extracts client names (legacy behavior).
 */
async function extractBillingInfo(items, onProgress = null, rmKeyData = null) {
  if (!items.length) return [];
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'PASTE_YOUR_OPENAI_KEY_HERE') {
    const result = items.map(item => ({
      ...item,
      client: item.client || item.rawClient || 'UNKNOWN - Please fill in',
      activityDescription: item.rawDescription || `Email correspondence re: ${item.subject || 'Review and fill in'}`
    }));
    if (onProgress) onProgress(items.length, items.length, result);
    return result;
  }

  const openai = getOpenAI();
  const results = [];
  const batchSize = 10;
  const clientAlreadyMapped = !!rmKeyData;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    let prompt;
    if (clientAlreadyMapped) {
      // Client is already known from subfolder → RM Key mapping.
      // AI only needs to generate the billing description.
      prompt = `You are a legal billing assistant. Generate concise billing activity descriptions for these communications.

For each item, create a professional billing description like:
- "Email correspondence re: regulatory strategy"
- "Teams message re: FDA submission timeline"
- "Phone conference re: clinical trial protocol"
- "Meeting re: quarterly review and compliance updates"

Items:
${batch.map((item, idx) => `[${idx}] Type: ${item.type} | Client: ${item.client} | Subject: ${item.subject || 'N/A'} | From/With: ${item.participants || 'N/A'}`).join('\n')}

Respond ONLY with a JSON array: [{"index": N, "activityDescription": "..."}]`;
    } else {
      // Legacy mode: AI extracts both client and description
      prompt = `You are a legal billing assistant. Extract billing information from these communications.

For each item identify:
1. CLIENT NAME: The client/company being served. If unclear use "UNKNOWN".
2. ACTIVITY DESCRIPTION: Concise billing description e.g. "Email correspondence re: regulatory strategy"

Items:
${batch.map((item, idx) => `[${idx}] Type: ${item.type} | Subject: ${item.subject || 'N/A'} | From/With: ${item.participants || 'N/A'} | Folder/Client: ${item.rawClient || 'N/A'}`).join('\n')}

Respond ONLY with a JSON array: [{"index": N, "client": "...", "activityDescription": "..."}]`;
    }

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      });
      const text = response.choices[0].message.content.trim().replace(/```json|```/g, '');
      const parsed = JSON.parse(text);
      parsed.forEach(({ index, client, activityDescription }) => {
        if (batch[index]) {
          if (!clientAlreadyMapped && client) {
            batch[index].client = client;
          }
          if (activityDescription) {
            batch[index].activityDescription = activityDescription;
          }
        }
      });
    } catch (err) {
      console.error('AI extraction error:', err.message);
      batch.forEach(item => {
        if (!item.client) item.client = 'UNKNOWN - Please fill in';
        if (!item.activityDescription) item.activityDescription = item.subject || 'Review and fill in';
      });
    }
    results.push(...batch);
    if (onProgress) onProgress(results.length, items.length, batch);
  }
  return results;
}

function emailsToBillingItems(emails) {
  return emails.map(email => ({
    id: `email-${email.id}`,
    sourceId: email.id,
    type: 'Email',
    source: 'Outlook',
    subject: email.subject,
    participants: email.from?.emailAddress?.address || '',
    toRecipients: (email.toRecipients || []).map(r => r.emailAddress?.address).filter(Boolean).join(', '),
    ccRecipients: (email.ccRecipients || []).map(r => r.emailAddress?.address).filter(Boolean).join(', '),
    bodyPreview: email.bodyPreview,
    conversationId: email.conversationId,
    importance: email.importance,
    hasAttachments: email.hasAttachments,
    startTime: email.receivedDateTime,
    endTime: dayjs(email.receivedDateTime).add(6, 'minute').toISOString(),
    folderName: email.folderName || '',
    rawClient: matchClientByDomain(email.from?.emailAddress?.address) || email.folderName || '',
    rawDescription: ''
  }));
}

function eventsToBillingItems(events) {
  return events.map(event => ({
    id: `event-${event.id || Math.random()}`,
    sourceId: event.id,
    type: event.isOnlineMeeting ? 'Teams Meeting' : 'Meeting',
    source: event.isOnlineMeeting ? 'Teams' : 'Calendar',
    subject: event.subject,
    participants: (event.attendees || []).map(a => a.emailAddress?.address).filter(Boolean).join(', '),
    bodyPreview: event.bodyPreview,
    location: event.location?.displayName || '',
    organizer: event.organizer?.emailAddress?.address || '',
    isOnlineMeeting: event.isOnlineMeeting,
    startTime: event.start?.dateTime ? event.start.dateTime + 'Z' : event.start?.dateTime,
    endTime: event.end?.dateTime ? event.end.dateTime + 'Z' : event.end?.dateTime,
    rawClient: '',
    rawDescription: ''
  }));
}

function teamsMessagesToBillingItems(messages) {
  return messages.map((msg, idx) => ({
    id: `teams-${msg.id || idx}`,
    sourceId: msg.id,
    chatId: msg.chatId,
    type: 'Teams Message',
    source: 'Teams',
    subject: `Teams: ${msg.chatTopic || 'Chat'}`,
    chatTopic: msg.chatTopic || 'Chat',
    chatType: msg.chatType,
    participants: msg.from?.user?.displayName || '',
    bodyPreview: msg.body?.content?.replace(/<[^>]*>/g, '').substring(0, 200) || '',
    startTime: msg.createdDateTime,
    endTime: dayjs(msg.createdDateTime).add(6, 'minute').toISOString(),
    rawClient: '',
    rawDescription: ''
  }));
}

function callLogsToBillingItems(rows) {
  return rows
    .filter(row => {
      return row && Object.keys(row).some(k =>
        k.toLowerCase().includes('date') || k.toLowerCase().includes('time')
      );
    })
    .map((row, idx) => {
      const dateVal = row['Date'] || row['date'] || row['Call Date'] || '';
      const timeVal = row['Time'] || row['time'] || row['Call Time'] || '12:00 AM';
      let durationSeconds = 60;
      const minutesRaw = row['Minutes'] || row['minutes'] || row['Duration (min)'] || '';
      const secondsRaw = row['Duration (seconds)'] || row['Duration'] || row['duration'] || '';
      if (minutesRaw !== '') {
        durationSeconds = Math.round(parseFloat(minutesRaw) * 60) || 60;
      } else if (secondsRaw !== '') {
        durationSeconds = parseInt(secondsRaw) || 60;
      }
      const number = row['Number'] || row['Called Number'] || row['Originating Number'] || row['Phone Number'] || '';
      const description = row['Description'] || row['Contact'] || row['Name'] || row['name'] || '';
      const callType = row['Call Type'] || row['Type'] || row['Feature'] || 'Voice Call';
      const typeStr = callType.toString().toLowerCase();
      if (typeStr.includes('data') || typeStr.includes('sms') || typeStr.includes('text') || typeStr.includes('mms')) {
        return null;
      }
      let startTime;
      try {
        startTime = new Date(`${dateVal} ${timeVal}`).toISOString();
        if (isNaN(new Date(startTime).getTime())) throw new Error();
      } catch {
        startTime = new Date().toISOString();
      }
      return {
        id: `call-${idx}`,
        type: 'Phone Call',
        source: 'AT&T',
        subject: `Call with ${description || number || 'Unknown'}`,
        participants: description || number || '',
        bodyPreview: `${callType} · ${(durationSeconds / 60).toFixed(1)} min`,
        startTime,
        endTime: dayjs(startTime).add(durationSeconds, 'second').toISOString(),
        rawClient: '',
        rawDescription: ''
      };
    })
    .filter(Boolean);
}

/**
 * Detect potential duplicate entries between calendar meetings and emails.
 * Flags items with possibleDuplicate, duplicateGroupId, duplicateReason.
 */
function detectDuplicates(items) {
  const meetings = items.filter(i => i.type === 'Meeting' || i.type === 'Teams Meeting');
  const emails = items.filter(i => i.type === 'Email');

  if (!meetings.length || !emails.length) return items;

  let groupCounter = 0;

  function normalizeSubject(s) {
    return (s || '').toLowerCase().replace(/^(re:|fw:|fwd:)\s*/gi, '').trim();
  }

  function subjectMatch(a, b) {
    const na = normalizeSubject(a);
    const nb = normalizeSubject(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (na.includes(nb) || nb.includes(na)) return true;
    // Check significant word overlap (3+ char words)
    const wordsA = na.split(/\s+/).filter(w => w.length > 2);
    const wordsB = nb.split(/\s+/).filter(w => w.length > 2);
    const overlap = wordsA.filter(w => wordsB.includes(w)).length;
    return overlap >= 2 && overlap >= Math.min(wordsA.length, wordsB.length) * 0.5;
  }

  function getDateKey(item) {
    return dayjs(item.startTime).tz('America/New_York').format('YYYY-MM-DD');
  }

  // Build date index for emails
  const emailsByDate = {};
  emails.forEach(e => {
    const dk = getDateKey(e);
    if (!emailsByDate[dk]) emailsByDate[dk] = [];
    emailsByDate[dk].push(e);
  });

  // For each meeting, find matching emails on same date with similar subject
  meetings.forEach(meeting => {
    const dk = getDateKey(meeting);
    const candidates = emailsByDate[dk] || [];
    for (const email of candidates) {
      if (subjectMatch(meeting.subject, email.subject)) {
        groupCounter++;
        const gid = `dup-${groupCounter}`;
        meeting.possibleDuplicate = true;
        meeting.duplicateGroupId = meeting.duplicateGroupId || gid;
        meeting.duplicateReason = 'Calendar event matches email on same date';
        email.possibleDuplicate = true;
        email.duplicateGroupId = email.duplicateGroupId || gid;
        email.duplicateReason = 'Email matches calendar event on same date';
      }
    }
  });

  return items;
}

module.exports = {
  extractBillingInfo,
  applyRMKeyMapping,
  detectDuplicates,
  emailsToBillingItems,
  eventsToBillingItems,
  teamsMessagesToBillingItems,
  callLogsToBillingItems,
  formatEntry,
  roundToTenthHour
};
