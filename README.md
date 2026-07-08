# Technician App — Backend API

Node.js + Express + MongoDB (Mongoose) + JWT with role-based access for **Admin**, **Manager**, and **Technician**.

## Prerequisites

- Node.js 18+
- MongoDB running locally **or** MongoDB Atlas connection string

## Setup

If you see `ECONNREFUSED 127.0.0.1:27017` but your `.env` uses Atlas, check **Windows environment variables**: an old `MONGODB_URI` pointing at localhost can override `.env`. This project loads `BE/.env` with `override: true` so the file wins. Remove any conflicting `MONGODB_URI` from System/User env if problems persist.

### `querySrv ECONNREFUSED` / `_mongodb._tcp.cluster…`

That means **DNS failed** on the Atlas SRV lookup (`mongodb+srv://`), not a wrong password.

- **Use the Standard URI:** Atlas → **Database** → **Connect** → **Drivers** → copy the connection string that starts with `mongodb://` (lists hosts like `cluster0-shard-00-00....`) and set it as `MONGODB_URI` in `BE/.env`.
- **Or fix DNS:** Windows DNS to **8.8.8.8** / **1.1.1.1**, `ipconfig /flushdns`, retry; try without VPN; corporate networks sometimes block SRV.
- **Atlas Network Access:** allow your IP (or `0.0.0.0/0` for dev only).

1. Copy environment file:

   ```bash
   copy .env.example .env
   ```

   On macOS/Linux: `cp .env.example .env`

2. Edit `.env`:

   - **Local MongoDB:** `MONGODB_URI=mongodb://127.0.0.1:27017/technician_app`
   - **Atlas:** paste your SRV URI from the Atlas UI (user, password, cluster host, database name).

3. Install and run:

   ```bash
   npm install
   npm run dev
   ```

   Default URL: `http://localhost:5000` (or the `PORT` you set).

4. Health check:

   ```http
   GET http://localhost:5000/health
   ```

## Bootstrap first admin (testing)

Use registration with role `admin` (or create via MongoDB). Example:

```http
POST http://localhost:5000/auth/register
Content-Type: application/json

{
  "name": "Super Admin",
  "email": "admin@example.com",
  "password": "your-secure-password",
  "role": "admin"
}
```

Then log in with `POST /auth/login` or `POST /admin/login` and store the returned `token` for authenticated requests.

---

## API summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | No | Register user (`role`: `admin` \| `manager` \| `technician`) |
| POST | `/auth/login` | No | Login; returns JWT + user |
| POST | `/admin/login` | No | Login **only** if user role is `admin` |
| GET | `/admin/dashboard` | Admin JWT | Aggregated users & tasks stats |
| GET | `/admin/users` | Admin JWT | List all users |
| POST | `/admin/create-manager` | Admin JWT | Create manager account |
| POST | `/admin/create-technician` | Admin JWT | Create technician account |
| GET | `/manager/dashboard` | Manager JWT | Manager KPIs |
| GET | `/manager/technicians` | Manager JWT | List technicians |
| POST | `/manager/tasks/assign` | Manager JWT | Create task assigned to technician |
| GET | `/technician/dashboard` | Technician JWT | Technician task counts |
| GET | `/technician/tasks` | Technician JWT | List tasks assigned to me |
| PATCH | `/technician/tasks/:taskId/status` | Technician JWT | Update task status |

### Auth header

```http
Authorization: Bearer <JWT>
```

### Examples

**Login**

```http
POST http://localhost:5000/auth/login
Content-Type: application/json

{ "email": "manager@example.com", "password": "secret123" }
```

**Assign task (manager)**

```http
POST http://localhost:5000/manager/tasks/assign
Authorization: Bearer <MANAGER_JWT>
Content-Type: application/json

{
  "title": "Install HVAC unit",
  "description": "Site B, floor 2",
  "technicianId": "<technician_user_id>"
}
```

**Update task status (technician)**

```http
PATCH http://localhost:5000/technician/tasks/<taskId>/status
Authorization: Bearer <TECHNICIAN_JWT>
Content-Type: application/json

{ "status": "in_progress" }
```

Allowed `status` values: `pending`, `in_progress`, `completed`, `cancelled`.

---

## Project structure

```
BE/
├── config/          # Database connection
├── controllers/     # Route handlers
├── middlewares/     # JWT auth, RBAC, errors
├── models/          # User, Task (Mongoose)
├── routes/          # Express routers
├── utils/           # JWT helpers
├── app.js           # Express app
├── server.js        # Entry + DB connect
├── .env.example
└── package.json
```

---

## Connecting the Flutter app

1. **Base URL**

   - **iOS simulator / desktop:** `http://localhost:5000` (or your machine IP).
   - **Android emulator:** use `http://10.0.2.2:5000` to reach the host machine’s `localhost`.
   - **Physical device:** use your PC’s LAN IP, e.g. `http://192.168.1.x:5000`, and ensure the firewall allows inbound connections on `PORT`.

2. **After login**, store the JWT (e.g. `flutter_secure_storage` or `shared_preferences`) and send it on every protected request:

   ```dart
   headers: {
     'Content-Type': 'application/json',
     'Authorization': 'Bearer $token',
   }
   ```

3. **CORS** is enabled for all origins in development. For production, restrict `origin` in `app.js` to your app’s domains.

4. **Role checks:** the backend enforces roles on every route. The Flutter UI should still hide screens by role, but **always** rely on the API for security.

---

## Security notes

- Set a strong `JWT_SECRET` in production.
- Use HTTPS in production.
- Passwords are hashed with **bcrypt** (salt rounds 12).
- Add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to `BE/.env` before using payment APIs.

## Razorpay payment endpoints

```http
POST /create-order
Authorization: Bearer <MANAGER_JWT>
Content-Type: application/json

{
  "amount": 250000,
  "description": "CCTV installation payment",
  "receipt": "job_1712345678901"
}
```

```http
POST /verify-payment
Authorization: Bearer <TECHNICIAN_JWT>
Content-Type: application/json

{
  "jobId": "<job_id>",
  "razorpay_order_id": "<order_id>",
  "razorpay_payment_id": "<payment_id>",
  "razorpay_signature": "<signature>"
}
```
