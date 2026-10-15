# Client wiring (what changed)

Copy these into your React project (same paths under `src/`):

| File | Purpose |
|---|---|
| `api.js` | axios instance: attaches the token, signs out on 401, friendly error text. **Set `API_BASE` for production.** |
| `context/AuthContext.jsx` | `AuthProvider` + `useAuth()` (login / logout / session) |
| `components/ProtectedRoute.jsx` | guards admin and customer routes by role |
| `App.jsx` | reference routes — merge into yours (wrap everything in `<AuthProvider>`) |
| `pages/user/Auth.jsx` | your login page, now signing in through the API (design untouched) |
| `pages/user/Home.jsx` | customer page on real data (+ sign out, refresh, empty/error states) |
| `pages/admin/Settings.jsx`, `components/ViewCustomer.jsx` | admin customers / cash / payments / chat / business settings |
| `pages/admin/Dashboard.jsx` | live stats, charts, calendar events, messages |
| `components/AdminHeader.jsx` | logout now clears the session |
| `styles/admin/AdminTheme.css`, `Settings.css`, `AdminHeader.css`, `styles/user/UserTheme.css` | replace yours (new loading / alert styles added) |

`src/UI/AdminUI.jsx`, `src/UI/UserUI.jsx`, `Home.css`, `Footer.*`, `Dashboard.css` are unchanged.
Install if missing: `npm i axios react-router-dom`.