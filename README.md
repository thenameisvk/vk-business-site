# VK Customer & Cash Management System

This project retains the original VK idea and workflows: customer management, cash/loan accounts, repayment schedules, interest/rebate/late-interest calculations, payment history, admin dashboard, settings, and customer access.

## Requirements
- Node.js 20 or newer (Node.js 22 recommended)
- npm
- MongoDB (local or MongoDB Atlas)

## Local setup

### 1. Backend
```bash
cd server
npm install
```
Copy `server/.env.example` to `server/.env` and configure `MONGO_URI`, `JWT_SECRET` (at least 32 random characters), `ADMIN_SECRET_KEY`, and `CLIENT_ORIGINS`. Never commit `.env`.

Run the API:
```bash
npm start
```
The API listens on `http://localhost:5000`. Health check: `http://localhost:5000/api/health`.

Run backend tests (does not require a running MongoDB instance):
```bash
npm test
```
Optional demo data (connects to the configured database):
```bash
npm run seed
```
The seed command refuses to add demo customers if the database already contains users unless `--force` is supplied.

### 2. Frontend
In another terminal:
```bash
cd client
npm install
npm run dev
```
Open the Vite URL shown in the terminal, normally `http://localhost:5173`. During development Vite proxies `/api` to `http://localhost:5000`.

For a separately hosted backend, set `VITE_API_BASE_URL` to the full public API base URL, including `/api`, before building the frontend. Add the deployed frontend origin to backend `CLIENT_ORIGINS`.

## Production deployment checklist
1. Provision MongoDB and use a database user with only the permissions the app needs.
2. Configure all backend environment variables in the hosting provider; do not upload `.env`.
3. Use a new, unique `JWT_SECRET` (32+ characters) and a strong `ADMIN_SECRET_KEY`.
4. Set `NODE_ENV=production`, `CLIENT_ORIGINS` to the exact frontend origin(s), and `TRUST_PROXY=1` only if the host runs behind a trusted proxy.
5. Backend build/install: `npm install`; start command: `npm start`; health path: `/api/health`.
6. Frontend install/build: `npm install` / `npm run build`; publish directory: `dist`; set `VITE_API_BASE_URL` to the deployed API URL plus `/api` if frontend and backend are hosted separately.
7. Test login, create/edit customer, create account, payment recording, manual closure, settings, messaging, and all dashboard views against a staging database before production.
8. Back up the database and review applicable financial, privacy, and consumer-protection obligations before using real customer data.

## Notes
- The application uses MongoDB; the automated backend tests exercise validation, authentication, schemas, and loan calculations without connecting to a live database.
- Build/test results depend on the Node/npm version and host OS. Install dependencies with `npm install` on the deployment host rather than uploading `node_modules` from another operating system.
