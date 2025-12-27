# SYRUS - Netlify Deployment

## Setup

1. **Push to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial SYRUS deployment"
   git remote add origin YOUR_REPO_URL
   git push -u origin main
   ```

2. **Connect to Netlify**
   - Go to [netlify.com](https://netlify.com)
   - Click "Add new site" > "Import an existing project"
   - Connect your GitHub repo
   - Build settings are auto-detected from `netlify.toml`

3. **Set Environment Variable**
   - Go to Site Settings > Environment Variables
   - Add: `ANTHROPIC_API_KEY` = your Claude API key
   - Redeploy after adding

## Structure

```
syrus-netlify/
├── netlify.toml           # Netlify config
├── public/
│   └── index.html         # Frontend (no sensitive data)
└── netlify/functions/
    └── syrus.js           # Backend (API key, codes, prompt)
```

## Security

**Hidden from users (server-side only):**
- Your Anthropic API key
- All beta/operator codes
- The full SYRUS prompt
- Code validation logic

**Users can only see:**
- The frontend UI
- Their own localStorage (sessions, token count)

## Codes

**Beta Codes (one-time use, 300 tokens):**
- SYRUS-EARLY-7X9
- MIDNIGHT-TEST-042
- SIGNAL-ACCESS-118
- CORE-PREVIEW-333
- PHANTOM-ENTRY-901

**Operator Codes (unlimited, reusable):**
- SYRUS-ALPHA-9X7
- MIDNIGHT-CTRL-001
- OPERATOR-OVERRIDE

Edit codes in `netlify/functions/syrus.js`

## ⚠️ Note on Code Persistence

The current setup stores used beta codes in-memory. This means:
- Codes reset when the function cold-starts (after ~15min inactivity)
- For true one-time codes, integrate a database (Supabase, Firebase, Netlify Blobs)

## Local Testing

```bash
npm install -g netlify-cli
netlify dev
```

Then visit `http://localhost:8888`
