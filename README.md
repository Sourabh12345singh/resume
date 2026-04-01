# Jobhunter

Jobhunter is a resume ATS analyzer and job recommender. It helps users upload a resume, get a score, and find matching jobs.

## What It Does

- Upload a PDF resume
- Check ATS-friendly content and format
- Show a resume score
- Suggest related jobs

## Project Structure

- `frontend/` - React app
- `backend/` - API server
- `docker-compose.yml` - starts the full stack

## Quick Start

```bash
docker-compose up --build -d
```

Open the apps:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`
- Python service: `http://localhost:5000`

## Basic Workflow

1. Sign up and log in.
2. Upload a resume PDF.
3. Select the target experience level.
4. Run the analysis.
5. Review the ATS score and suggestions.
6. Check the recommended jobs.

## Tech Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS
- Backend: Express, TypeScript, Bun
- Database: MongoDB
- ML service: Flask, Sentence-BERT, PyMuPDF, PyTorch
- Deployment: Docker

## Environment Variables

Backend `.env`:

```env
MONGODB_URI=mongodb://localhost:27017/jobhunter
JWT_SECRET=your_secret_key
PYTHON_SERVICE_URL=http://localhost:5000
```

Frontend `.env`:

```env
VITE_API_URL=http://localhost:3001
```

## Useful Commands

```bash
docker-compose up -d
docker-compose up --build -d
docker-compose down
docker-compose logs -f
```

## API Summary

- `POST /api/auth/signup` - register user
- `POST /api/auth/login` - log in
- `POST /api/upload-resume` - upload resume
- `POST /api/analyze` - analyze resume
- `GET /api/jobs/recommendations` - get matching jobs
 
## Snaps


<img width="1889" height="977" alt="Screenshot 2026-04-01 185506" src="https://github.com/user-attachments/assets/5b4501ec-dedd-4194-9ffd-1af04149f05f" />

<img width="1890" height="974" alt="Screenshot 2026-04-01 185624" src="https://github.com/user-attachments/assets/1aa3f9b6-59ed-4324-b9a0-a24f6dc88f42" />

<img width="1898" height="977" alt="Screenshot 2026-04-01 185736" src="https://github.com/user-attachments/assets/5135f416-24f1-4de7-b893-caef0c8ed2f5" />

<img width="1587" height="787" alt="Screenshot 2026-04-01 185811" src="https://github.com/user-attachments/assets/eaa4b1d5-39b4-490d-ba93-b09d1c18a189" />

