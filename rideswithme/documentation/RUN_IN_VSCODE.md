# Running RideswithMe in VS Code

This guide gets the API, admin dashboard, passenger website and partner
portal running on your computer from VS Code, then covers the phone apps,
debugging and tests. It works on Windows, macOS and Linux. Allow about 30
minutes the first time, most of it downloads.

Every step was rehearsed on a fresh copy of the code.

## 1. Install the tools (once)

| Tool                 | Why                                     | Get it                                                                                                |
| -------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **VS Code**          | the editor                              | code.visualstudio.com                                                                                 |
| **Git**              | to download the code                    | git-scm.com                                                                                           |
| **Node.js 22** (LTS) | runs everything                         | nodejs.org. Choose version 22.                                                                        |
| **pnpm 10**          | installs the packages                   | after Node: run `corepack enable` in a terminal (on Windows, in a terminal opened "as administrator") |
| **Docker Desktop**   | runs PostgreSQL, Redis and file storage | docker.com/products/docker-desktop. Start it, and wait until it says it is running.                   |

Check them in a terminal. Each should print a version:

```sh
git --version
node --version      # v22.x
pnpm --version      # 10.x
docker --version
```

**Windows:** Docker Desktop needs WSL 2, and offers to set it up during
installation. If anything later misbehaves on Windows (slow installs, file
watching), install the **WSL** extension in VS Code and do everything inside
WSL (Ubuntu) instead. Everything in this guide works the same there.

## 2. Get the code and open it

```sh
git clone https://github.com/ugambo/ugambo4.git
cd ugambo4
git checkout ccr-a4a52d25-93z2fg
```

In VS Code: **File → Open Folder…** and choose the **`rideswithme`** folder
inside `ugambo4`, not `ugambo4` itself. The editor settings, tasks and debug
configurations are in `rideswithme/.vscode`.

When VS Code asks **"Do you want to install the recommended extensions?"**,
choose **Install**. They are:

- ESLint and Prettier: errors shown as you type, formatting on save
- Docker
- Vitest and Playwright: run tests from the Testing panel
- Expo Tools

If VS Code asks whether to use the workspace's TypeScript version, say
**Allow**.

## 3. First-time set-up: five tasks

Everything is a **task**: open **Terminal → Run Task…** (or press
`Ctrl+Shift+P` / `Cmd+Shift+P`, type "Run Task") and pick one. Run these in
order and wait for each to finish:

| Task                                   | What it does                                                                                                             | Takes                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------- |
| **1. Create settings files (.env)**    | Writes a `.env` file for each app, with fresh random secrets. These files stay on your computer and are never committed. | seconds                 |
| **2. Start databases (Docker)**        | Starts PostgreSQL (with PostGIS), Redis and the S3 stand-in in Docker                                                    | 1–3 min the first time  |
| **3. Install and build**               | `pnpm install`, then builds every package and app                                                                        | 5–10 min the first time |
| **4. Prepare the database**            | Creates the tables, then adds a test city (Katsina) with **placeholder** fares                                           | seconds                 |
| **5. Make a phone number super admin** | Asks for your phone number and gives it the super admin role. Use any Nigerian number: no real SMS is sent.              | seconds                 |

Prefer the terminal? The same steps are:

```sh
pnpm setup:local
docker compose up -d --wait postgres redis s3
pnpm install
pnpm build
pnpm db:migrate:local
pnpm seed:local
pnpm --filter @rideswithme/api cli grant-role --phone 08031234567 --role super_admin
```

## 4. Run it

**Terminal → Run Task… → Run everything.** Four terminals open side by side:

| What                                      | Address                                       |
| ----------------------------------------- | --------------------------------------------- |
| API                                       | <http://localhost:3000> (try `/health/ready`) |
| Admin dashboard                           | <http://localhost:3001>                       |
| Passenger website                         | <http://localhost:3002>                       |
| Partner portal (fleets and bus operators) | <http://localhost:3003>                       |

Code changes reload by themselves. To stop, click the bin icon on each
terminal, or close VS Code. To stop the databases too, run the task **Stop
databases (Docker)**. Your data is kept for next time.

### Signing in: where the SMS codes are

No real SMS is sent in development. The code appears in the **API** terminal,
in a line like:

```
[DEV SMS] to +2348031234567: Your RideswithMe code is 482913. It expires in 5 minutes.
```

**Admin dashboard** (<http://localhost:3001>):

1. Enter the phone number from task 5, then **Send code**, then the code from
   the API terminal.
2. Staff must use two-factor sign-in. Scan the QR code with an authenticator
   app on your phone (Google Authenticator, Microsoft Authenticator, Authy…),
   then enter the 6-digit code it shows. Next time you only need the SMS code
   and the authenticator code.

**Passenger website** (<http://localhost:3002>): sign in with any other phone
number and its code from the API terminal.

**Partner portal** (<http://localhost:3003>):

1. In the admin dashboard, create a fleet (**Fleets → New fleet**) or a bus
   operator (**Buses → New bus operator**) with a manager's phone number.
2. Sign in to the portal with that number: SMS code, then authenticator, as
   for staff.

### Things to try

- **Buses:** in the portal, add a route, draw a seat layout and create
  departures. Then on the passenger website, go to **Buses**, choose seats and
  pay. Payments are simulated: the "fake checkout" page has **Pay**,
  **Decline** and **Cancel** buttons.
- **Wallet:** top up on the passenger website with the fake checkout. Then see
  the money in admin → **Payments**.
- **Safety:** press **SOS** during a ride, and watch the red banner appear in
  the admin dashboard straight away.
- **Hausa:** every screen has a language switch.
- **A full ride** needs a driver. Either run the driver app (section 6), or
  run the browser tests (section 8). They simulate a driver and save
  screenshots of every step.

Places in development come from a built-in demo list. For Katsina, search
"Katsina", "Emir", "Gobarau", "stadium" or "airport". Routes are straight-line
estimates, until Google Maps keys are added.

## 5. Debugging

Open **Run and Debug** (`Ctrl+Shift+D`):

| Configuration                                                          | What it does                                                                                 |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Debug API**                                                          | Builds and starts the API under the debugger. Breakpoints in `apps/api/src/**/*.ts` work.    |
| **Debug admin dashboard** / **passenger website** / **partner portal** | Starts that site with the debugger attached to its server code, and opens it in your browser |
| **Debug everything**                                                   | All four at once                                                                             |

Stop **Run everything** first: the debug configurations use the same ports.
Breakpoints in browser code (`'use client'` components) are easiest in the
browser's own developer tools (F12).

## 6. The phone apps (driver and passenger)

Both apps use location, background tracking and push notifications, so they
run as a **development build**. The Expo Go app from the store will not work.

**Android emulator (Windows, macOS or Linux):**

1. Install **Android Studio**. In **Device Manager**, create a phone (for
   example Pixel 7, a recent Android version) and start it.
2. In a VS Code terminal:

   ```sh
   cd apps/driver-mobile        # or apps/passenger-mobile
   npx expo run:android         # the first build takes 10–20 minutes
   ```

3. The app opens in the emulator, talking to your API through
   `http://10.0.2.2:3000`, which is how an emulator reaches your computer. That
   address is already in the app's `.env`.
4. Later, start just the JavaScript side with the task **Driver app (Metro…)**
   or **Passenger app (Metro…)**, and open the installed app.

**A real Android phone:**

1. Turn on **USB debugging** and connect the phone. Keep the phone and
   computer on the same Wi-Fi.
2. In the app's `.env`, set `EXPO_PUBLIC_API_URL=http://<your computer's
Wi-Fi IP address>:3000`.
3. Run `npx expo run:android`.

**iPhone:** needs a Mac with Xcode. Run `npx expo run:ios`.

**A full ride, end to end:**

1. Sign up in the driver app and send the application.
2. Approve it in admin → **Driver verification**.
3. Go online in the driver app.
4. Book from the passenger website or the passenger app, near the driver. The
   test city is Katsina.

## 7. Day-to-day commands

| Task / command                               | When                                                                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Run everything**                           | each time you start working                                                                                          |
| **Build everything** (`pnpm build`)          | after pulling new code. Also run **4. Prepare the database** if new migrations arrived; it only applies what is new. |
| `pnpm lint`, `pnpm typecheck`, `pnpm format` | before committing (VS Code also formats on save)                                                                     |
| `pnpm hausa:export`                          | spreadsheet of every English and Hausa text, for the Hausa reviewer                                                  |

## 8. Tests

- **Unit and integration tests:** run the task **Tests: everything except
  browsers** (`pnpm test`). These need the Docker databases running. They use
  their own test database, never your data.
- **Browser tests:** run the task **Tests: browser tests (all three
  websites)**.
  - Build first (**Build everything**). Then a real API and each website start
    on their own ports, and a browser drives them, with a simulated driver.
  - This also runs the accessibility checks (WCAG 2.1 AA, and phone widths
    down to 320 px).
  - Screenshots of every step are saved in `apps/<site>/e2e/.output/screenshots`.
- **In the editor:** the Testing panel (flask icon) lists the Vitest and
  Playwright tests, to run or debug one at a time.

## 9. If something goes wrong

| Problem                                        | Fix                                                                                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task 2 fails: "port 5432 is already allocated" | Another PostgreSQL is running on your computer. Stop it (Windows: Services → postgresql → Stop), or change the port in `docker-compose.yml` and in `DATABASE_URL` in `apps/api/.env`. |
| "Cannot connect to the Docker daemon"          | Start Docker Desktop and wait until it says it is running.                                                                                                                            |
| The API stops with "Invalid configuration"     | It names the setting. Usually the `.env` file is missing: run task 1 again (it never overwrites).                                                                                     |
| "Too many attempts" when signing in            | The sign-in limits are working. Wait an hour, or clear them: `docker compose exec redis redis-cli FLUSHALL`.                                                                          |
| No SMS code in the API terminal                | Make sure you are looking at the **API** terminal, not a website's, and that `SMS_PROVIDER=console` is in `apps/api/.env`.                                                            |
| A page says it cannot reach the API            | Is the **API** terminal running and showing no errors? Check <http://localhost:3000/health/ready>.                                                                                    |
| Start again with an empty database             | `docker compose down -v` (deletes all local data), then tasks 2 and 4.                                                                                                                |
| `pnpm` is not recognised (Windows)             | Run `corepack enable` in a terminal opened as administrator, then restart VS Code.                                                                                                    |
| The phone app cannot reach the API             | Emulator: `EXPO_PUBLIC_API_URL=http://10.0.2.2:3000`. Real phone: your computer's Wi-Fi IP, the same network, and allow Node through the computer's firewall.                         |

## What you should see

Screenshots from the browser tests (a real API, a simulated driver and real
browsers) are in each site's `e2e/.output/screenshots` folder once the tests
have run. The README lists what each phase built.
