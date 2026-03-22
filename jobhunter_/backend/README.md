# Backend (TypeScript + Bun)

Resume ATS and Job Recommendation System backend service.

## Setup

```bash
bun install
```

## Environment

Create `backend/.env` with the following variables:

```bash
cp .env.example .env
```

```env
# Database (MongoDB)
MONGODB_URI=your_mongodb_connection_string

# Auth
JWT_SECRET=your_secret_key

# Server
PORT=3001
NODE_ENV=development

# Python Service URL (from backend to Python service)
PYTHON_SERVICE_URL=http://localhost:5000

# Job API
JOOBLE_API_KEY=your_jooble_api_key
```

> The server exits on startup if `MONGODB_URI` is not provided.

## Run

```bash
bun run dev
```

## Database Migration

```bash
bun run migrate
```

In MongoDB mode this command is a no-op because Mongoose auto-creates collections/indexes.
