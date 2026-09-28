# CodeOrbit — Project Plan (Simple Version)

*A one-stop platform for coders to track their progress, follow study sheets, and prepare smarter.*

---

## 1. What is CodeOrbit?

CodeOrbit is a website where a coder connects their accounts from different coding practice platforms — LeetCode, Codeforces, CodeChef, GeeksforGeeks — and sees everything in one place: how many problems they've solved, their ratings, a streak calendar, and upcoming contests.

On top of that, CodeOrbit lets users follow **study sheets** — curated lists of problems (like "Blind 75") or CS subjects (like Operating Systems) — and automatically checks off what they've already solved.

Think of it as **one dashboard for your entire coding journey**, instead of five different tabs.

---

## 2. Why build this?

Coders today have their progress scattered:
- Problems solved live on 3–4 different websites
- Study sheets are spreadsheets you tick off by hand
- Contest schedules are easy to miss
- There's no single place that says "here's what to solve next"

CodeOrbit brings all of this together, and — unlike similar tools — also tells the user **what to do next**, instead of just showing numbers.

---

## 3. Who is this for?

| Type of user | What they want |
|---|---|
| **Student preparing for placements** (main audience) | Follow a sheet, track progress, stay consistent |
| **Competitive programmer** | See rating history, never miss a contest |
| **Working developer refreshing DSA** | Quick, low-effort tracking and revision |
| **Mentor / placement cell** (later) | See how a whole batch of students is progressing |

---

## 4. What CodeOrbit does (features)

### A. Connect your coding accounts
- Add your username for LeetCode, Codeforces, CodeChef, GFG
- CodeOrbit automatically pulls your solved problems, ratings, and activity every few hours
- No passwords are ever asked for — just your public username

### B. One dashboard
- Total problems solved, split by easy/medium/hard
- A heatmap calendar (like GitHub's) showing your daily activity across all platforms combined
- Graphs: topics you're strong/weak in, rating over time, problems solved per month
- Current streak and longest streak

### C. Contest calendar
- All upcoming contests from your chosen platforms, in one calendar
- Countdown timers, and reminders sent by email before a contest starts
- Add any contest to your own Google Calendar

### D. DSA Sheets
- Browse popular ready-made sheets: Blind 75, NeetCode 150, Striver's Sheet, etc.
- Follow a sheet and see your progress bar fill up automatically as you solve its problems
- For problems CodeOrbit can't auto-detect, mark them "done" manually
- Add personal notes to any problem, and bookmark ones to revisit

### E. Core CS Subjects *(new)*
Not just DSA — CodeOrbit also has sheets for core Computer Science subjects like:
- Operating Systems, DBMS, Computer Networks, OOP, System Design

Each subject sheet works like this:
- A list of topics (e.g., "CPU Scheduling", "Normalization", "TCP vs UDP")
- Each topic has a **direct video lecture** linked to it
- A **checkbox** to mark the topic as done once you've watched/understood it
- Same progress bar and tracking as DSA sheets — just for concepts instead of problems

This turns CodeOrbit into a complete interview-prep tool, not just a DSA tracker.

### F. Revision system
- Solved problems get scheduled for revision using **spaced repetition** — they resurface after 1 day, then 3, then 7, then 21 days, so you don't forget them
- CodeOrbit suggests your weakest topics based on what you've solved vs. what's left in your sheets
- "What should I solve next?" — a one-click suggestion from your followed sheets

### G. AI Planner *(new)*
Instead of the user figuring out a study plan alone, they can tell CodeOrbit their goal:

> *"I want to be ready for SDE interviews in 8 weeks, and I can give 2 hours a day."*

CodeOrbit (using AI) then builds a **week-by-week plan** — which sheets and subjects to focus on, how many problems per day, and where to focus based on the user's actual weak spots. This plan becomes a checklist the user follows and can regenerate anytime they fall behind.

### H. AI Personal Assistant *(new)*
A chat assistant inside CodeOrbit that can answer things like:
- "What should I solve today?"
- "How am I doing on Blind 75?"
- "Give me a hint for this problem" (it gives hints, never the full answer — that would defeat the purpose)
- "Am I ready for Amazon-style questions?"

Unlike a general chatbot, it only answers using the user's **real data already inside CodeOrbit** — so answers are accurate, not made up.

### I. Sharing and growth (later stage)
- A public profile page to share on LinkedIn or a resume
- Goals with a deadline and daily pace tracker
- Friends list and leaderboards (college, batch, or friend group)
- Users can build and share their own custom sheets

### J. For mentors and colleges (later stage)
- A dashboard where a mentor or placement cell can see a whole batch's progress
- Assign a sheet or set of problems to the group

---

## 5. How it works (in plain terms)

```
 You (browser/phone)
        │
        ▼
   CodeOrbit Website  ──────►  CodeOrbit's own database (all your stats live here)
        │
        ▼
  Background "sync workers" — these quietly visit LeetCode, Codeforces, etc.
  every few hours, pull your latest activity, and update your dashboard
```

**Key idea:** the website itself never talks to LeetCode or Codeforces directly. A separate background process does that job on a schedule, so the site stays fast and one broken platform never slows down the rest.

For contests, CodeOrbit pulls data from a contest-tracking service (**clist.by**) that already aggregates schedules from many platforms.

For the AI features, CodeOrbit sends the user's own progress data to an AI model (like Claude or GPT) to generate plans and chat answers — the AI never sees other users' data.

---

## 6. What it's built with (in plain terms)

| Part | What it is | Why |
|---|---|---|
| Website | Built with Next.js (a modern web framework) | Fast, works well on mobile and desktop |
| Backend (the "brain") | A server that handles logins, saves data, and talks to the database | Standard, reliable approach |
| Database | PostgreSQL | Stores all users' stats, sheets, and progress safely |
| Background jobs | A queue system (Redis) | Lets CodeOrbit fetch data from other platforms without slowing the site down |
| Login | Google, GitHub, or email link | No passwords to manage or leak |
| AI features | Claude/GPT via API | Powers the planner and assistant |
| Hosting | Cloud services (Vercel, Railway/Render, managed database) | Cheap to start, scales up later |

---

## 7. Is this realistic to build?

**Yes — with one thing to be careful about.**

- **Codeforces** has an official, public way to get data — very reliable.
- **LeetCode** doesn't have an official public system for this, so CodeOrbit uses the same public data the website itself uses. This works, but with one limit: CodeOrbit can see your *total* solved count easily, but building the *exact list* of every problem you've solved takes a bit longer (it builds up over time as you keep syncing). Manual "mark as done" covers the gap.
- **CodeChef and GFG** are the least reliable sources — CodeOrbit will support them on a best-effort basis and can turn them off individually if they break, without affecting the rest of the site.

Because of this, CodeOrbit is designed so that **each platform is handled separately** — if one breaks, only that one is affected, and it can be fixed and turned back on without touching anything else.

**Estimated time:** a small team (1–2 people) can realistically build a working first version in about 5–7 weeks, followed by 5–6 more weeks to add sheets, subjects, and revision features.

**Estimated cost:** free to about $10/month while small, growing to roughly $80–200/month once there are thousands of users. The AI features (planner, assistant) add a small extra cost per use, since each request calls a paid AI service.

---

## 8. What we will NOT build (at least not initially)

- No code editor or judge — CodeOrbit doesn't run code, it just tracks progress on other platforms
- No login with username/password and no storing of anyone's platform passwords
- No social feed, forums, or chat with strangers
- No AI writing full solutions to problems — only hints and plans

---

## 9. Rough order we'll build things in

| Stage | What gets built |
|---|---|
| **1. Foundation** | Basic website, login, database set up |
| **2. Core tracker (MVP)** | Connect accounts, dashboard, heatmap, graphs, contest calendar |
| **3. Sheets** | DSA sheets, Core CS Subjects, notes, revision system |
| **4. Growth features** | Public profiles, goals, friends, leaderboards |
| **5. AI + advanced** | AI planner, AI assistant, mentor/college dashboards |

Each stage is fully working before moving to the next — so even if we stop after Stage 2, there's already a usable product.

---

## 10. A few things to decide later

1. Final name and branding for the product
2. Whether it stays free, or has a paid tier for colleges/mentors
3. Which extra platforms to support after launch (AtCoder, HackerRank, etc.)
4. How much to invest in the AI features early on, since they add ongoing cost

---

*This is the simple-language version of the PRD, meant for quick understanding and sharing with anyone — technical or not. A detailed, developer-ready technical version also exists separately for building the actual product.*
