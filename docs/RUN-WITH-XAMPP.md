# Run Explore Katsina on your computer with XAMPP and VS Code

No Docker, no Node.js, no command line. You put WordPress in XAMPP, import the Explore Katsina site file
(`explore-katsina-site-….wpress`), and edit it with VS Code. Everything runs on your computer only.

Written for **Windows** (paths like `C:\xampp`). On a Mac, XAMPP is in `/Applications/XAMPP` and the steps are
the same. Allow about 45 minutes the first time.

You need:
- the site file **`explore-katsina-site-….wpress`** (sent to you; about 210 MB),
- the **owner login** for that file (username `explorekatsina_admin` and its password, given to you separately).

---

## Step 1 — Install XAMPP and VS Code (once)

1. Download **XAMPP for Windows with PHP 8.2 or newer** from https://www.apachefriends.org and install it to
   `C:\xampp` (the default). You only need **Apache, MySQL, PHP and phpMyAdmin**.
2. Download and install **VS Code** from https://code.visualstudio.com.
3. Open the **XAMPP Control Panel** and click **Start** next to **Apache** and **MySQL**. Both should turn green.
   (If Apache will not start, see "If something goes wrong" at the end.)

---

## Step 2 — Give PHP enough room for the import (once)

1. In the XAMPP Control Panel, on the **Apache** row click **Config → PHP (php.ini)**. The file opens in Notepad.
2. Use **Ctrl+F** to find each line below and change the number (keep everything else the same):

   ```
   upload_max_filesize = 512M
   post_max_size = 512M
   memory_limit = 512M
   max_execution_time = 300
   ```
3. Still in php.ini, find these lines and make sure there is **no `;` at the start** (remove it if there is):

   ```
   extension=gd
   extension=intl
   extension=zip
   extension=sodium
   ```
4. Save the file. In the Control Panel click **Stop** then **Start** on **Apache**.

---

## Step 3 — Create an empty database (once)

1. Open **http://localhost/phpmyadmin** in your browser.
2. Click **Databases** at the top. Name: **`explorekatsina`**. Collation: **`utf8mb4_unicode_ci`**. Click **Create**.

---

## Step 4 — Install a fresh WordPress (once)

1. Download WordPress from https://wordpress.org/download/ and unzip it.
2. Rename the unzipped **`wordpress`** folder to **`explorekatsina`** and move it into **`C:\xampp\htdocs`**,
   so you have `C:\xampp\htdocs\explorekatsina\wp-admin`, `…\wp-content` and so on.
3. Open **http://localhost/explorekatsina** and follow the installer:
   - Database Name: **`explorekatsina`** · Username: **`root`** · Password: *(leave empty)* · Database Host:
     **`localhost`** · Table Prefix: **`wp_`**
   - Site title, username and password: anything (for example `temp` / `temp-password-123`). The import in
     Step 6 replaces them.

---

## Step 5 — Open the site in VS Code and mark it as a local copy

1. In VS Code: **File → Open Folder…** → choose **`C:\xampp\htdocs\explorekatsina`**. If asked, click
   **Yes, I trust the authors**.
2. Open **`wp-config.php`** (in the file list on the left).
3. Find the line `define( 'WP_DEBUG', false );` and replace it with these lines:

   ```php
   define( 'WP_DEBUG', true );
   define( 'WP_DEBUG_LOG', true );
   define( 'WP_DEBUG_DISPLAY', false );
   define( 'SCRIPT_DEBUG', true );
   define( 'WP_ENVIRONMENT_TYPE', 'local' );
   ```
4. Save (**Ctrl+S**).

What these do: `WP_ENVIRONMENT_TYPE` = `local` switches on the **test payment** screen (no real money) and
the **Test emails** inbox in wp-admin, because XAMPP cannot send email. `SCRIPT_DEBUG` makes the site load
the readable CSS and JavaScript files, so your edits show straight away. Errors are written to
`wp-content\debug.log` instead of on the page.

**Never** put `WP_ENVIRONMENT_TYPE` = `local` on the live site.

---

## Step 6 — Import Explore Katsina

1. Go to **http://localhost/explorekatsina/wp-admin** and log in with the temporary user from Step 4.
2. **Plugins → Add New Plugin** → search **All-in-One WP Migration** → **Install Now** → **Activate** (free).
3. In the left menu: **All-in-One WP Migration → Import** → drag the **`.wpress`** file onto the page (or
   **Import From → File**).
4. When it warns that the site will be replaced, click **Proceed**. Wait (a few minutes) until it says
   **"Your site has been imported successfully"**, then click **Finish**.
5. You are logged out. Log in again with the **owner login** (`explorekatsina_admin` and its password).
6. Go to **Settings → Permalinks** and click **Save Changes** twice. (This makes the page addresses work.)

---

## Step 7 — Two small settings after the import

1. **Encryption key:** wp-admin shows a yellow box with a line starting `define( 'EK_ENCRYPTION_KEY', …`.
   Copy that whole line into **`wp-config.php`** (just under the lines you added in Step 5), save, reload wp-admin:
   the box disappears.
2. **Page cache off while you work:** **Plugins** → find **WP Super Cache** → **Deactivate** (so you always see
   your latest changes). Switch it on again on the live site.

Other yellow boxes (Wordfence "installation incomplete", FluentSMTP "no connection", Rank Math) are normal on a
local copy: you can close them.

---

## Step 8 — Use it

| What | Address |
|---|---|
| The website | **http://localhost/explorekatsina/** |
| WordPress admin | **http://localhost/explorekatsina/wp-admin** |
| Emails the site sends | **wp-admin → Explore Katsina → Test emails** |

Things to try:
- Book a SAMPLE hotel: the payment page shows **"Test payment: no real money"**: click *Pay (test, succeeds)*.
  Then open **Explore Katsina → Test emails** to read the booking emails.
- Buy event tickets: the ticket email shows the **QR codes**.
- Log in as a SAMPLE business: **Users** → open a `sample_…` user → **Set New Password** → **Update User**, then
  log in at **http://localhost/explorekatsina/business-dashboard/** with that user (use a private/incognito window
  so you stay logged in as admin in the other).
- Look around **wp-admin → Explore Katsina** (Approvals, Payouts, Invoices, Settings…).

The map needs an internet connection for its background map pictures (OpenStreetMap).

Each time you want to use the site: open the **XAMPP Control Panel** and **Start Apache and MySQL**.

---

## Step 9 — Editing with VS Code

With `C:\xampp\htdocs\explorekatsina` open in VS Code:

| To change… | Edit files in |
|---|---|
| Bookings, dashboards, money, map, emails (our plugin) | `wp-content\plugins\explore-katsina-core\` |
| The look: colours, header, footer, homepage | `wp-content\themes\explore-katsina\` |
| Page texts (About, FAQs, legal drafts) | edit them in **wp-admin → Pages** (easiest) |

Save the file (**Ctrl+S**) and refresh the browser. Because of `SCRIPT_DEBUG`, changed CSS/JavaScript files
are used straight away. (On the live site the small ".min" copies are used; a developer re-makes them with
`npm run build`. If they are out of date the site safely uses your edited files instead.)

**Make a copy before big changes:** XAMPP Control Panel → Stop both, then copy the whole
`C:\xampp\htdocs\explorekatsina` folder (and export the database in phpMyAdmin → `explorekatsina` → **Export**).
Or use **All-in-One WP Migration → Export → File** to make a new `.wpress` of your local site.

### Optional: keep the code in step with GitHub
If you also cloned the GitHub project (VS Code → Source Control → Clone Repository → Ugambo/ugambo4, branch
`claude/explore-katsina-architecture-wj2xli`), you can make XAMPP use the plugin and theme straight from it:
1. Delete `C:\xampp\htdocs\explorekatsina\wp-content\plugins\explore-katsina-core` and
   `…\wp-content\themes\explore-katsina` (they are inside the GitHub copy).
2. Open **Command Prompt** and run (change `C:\path\to\ugambo4` to where you cloned it):

   ```
   mklink /J C:\xampp\htdocs\explorekatsina\wp-content\plugins\explore-katsina-core C:\path\to\ugambo4\plugins\explore-katsina-core
   mklink /J C:\xampp\htdocs\explorekatsina\wp-content\themes\explore-katsina C:\path\to\ugambo4\themes\explore-katsina
   ```
Now edits in the GitHub copy show on the XAMPP site, and **Source Control → Commit / Sync** saves them to GitHub.

---

## What you cannot do with XAMPP only

- The **automatic tests** (about 1,350 checks) need Docker and Node.js: see `docs/RUN-LOCALLY.md` if you ever
  want them.
- **Real payments** need your Paystack/Flutterwave keys and a site on the internet: do that on the host
  (HANDOVER.md, step 1.8).
- **Real emails** are not sent from XAMPP: they appear in **Test emails** instead.

---

## If something goes wrong

| You see | Do this |
|---|---|
| Apache will not start (port 80 in use) | Close Skype/other web servers, or change the port: Apache row → **Config → httpd.conf**, change `Listen 80` to `Listen 8080`, save, Start. Then use **http://localhost:8080/explorekatsina/** everywhere. |
| MySQL will not start (port 3306 in use) | Another MySQL is running: stop it (Windows Services), or restart the computer. |
| Import says the file is too big | Step 2 was not saved, or Apache was not restarted after it. |
| "Error establishing a database connection" | MySQL is not started in the XAMPP Control Panel, or the database name in `wp-config.php` is not `explorekatsina`. |
| Pages show "Not Found" after the import | **Settings → Permalinks → Save Changes** (twice). |
| White page / "There has been a critical error" | Open `wp-content\debug.log` in VS Code and look at the last lines (or send them to a developer). |
| No "Test payment" button / no "Test emails" menu | Step 5: `WP_ENVIRONMENT_TYPE` must be `'local'` in `wp-config.php`. |
| Very slow first page loads | Normal for the first visits after starting XAMPP; it speeds up. |
