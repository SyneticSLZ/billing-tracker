const axios = require('axios');
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

async function graphGet(token, endpoint, params = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${GRAPH_BASE}${endpoint}`;
  const config = { headers: { Authorization: `Bearer ${token}` } };
  if (!endpoint.startsWith('http')) config.params = params;
  const response = await axios.get(url, config);
  return response.data;
}

/**
 * Get all subfolders of the Inbox.
 * These subfolders are the client folders — each subfolder name = client name.
 */
async function getInboxSubfolders(token) {
  // First, get the Inbox folder ID
  const inboxData = await graphGet(token, '/me/mailFolders/Inbox');
  const inboxId = inboxData.id;

  // Then get its child folders
  const children = await graphGet(token, `/me/mailFolders/${inboxId}/childFolders`, {
    $top: 100,
    $select: 'id,displayName,totalItemCount,unreadItemCount'
  });

  const subfolders = (children.value || []).map(folder => ({
    id: folder.id,
    displayName: folder.displayName,
    totalItemCount: folder.totalItemCount || 0,
    unreadItemCount: folder.unreadItemCount || 0,
  }));

  console.log(`  📁 Found ${subfolders.length} Inbox subfolders:`);
  subfolders.forEach(f => console.log(`     - ${f.displayName} (${f.totalItemCount} items)`));
  return subfolders;
}

/**
 * Fetch emails from specific Inbox subfolders.
 * Each email is tagged with the subfolder name (= client name).
 */
async function getEmailsFromSubfolders(token, startDate, endDate, limit = 250, folderFilter = null) {
  const subfolders = await getInboxSubfolders(token);

  // Optionally filter to specific subfolder names
  const foldersToFetch = folderFilter
    ? subfolders.filter(f => folderFilter.includes(f.displayName))
    : subfolders;

  if (foldersToFetch.length === 0) {
    console.log('  ⚠️ No matching Inbox subfolders found');
    return { emails: [], subfolders };
  }

  const allEmails = [];
  const filter = `receivedDateTime ge ${startDate}T00:00:00Z and receivedDateTime le ${endDate}T23:59:59Z`;
  const select = 'id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,conversationId,importance,hasAttachments';
  // PidTagMessageClass (tag 0x001A) distinguishes meeting requests/responses
  // (IPM.Schedule.Meeting.*) from regular mail. Locale-independent, unlike
  // subject prefixes. Some tenants reject this $expand — we degrade gracefully.
  const MSG_CLASS_PROP = "singleValueExtendedProperties($filter=id eq 'String 0x001A')";
  let expandSupported = true;

  for (const folder of foldersToFetch) {
    // Lift the MAPI message class onto a flat `messageClass` field and tag
    // each email with its subfolder (= client) name.
    const tagEmail = (email) => {
      const ext = (email.singleValueExtendedProperties || [])
        .find(p => (p.id || '').toLowerCase().includes('0x001a'));
      return {
        ...email,
        messageClass: ext ? ext.value : (email.messageClass || ''),
        folderName: folder.displayName,  // This IS the client name
        folderId: folder.id,
      };
    };

    try {
      let nextLink = null;
      const baseParams = {
        $filter: filter,
        $select: select,
        $top: 100,
        $orderby: 'receivedDateTime desc'
      };
      let initialData;
      try {
        initialData = await graphGet(token, `/me/mailFolders/${folder.id}/messages`,
          expandSupported ? { ...baseParams, $expand: MSG_CLASS_PROP } : baseParams);
      } catch (expandErr) {
        if (expandSupported) {
          console.warn(`  ⚠️ messageClass $expand rejected — falling back to subject heuristic:`, expandErr.message);
          expandSupported = false;
          initialData = await graphGet(token, `/me/mailFolders/${folder.id}/messages`, baseParams);
        } else {
          throw expandErr;
        }
      }

      const folderEmails = (initialData.value || []).map(tagEmail);
      allEmails.push(...folderEmails);
      nextLink = initialData['@odata.nextLink'] || null;

      // Paginate within folder
      while (nextLink && allEmails.length < limit) {
        const data = await graphGet(token, nextLink);
        const moreEmails = (data.value || []).map(tagEmail);
        allEmails.push(...moreEmails);
        nextLink = data['@odata.nextLink'] || null;
      }

      if (allEmails.length >= limit) break;
    } catch (err) {
      console.warn(`  ⚠️ Could not fetch emails from subfolder "${folder.displayName}":`, err.message);
    }
  }

  // Sort all emails by date descending and cap at limit
  allEmails.sort((a, b) => new Date(b.receivedDateTime) - new Date(a.receivedDateTime));
  return { emails: allEmails.slice(0, limit), subfolders };
}

/**
 * Legacy: get emails from all mail folder subfolders (original behavior).
 */
async function getEmails(token, startDate, endDate, limit = 250) {
  const result = await getEmailsFromSubfolders(token, startDate, endDate, limit);
  return result.emails;
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

/**
 * Get a full mailbox overview: Inbox total + all subfolders with counts.
 */
async function getMailboxOverview(token) {
  const inboxData = await graphGet(token, '/me/mailFolders/Inbox');
  const inboxId = inboxData.id;
  const inboxTotal = inboxData.totalItemCount || 0;

  const children = await graphGet(token, `/me/mailFolders/${inboxId}/childFolders`, {
    $top: 100,
    $select: 'id,displayName,totalItemCount,unreadItemCount'
  });

  const subfolders = (children.value || [])
    .map(folder => ({
      id: folder.id,
      displayName: folder.displayName,
      totalItemCount: folder.totalItemCount || 0,
      unreadItemCount: folder.unreadItemCount || 0,
    }))
    .sort((a, b) => b.totalItemCount - a.totalItemCount);

  return { inboxTotal, subfolders };
}

module.exports = {
  getEmails,
  getEmailsFromSubfolders,
  getInboxSubfolders,
  getMailboxOverview,
  getCalendarEvents,
  getCallRecords,
  getTeamsMessages,
  getEmailBody
};
