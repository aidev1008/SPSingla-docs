# SPSingla-docs — Project Notes for Claude

SP Singla Document Controller — a Node.js/Express web app that manages construction-business documents: FDRs (Fixed Deposit Receipts), Bank Guarantees (BG), sites/projects, and users. EJS server-rendered, Postgres for data, Redis + BullMQ for background jobs, AWS S3 for file storage, AWS Textract + OpenAI for document data extraction.

## Stack
- **Runtime:** Node.js >= 18.12 (entry: [server.js](server.js))
- **Web:** Express 4 + EJS views + express-session (Redis-backed in dev)
- **DB:** Postgres (`pg`) — see [app/helpers/database.helper.js](app/helpers/database.helper.js)
- **Queue:** BullMQ + Redis — see [app/helpers/queue.js](app/helpers/queue.js); Bull-Board UI mounted at `/admin/queues`
- **Storage:** AWS S3 (`@aws-sdk/client-s3`, `aws-sdk`)
- **AI/OCR:** AWS Textract + OpenAI (`openai` v4) for PDF data extraction
- **PDF:** `pdf-lib`, `pdf-parse`, `pdfjs-dist`, `canvas`
- **Dev:** `npm run dev` → nodemon with `--max-old-space-size=2500` (large PDFs)

## Layout
```
server.js                       # Express bootstrap, session, Bull-Board, /admin/queues
app/
  routes/router.js              # mounts: /auth /docs /users /sites /ai /dashboard /admin /bank-master /fdr
  routes/*.router.js            # one router per domain
  controllers/*.controller.js   # admin, ai, auth, bankMaster, dashboard, document, fdr, render, sites, users
  middlewares/auth.middleware.js
  helpers/                      # database, queue, openai, textract, S3 folder checks, AI response validation
  crons/                        # textract.cron.js, openai.cron.js, processPdf.js (currently commented out in server.js)
  workers/recalculate-worker.js # background recalc worker
  utils/                        # PDF first-page extract, datetime, financials, subject parsing
  views/                        # EJS — note subfolders: Fdr/, bank-master/, manage-bg/, project-master/, settings/
```

## Conventions
- Globals: `global.app` and `global.basePath` set in [server.js](server.js#L28-L29).
- File header `/* ॐ नमः शिवाय */` at top of [server.js](server.js).
- `process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0` is set globally — be aware when working on outbound HTTPS.
- No test suite at present.
- Deployment: `Dockerfile` + `docker-compose.yml` at root.

## Notes / Gotchas
- The cron requires (`textract.cron.js`, `openai.cron.js`) are commented out in [server.js](server.js#L18-L19) — document ingestion is currently driven by the BullMQ worker / queue, not the cron.
- Session is signed with `"verySecretKey"` literal in [server.js](server.js#L62) — flag if hardening this.
- Recent commit history (`main` branch): bug fixes around the REFERENCE flow and folder handling.

## When working in this repo
- Use forward slashes in paths even on Windows; shell is bash.
- Prefer editing the matching controller + router pair when adding a domain endpoint.
- Long-running document work belongs in the BullMQ queue, not request handlers.
