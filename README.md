# Exclusive Caffe Lounge reservations

Table booking app for a café lounge. Guests pick an event and their exact table on an interactive floor plan, and the owner manages everything from an admin panel, with no phone calls or paper.

**Live:** https://rezervacije-production-6f84.up.railway.app/r/exclusive/rezervacije

## What's inside

- Interactive floor plan instead of a plain list
- Protection against double bookings, spam requests and admin password guessing
- Admin panel: confirm or decline requests, manage events, export the guest list as PDF
- Telegram alert to the admin for every booking or cancellation
- WhatsApp and Viber shortcuts to contact a guest
- Guests can cancel through a secure link

## Tech

Angular 19, .NET 10 (minimal API), SQLite, GitHub Actions. Frontend and backend run as two services on Railway, with the database on a persistent volume.

## Run locally

```
npm install
npm start
```

The API is in `api/Rezervacije.Api` (`dotnet run`).

Made by [Ahmed Grabus (Graba)](https://graba-portofolio.grabafaceit.workers.dev)
