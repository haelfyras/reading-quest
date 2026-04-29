# Reading Quest

Reading Quest is a Next.js app for turning books into AI-generated quizzes for children. It now supports profile logins, one-question-at-a-time quiz flow, and points attached to a user account.

## Product Overview

Reading Quest is designed as an MVP for a family reading platform.

- Profile-based login for each child
- Points earned are saved to the logged-in profile
- One-question-at-a-time multiple-choice quizzes
- Difficulty tiers: Easy, Medium, Hard
- Reading level and learning goals influence quiz generation
- A simple dashboard for profile and quiz progress

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env.local` file with:

```bash
OPENAI_API_KEY=your-openai-api-key
```

3. Run the app locally:

```bash
npm run dev
```

4. Open `http://localhost:3000` in your browser.

## How it works

- Sign in or register a child profile on the home page.
- Use the quiz page to create a quiz for a book.
- Answer one question at a time.
- Points are awarded and saved to the profile when the quiz is complete.

## Notes

- Replace `your-openai-api-key` with a valid OpenAI API key.
- The app uses `gpt-3.5-turbo` for quiz generation.
- Profiles and points are stored in browser local storage for the MVP.
