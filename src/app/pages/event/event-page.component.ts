import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { switchMap } from 'rxjs';
import { ReservationService } from '../../core/reservation.service';
import { FloorTable, VenueEvent } from '../../core/models';
import { FloorMapComponent } from '../../components/floor-map/floor-map.component';

@Component({
  selector: 'app-event-page',
  standalone: true,
  imports: [DatePipe, ReactiveFormsModule, RouterLink, FloorMapComponent],
  templateUrl: './event-page.component.html',
  styleUrl: './event-page.component.scss',
})
export class EventPageComponent {
  private route = inject(ActivatedRoute);
  private api = inject(ReservationService);
  private fb = inject(FormBuilder);

  venueSlug = this.route.snapshot.paramMap.get('venue')!;
  venue = toSignal(this.api.getVenue(this.venueSlug));
  event = toSignal(this.route.paramMap.pipe(switchMap(p => this.api.getEvent(p.get('eventId')!))));

  table = signal<FloorTable | null>(null);
  submitting = signal(false);
  error = signal<string | null>(null);
  done = signal(false);
  lastReservationId = signal<string | null>(null);

  form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(3)]],
    phone: ['', [Validators.required, Validators.pattern(/^\+?[0-9 /-]{8,}$/)]],
    note: [''],
    terms: [false, Validators.requiredTrue],
    hp: [''],
  });

  pickTable(t: FloorTable) {
    this.table.set(this.table()?.id === t.id ? null : t);
    this.error.set(null);
  }

  continueToForm() {
    document.getElementById('guest-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  invalid(name: keyof typeof this.form.controls) {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  submit(ev: VenueEvent) {
    this.error.set(null);
    if (!this.table()) { this.error.set('Izaberi stol na mapi.'); return; }
    if (this.form.invalid) { this.form.markAllAsTouched(); this.error.set('Popuni obavezna polja označena crvenom.'); return; }

    const v = this.form.getRawValue();
    this.submitting.set(true);
    this.api.reserve({
      eventId: ev.id, tableId: this.table()!.id,
      fullName: v.fullName.trim(), phone: v.phone.trim(), note: v.note.trim() || undefined,
      hp: v.hp || undefined,
    }).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.lastReservationId.set(res.reservationId);
        this.done.set(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        try {
          localStorage.setItem('rezervacije-last', JSON.stringify({ venueSlug: this.venueSlug, id: res.reservationId }));
        } catch { /* privatni prozor ili blokiran storage - link za status jednostavno nece biti ponudjen kasnije */ }
      },
      error: (e: Error) => { this.submitting.set(false); this.table.set(null); this.error.set(e.message); },
    });
  }
}
