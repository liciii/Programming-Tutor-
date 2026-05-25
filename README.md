# CodeTutor AI — Intelligent Programming Tutor

An adaptive, conversational programming tutor powered by GPT-4. Personalizes every interaction based on a learner profile built during onboarding.

## Architecture

```
tutor/
├── server/                     # Node.js + Express backend
│   ├── index.js                # Entry point
│   ├── middleware/
│   │   └── auth.js             # JWT middleware
│   ├── routes/
│   │   ├── auth.js             # Register / login
│   │   ├── chat.js             # Streaming SSE chat
│   │   ├── profile.js          # Learner profile + onboarding
│   │   └── templates.js        # Prompt template CRUD
│   ├── services/
│   │   ├── userService.js      # User storage (JSON)
│   │   ├── profileService.js   # Learner profile storage (JSON)
│   │   ├── templateService.js  # Template storage + prompt builder
│   │   └── llmService.js       # OpenAI streaming + intent detection
│   └── data/
│       ├── users/              # users.json
│       ├── profiles/           # {userId}.json per learner
│       └── templates/          # templates.json
│
└── client/                     # React + Vite frontend
    └── src/
        ├── pages/
        │   ├── AuthPage.jsx        # Login / Register
        │   ├── OnboardingPage.jsx  # Conversational profile builder
        │   ├── ChatPage.jsx        # Main tutor chat
        │   └── SettingsPage.jsx    # Profile, templates, API keys
        ├── components/
        │   ├── chat/
        │   │   ├── MessageBubble.jsx    # Markdown + code rendering
        │   │   ├── TemplateSelector.jsx # Template dropdown
        │   │   └── ProfileBadge.jsx     # Profile summary popover
        │   ├── settings/
        │   │   └── TemplateEditor.jsx   # Template CRUD UI
        │   └── shared/
        │       └── AppLayout.jsx        # Sidebar + layout
        ├── context/
        │   └── AuthContext.jsx          # Auth state
        └── services/
            └── api.js                   # HTTP + SSE client
```

## Quick Start

### 1. Clone and install

```bash
git clone <repo>
cd tutor
npm run install:all
```

### 2. Configure the server

```bash
cd server
cp .env.example .env
```

Edit `.env`:
```
PORT=3001
JWT_SECRET=change_this_to_a_long_random_string
OPENAI_API_KEY=sk-your-key-here
```

### 3. Run in development

From the root directory:
```bash
npm run dev
```

This starts:
- Backend on `http://localhost:3001`
- Frontend on `http://localhost:5173`

### 4. Use the app

1. Open `http://localhost:5173`
2. Register a new account
3. Complete the onboarding chat (takes 2–4 minutes)
4. Start learning!

## Features

### Learner Profiling
- Conversational onboarding via GPT-4 — no forms
- Profile stored as a JSON file per user: `server/data/profiles/{userId}.json`
- Auto-updates after each tutoring session (strengths, weaknesses, topics)
- Editable manually from Settings → Profile

### Adaptive Chat
- Detects intent from your message (explain / exercise / debug / quiz / feedback)
- Builds a custom system prompt from the matching template + your profile
- Streams responses in real-time with markdown and syntax-highlighted code
- Session history feeds back into future prompts

### Prompt Templates
- 5 built-in default templates (non-deletable):
  - Explain a Concept
  - Assign Practice Exercise
  - Code Feedback
  - Debugging Help
  - Quick Quiz
- Users can create and edit their own custom templates
- Templates support placeholders: `{{programmingLevel}}`, `{{targetLanguage}}`, `{{learningStyle}}`, `{{interests}}`, `{{weaknesses}}`, `{{strengths}}`, `{{topics}}`

### Multi-LLM Support (extensible)
- Default: OpenAI GPT-4o (server API key)
- Users can provide their own API keys in Settings → API Keys
- LLM router in `server/services/llmService.js` is designed to be extended with Gemini, Claude, etc.

## Extending with More LLM Providers

In `server/services/llmService.js`, extend `streamChatCompletion`:

```js
export async function streamChatCompletion({ messages, systemPrompt, provider, apiKey, res }) {
  if (provider === 'gemini') return streamGemini({ messages, systemPrompt, apiKey, res });
  if (provider === 'anthropic') return streamAnthropic({ messages, systemPrompt, apiKey, res });
  return streamOpenAI({ messages, systemPrompt, apiKey, res }); // default
}
```

## Data Files

All data is stored as JSON files — no database required:

| File | Contents |
|------|----------|
| `server/data/users/users.json` | User accounts (hashed passwords) |
| `server/data/profiles/{userId}.json` | Learner profile per user |
| `server/data/templates/templates.json` | All prompt templates |

## Production Notes

- Replace the JSON file storage with a real database (PostgreSQL, MongoDB)
- Store API keys using a secrets manager (AWS Secrets Manager, Vault)
- Add rate limiting (`express-rate-limit`)
- Use HTTPS and secure cookie settings
- Set `JWT_SECRET` to a 64+ character random string
