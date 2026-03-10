# ⚖️ Billing Tracker — Rocket Matter Export

Automatically pulls Outlook emails, Teams meetings, and iPhone call logs,
then exports a Rocket Matter-ready CSV with .1 hour billing increments.

---

## 🚀 SETUP (5 minutes)

### Step 1 — Add your credentials to `.env`

Open the `.env` file and fill in:

```
CLIENT_ID=     ← From Azure App Registration
TENANT_ID=     ← From Azure App Registration  
CLIENT_SECRET= ← From Azure App Registration (the Value, not the ID)
OPENAI_API_KEY=← From https://platform.openai.com/api-keys
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

1. **Sign in** with the Microsoft 365 / GoDaddy account
2. **Select a date range** (or click "This Month")
3. **Click "Pull Outlook + Teams"** — emails and meetings auto-load
4. **Upload iPhone call log** (CSV from iMazing) if needed
5. **Review entries** — click any row to edit client name or description
6. **Export CSV** — click "Export Rocket Matter CSV" to download

---

## 📞 AT&T Call Log Export

1. Log in to **myAT&T** at https://www.att.com/my/#/
2. Go to **My Usage** → **View Bill** or **Usage Details**
3. Select the billing period / date range
4. Click **Export** or **Download** → choose **CSV**
5. Upload that CSV in the app — it handles AT&T's format automatically

The parser automatically skips data sessions and SMS rows, keeping only voice calls.

---

## 📊 Rocket Matter CSV Columns

| Column | Description |
|--------|-------------|
| Client | AI-extracted or manually entered client name |
| Date | MM/DD/YYYY |
| Start Time | e.g. 9:00 AM |
| End Time | e.g. 9:06 AM |
| Duration (Hours) | Rounded UP to nearest 0.1 hour (6 min increments) |
| Activity Description | AI-generated billing description |
| Type | Email / Teams Meeting / Phone Call |
| Source | Outlook / Teams / iPhone |

---

## ⚠️ Troubleshooting

**"Not authenticated" error** → Make sure Azure redirect URI is exactly `http://localhost:3000/auth/callback`

**No Teams meetings showing** → Make sure `OnlineMeetings.Read` permission was granted in Azure

**CallRecords not available** → This requires admin consent in Azure. Calendar events (Teams meetings) still work without it.

**GoDaddy account issues** → When logging into portal.azure.com, use your full Microsoft email (the one you use for Outlook/Teams)
