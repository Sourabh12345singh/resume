# Backend

This folder contains the API server for Jobhunter.

## What It Does

- Handles signup and login
- Accepts resume uploads
- Sends resume data to the analysis service
- Stores results in MongoDB

## Setup

```bash
bun install
```

Create a `.env` file using the example:

```bash
cp .env.example .env
```

## Environment Variables

```env
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
PORT=3001
NODE_ENV=development
PYTHON_SERVICE_URL=http://localhost:5000
JOOBLE_API_KEY=your_jooble_api_key
```

The server exits on startup if `MONGODB_URI` is missing.

## Run

```bash
bun run dev
```

## Other Commands

```bash
bun run build
bun run migrate
bun test
```

## Workflow

1. Frontend sends a request to the backend.
2. Backend validates the data and checks auth.
3. Backend stores or fetches data from MongoDB.
4. Backend sends resume text to the Python service for analysis.
5. Backend returns the score, insights, and job matches.
