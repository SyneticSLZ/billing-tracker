# ⚖️ Billing Tracker — Subfolder Client Mapping + NextGen Export

## 🆕 What's New (feature/subfolder-client-mapping)

### 1. RM Key Upload
Upload the **RM Key Excel file** (Client Name → Matter Key + Rate) before pulling data.
The app matches your Inbox subfolder names to RM Key clients automatically.

### 2. Subfolder-Based Client Mapping
Instead of relying on AI to guess client names, the app:
- Reads **Inbox subfolders** (each subfolder = a client)
- Matches subfolder names to RM Key entries using fuzzy matching
- Assigns **Matter-Key** and **Rate** automatically
- AI is only used for **activity descriptions** (not client names)

### 3. NextGen Financial Import XLSX Export
Export billing entries as a `.xlsx` file matching the **NextGen Financial Data Import Template**:
- **Time sheet** with all required columns
- Matter-Key, Client Name, Rate auto-populated from RM Key
- Date, Timekeeper-Name, Description, Billing-Type, Total-Billed-Hours filled in
- Ready for direct import into NextGen/CosmoLex

---

## 🚀 SETUP

### Step 1 — Add your credentials to `.env`

```
CLIENT_ID=     ← From Azure App Registration
TENANT_ID=     ← From Azure App Registration
CLIENT_SECRET= ← From Azure App Registration (the Value, not the ID)
OPENAI_API_KEY=← From https://platform.openai.com/api-keys
SESSION_SECRET=← Any random string
```

### Step 2 — Install dependencies

```bash
npm install
```

### Step 3 — Start the app

```bash
node server.js
```

### Step 4 — Open in browser

```
http://localhost:3000
```

---

## 📋 How to Use

1. **Sign in** with Microsoft 365
2. **Upload RM Key** — click "Upload RM Key Excel" on the dashboard
   - This maps Client Name → Matter Key + Rate
   - Green badges show matched Inbox subfolders
3. **Select a date range** and click **Pull Data**
   - Emails are fetched from Inbox subfolders
   - Each subfolder name is matched to the RM Key
   - AI generates billing descriptions only (client is already known)
4. **Review entries** — click any row to edit
5. **Export:**
   - **Export NextGen XLSX** — generates the Financial Import template
   - **Export CSV** — legacy Rocket Matter format

---

## 📊 NextGen XLSX Export Columns

| Column | Filled? | Source |
|--------|---------|--------|
| Time-Key | ○ | Blank |
| Matter-Key | ● | RM Key lookup |
| Client Name | ● | RM Key / subfolder |
| Matter Name | ○ | Blank |
| Date | ● | Email received date |
| Timekeeper-Name | ● | Settings (default: Mark Paxton) |
| Rate | ● | RM Key lookup |
| ActivityCode | ○ | Blank |
| TaskCode | ○ | Blank |
| Task-Name | ○ | Blank |
| Description | ● | AI-generated |
| Notes | ○ | Blank |
| Billing-Type | ● | "Billable" |
| Billed-Hours | ○ | Blank |
| Billed-Minutes | ○ | Blank |
| Total-Billed-Hours | ● | Rounded to 0.1h |
| Tax1 | ○ | Blank |
| Tax2 | ○ | Blank |
| Amount | ○ | Blank |

---

## 🔑 RM Key File Format

The RM Key Excel file should have 3 columns:

| Client Name | RM Matter Key | Rate |
|-------------|---------------|------|
| BHC Management, LLC | 14 | 450 |
| Denovo Biopharma | 7 | 450 |
| Entegrion | 1 | 150 |

---

## 📁 How Subfolder Matching Works

1. App reads all **child folders of your Inbox**
2. Each subfolder name is matched against the RM Key using:
   - Exact match first
   - Then normalized match (strips punctuation, LLC/Inc, etc.)
   - Then substring containment
   - Then word overlap (2+ significant words)
3. Matched entries get **Matter-Key** and **Rate** from the RM Key
4. Unmatched entries are flagged as "UNKNOWN - No RM Key match"

---

## 🔧 API Endpoints (New)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/rmkey/upload` | POST | Upload RM Key Excel file |
| `/api/rmkey` | GET | Get RM Key status and client list |
| `/api/rmkey` | DELETE | Clear RM Key data |
| `/api/subfolders` | GET | List Inbox subfolders with match status |
| `/export/xlsx` | GET | Download NextGen Financial Import XLSX |
| `/export/settings/timekeeper` | POST | Set default timekeeper name |
