const OpenAI = require('openai');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const fs = require('fs');
const path = require('path');
dayjs.extend(utc);
dayjs.extend(timezone);

// Load domain-to-client mapping (hot-reloads on each call so edits take effect without restart)
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

async function extractBillingInfo(items, onProgress = null) {
  if (!items.length) return [];
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'PASTE_YOUR_OPENAI_KEY_HERE') {
    const result = items.map(item => ({
      ...item,
      client: item.rawClient || 'UNKNOWN - Please fill in',
      activityDescription: item.rawDescription || `Email correspondence re: ${item.subject || 'Review and fill in'}`
    }));
    if (onProgress) onProgress(items.length, items.length, result);
    return result;
  }

  const openai = getOpenAI();
  const results = [];
  const batchSize = 10;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const prompt = `You are a legal billing assistant. Extract billing information from these communications.

For each item identify:
1. CLIENT NAME: The client/company being served. If unclear use "UNKNOWN".
2. ACTIVITY DESCRIPTION: Concise billing description e.g. "Email correspondence re: regulatory strategy", "Teams message re: FDA submission", "Phone conference re: clinical trial protocol"

Items:
${batch.map((item, idx) => `[${idx}] Type: ${item.type} | Subject: ${item.subject || 'N/A'} | From/With: ${item.participants || 'N/A'} | Folder/Client: ${item.rawClient || 'N/A'}`).join('\n')}

Respond ONLY with a JSON array: [{"index": N, "client": "...", "activityDescription": "..."}]`;

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
          batch[index].client = client;
          batch[index].activityDescription = activityDescription;
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

module.exports = {
  extractBillingInfo,
  emailsToBillingItems,
  eventsToBillingItems,
  teamsMessagesToBillingItems,
  callLogsToBillingItems,
  formatEntry,
  roundToTenthHour
};
