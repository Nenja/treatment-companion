# Deploying the prototype — step by step

You don't need to install anything on your computer. You'll do it all in a
web browser. Allow about 10 minutes the first time.

---

## Step 1 — Download the project

Download **treatment-companion.zip** (the file presented alongside this
guide).

**Unzip it.** On Windows: right-click the zip → "Extract All..." → click
Extract. You'll get a folder called `treatment-companion` with files
inside.

Keep that folder somewhere you can find it (e.g. your Desktop).

---

## Step 2 — Make a free GitHub account

GitHub is where the project files will live online. Vercel reads them
from there.

1. Go to **https://github.com**
2. Click **Sign up** (top right).
3. Use any email, pick a username, pick a password. Skip any "tell us
   about yourself" survey screens.
4. Verify your email when GitHub asks.

That's it. You don't need to learn how GitHub works.

---

## Step 3 — Upload the project to GitHub

1. Once signed in, click the **+** icon top-right of GitHub → **New
   repository**.
2. **Repository name:** type `treatment-companion`
3. Leave everything else as default. Make sure it's set to **Public** (or
   Private — both work).
4. **Do not** tick "Add a README file" — we already have one.
5. Click **Create repository**.

You'll land on a mostly-empty page. Look for a link near the top that says
**"uploading an existing file"** (it's a small blue link in a sentence
like "...or push an existing repository from the command line, or
uploading an existing file").

Click **uploading an existing file**.

6. You'll see a big dashed box that says "Drag files here". Open the
   `treatment-companion` folder you unzipped, **select all the files and
   folders inside it** (Ctrl+A on Windows), and drag them into the box.

   ⚠️ Drag the **contents** of the folder, not the folder itself. You
   should be uploading files like `package.json`, `README.md`, and
   folders like `app`, `components`, etc.

7. Wait for the upload to finish (the file list will fill in below the
   box). Then scroll down and click the green **Commit changes** button.

GitHub now has your project.

---

## Step 4 — Make a free Vercel account

1. Go to **https://vercel.com/signup**
2. Click **Continue with GitHub**.
3. Authorise Vercel to see your GitHub account when it asks.
4. If it asks you to pick a plan, choose **Hobby** (free, no credit card).
5. If it asks for a team name, just use your name. Click through any
   onboarding screens.

---

## Step 5 — Deploy

1. Once you're in Vercel, click **Add New...** → **Project** (top right).
2. You'll see a list of your GitHub repositories. Find
   **treatment-companion** and click **Import** next to it.

   *If you don't see it: click "Adjust GitHub App Permissions" and give
   Vercel access to the repository, then come back.*

3. Vercel will show a "Configure Project" screen. **Leave everything as
   default** — it auto-detects Next.js correctly.
4. Click **Deploy**.

Wait about 2–3 minutes. You'll see a build log scrolling. When it
finishes you'll see confetti and a preview of the site.

---

## Step 6 — Open it on your phone

Vercel gives you a URL like
`treatment-companion-xyz.vercel.app`. Click it, or copy it and open
it on your phone.

For the Danish version, add `/da` to the end:
`treatment-companion-xyz.vercel.app/da`

---

## Database changes (migrations) — the order matters

Some deliveries include **SQL files** (named like `0098_…sql`). These change the
database, and the app expects those changes to already be there. The golden rule:

> **Run the database SQL *before* (or at the same time as) you upload the new app.**
> Never upload an app that is "ahead" of the database.

Most of the broken-page problems we have hit came from doing this out of order —
the app went live expecting a column the database didn't have yet, and the page
either hung on a loading spinner or showed a network error.

How to do it:

1. Open your Supabase project → **SQL editor**.
2. Run each delivered `.sql` file **in number order** (0095, then 0096, then
   0098, …). Paste the contents, click **Run**, check it says success.
3. If you're not sure which ones you've already run, paste **`schema_audit.sql`**
   (delivered separately) and run it — it lists every table, column and function
   and flags anything missing, so you can see exactly what still needs running.
4. *Then* upload the new app zip to GitHub.
5. After Vercel finishes building, **hard-refresh** the page (Ctrl+Shift+R) so
   your browser loads the new version rather than a cached old one.

---

## The automatic checks (CI)

Every time files are uploaded to GitHub, GitHub now runs a set of **automatic
checks** (defined in `.github/workflows/ci.yml`). You'll see either a green
check ✓ or a red ✗ next to your upload on the GitHub page. The checks are:

- **Type-check** — catches programming mistakes.
- **i18n parity** — makes sure the English and Danish texts have exactly the
  same set of entries (no missing translations).
- **Production build** — builds the app the same way Vercel will, so build
  breaks are caught here first.
- **Migrations apply cleanly** — takes all the numbered SQL files and applies
  them to a fresh throwaway database, in order, to prove there are no ordering
  or syntax errors. (It does **not** touch your real database. Dev-only "reseed"
  files marked `ci:skip` are excluded.)

**What to do:** if you see a red ✗, click it, copy the error text, and paste it
to me. A green ✓ means the basics are sound. (This is a safety net, not a
guarantee the screens look right — visual/behaviour checking still happens on
the live site.)

---

## Later, optional: applying migrations automatically

It's possible to have GitHub apply the database SQL to Supabase automatically on
every upload (via the Supabase CLI). We are **not** doing that yet, on purpose:
because the migrations have been run by hand so far, the automatic tool's record
of "what's already applied" isn't set up, and switching over needs a careful
one-time reconciliation first (telling it which migrations are already in place).
When you'd like to remove the manual SQL step entirely, tell me and we'll do that
reconciliation as its own task.

---

## If something goes wrong

- **The build failed** — copy the red error text from the build log and
  paste it back to me. I'll fix it.
- **"This page can't be reached"** — wait another minute, Vercel
  sometimes takes a moment to make the URL live.
- **You see "404 not found"** — make sure you uploaded the **contents**
  of the folder, not the folder itself. The `package.json` file must be
  at the top level of the repository.
- **Anything else weird** — tell me what you see and I'll talk you
  through it.

---

## What to do once it's working

Look at the patient home screen on your phone. Then come back and tell me:

1. Does the copy feel right? (Too clinical? Too soft?)
2. The "How progress is measured" section on a goal card — tap it to
   expand. Does highlighting the middle anchor in sage feel helpful or
   does it draw too much attention?
3. Tap the dark **"⚙ Dev panel"** pill bottom-right. Switch between Anna,
   Lars, and Mette to see different states. Try "Simulate next week".
4. Anything that just feels off.
