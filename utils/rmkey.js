/**
 * RM Key Parser
 * Loads the RM Key Excel file (Client Name → Matter-Key + Rate)
 * and matches Outlook subfolder names to client records.
 */
const ExcelJS = require('exceljs');

/**
 * Parse the RM Key Excel buffer into a lookup map.
 * Returns: { clientName: { matterKey, rate, clientName } }
 * Also builds a normalized lookup for fuzzy matching.
 */
async function parseRMKey(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('No worksheet found in RM Key file');

  const clients = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    const clientName = row.getCell(1).value?.toString().trim();
    const matterKey = row.getCell(2).value;
    const rate = row.getCell(3).value;
    if (clientName && matterKey != null) {
      clients.push({
        clientName,
        matterKey: typeof matterKey === 'number' ? matterKey : parseInt(matterKey) || 0,
        rate: typeof rate === 'number' ? rate : parseFloat(rate) || 0,
      });
    }
  });

  // Build lookup maps
  const exactMap = {};        // exact client name → record
  const normalizedMap = {};   // normalized name → record (for fuzzy matching)

  clients.forEach(c => {
    exactMap[c.clientName] = c;
    normalizedMap[normalize(c.clientName)] = c;
  });

  return { clients, exactMap, normalizedMap };
}

/**
 * Normalize a string for fuzzy matching:
 * lowercase, strip punctuation, collapse whitespace
 */
function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[.,\-_'"()&!]/g, '')
    .replace(/\b(llc|inc|ltd|corp|co|the|and)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Match a subfolder name to an RM Key client.
 * Tries exact match first, then normalized match,
 * then checks if one contains the other.
 * Returns the matched client record or null.
 */
function matchSubfolderToClient(subfolderName, rmKeyData) {
  if (!rmKeyData || !subfolderName) return null;

  // 1. Exact match
  if (rmKeyData.exactMap[subfolderName]) {
    return rmKeyData.exactMap[subfolderName];
  }

  // 2. Normalized match
  const normFolder = normalize(subfolderName);
  if (rmKeyData.normalizedMap[normFolder]) {
    return rmKeyData.normalizedMap[normFolder];
  }

  // 3. Substring/contains match (subfolder name within client name or vice versa)
  for (const client of rmKeyData.clients) {
    const normClient = normalize(client.clientName);
    if (normClient.includes(normFolder) || normFolder.includes(normClient)) {
      return client;
    }
  }

  // 4. Word overlap match — if 2+ significant words match
  const folderWords = normFolder.split(' ').filter(w => w.length > 2);
  let bestMatch = null;
  let bestOverlap = 0;

  for (const client of rmKeyData.clients) {
    const clientWords = normalize(client.clientName).split(' ').filter(w => w.length > 2);
    const overlap = folderWords.filter(w => clientWords.includes(w)).length;
    if (overlap >= 2 && overlap > bestOverlap) {
      bestOverlap = overlap;
      bestMatch = client;
    }
  }

  return bestMatch;
}

module.exports = { parseRMKey, matchSubfolderToClient, normalize };
