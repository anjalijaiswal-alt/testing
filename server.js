require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL  = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

function extractJSON(raw) {
  let text = raw.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
  const s = text.search(/[{[]/);
  if (s > 0) text = text.slice(s);
  try { return JSON.parse(text); }
  catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Could not parse structured response from AI');
  }
}

function getModel() {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured. Add it to .env or set as environment variable.');
  return new GoogleGenerativeAI(GEMINI_API_KEY).getGenerativeModel({ model: GEMINI_MODEL });
}

function todayCtx() {
  const d = new Date();
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return { today: d.toISOString().split('T')[0], dayName: days[d.getDay()] };
}

// ─── 1. Parse free-text → full structured plan ───────────────────────────────
app.post('/api/parse-tasks', async (req, res) => {
  try {
    const { input } = req.body;
    if (!input?.trim()) return res.status(400).json({ error: 'Input is required.' });

    const { today, dayName } = todayCtx();
    const model = getModel();

    const prompt = `Today is ${dayName}, ${today}.

Parse this student's free-text task dump into a detailed, actionable schedule.

INPUT: "${input}"

Return ONLY valid JSON (no markdown code fences, no explanation outside JSON):
{
  "tasks": [
    {
      "id": "t1",
      "title": "string",
      "deadline": "YYYY-MM-DD or null",
      "deadlineLabel": "e.g. 'This Monday', 'Tomorrow 3pm', 'Next Friday'",
      "daysUntilDeadline": 2,
      "estimatedHours": 4,
      "priority": "critical|high|medium|low",
      "category": "assignment|exam|interview|meeting|personal|other",
      "status": "pending",
      "color": "#hexcode"
    }
  ],
  "dayPlan": [
    {
      "date": "YYYY-MM-DD",
      "label": "Today|Tomorrow|Wednesday",
      "totalHours": 5,
      "slots": [
        {
          "taskId": "t1",
          "taskTitle": "string",
          "plannedHours": 2,
          "note": "Very specific action — e.g. 'Solve 3 DP problems from LeetCode: coin change, longest subsequence, knapsack'"
        }
      ]
    }
  ],
  "reasoning": "2-3 sentences explaining the prioritization logic with specific task references",
  "urgencyAlert": null,
  "agentIntro": "2-sentence personalized opening from the AI agent that names the student's most critical task and shows genuine understanding of their crunch situation"
}

Rules:
- Hard cap: 5h focused work/day. Students burn out past this.
- Prioritize strictly by: (1) deadline proximity, (2) estimated effort, (3) impact
- Deadline day names like 'Friday' → compute actual YYYY-MM-DD relative to ${today} (${dayName})
- daysUntilDeadline: integer (0=today, 1=tomorrow, negative=overdue)
- Plan 7 days ahead. dayPlan[0] must be today (${today})
- Action notes must be SPECIFIC — tell the student exactly what to do in that session
- Colors: exam=#EF4444, assignment=#F59E0B, interview=#8B5CF6, meeting=#3B82F6, personal=#10B981, other=#6B7280
- urgencyAlert: urgent string if a high-stakes task is critically close, else null
- agentIntro: must name the top-priority task, show empathy, and feel personal — not generic`;

    const result = await model.generateContent(prompt);
    const data = extractJSON(result.response.text());
    res.json(data);
  } catch (err) {
    console.error('[parse-tasks]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── 2. Proactive replan when a task slips ────────────────────────────────────
app.post('/api/replan', async (req, res) => {
  try {
    const { slippedTask, currentDayPlan, allTasks } = req.body;
    if (!slippedTask) return res.status(400).json({ error: 'slippedTask is required.' });

    const { today } = todayCtx();
    const model = getModel();

    const prompt = `You are a proactive AI productivity coach. A student couldn't finish a task.

TODAY: ${today}
SLIPPED TASK: ${JSON.stringify(slippedTask)}
CURRENT SCHEDULE: ${JSON.stringify(currentDayPlan)}
ALL TASKS: ${JSON.stringify(allTasks)}

Intelligently replan the rest of the schedule around this slip. Think about cascading impacts.

Return ONLY valid JSON:
{
  "updatedDayPlan": [same schema as dayPlan above — full updated schedule],
  "changes": [
    {
      "type": "moved|shortened|prioritized|dropped|extended|split",
      "taskTitle": "exact task name from the plan",
      "detail": "specific description of what changed and why"
    }
  ],
  "explanation": "2 direct coach-like sentences — name the slipped task, explain what you did to protect the critical deadlines",
  "confirmationQuestion": "A specific yes/no question using actual task names from the plan",
  "tradeoff": "1 honest sentence about what this schedule change costs the student"
}

Sound like a sharp, empathetic coach. Use actual task names throughout. Be specific.`;

    const result = await model.generateContent(prompt);
    const data = extractJSON(result.response.text());
    res.json(data);
  } catch (err) {
    console.error('[replan]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── 3. Conversational agent (Sage) ──────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  try {
    const { message, tasks, dayPlan, history = [] } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'Message is required.' });

    const { today, dayName } = todayCtx();
    const model = getModel();

    const ctxTasks = (tasks || []).slice(0, 12);
    const ctxPlan  = (dayPlan || []).slice(0, 5);
    const ctxHist  = history.slice(-8).map(m =>
      `${m.role === 'agent' ? 'Sage' : 'Student'}: ${m.content}`
    ).join('\n');

    const prompt = `You are Sage, an AI productivity coach. Today is ${dayName}, ${today}.

STUDENT'S CURRENT PLAN:
Tasks: ${JSON.stringify(ctxTasks)}
Schedule: ${JSON.stringify(ctxPlan)}

${ctxHist ? `CONVERSATION SO FAR:\n${ctxHist}\n` : ''}
STUDENT: "${message}"

Respond as Sage. You are direct, warm, and very specific. Rules:
- 2-3 sentences MAX. Dense, actionable, no filler.
- Reference actual task names from the plan when relevant.
- "What if I skip X?" → estimate concrete impact: which deadline is at risk, by how much.
- "Break down X" → give 3 numbered concrete steps inline.
- Stressed student → one word of empathy, then immediate action step.
- Always end with forward momentum — what should they do RIGHT NOW.

Return ONLY valid JSON: { "reply": "your response as Sage" }`;

    const result = await model.generateContent(prompt);
    const data = extractJSON(result.response.text());
    res.json({ reply: data.reply || "Let's stay focused — what do you need right now?" });
  } catch (err) {
    console.error('[chat]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── 4. Break a task into concrete subtasks ───────────────────────────────────
app.post('/api/breakdown', async (req, res) => {
  try {
    const { task, availableHours } = req.body;
    if (!task) return res.status(400).json({ error: 'task is required.' });

    const model = getModel();
    const hours = availableHours || task.estimatedHours || 2;

    const prompt = `Break this task into concrete, completable subtasks.

TASK: ${JSON.stringify(task)}
TIME AVAILABLE TODAY: ${hours}h

Return ONLY valid JSON:
{
  "subtasks": [
    {
      "id": "s1",
      "title": "Short action title",
      "minutes": 30,
      "note": "Exactly what to do — specific enough that the student can start immediately"
    }
  ],
  "tip": "One sharp, specific tip for tackling this task efficiently"
}

Rules:
- 3-5 subtasks. Together they must sum to roughly ${hours * 60} minutes.
- Each subtask must be concrete — completable in one focused session
- Notes must be specific enough to start without thinking
- tip must be specific to this task type (not generic "take breaks" advice)`;

    const result = await model.generateContent(prompt);
    const data = extractJSON(result.response.text());
    res.json(data);
  } catch (err) {
    console.error('[breakdown]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server → http://localhost:${PORT}`);
  if (!GEMINI_API_KEY) console.warn('GEMINI_API_KEY not set — AI features disabled');
});
