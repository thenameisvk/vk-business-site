# VK server (Express + MongoDB Atlas)

## 1 · MongoDB Atlas (one-time, ~5 min, free M0 is enough)
1. Atlas → **Database Access** → *Add New Database User* (username + password, role *Read and write to any database*).
2. Atlas → **Network Access** → *Add IP Address* → your IP (or `0.0.0.0/0` while testing; tighten before going live).
3. Atlas → **Database → Connect → Drivers** → copy the `mongodb+srv://…` string.
4. Paste it into `.env` as `MONGO_URI`, replacing `<db_username>`, `<db_password>`, `<cluster-host>`.
   Keep `/vk` before the `?` — that is the database name (created automatically).

## 2 · Run
```bash
npm install
npm run dev        # http://localhost:5000/api/health  → { ok: true }
npm run seed       # optional demo customers (prints their secret keys)
npm test           # 26 tests: loan maths, auth, validation, schemas
```
Sign in on the login page with `ADMIN_SECRET_KEY` (in `.env`) for the admin panel, or with a customer's secret key.

## 3 · API map
| Area | Endpoint |
|---|---|
| Auth | `POST /api/user/login` · `GET /api/user/me` · `GET /api/user/public` |
| Customer (Home) | `GET /api/user/accounts` · `GET /api/user/config` · `GET/POST /api/user/messages` · `POST /api/user/messages/read` |
| Admin · customers | `GET/POST /api/settings/customers` · `GET/PATCH/DELETE /api/settings/customers/:id` · `POST …/bulk` · `GET …/export` |
| Admin · cash | `POST /api/settings/customers/:id/cash` · `PATCH/DELETE /api/settings/cash/:cashId` · `POST …/complete` · `POST …/reopen` |
| Admin · payments | `POST /api/settings/cash/:cashId/payments` · `PATCH/DELETE …/payments/:pid` |
| Admin · chat / config | `GET/POST /api/settings/customers/:id/messages` · `GET/PUT /api/settings/config` |
| Dashboard | `GET /api/dashboard/overview` · `/chart?range=` · `/recent-users` · `/events` · `/messages` |

## 4 · How the database stays small
* **Four tiny collections** + one settings document: `users`, `cash` (payments embedded), `messages`, `events`, `settings`.
* **Nothing derived is stored** — balance, progress, status, late interest and rebate are recalculated from the facts (`utils/loanMath.js`).
* **Money = integer paise** (no floats, no rounding drift).
* **Chat auto-deletes after 24 h** and **events 90 days after they happen** (MongoDB TTL indexes).
* Only 5 indexes in total; documents have no `__v`; text fields have length limits; a cash entry holds ≤ 400 payments and a customer ≤ 50 entries.
* Deleting a customer removes their cash entries and messages too — no orphans.

## 5 · Before going live
* Change `ADMIN_SECRET_KEY`; keep `JWT_SECRET` private; set `NODE_ENV=production`.
* Set `CLIENT_ORIGINS` to your real site URL and `TRUST_PROXY=1` behind a host like Render/Railway.
* Restrict Atlas Network Access to your server's IP.