# Jobhunter - Resume ATS Analyzer & Job Recommender

Analyze resumes for ATS compatibility and get ML-powered job recommendations.

## Quick Start

```bash
docker-compose up --build -d
```

- **Frontend:** http://localhost:5173
- **Backend:** http://localhost:3001
- **Python ML:** http://localhost:5000

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│   Browser   │────▶│   Frontend   │────▶│   Backend   │────▶│ MongoDB  │
│             │◀────│   (React)    │◀────│   (Bun)     │     │          │
└─────────────┘     └──────────────┘     └──────┬──────┘     └──────────┘
                                                │
                                                ▼
                                      ┌─────────────────┐
                                      │  Python (Flask) │
                                      │  ML Processing   │
                                      └─────────────────┘
```

## User Flow

```
Sign Up → Login → Upload PDF → Select Level (entry/mid/senior) → Analyze → View Score → Get Jobs
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/signup | User registration |
| POST | /api/auth/login | User login |
| POST | /api/upload-resume | Upload PDF |
| POST | /api/analyze | Analyze resume |
| GET | /api/jobs/recommendations | Get job matches |

## ATS Scoring (0-100)

```
┌─────────────────────────────────────────────────────────────┐
│  ATS Score = ML Score (0-20) + Rule Score (0-80)          │
├─────────────────────────────────────────────────────────────┤
│  ML Score: Sentence-BERT semantic similarity                │
│  Rule Score: Contact(3) + Skills(10) + Action Verbs(10)   │
│            + Quantified Metrics(10) + Experience(7) +       │
│            + Sections(5) + Education(5) + Format(5) + ...   │
├─────────────────────────────────────────────────────────────┤
│  Status: Excellent(80+) | Good(65+) | Fair(50+) | Poor     │
└─────────────────────────────────────────────────────────────┘
```

**Level Adjustments:** Entry level expects 5+ skills, senior expects 15+.

## Job Matching

```
Resume + Job Description → Sentence-BERT → Semantic Similarity
                                      │
                                      ▼
                    + ATS Score Contribution (0-15 pts)
                                      │
                                      ▼
                    - Seniority Penalty (if level mismatch)
                    - entry→senior: -40 pts
                    - mid→senior: -10 pts
                                      │
                                      ▼
                        Final Match Score (0-100)
```

## Python ML Pipeline

```
PDF File → PyMuPDF (extract text) → Sentence-BERT (analyze) → Results
                                           │
                                           ├── ATS Score
                                           ├── Skills (technical/soft)
                                           ├── Insights (strengths)
                                           └── Recommendations (improve)
```

## Database (MongoDB)

```
users         → email, password_hash
resumes       → file_path, analysis_data, target_level
jobs          → title, company, description, url
recommendations → match_score, reasons, batch_id
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React, TypeScript, Vite, Tailwind |
| Backend | Express, TypeScript, Bun |
| Database | MongoDB |
| ML | Flask, Sentence-BERT, PyTorch, PyMuPDF |
| Container | Docker |

## Environment Variables

```env
# Backend (.env)
MONGODB_URI=mongodb://localhost:27017/jobhunter
JWT_SECRET=your_secret_key
PYTHON_SERVICE_URL=http://localhost:5000

# Frontend (.env)
VITE_API_URL=http://localhost:3001
```

## Docker Commands

```bash
# Start
docker-compose up -d

# Rebuild
docker-compose up --build -d

# Stop
docker-compose down

# View logs
docker-compose logs -f
```
