# Jobhunter

**Resume ATS Analyzer + ML-Powered Job Recommender**

Jobhunter helps job seekers upload a PDF resume, get an ATS-style score with actionable feedback, and receive ranked job recommendations matched to their profile using Sentence-BERT semantic similarity.

This README is written as an **interview deep-dive**: architecture, data models, algorithms, tradeoffs, and talking points.

---

## Table of Contents

1. [Elevator Pitch](#1-elevator-pitch)
2. [Problem & Solution](#2-problem--solution)
3. [Tech Stack](#3-tech-stack)
4. [High-Level Architecture](#4-high-level-architecture)
5. [Repository Structure](#5-repository-structure)
6. [Core User Journey](#6-core-user-journey)
7. [Frontend](#7-frontend)
8. [Backend (Express / Bun)](#8-backend-express--bun)
9. [Python ML Service](#9-python-ml-service)
10. [ATS Scoring Algorithm (Interview Gold)](#10-ats-scoring-algorithm-interview-gold)
11. [Job Matching Algorithm (Interview Gold)](#11-job-matching-algorithm-interview-gold)
12. [Data Models (MongoDB)](#12-data-models-mongodb)
13. [Auth & Security](#13-auth--security)
14. [Storage (AWS S3)](#14-storage-aws-s3)
15. [External Integrations](#15-external-integrations)
16. [API Reference](#16-api-reference)
17. [Docker & Deployment](#17-docker--deployment)
18. [Environment Variables](#18-environment-variables)
19. [Local Setup](#19-local-setup)
20. [Design Decisions & Tradeoffs](#20-design-decisions--tradeoffs)
21. [Scalability / Reliability Patterns](#21-scalability--reliability-patterns)
22. [Known Limitations & Future Work](#22-known-limitations--future-work)
23. [Interview Q&A Cheat Sheet](#23-interview-qa-cheat-sheet)

---

## 1. Elevator Pitch

> “I built a full-stack job-hunting platform that parses resumes with PyMuPDF, scores them with a hybrid ATS system (Sentence-BERT + rule-based heuristics), fetches live jobs from Jooble, and ranks them with semantic similarity plus seniority-aware penalties. It’s a 3-service architecture: React frontend, Bun/Express API, and a Flask ML microservice, all Dockerized, with MongoDB for persistence and S3 for resume storage.”

**One-line version:** ATS resume scoring + semantic job matching, microservices style.

---

## 2. Problem & Solution

| Problem | How Jobhunter addresses it |
|---|---|
| Resumes get rejected by ATS parsers | Hybrid ATS score with formatting, content, skills, and language checks |
| Keyword-only job search is noisy | Sentence-BERT semantic similarity between resume and JD |
| Entry-level candidates see senior roles | Seniority detection + penalty so underqualified matches are demoted |
| Job APIs have rate limits / downtime | MongoDB job cache + DB fallback when Jooble is unavailable |
| Resume files need durable storage | PDFs stored in AWS S3; metadata in MongoDB |

---

## 3. Tech Stack

### Frontend
| Tech | Role |
|---|---|
| React 18 + TypeScript | UI |
| Vite 5 | Bundler / dev server |
| React Router v6 | Client routing + auth guards |
| Tailwind CSS 3 | Styling |
| Axios | HTTP client |
| Framer Motion | Auth page animations |
| Lucide React | Icons |
| `serve` (prod Docker) | Static SPA hosting |

### Backend API
| Tech | Role |
|---|---|
| Bun (runtime) | Runs TypeScript directly |
| Express 4 | REST API |
| Mongoose 8 | MongoDB ODM |
| JWT (`jsonwebtoken`) | Auth tokens |
| bcrypt | Password hashing |
| Multer | Multipart PDF upload (memory storage) |
| AWS SDK v3 (`@aws-sdk/client-s3`) | Resume upload / download |
| Axios | Calls Python ML service + Jooble |

### ML Service
| Tech | Role |
|---|---|
| Flask 3 + Gunicorn | HTTP microservice |
| PyMuPDF (`fitz`) | PDF text extraction |
| Sentence-Transformers 3.2 | Embeddings |
| PyTorch 2.5 | Model inference backend |
| scikit-learn / NumPy | Similarity helpers |
| Model: `anass1209/resume-job-matcher-all-MiniLM-L6-v2` | Resume/job fine-tuned MiniLM (~90MB) |
| Fallback model: `all-mpnet-base-v2` | General-purpose if fine-tuned model fails |

### Infra / Data
| Tech | Role |
|---|---|
| MongoDB (Atlas or local) | Users, resumes, jobs, recommendations |
| AWS S3 | Resume PDF blobs |
| Jooble API | Live job search |
| Docker Compose | Orchestrates 3 containers |

> Note: There is a leftover `schema.sql` (Postgres-style users table) from an earlier design. **Production path is MongoDB + Mongoose**, not SQL.

---

## 4. High-Level Architecture

```
┌─────────────┐     JWT + REST      ┌──────────────────────┐
│  React SPA  │ ──────────────────► │  Express API (Bun)   │
│  :5173      │ ◄────────────────── │  :3001               │
└─────────────┘                     │                      │
                                    │  • Auth (JWT)        │
                                    │  • Upload → S3       │
                                    │  • Orchestration     │
                                    │  • Jooble + cache    │
                                    └──────────┬───────────┘
                            multipart/JSON     │
                                               ▼
                                    ┌──────────────────────┐
                                    │  Flask ML Service    │
                                    │  :5000 (Gunicorn)    │
                                    │                      │
                                    │  • PDF extract       │
                                    │  • ATS hybrid score  │
                                    │  • Batch job match   │
                                    └──────────────────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    ▼                          ▼                          ▼
              MongoDB Atlas                  AWS S3                   Jooble API
         (users/resumes/jobs)          (resume PDFs)              (live listings)
```

### Why 3 services?
- **Separation of concerns:** Node handles auth, I/O, APIs; Python owns heavy ML.
- **Independent scaling:** ML workers can scale separately from the API.
- **Language fit:** PyTorch / sentence-transformers are strongest in Python; Bun/Express is great for REST + file orchestration.
- **Failure isolation:** If ML is down, API can still auth/upload; matching falls back to keyword rules.

---

## 5. Repository Structure

```
jobhunter_/
├── docker-compose.yml          # python-service + backend + frontend
├── README.md
├── frontend/
│   ├── Dockerfile              # multi-stage: build → serve
│   ├── src/
│   │   ├── App.tsx             # routes + JWT expiry check
│   │   ├── pages/              # Login, Signup, Home
│   │   ├── components/         # AuthForm, CreativeVisual
│   │   └── context/            # ResumeContext (file state)
│   └── package.json
└── backend/
    ├── Dockerfile              # Bun alpine
    ├── .env.example
    ├── package.json
    ├── src/
    │   ├── server.ts           # Express entry
    │   ├── config/database.ts  # Mongo connect + index sync
    │   ├── middleware/auth.ts  # JWT guard
    │   ├── routes/             # auth, upload, analysis, jobs
    │   ├── controllers/        # auth + analysis handlers
    │   ├── models/             # Mongoose schemas + ResumeModel
    │   └── services/           # analysis, jooble, recommendations
    └── python/
        ├── Dockerfile          # Python 3.11 + gunicorn
        ├── app.py              # Flask routes
        ├── pdf_text_extract.py
        ├── resume_analyzer_ml.py   # ATS scoring (~2k LOC)
        ├── job_matcher_ml.py       # Semantic matching
        └── requirements.txt
```

---

## 6. Core User Journey

```
Signup/Login
    → JWT stored in localStorage
    → PrivateRoute protects /home

Upload PDF (+ choose target level: entry | mid | senior)
    → POST /api/upload-resume (Bearer token)
    → Multer validates PDF ≤ 5MB
    → PutObject to S3
    → Resume metadata saved in MongoDB (is_latest=true)
    → Retention: keep last N resumes (default 3)

Analyze
    → POST /api/analyze { targetLevel }
    → Backend downloads PDF from S3 to temp file
    → Forwards to Python /ml/api/ml/analyze-pdf
    → Hybrid ATS score + extractedInfo returned
    → Stored on resume.analysis_data (+ history versioning)

Recommend jobs
    → GET /api/jobs/recommendations?filters
    → Extract keywords from skills
    → Search Jooble (+ DB cache merge, dedupe by URL)
    → Batch ML match (semantic + ATS boost − seniority penalty)
    → Upsert jobs + recommendations; archive previous batch
    → Return top 20 ranked matches to UI
```

---

## 7. Frontend

### Routes
| Path | Access | Purpose |
|---|---|---|
| `/` | Public | Redirect by session |
| `/login`, `/signup` | Public only | Auth forms |
| `/home` | Private | Upload, score, recommendations |

### Auth UX
- Token + user JSON in `localStorage`
- `getValidToken()` decodes JWT payload (`atob`) and checks `exp`
- Expired/malformed token → cleared → redirect to `/login`
- `PrivateRoute` / `PublicRoute` wrappers

### Home page features
1. **Resume upload** with experience-level selector (entry/mid/senior)
2. **Latest resume** status panel
3. **ATS analysis display** (score, insights, recommendations, metrics)
4. **Job recommendations** with:
   - Match % + match level badge (excellent → poor)
   - Semantic similarity, seniority penalty, detected job level
   - Human-readable match reasons
   - Filters: location, keywords, days posted, min match score

### State
- Lightweight: React `useState` + `ResumeContext` for selected file
- No Redux/Zustand — appropriate for a focused single-page workflow
- API calls via Axios with `Authorization: Bearer <token>`
- Requests use relative `/api/...` paths (expects reverse proxy or same-origin in prod)

---

## 8. Backend (Express / Bun)

### Responsibilities
1. Auth (signup/login/JWT)
2. Resume upload to S3 + Mongo metadata
3. Orchestrate Python analysis
4. Job search via Jooble + Mongo cache
5. Persist & serve recommendations

### Key modules

| Module | What it does |
|---|---|
| `authController` | bcrypt hash (10 rounds), JWT issue (`JWT_EXPIRES_IN` default `7d`) |
| `upload` routes | Multer memory → S3 PutObject → ResumeModel.create + retention |
| `analysisController` | Ownership check → S3 download → AnalysisService → save result |
| `analysisService` | HTTP client to Flask; ML first, rule-based fallback |
| `joobleService` | Live search, DB cache, archive stale jobs, ML/rule matching |
| `jobRecommendationService` | Soft-archive old recs, upsert jobs/recs, fetch stored recs |

### Patterns worth mentioning in interviews
- **Service layer** separates HTTP routes from business logic
- **Soft archive** of jobs/recommendations instead of hard delete (auditability)
- **Upsert by job URL** for idempotent job caching
- **Temp-file cleanup** after analysis (`finally` block)
- **ML → rule fallback** at multiple layers for resilience
- **Ownership checks** before analyzing/deleting resumes

---

## 9. Python ML Service

Flask app (`app.py`) exposing PDF + ML endpoints. Runs under **Gunicorn** (`-w 2`) in Docker with a `/health` HEALTHCHECK.

### Capabilities
1. **PDF text extraction** (PyMuPDF page-by-page)
2. **Structured resume parsing** (regex + heuristics): name, email, phone, LinkedIn, GitHub, sections, education, work experience, projects, skills, action verbs, bullet quantification
3. **Hybrid ATS scoring** (see next section)
4. **Job matching** (single + batch) with Sentence-BERT
5. **Singleton model loading** (`get_analyzer()`, `get_matcher()`) so the ~90MB model loads once per process

### Important endpoints (Python)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness |
| POST | `/ml/api/extract-text` | PDF → text |
| POST | `/ml/api/ml/analyze-pdf` | Extract + ATS analyze |
| POST | `/ml/api/ml/analyze-text` | Analyze raw text |
| POST | `/ml/api/ml/match-job` | One resume ↔ one JD |
| POST | `/ml/api/ml/batch-match-jobs` | One resume ↔ many JDs (efficient) |

Many routes are aliased under both `/ml/api/...` and `/api/...` for compatibility.

---

## 10. ATS Scoring Algorithm (Interview Gold)

Implemented in `resume_analyzer_ml.py` → `_calculate_hybrid_ats_score()` (**Hybrid ATS Scoring v3.0**).

### Formula (conceptual)

```
Final Score = clamp(0, 100,
    ML_Semantic(20)
  + Formatting(28)
  + Content(24)
  + Skills_Keywords(18)
  + Education(10)
  + Language(8)
  + Length(2)
  + Bonuses(≤ +4)
  + Penalties(≥ -35)
)
```

### Category breakdown

| Category | Max pts | What is measured |
|---|---:|---|
| **ML Semantic** | 20 | Cosine similarity of resume embedding vs ideal resume trait sentences; average of **top-5** similarities × 22, capped at 20 |
| **Formatting / ATS compat** | 28 | Text-based PDF, single-column layout, standard sections, date consistency, contact + LinkedIn/GitHub, bullets/role density |
| **Content structure** | 24 | Summary quality, skills clarity, experience completeness (level-aware), project detail |
| **Skills & keywords** | 18 | Hard-skill diversity, action verbs, % quantified bullets |
| **Education** | 10 | Degree/institution/field completeness + certifications |
| **Language** | 8 | Grammar/typo heuristics + tone/readability (passive voice, etc.) |
| **Length** | 2 | Level-aware word-count ranges (entry 400–800 ideal, etc.) |

### Bonuses
- Tailoring language (+2)
- Leadership/ownership verbs (+1.5)
- OSS contributions (+0.5)

### Penalties
- Missing contact (−10)
- Missing dates when > half of entries lack dates (−5)
- Image-based / unreadable file type (reserved)

### Level-aware scoring
User selects **entry / mid / senior**. Expectations change:
- **Entry:** projects can compensate for limited work history
- **Mid:** needs stronger work-experience count
- **Senior:** experience-heavy; projects optional

Also auto-detects experience level from years/keywords/bullet volume when target level is omitted.

### Fallbacks
1. Hybrid ML scoring (preferred)
2. If model fails / image-ish error → pure rule-based score
3. Insights + recommendations generated from extracted metrics + score bands

### Status bands
Returned as `status` + `statusMessage` (e.g. good / needs improvement) based on score thresholds.

**Interview tip:** Emphasize this is **not** “just LLM chat” — it’s a deterministic hybrid of embeddings + measurable heuristics, so scores are explainable via `scoreBreakdown.category_scores`.

---

## 11. Job Matching Algorithm (Interview Gold)

Implemented in `job_matcher_ml.py` → `JobMatcherML`.

### Pipeline

```
1. Encode resume once (batch path)
2. Batch-encode all job texts (title + description)
3. Cosine similarity (Sentence-BERT)
4. Map similarity → semantic_score with piecewise curves
   - Different curves for SNIPPET (<100 words, Jooble-style) vs FULL JD
5. ATS contribution = (ats_score/100) * (10 if snippet else 15)
6. Detect job seniority from title/description keywords + years patterns
7. Seniority penalty if candidate is under-leveled (0–50)
8. final = clamp(semantic + ats_boost − penalty, 0, 100)
9. Attach matchLevel + human reasons + overlapping tech skills
```

### Match levels
| Score | Level |
|---:|---|
| ≥ 80 | excellent |
| ≥ 65 | very-good |
| ≥ 50 | good |
| ≥ 35 | fair |
| < 35 | poor |

### Seniority hierarchy & penalties
Levels: `intern → entry → mid → senior → principal`

- Overqualified candidates: **no penalty** (can apply down)
- Underqualified: heavy penalties (e.g. entry → senior ≈ −35, intern → principal ≈ −50)
- Prevents “high semantic similarity but wrong seniority” false positives

### Why snippet-aware scoring?
Jooble often returns short **snippets**, not full JDs. Raw cosine on short text tends to under-score good matches, so the snippet curve is more generous and ATS weight is reduced.

### Keyword fallback (no ML)
```
keyword_overlap * 60 + (ats_score/100)*40
```

### Backend orchestration extras
Before matching, `joobleService.validateResumeFormat()` requires **≥ 3 of 5** checks:
1. ≥ 3 skills  
2. ≥ 2 sections  
3. Contact info  
4. Work experience **or** education  
5. Word count 200–2000  

This filters random PDFs that aren’t resumes.

Search keywords are built by categorizing extracted skills (frameworks, languages, cloud, DBs, soft skills, etc.) into a Jooble query.

Results are filtered/sorted; **top 20** returned.

---

## 12. Data Models (MongoDB)

Defined in `backend/src/models/DbModels.ts`.

### User
- `username`, `email` (unique, lowercase), `password_hash`, `last_login`
- timestamps

### Resume
- `user_id` (ref User, indexed)
- `file_name`, `s3_key` (indexed), optional `file_path`
- `is_latest` (indexed) — only one “current” resume emphasized
- `status`: `uploaded` → `processed`
- `analysis_data` (Mixed JSON — full ATS payload)
- `analysis_version` + `analysis_history[]` (previous versions pushed on re-analyze)

### Job
- `title`, `company`, `location`, `description`, `url` (**unique**)
- `posted_date`, `salary`, `tags`, `source` (default `jooble`)
- `is_active`, `is_archived`, `archived_at`, `archive_reason`
- `last_seen_at` — used for stale archival (default 45 days)

### JobRecommendation
- `user_id`, `resume_id`, `job_id` (+ unique compound index when not archived)
- `match_score`, `recommendation_reasons[]`
- Soft-archive fields + `recommendation_batch_id`

### Relationships
```
User 1 ─── * Resume
User 1 ─── * JobRecommendation * ─── 1 Job
Resume 1 ─── * JobRecommendation
```

Indexes synced on startup via `Model.syncIndexes()`.

---

## 13. Auth & Security

| Concern | Implementation |
|---|---|
| Password storage | bcrypt, 10 salt rounds |
| Session | Stateless JWT (`id`, `email`), default 7d expiry |
| Protected routes | `authenticateToken` middleware (`Authorization: Bearer`) |
| Resource authz | Resume owner check before analyze/delete |
| Upload validation | PDF MIME only, 5MB max |
| Secrets | `.env` (not committed); `JWT_SECRET`, Mongo URI, AWS, Jooble key |
| CORS | Enabled on Express for frontend access |
| Client token expiry | Frontend JWT `exp` check before route access |

### Honest security talking points (interview maturity)
- JWT secret has a **dev default** if unset — must set in production
- S3 objects use timestamped keys; ensure bucket is private + IAM least privilege
- No refresh-token rotation / logout blacklist (stateless JWT tradeoff)
- XSS risk if rendering HTML snippets — frontend does light HTML transform of Jooble snippets; sanitize carefully in production
- Rate limiting / CSRF not implemented yet

---

## 14. Storage (AWS S3)

- Upload: Multer memory buffer → `PutObjectCommand`
- Bucket from `BUCKET_NAME` / `BUCKET_ARN`, region `AWS_REGION` (default `ap-south-1`)
- Analysis downloads object to OS temp dir, streams via `pipeline`, then deletes temp file
- Retention policy keeps latest `RESUME_RETENTION_COUNT` (default **3**) DB records per user (controls cost)
- Note: DB deletion of old resume rows may not always delete S3 objects — good improvement topic

---

## 15. External Integrations

### Jooble
- `POST https://jooble.org/api/{API_KEY}` with keywords/location/page
- In-memory soft limit (`API_LIMIT = 500` calls per process lifetime)
- On missing key / limit / error → **MongoDB job fallback**
- Successful fetches upserted into `Job` collection
- Stale jobs soft-archived after `JOB_ARCHIVE_DAYS` (default 45)

### Hugging Face / Sentence-Transformers
- Downloads/caches model under `~/.cache/huggingface/hub`
- Resume-specific MiniLM preferred; mpnet fallback

---

## 16. API Reference

Base: `http://localhost:3001`

### Auth
| Method | Endpoint | Auth | Body |
|---|---|---|---|
| POST | `/api/auth/signup` | No | `{ username, email, password }` |
| POST | `/api/auth/login` | No | `{ email, password }` → `{ token, user }` |

### Resumes
| Method | Endpoint | Auth | Notes |
|---|---|---|---|
| POST | `/api/upload-resume` | Yes | multipart `resume` + optional `targetLevel` |
| GET | `/api/latest-resume` | Yes | Metadata + analysis |
| GET | `/api/resumes` | Yes | List user’s resumes |
| GET | `/api/resume/:id` | Yes | Redirect to S3 URL |
| DELETE | `/api/resume/:id` | Yes | Delete owned resume |
| DELETE | `/api/resumes/cleanup?keepLatest=N` | Yes | Retention cleanup |

### Analysis
| Method | Endpoint | Auth | Body |
|---|---|---|---|
| POST | `/api/analyze` | Yes | `{ targetLevel? }` — latest resume |
| POST | `/api/analyze/:id` | Yes | Analyze specific resume |

### Jobs
| Method | Endpoint | Auth | Notes |
|---|---|---|---|
| POST | `/api/jobs/search` | Yes | Live Jooble search |
| GET | `/api/jobs` | Yes | DB jobs (+ live refresh if empty) |
| POST | `/api/jobs/refresh` | Yes | Manual cache refresh |
| POST | `/api/jobs/archive-stale` | Yes | Soft-archive old jobs |
| GET | `/api/jobs/recommendations` | Yes | Generate + store ranked matches |
| GET | `/api/jobs/recommendations/stored` | Yes | Previously stored recs |

### Ops
| Method | Endpoint |
|---|---|
| GET | `/health` |
| GET | `/` | API discovery JSON |

---

## 17. Docker & Deployment

`docker-compose.yml` defines three services:

| Service | Image base | Port | Notes |
|---|---|---|---|
| `python-service` | `python:3.11-slim` + gunicorn | 5000 | HEALTHCHECK; shared `uploads` volume |
| `backend` | `oven/bun:1.2.13-alpine` | 3001 | `env_file: backend/.env`; waits for Python healthy |
| `frontend` | Node 20 multi-stage + `serve` | 5173 | Static `dist` |

Shared volume: `./backend/uploads` mounted into Python + backend for local PDF path sharing when needed.

```bash
docker-compose up --build -d
```

- Frontend: http://localhost:5173  
- Backend: http://localhost:3001  
- Python: http://localhost:5000  

---

## 18. Environment Variables

### Backend (`backend/.env`)

```env
MONGODB_URI=mongodb+srv://.../jobhunter   # required (process exits if missing)
JWT_SECRET=long_random_secret
JWT_EXPIRES_IN=7d
PORT=3001
NODE_ENV=development
PYTHON_SERVICE_URL=http://localhost:5000  # in Docker: http://python-service:5000
JOOBLE_API_KEY=your_jooble_api_key

# AWS
AWS_REGION=ap-south-1
BUCKET_NAME=jobhunter-resumes01
BUCKET_ARN=arn:aws:s3:::jobhunter-resumes01
# (+ standard AWS credentials via env/instance role)

# Optional knobs
RESUME_RETENTION_COUNT=3
JOB_ARCHIVE_DAYS=45
```

### Frontend
Relative `/api` calls are used in code. In production you’d typically put Nginx/Caddy or CloudFront in front to route `/api` → backend. Locally you may need a Vite proxy or set absolute API URLs if not same-origin.

---

## 19. Local Setup

### Option A — Docker (recommended)
```bash
cp backend/.env.example backend/.env
# fill secrets
docker-compose up --build -d
```

### Option B — Separate processes

**Python**
```bash
cd backend/python
python -m venv venv
# Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py   # or gunicorn -w 2 -b 0.0.0.0:5000 app:app
```

**Backend**
```bash
cd backend
bun install
cp .env.example .env
bun run dev
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

---

## 20. Design Decisions & Tradeoffs

These are high-signal interview discussion points.

### 1. Microservice for ML instead of in-process Python
**Pros:** Independent deploy/scale, language best-fit, failure isolation.  
**Cons:** Network latency, operational complexity, serialization overhead.  
**Mitigation:** Health checks, timeouts (30–60s), ML→rule fallbacks.

### 2. Hybrid scoring vs pure LLM judgment
**Pros:** Explainable breakdown, cheaper/faster, deterministic enough for product UX.  
**Cons:** Heuristics can be gamed; regex extraction imperfect.  
**Why hybrid:** Embeddings capture “does this look like a strong resume?” while rules enforce ATS realities (sections, bullets, contact).

### 3. MiniLM fine-tuned model vs larger LLMs
**Pros:** ~90MB, fast CPU inference, domain-tuned for resume↔job.  
**Cons:** Weaker than large LLMs on nuanced language.  
**Tradeoff chosen:** Latency + cost for batch matching many jobs.

### 4. MongoDB document store
**Pros:** Flexible `analysis_data` JSON, easy upserts for jobs, good for evolving ML payloads.  
**Cons:** Less rigid relational integrity; need careful indexes.  
**Evidence of evolution:** leftover `schema.sql` shows earlier SQL thinking.

### 5. Soft-delete / archive for jobs & recommendations
Keeps history, avoids breaking references, supports “superseded_by_new_batch” auditing.

### 6. S3 + retention of last N resumes
Balances user convenience with storage cost.

### 7. Jooble cache + fallback
Respects API limits; product still works offline from cache.

### 8. Bun as backend runtime
Fast TypeScript execution, simple DX (`bun run src/server.ts`), smaller Docker base image.

---

## 21. Scalability / Reliability Patterns

| Pattern | Where |
|---|---|
| Health checks | Express `/health`, Flask `/health`, Docker HEALTHCHECK |
| Batch embedding | Encode resume once, jobs in batch (`util.cos_sim`) |
| Model singleton | Avoid reloading transformers per request |
| Timeouts | Axios 3s health / 30s match / 60s analyze |
| Graceful degradation | ML → rule-based at analysis + matching |
| Idempotent upserts | Jobs keyed by unique URL |
| Index sync on boot | Mongoose `syncIndexes()` |
| Gunicorn workers | 2 workers in Python container |
| Dependency order | Compose `depends_on` + Python healthy before backend |

### If asked “how would you scale this?”
1. Put API behind load balancer; horizontal scale Bun pods  
2. Scale Python workers separately; consider GPU for higher throughput  
3. Redis cache for embeddings / recent recommendations  
4. Queue (SQS/Rabbit) for async analyze + match jobs  
5. CDN + private S3 with signed URLs  
6. Move Jooble call counter to Redis (currently in-memory per process)

---

## 22. Known Limitations & Future Work

Good to mention unprompted — shows ownership.

| Limitation | Why it matters | Possible fix |
|---|---|---|
| Image-only / scanned PDFs | PyMuPDF text layer empty | OCR (Tesseract / AWS Textract) |
| Regex extraction brittle | Misses unusual formats | Layout-aware parsers / NER models |
| Frontend relative `/api` | Needs reverse proxy in prod | Vite proxy / Nginx / env base URL |
| Recommendations endpoint may re-analyze aggressively | Extra latency/cost | Version gate instead of always-true flag |
| In-memory Jooble call counter | Resets per process; not shared | Redis counter |
| Limited automated tests | `bun test` exists but few/no test files | Unit tests for scorers + API integration tests |
| S3 orphan objects | Retention deletes DB rows | Lifecycle rules + delete object on cleanup |
| Snippet ≠ full JD | Matching quality capped | Fetch full JD pages when possible |
| No refresh tokens | Long-lived JWT risk | Rotate + short access tokens |

---

## 23. Interview Q&A Cheat Sheet

### “Walk me through the system.”
Three services. User uploads PDF → API stores in S3 → Python extracts text & hybrid-scores → API fetches jobs from Jooble/cache → Python batch-matches with MiniLM → ranked results stored and shown.

### “How do you compute ATS score?”
Hybrid: 20% semantic similarity to ideal resume traits + 80% structured heuristics (formatting, content, skills, education, language, length), plus bonuses/penalties. Level-aware thresholds for entry/mid/senior.

### “How does job matching work?”
Sentence-BERT cosine similarity → piecewise score mapping (snippet vs full) → ATS quality boost → seniority penalty → sort top 20. Keyword fallback if ML unavailable.

### “Why Sentence-BERT instead of TF-IDF / BM25?”
Captures paraphrases (“built REST APIs” ≈ “developed backend services”) better than exact keywords; MiniLM is fast enough for interactive batch ranking.

### “How do you prevent bad matches for juniors?”
Keyword/years-based job seniority detection + asymmetric penalties when candidate level << job level.

### “What happens if Jooble is down?”
Serve cached jobs from MongoDB; still run matching.

### “What happens if the ML service is down?”
Analysis/matching fall back to rule/keyword paths; API returns clear errors if Python is unreachable (`ECONNREFUSED`).

### “How is auth done?”
bcrypt passwords, JWT Bearer tokens, middleware on protected routes, ownership checks on resume ops, client-side expiry validation.

### “Why MongoDB?”
Flexible schema for evolving analysis JSON; natural fit for job documents and upserts.

### “Biggest technical challenge?”
Calibrating match scores for short Jooble snippets while still applying meaningful seniority penalties — required separate scoring curves and lots of logging/iteration.

### “What would you improve next?”
Async analysis queue, OCR for scanned PDFs, signed S3 URLs, proper test suite, Redis for embeddings/rate limits, full JD fetch, remove forced re-analysis, production reverse proxy.

### “Any metrics / observability?”
Verbose structured console logging for scoring breakdowns and batch match summaries; Docker healthchecks. (Production would add OpenTelemetry / structured logs / metrics.)

---

## Quick Mental Model (memorize this)

```
PDF → PyMuPDF text
    → Hybrid ATS score (SBERT + rules, level-aware)
    → Skills → Jooble query (+ DB cache)
    → Batch SBERT match + seniority penalty
    → Top 20 recommendations in UI
```

**Stack slogan:** React + Bun/Express + Flask/SBERT + MongoDB + S3 + Jooble, Dockerized.

---

## License

MIT (see `backend/package.json`).
