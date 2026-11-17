# Run Explore Katsina on your own computer (with VS Code)

This puts a complete working copy of the site on your computer: same pages, SAMPLE data, bookings with a
**test** payment screen (no real money), and a **test inbox** that catches every email the site sends.
Nothing you do here affects a live site.

Works on **Windows 10/11** and **macOS** (Linux too). Allow about an hour the first time, most of it waiting for
downloads. You need a computer with at least **8 GB of memory** and about **10 GB of free disk space**.

---

## Step 1 — Install four free programs (once)

| Program | Where | Notes |
|---|---|---|
| **Git** | https://git-scm.com/downloads | Windows: keep the default options. It also installs **Git Bash**, which you will use. |
| **Docker Desktop** | https://www.docker.com/products/docker-desktop/ | Windows: when asked, allow it to install/enable **WSL 2**, then restart the computer. Free for personal use and small businesses (check Docker's current terms if your company grows). |
| **Node.js** (the "LTS" version) | https://nodejs.org | Keep the default options. |
| **Visual Studio Code** | https://code.visualstudio.com | Keep the default options. |

After installing, **open Docker Desktop** and wait until it says it is running (the whale icon stops
animating). Docker must be running whenever you use the local site.

---

## Step 2 — Get the project into VS Code (once)

1. Open **VS Code**.
2. Click the **Source Control** icon on the left (the branching icon), then **Clone Repository**.
   (Or press `Ctrl+Shift+P` / `Cmd+Shift+P` and type *Git: Clone*.)
3. Choose **Clone from GitHub**, sign in to GitHub when asked (the repository is private), and pick
   **Ugambo/ugambo4**.
4. Choose a folder to save it in (for example `Documents`), then click **Open** when VS Code asks.
5. If VS Code asks *"Do you trust the authors of the files in this folder?"*, click **Yes, I trust the authors**.
6. **Switch to the branch with all the work:** click the branch name at the **bottom-left** of the window
   (it may say `main`) and choose **`origin/claude/explore-katsina-architecture-wj2xli`**.
   The bottom-left should now show `claude/explore-katsina-architecture-wj2xli`.
7. VS Code may suggest a few extensions (Docker, PHP): you can click **Install All**. They are optional.

---

## Step 3 — Open the right terminal

**Terminal → New Terminal** (or `` Ctrl+` ``). A panel opens at the bottom.

- **Windows:** click the small **⌄** arrow next to the **+** in that panel and choose **Git Bash**.
  The prompt should end with `$`. (Do **not** use PowerShell or Command Prompt for the commands below.)
- **Mac:** the normal terminal is fine.

Check everything is installed by typing these, one at a time, pressing Enter after each:

```bash
docker --version
node --version
git --version
```

Each should print a version number. If one says "not found", install that program again and restart VS Code.

---

## Step 4 — Build the local site (first time: 15–30 minutes)

In the terminal type:

```bash
./setup.sh --offline
```

(Or, without typing: **Terminal → Run Task… → "Explore Katsina: 1. Set up / update the local site"**.)

What happens: it downloads WordPress, the free plugins and the Kadence theme, creates the database,
installs the Explore Katsina plugin and theme, the English/Hausa pages, the guide content and the SAMPLE
data. You will see green ✔ lines for each step and finally **"7/7 Done"**.

Warnings that mention *"could not establish a secure connection to WordPress.org"* are harmless.

> Why `--offline`? It uses ready-made Docker images and adds the **test inbox**; it is also the mode the
> automatic tests use. (Plain `./setup.sh` uses WordPress's own "wp-env" tool instead; both work.)

---

## Step 5 — Open the site

| What | Address |
|---|---|
| The website | **http://localhost:8888** |
| WordPress admin | **http://localhost:8888/wp-admin** |
| Test inbox (every email the site sends) | **http://localhost:8025** |

**Admin login:** user **`admin`**. The password was created for you: in VS Code open the file **`.env`**
(in the file list on the left) and copy the value after `EK_ADMIN_PASSWORD=`. This file stays on your
computer only; it is never uploaded to GitHub.

Things to try:
- Book a SAMPLE hotel: the payment page says **"Test payment: no real money"**: click *Pay (test, succeeds)*.
- Open http://localhost:8025 to see the booking emails.
- Log in to a SAMPLE business dashboard: in wp-admin go to **Users**, open a `sample_…` user, set a new password,
  then log in at http://localhost:8888/business-dashboard/ with that user.
- Explore the admin: **wp-admin → Explore Katsina** (approvals, payouts, settings…).

---

## Every day after that

| To… | Do this (terminal) | or **Terminal → Run Task…** |
|---|---|---|
| Start the site (after a restart) | open Docker Desktop, then `docker compose -f docker-compose.offline.yml up -d` | **Explore Katsina: Start the site** |
| Stop the site (frees memory) | `docker compose -f docker-compose.offline.yml stop` | **Explore Katsina: Stop the site** |
| Get the latest changes from GitHub | Source Control → **⋯ → Pull**, then `./setup.sh --offline` | **…1. Set up / update the local site** |
| Start again with a clean site | `./setup.sh --offline --reset` (deletes the local database) | **…Start again from scratch** |

Your local data (bookings you make, settings you change) is kept between restarts until you reset.

---

## Changing things

- **The plugin** (bookings, dashboards, money, map…): `plugins/explore-katsina-core/`
- **The look** (theme, homepage, header/footer): `themes/explore-katsina/`
- **Pages text** (About, FAQs, legal drafts): `plugins/explore-katsina-core/content/pages/`

Save the file in VS Code and refresh the browser: changes show straight away (the files are shared with the
local site). After editing a **CSS or JavaScript** file, run `npm run build` (or the task **"Make the small CSS/JS
copies"**) so visitors get the updated small copies. Logged-out visitors may see a cached page: log in, or
reset the cache in **wp-admin → Settings → WP Super Cache → Delete Cache**.

To save your changes to GitHub: **Source Control** → write a short message → **Commit** → **Sync Changes**.

---

## Running the automatic tests (optional)

Once, install the test tools:

```bash
npm install
npx playwright install chromium
```

Then run everything (about 1,350 checks; takes 1–2 hours):

```bash
./tests/run.sh
```

Or one part at a time, for example `node tests/e2e/phase15-journeys.js` (the 14 journeys, about 10 minutes).
Add `--lighthouse` to `./tests/run.sh` for the phone-speed test. The last test deletes and re-creates the
SAMPLE data; that is expected.

---

## If something goes wrong

| You see | Do this |
|---|---|
| `Docker is installed but not running` | Open Docker Desktop, wait until it is running, try again. |
| `$'\r': command not found` (Windows) | The files got Windows line endings. In the terminal run `git rm -r --cached . -q && git reset --hard` (this throws away changes you have not committed), then try again. |
| `Permission denied` when running `./setup.sh` | Run `bash setup.sh --offline` instead. |
| `port is already allocated` / site will not start | Another program uses port 8888 or 8025. Close it (e.g. another local WordPress) or restart the computer. |
| The map looks grey | The map pictures come from the internet (OpenStreetMap): check your connection. |
| A page says "There has been a critical error" | See the details in `docker compose -f docker-compose.offline.yml logs wordpress`, or ask for help with that output. |
| Everything is confused | `./setup.sh --offline --reset` rebuilds the local site from scratch (your code changes are kept). |

**Never upload** `mu-plugins/ek-local-mail.php` or the `.env` file to a live site: they are for this local copy only.
