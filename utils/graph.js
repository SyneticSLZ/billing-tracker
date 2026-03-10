const axios = require('axios');
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

async function graphGet(token, endpoint, params = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${GRAPH_BASE}${endpoint}`;
  const config = { headers: { Authorization: `Bearer ${token}` } };
  if (!endpoint.startsWith('http')) config.params = params;
  const response = await axios.get(url, config);
  return response.data;
}

async function getEmails(token, startDate, endDate, limit = 250) {
  const allEmails = [];
  let nextLink = null;
  const filter = `receivedDateTime ge ${startDate}T00:00:00Z and receivedDateTime le ${endDate}T23:59:59Z`;

  const initialData = await graphGet(token, '/me/messages', {
    $filter: filter,
    $select: 'id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,conversationId,importance,hasAttachments',
    $top: 100,
    $orderby: 'receivedDateTime desc'
  });

  allEmails.push(...(initialData.value || []));
  nextLink = initialData['@odata.nextLink'] || null;

  while (nextLink && allEmails.length < limit) {
    const data = await graphGet(token, nextLink);
    allEmails.push(...(data.value || []));
    nextLink = data['@odata.nextLink'] || null;
  }

  return allEmails.slice(0, limit);
}

async function getCalendarEvents(token, startDate, endDate) {
  try {
    const data = await graphGet(token, '/me/calendarView', {
      startDateTime: `${startDate}T00:00:00Z`,
      endDateTime: `${endDate}T23:59:59Z`,
      $select: 'subject,start,end,attendees,bodyPreview,isOnlineMeeting,organizer',
      $top: 100
    });
    return data.value || [];
  } catch (err) {
    console.warn('Calendar fetch failed:', err.response?.data?.error || err.message);
    return [];
  }
}

async function getCallRecords(token, startDate, endDate) {
  try {
    const data = await graphGet(token, '/communications/callRecords', {
      $filter: `startDateTime ge ${startDate}T00:00:00Z and startDateTime le ${endDate}T23:59:59Z`,
      $select: 'id,startDateTime,endDateTime,type,participants',
      $top: 50
    });
    return data.value || [];
  } catch (err) {
    console.warn('CallRecords not available:', err.message);
    return [];
  }
}

async function getTeamsMessages(token, startDate, endDate, chatLimit = 50, messagesPerChat = 50) {
  try {
    const chats = await graphGet(token, '/me/chats', {
      $select: 'id,topic,chatType',
      $top: chatLimit
    });

    const allMessages = [];

    for (const chat of (chats.value || [])) {
      try {
        const messages = await graphGet(token, `/me/chats/${chat.id}/messages`, {
          $top: messagesPerChat
        });
        for (const msg of (messages.value || [])) {
          const msgDate = msg.createdDateTime?.split('T')[0];
          if (msgDate >= startDate && msgDate <= endDate && msg.body?.content && msg.messageType === 'message') {
            allMessages.push({
              ...msg,
              chatId: chat.id,
              chatTopic: chat.topic || 'Teams Chat',
              chatType: chat.chatType
            });
          }
        }
      } catch (err) {
        // Skip chats we can't access
      }
    }

    console.log(`  ✅ Found ${allMessages.length} Teams messages`);
    return allMessages;
  } catch (err) {
    console.warn('Teams messages not available:', err.message);
    return [];
  }
}

async function getEmailBody(token, emailId) {
  try {
    const data = await graphGet(token, `/me/messages/${emailId}`, {
      $select: 'body'
    });
    return data.body || null;
  } catch (err) {
    console.warn('Could not fetch email body:', err.message);
    return null;
  }
}

module.exports = { getEmails, getCalendarEvents, getCallRecords, getTeamsMessages, getEmailBody };
