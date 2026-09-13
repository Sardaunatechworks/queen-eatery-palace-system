# Queen's Palace Eatery & Event Hall - Frontend V2

Production Single-Page Application (SPA) for Queen's Palace Eatery & Event Hall.

## Architecture

```
queenspalaceeatery.com
        ↓
      Vercel (React 19 + Vite 6 + TypeScript)
        ↓  (HTTPS API calls with HttpOnly credentials)
https://api.queenspalaceeatery.com
        ↓
DirectAdmin (PHP 8.3 REST API)
        ↓
MySQL 8 Database
```

## Tech Stack

- **Framework**: React 19, TypeScript (~5.8), Vite 6
- **Styling**: Tailwind CSS v4
- **State Management & Routing**: React Router v7, React Context
- **Icons & Motion**: Lucide React, Motion
- **Reports & Exporting**: Recharts, jsPDF, AutoTable, XLSX, html2canvas
- **Payment**: React Paystack (Client-side checkout modal)
- **Deployment Platform**: Vercel

## System Modules

1. **Public Website**: Hero dining showcase, dynamic menus, gallery, story, event hall booking request form, and direct WhatsApp contact.
2. **Customer Portal**: Registration, login, active menu browsing, live takeaway fee calculation, shopping cart, and Paystack online checkout.
3. **Guest QR Table Ordering**: Frictionless QR table ordering with table-bound sessions and live status tracking.
4. **Order Tracking**: Real-time order progress timeline.
5. **Cashier POS**: Fast search, custom orders, cash/Paystack payment recording, live kitchen dispatch, receipt printing, and audio alerts.
6. **Kitchen Display System (KDS)**: Unified live order queue, item status progression (Pending → Preparing → Ready), and audio alerts.
7. **Inventory Management**: Real-time stock levels, low-stock threshold alerts, batch movements, supplier directory, and restock records.
8. **Menu Management**: Categories, food items, pricing, allergen tags, availability toggles, and image uploads.
9. **Staff Management**: Role-based access control (Super Admin, Manager, Cashier, Kitchen Staff), PIN/password security, and activity logs.
10. **Financial & Operations Reports**: Revenue analytics, payment method breakdown, transaction logs, CSV/Excel/PDF exports.
11. **CMS (Content Management)**: Hero banners, announcement banner, business hours, and contact information.
12. **Event Hall Management**: Reservation booking review, approval/rejection workflows, and automated client messaging.

## Environment Variables

Copy `.env.example` to `.env.local` for local development:

```bash
cp .env.example .env.local
```

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `VITE_API_URL` | Base origin of the PHP REST API backend | `https://api.queenspalaceeatery.com` |
| `VITE_PAYSTACK_PUBLIC_KEY` | Paystack Public Key for inline checkout | `pk_live_...` / `pk_test_...` |

> **SECURITY NOTE**: Only the Paystack **Public Key** (`VITE_PAYSTACK_PUBLIC_KEY`) belongs in the frontend. Never place Paystack Secret Keys, database passwords, or private tokens in this repository or client build.

## Development

```bash
# Install dependencies
npm install

# Run local development server
npm run dev

# Type check
npm run lint

# Production build
npm run build
```

## Production Deployment (Vercel)

1. Connect this repository to Vercel.
2. Build Command: `npm run build`
3. Output Directory: `dist`
4. Install Command: `npm install`
5. Configure Environment Variables in Vercel:
   - `VITE_API_URL`: `https://api.queenspalaceeatery.com`
   - `VITE_PAYSTACK_PUBLIC_KEY`: (Your Paystack Live Public Key)
6. Attach custom domain `queenspalaceeatery.com`.
