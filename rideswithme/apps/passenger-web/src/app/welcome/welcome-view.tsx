'use client';

import Link from 'next/link';
import type { SupportContactView, VehicleCategorySummary } from '@rideswithme/shared-types';
import { BrandMark } from '@rideswithme/web-core/client';
import { Bike, Bus, Car, CarTaxiFront, MapPinned, ShieldCheck, Wallet } from 'lucide-react';
import { LanguageSelect } from '@/components/language-select';
import { useI18n } from '@/lib/i18n';

const VEHICLE_ICONS: Record<string, typeof Car> = {
  car: Car,
  taxi: CarTaxiFront,
  keke_napep: Car,
  motorcycle: Bike,
};

/** The welcome page: logo, what RideswithMe is, the vehicle types on offer, and the way in. */
export function WelcomeView({
  vehicles,
  contact,
}: {
  vehicles: VehicleCategorySummary[];
  contact: SupportContactView;
}) {
  const { t } = useI18n();
  const features = [
    { icon: Wallet, title: t('welcome.f.price'), body: t('welcome.f.priceBody') },
    { icon: ShieldCheck, title: t('welcome.f.safety'), body: t('welcome.f.safetyBody') },
    { icon: MapPinned, title: t('welcome.f.live'), body: t('welcome.f.liveBody') },
    { icon: Bus, title: t('welcome.f.bus'), body: t('welcome.f.busBody') },
  ];
  return (
    <div className="welcome">
      <header className="welcome-top">
        <div className="brand">
          <BrandMark />
          {t('app.name')}
        </div>
        <LanguageSelect />
      </header>

      <main>
        <section className="welcome-hero">
          <div className="welcome-hero-logo">
            <BrandMark size={96} />
          </div>
          <h1>{t('welcome.title')}</h1>
          <p className="welcome-lead">{t('welcome.lead')}</p>
          <div className="welcome-actions">
            <Link href="/sign-in" className="btn btn-accent btn-large" data-testid="welcome-book">
              {t('welcome.book')}
            </Link>
            <Link href="/sign-in" className="btn btn-secondary btn-large">
              {t('welcome.signIn')}
            </Link>
          </div>
          <p className="small welcome-note">{t('welcome.noPassword')}</p>
        </section>

        {vehicles.length > 0 && (
          <section className="welcome-section" aria-labelledby="welcome-vehicles">
            <h2 id="welcome-vehicles">{t('welcome.vehicles')}</h2>
            <ul className="welcome-vehicles">
              {vehicles.map((v) => {
                const Icon = VEHICLE_ICONS[v.key] ?? Car;
                return (
                  <li key={v.key} className="welcome-card">
                    <Icon aria-hidden className="welcome-icon" />
                    <strong>{v.name}</strong>
                    <span className="small muted">{v.description}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="welcome-section" aria-labelledby="welcome-why">
          <h2 id="welcome-why">{t('welcome.why')}</h2>
          <ul className="welcome-features">
            {features.map((f) => (
              <li key={f.title} className="welcome-card">
                <f.icon aria-hidden className="welcome-icon" />
                <strong>{f.title}</strong>
                <span className="small muted">{f.body}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="welcome-section welcome-drive">
          <h2>{t('welcome.drive')}</h2>
          <p>{t('welcome.driveBody')}</p>
        </section>
      </main>

      <footer className="welcome-footer small">
        {(contact.phone || contact.email) && (
          <p>
            {t('welcome.contact')}{' '}
            {contact.phone && (
              <a href={`tel:${contact.phone.replace(/\s/g, '')}`}>{contact.phone}</a>
            )}
            {contact.phone && contact.email && ' · '}
            {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
          </p>
        )}
        <p className="muted">
          © {new Date().getFullYear()} {t('app.name')}
        </p>
      </footer>
    </div>
  );
}
