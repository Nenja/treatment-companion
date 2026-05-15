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
