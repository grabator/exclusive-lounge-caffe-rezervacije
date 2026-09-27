import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, formatDate } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AdminEvent, AdminReservation, AdminService } from '../../core/admin.service';

const STORAGE_KEY = 'rezervacije-admin-pw';

type StatusFilter = 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'all';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Na čekanju',
  confirmed: 'Potvrđeno',
  rejected: 'Odbijeno',
  cancelled: 'Otkazano',
};

@Component({
  selector: 'app-admin-page',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './admin-page.component.html',
  styleUrl: './admin-page.component.scss',
})
export class AdminPageComponent {
  private api = inject(AdminService);
  private route = inject(ActivatedRoute);

  venueSlug = this.route.snapshot.paramMap.get('venue')!;

  password = signal(sessionStorage.getItem(STORAGE_KEY) ?? '');
  authed = signal(false);
  authError = signal<string | null>(null);
  loading = signal(false);
  reservations = signal<AdminReservation[]>([]);
  actingOn = signal<string | null>(null);
  confirmingCancelId = signal<string | null>(null);
  copiedId = signal<string | null>(null);
  copyFailedId = signal<string | null>(null);
  filter = signal<StatusFilter>('pending');
  eventFilter = signal<string>('all');
  tableFilter = signal<string>('all');

  events = signal<AdminEvent[]>([]);
  showEvents = signal(false);
  showEventForm = signal(false);
  editingEventId = signal<string | null>(null);
  eventTitle = signal('');
  eventSubtitle = signal('');
  eventDate = signal('');
  eventImageUrl = signal('');
  creatingEvent = signal(false);
  eventError = signal<string | null>(null);
  confirmingDeleteEventId = signal<string | null>(null);
  deleteEventError = signal<string | null>(null);

  passwordInput = '';

  counts = computed(() => {
    const list = this.reservations();
    return {
      all: list.length,
      pending: list.filter(r => r.status === 'pending').length,
      confirmed: list.filter(r => r.status === 'confirmed').length,
      rejected: list.filter(r => r.status === 'rejected').length,
      cancelled: list.filter(r => r.status === 'cancelled').length,
    };
  });

  statusLabel(status: string): string {
    return STATUS_LABELS[status] ?? status;
  }

  availableEvents = computed(() => {
    const map = new Map<string, string>();
    for (const r of this.reservations()) map.set(r.eventId, r.eventTitle);
    return [...map.entries()].map(([id, title]) => ({ id, title }));
  });

  availableTables = computed(() => {
    const ev = this.eventFilter();
    const labels = new Set<string>();
    for (const r of this.reservations()) {
      if (ev === 'all' || r.eventId === ev) labels.add(r.tableLabel);
    }
    return [...labels].sort((a, b) => {
      const na = parseInt(a.replace(/\D/g, ''), 10), nb = parseInt(b.replace(/\D/g, ''), 10);
      return !isNaN(na) && !isNaN(nb) ? na - nb : a.localeCompare(b);
    });
  });

  filtered = computed(() => {
    const f = this.filter();
    const ev = this.eventFilter();
    const tbl = this.tableFilter();
    return this.reservations().filter(r =>
      (f === 'all' || r.status === f) &&
      (ev === 'all' || r.eventId === ev) &&
      (tbl === 'all' || r.tableLabel === tbl)
    );
  });

  onEventFilterChange(id: string) {
    this.eventFilter.set(id);
    this.tableFilter.set('all');
  }

  constructor() {
    if (this.password()) this.tryLoad(this.password());
  }

  submitPassword() {
    this.tryLoad(this.passwordInput.trim());
  }

  private tryLoad(pw: string) {
    if (!pw) return;
    this.loading.set(true);
    this.authError.set(null);
    this.api.list(pw).subscribe({
      next: (list) => {
        this.password.set(pw);
        sessionStorage.setItem(STORAGE_KEY, pw);
        this.authed.set(true);
        this.reservations.set(sortReservations(list));
        this.loading.set(false);
        this.actingOn.set(null);
        this.loadEvents();
      },
      error: () => {
        sessionStorage.removeItem(STORAGE_KEY);
        this.authed.set(false);
        this.authError.set('Pogrešna lozinka.');
        this.loading.set(false);
      },
    });
  }

  refresh() {
    this.tryLoad(this.password());
  }

  logout() {
    sessionStorage.removeItem(STORAGE_KEY);
    this.password.set('');
    this.authed.set(false);
    this.reservations.set([]);
  }

  confirm(r: AdminReservation) {
    this.actingOn.set(r.id);
    this.api.confirm(this.password(), r.id).subscribe({
      next: () => this.refresh(),
      error: (e) => {
        this.actingOn.set(null);
        // Neko drugi je vec obradio ovu rezervaciju (npr. gost je otkazao) - stara lista
        // koju gleda admin nije tacna. Javi mu jasno i odmah osvjezi da vidi pravo stanje.
        window.alert(e.error?.message ?? 'Rezervacija se više ne može potvrditi.');
        this.refresh();
      },
    });
  }

  reject(r: AdminReservation) {
    this.actingOn.set(r.id);
    this.api.reject(this.password(), r.id).subscribe({
      next: () => this.refresh(),
      error: (e) => {
        this.actingOn.set(null);
        window.alert(e.error?.message ?? 'Rezervacija se više ne može odbiti.');
        this.refresh();
      },
    });
  }

  askCancel(r: AdminReservation) {
    this.confirmingCancelId.set(r.id);
  }

  dismissCancel() {
    this.confirmingCancelId.set(null);
  }

  cancel(r: AdminReservation) {
    this.confirmingCancelId.set(null);
    this.actingOn.set(r.id);
    this.api.cancel(this.password(), r.id).subscribe({
      next: () => this.refresh(),
      error: (e) => {
        this.actingOn.set(null);
        window.alert(e.error?.message ?? 'Rezervacija se više ne može otkazati.');
        this.refresh();
      },
    });
  }

  loadEvents() {
    this.api.listEvents(this.password()).subscribe(list => this.events.set(list));
  }

  toggleEventForm() {
    if (this.showEventForm()) this.closeEventForm();
    else this.startNewEvent();
  }

  startNewEvent() {
    this.editingEventId.set(null);
    this.eventTitle.set('');
    this.eventSubtitle.set('');
    this.eventDate.set('');
    this.eventImageUrl.set('');
    this.eventError.set(null);
    this.showEventForm.set(true);
  }

  startEditEvent(ev: AdminEvent) {
    this.editingEventId.set(ev.id);
    this.eventTitle.set(ev.title);
    this.eventSubtitle.set(ev.subtitle);
    this.eventDate.set(ev.startsAt.slice(0, 16));
    this.eventImageUrl.set(ev.imageUrl ?? '');
    this.eventError.set(null);
    this.showEventForm.set(true);
  }

  closeEventForm() {
    this.showEventForm.set(false);
    this.editingEventId.set(null);
  }

  saveEvent() {
    const title = this.eventTitle().trim();
    if (!title || title.length < 3) { this.eventError.set('Upiši naziv eventa (min 3 slova).'); return; }
    if (!this.eventDate()) { this.eventError.set('Izaberi datum i vrijeme.'); return; }

    this.creatingEvent.set(true);
    this.eventError.set(null);

    const payload = {
      title,
      subtitle: this.eventSubtitle().trim() || undefined,
      // Salje se "kao sto pise" (npr. "2026-10-15T20:00", bez UTC konverzije) jer cijela
      // aplikacija tretira datume kao goli lokalni datum/vrijeme (vidi SeedData.cs) -
      // .toISOString() bi ovdje pomjerio sat za razliku u odnosu na UTC.
      startsAt: this.eventDate(),
      imageUrl: this.eventImageUrl().trim() || undefined,
    };

    const editingId = this.editingEventId();
    const req$ = editingId
      ? this.api.updateEvent(this.password(), editingId, payload)
      : this.api.createEvent(this.password(), { venueSlug: this.venueSlug, ...payload });

    req$.subscribe({
      next: () => {
        this.creatingEvent.set(false);
        this.closeEventForm();
        this.loadEvents();
      },
      error: (e) => {
        this.creatingEvent.set(false);
        this.eventError.set(e.error?.message ?? 'Greška pri čuvanju eventa.');
      },
    });
  }

  askDeleteEvent(ev: AdminEvent) {
    this.deleteEventError.set(null);
    this.confirmingDeleteEventId.set(ev.id);
  }

  dismissDeleteEvent() {
    this.confirmingDeleteEventId.set(null);
    this.deleteEventError.set(null);
  }

  deleteEvent(ev: AdminEvent) {
    this.deleteEventError.set(null);
    this.api.deleteEvent(this.password(), ev.id).subscribe({
      next: () => {
        this.confirmingDeleteEventId.set(null);
        this.loadEvents();
      },
      error: (e) => this.deleteEventError.set(e.error?.message ?? 'Event se ne može obrisati.'),
    });
  }

  async exportPdf() {
    const rows = this.filtered();
    const [regular, bold] = await Promise.all([
      loadFontBase64('fonts/Roboto-Regular.ttf'),
      loadFontBase64('fonts/Roboto-Bold.ttf'),
    ]);

    const doc = new jsPDF();
    doc.addFileToVFS('Roboto-Regular.ttf', regular);
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
    doc.addFileToVFS('Roboto-Bold.ttf', bold);
    doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
    doc.setFont('Roboto');

    const evId = this.eventFilter();
    const ev = evId !== 'all' ? this.events().find(e => e.id === evId) : undefined;
    const showEventColumn = evId === 'all';

    doc.setFontSize(16);
    doc.setFont('Roboto', 'bold');
    doc.text('Exclusive Caffe Lounge', 14, 18);

    doc.setFontSize(11);
    doc.setFont('Roboto', 'normal');
    doc.setTextColor(90);
    const statusText = this.filter() === 'all' ? 'Sve' : this.statusLabel(this.filter());
    const subtitle = ev
      ? `${ev.title} · ${formatDate(ev.startsAt, 'EEEE, d. MMMM, HH:mm', 'bs')} — ${statusText}`
      : `${statusText} rezervacije - svi eventi`;
    doc.text(subtitle, 14, 25);

    doc.setFontSize(9);
    doc.text(`Generisano: ${formatDate(new Date(), 'd.M.yyyy. HH:mm', 'bs')}`, 196, 18, { align: 'right' });

    const head = showEventColumn
      ? [['Event', 'Stol', 'Ime i prezime', 'Telefon']]
      : [['Stol', 'Ime i prezime', 'Telefon']];
    const body = rows.map(r => showEventColumn
      ? [r.eventTitle, r.tableLabel, r.fullName, r.phone]
      : [r.tableLabel, r.fullName, r.phone]);

    autoTable(doc, {
      head,
      body,
      startY: 31,
      styles: { font: 'Roboto', fontSize: 11, cellPadding: 3 },
      headStyles: { font: 'Roboto', fontStyle: 'bold', fillColor: [255, 255, 255], textColor: 20, lineWidth: 0.2, lineColor: 30 },
      theme: 'striped',
    });

    const slug = ev ? ev.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'svi-eventi';
    doc.save(`rezervacije-${slug}.pdf`);
  }

  statusLink(r: AdminReservation): string {
    return `${window.location.origin}/r/${this.venueSlug}/rezervacije/status/${r.id}`;
  }

  confirmedMessage(r: AdminReservation): string {
    return `Zdravo ${r.fullName}, tvoja rezervacija u Exclusive Caffe Loungeu je potvrđena.\n`
      + `${r.eventTitle} - stol ${r.tableLabel}.\n`
      + `Stol se čuva do 30 minuta nakon početka eventa - dođi na vrijeme.\n`
      + `Status/otkazivanje: ${this.statusLink(r)}`;
  }

  whatsappLink(r: AdminReservation): string {
    const digits = r.phone.replace(/[^\d]/g, '');
    if (r.status === 'confirmed') {
      return `https://wa.me/${digits}?text=${encodeURIComponent(this.confirmedMessage(r))}`;
    }
    return `https://wa.me/${digits}`;
  }

  viberLink(phone: string): string {
    return `viber://chat?number=%2B${phone.replace(/[^\d]/g, '')}`;
  }

  copyMessage(r: AdminReservation) {
    this.copyFailedId.set(null);
    navigator.clipboard.writeText(this.confirmedMessage(r)).then(
      () => {
        this.copiedId.set(r.id);
        setTimeout(() => {
          if (this.copiedId() === r.id) this.copiedId.set(null);
        }, 2000);
      },
      () => {
        // Kopiranje moze biti blokirano (npr. bez HTTPS ili bez dozvole) - jasno javi umjesto tihog neuspjeha.
        this.copyFailedId.set(r.id);
        setTimeout(() => {
          if (this.copyFailedId() === r.id) this.copyFailedId.set(null);
        }, 2500);
      },
    );
  }
}

function sortReservations(list: AdminReservation[]): AdminReservation[] {
  return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const fontCache = new Map<string, string>();

// jsPDF-u treba font ugradjen kao base64 da bi ispravno prikazao č/ć/š/ž/đ -
// ugradjeni jsPDF fontovi (Helvetica i sl.) nemaju te znakove. Ucitava se
// samo jednom po sesiji (keš), a ne pri svakom kliku na "Izvoz u PDF".
async function loadFontBase64(path: string): Promise<string> {
  const cached = fontCache.get(path);
  if (cached) return cached;
  const buffer = await fetch(path).then(r => r.arrayBuffer());
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  fontCache.set(path, base64);
  return base64;
}
