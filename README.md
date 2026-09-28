# Exclusive Caffe Lounge — Rezervacije

Web aplikacija za rezervaciju stolova u Exclusive Caffe Loungeu. Gost bira event i sto direktno na interaktivnoj mapi sale i dobija potvrdu, a vlasnik lokala sve upravlja iz admin panela — bez ijednog poziva ili papira.

Live: https://rezervacije-production-6f84.up.railway.app

## Šta radi

- Interaktivna mapa sale umjesto obične liste — gost bira tačno svoj sto
- Zaštita od duple rezervacije, spam-zahtjeva i pogađanja admin lozinke
- Admin panel: potvrda/odbijanje zahtjeva, upravljanje eventima, izvoz spiska gostiju u PDF
- Telegram notifikacija adminu čim neko rezerviše ili otkaže
- WhatsApp/Viber prečice za brz kontakt sa gostom
- Gost sam može otkazati rezervaciju preko sigurnog linka, bez zvanja lokala

## Tehnologije

Angular 19 · .NET 10 (minimal API) · SQLite · GitHub Actions

## Hosting

Frontend i backend rade kao dva odvojena servisa na [Railway](https://railway.app), svaki sa sopstvenim URL-om. Baza je na trajnom volume-u, tako da podaci ostaju i nakon redeploy-a.
