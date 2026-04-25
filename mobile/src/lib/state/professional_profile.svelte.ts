/**
 * Professional profile — the trade's onboarding info baked into every PDF
 * footer (CLAUDE.md §14 Q3).
 *
 * Stored as a single record under IndexedDB `meta` key `professional_profile`
 * because the device IS the account (§3.3). No multi-user, no sync. The
 * profile applies across all trade cartridges; future per-cartridge
 * overrides land as separate keys.
 *
 * Fields mirror `_shared/schemas/client_report.schema.json#/properties/professional`
 * so a `defaultClientReport()` can copy them into the report 1:1.
 */

import { getMeta, setMeta } from "../storage/db";

export interface ProfessionalProfile {
  name?: string;
  /** Display business name on the PDF (often distinct from `name`). */
  business_name?: string;
  /** Matriculation/license id when applicable. */
  matriculation_id?: string;
  matriculated: boolean;
  phone?: string;
  /** RUT (Uruguay tax id) when the trade invoices formally. */
  rut?: string;
  /** URI to a logo blob in StorageProvider — embedded in PDF header. */
  logo_uri?: string;
  /** When the user last edited the profile. Drives the "edit settings" tile. */
  updated_at?: string;
}

const META_KEY = "professional_profile";

interface ProfileStore {
  loaded: boolean;
  profile: ProfessionalProfile | null;
}

const store = $state<ProfileStore>({ loaded: false, profile: null });

export function professionalProfile(): ProfileStore {
  return store;
}

/** True when the trade has filled enough fields for a credible PDF footer. */
export function isProfileComplete(p: ProfessionalProfile | null): boolean {
  if (!p) return false;
  // Minimum bar: a name (or business_name) + phone. Matriculation is
  // expected for electricista but not enforced here — the cartridge's
  // disclaimer template handles non-matriculated wording.
  const hasIdentity = Boolean((p.name && p.name.trim()) || (p.business_name && p.business_name.trim()));
  const hasPhone = Boolean(p.phone && p.phone.trim());
  return hasIdentity && hasPhone;
}

export async function loadProfessionalProfile(): Promise<void> {
  const raw = await getMeta<ProfessionalProfile>(META_KEY);
  if (raw && typeof raw === "object") {
    store.profile = normalize(raw);
  } else {
    store.profile = null;
  }
  store.loaded = true;
}

export async function saveProfessionalProfile(profile: ProfessionalProfile): Promise<void> {
  const next: ProfessionalProfile = normalize({
    ...profile,
    updated_at: new Date().toISOString(),
  });
  await setMeta(META_KEY, next);
  store.profile = next;
}

export async function clearProfessionalProfile(): Promise<void> {
  await setMeta(META_KEY, null);
  store.profile = null;
}

/**
 * Test helper — drop the in-memory store so a fresh fake-IndexedDB starts clean.
 */
export function _resetProfessionalProfileForTests(): void {
  store.loaded = false;
  store.profile = null;
}

function normalize(p: ProfessionalProfile): ProfessionalProfile {
  // Trim string fields, drop empties so the sheet shows clean defaults.
  const out: ProfessionalProfile = {
    matriculated: Boolean(p.matriculated),
  };
  for (const key of ["name", "business_name", "matriculation_id", "phone", "rut", "logo_uri", "updated_at"] as const) {
    const v = p[key];
    if (typeof v === "string" && v.trim().length > 0) {
      out[key] = v.trim();
    }
  }
  return out;
}
