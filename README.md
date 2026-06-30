# Last-Minute Life Saver 🎯

**An AI productivity companion that proactively plans your day, breaks tasks apart, and replans when things slip — so you always know exactly what to do next.**

---

## The Problem

Students and professionals miss deadlines not because they forget — but because existing tools give passive reminders that are easy to ignore. They don't help you *actually make progress*.

## The Solution

Last-Minute Life Saver turns a messy brain-dump of tasks into an actively-managed, continuously replanning schedule. It moves beyond reminders into **agentic behavior**: the AI breaks down tasks, monitors your progress, and proactively restructures your day when something falls behind.

## Key Features

| Feature | What it does |
|---|---|
| **Free-text parsing** | Dump tasks in any format — AI extracts deadlines, estimates effort, assigns priority |
| **Smart day planning** | Builds a prioritized, time-blocked schedule (not just a sorted list) |
| **Agentic replanning** | When a task slips, AI restructures the entire schedule, explains the tradeoff, asks for confirmation |
| **Task breakdown** | One click breaks any complex task into 3–5 concrete, timed subtasks |
| **Sage (AI agent chat)** | Conversational agent that proactively surfaces insights, answers "what if" questions, and coaches you through the day |
| **Focus timer** | Per-task deep work timer with pause/resume and automatic completion |
| **Deadline countdown** | Visual urgency chips (TODAY / TOMORROW / 2d / etc.) on every card |
| **Persistent state** | Plan survives page refreshes via localStorage |

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS — glassmorphism design, typewriter animations, zero build step
- **Backend**: Node.js + Express
- **AI**: Google Gemini (`gemini-2.0-flash`) via the official Google AI SDK
- **Deployment**: Docker → Google Cloud Run

## Running Locally

```bash
# 1. Install
npm install

# 2. Set your Gemini API key
cp .env.example .env
# Edit .env — get your key from https://aistudio.google.com/app/apikey

# 3. Start
npm start
# → http://localhost:3000
```

## Deploying to Google Cloud Run

```bash
# Authenticate
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

# Build and push container
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/last-minute-life-saver

# Deploy
gcloud run deploy last-minute-life-saver \
  --image gcr.io/YOUR_PROJECT_ID/last-minute-life-saver \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=YOUR_GEMINI_KEY_HERE

# The deploy command prints your public HTTPS URL
```

## API Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/parse-tasks` | Parse free-text → structured tasks + day plan + agent intro |
| `POST /api/replan` | Proactive replan when a task slips |
| `POST /api/chat` | Conversational agent (Sage) with full plan context |
| `POST /api/breakdown` | Break a task into concrete timed subtasks |

## Google Technologies Used

- **Google Gemini (gemini-2.0-flash)** via `@google/generative-ai` SDK — all AI reasoning, planning, and replanning
- **Google AI Studio** — API key management
- **Google Cloud Run** — serverless deployment
- **Google Cloud Build** — container build pipeline
