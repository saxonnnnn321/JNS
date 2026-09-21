'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { estimateQuote } from '@/lib/pricing';
import { RATE_CARD } from '@/lib/rate-card';
import { BUSINESS } from '@/lib/business';
import { UNSEEN_CONDITION_CONFIDENCE, combineConfidence } from '@/lib/confidence';
import { conditionLabel, formatMinutes, formatMoney, formatQuantity } from '@/lib/format';
import { formatBusinessDate } from '@/lib/dates';
import type {
  LabourAddition,
  QuoteRequest,
  SiteConditions,
  SiteMeasurements,
} from '@/lib/types';
import type { OptionalTask } from '@/lib/assess/site';
import type { PropertyLookupResult } from '@/lib/property/lookup';
import { useDictation } from '@/lib/voice/use-dictation';
import { joinDictation, looksLikeAddress, tidyAddress } from '@/lib/voice/speech';
import { MicButton } from '@/components/mic-button';
import { useVoiceTarget } from '@/components/voice-provider';

/**
 * Two inputs: an address and some photos.
 *
 * The address gives us the block (NSW cadastre). The photos give us the state
 * of it. Measurements and conditions are RESULTS shown back to the operator,
 * not a form to fill in — but every one of them stays correctable under
 * "Adjust details", because the estimate is only ever an estimate.
 */

const EMPTY_MEASUREMENTS: SiteMeasurements = {
  lawnAreaM2: 0,
  edgeMetres: 0,
  hardSurfaceM2: 0,
  bedEdgeMetres: 0,
  weedAreaM2: 0,
  hedgeMetres: 0,
  greenWasteM3: 0,
  travelKm: 0,
};

const ASSUMED_CONDITIONS: Omit<SiteConditions, 'confidence'> = {
  grassHeight: 'normal',
  obstacleDensity: 'low',
  slope: 'flat',
  access: 'standardGate',
};

const MEASUREMENT_FIELDS: { key: keyof SiteMeasurements; label: string; unit: string }[] = [
  { key: 'lawnAreaM2', label: 'Lawn', unit: 'm²' },
  { key: 'edgeMetres', label: 'Edges', unit: 'm' },
  { key: 'hardSurfaceM2', label: 'Paths & drive', unit: 'm²' },
  { key: 'bedEdgeMetres', label: 'Bed edges', unit: 'm' },
  { key: 'weedAreaM2', label: 'Beds to weed', unit: 'm²' },
  { key: 'hedgeMetres', label: 'Hedge', unit: 'm' },
  { key: 'greenWasteM3', label: 'Green waste', unit: 'm³' },
  { key: 'travelKm', label: 'Distance', unit: 'km' },
];

const CONDITION_FIELDS = [
  { key: 'grassHeight', label: 'Grass height' },
  { key: 'obstacleDensity', label: 'Obstacles' },
  { key: 'slope', label: 'Slope' },
  { key: 'access', label: 'Access' },
] as const;

interface Photo {
  id: string;
  previewUrl: string;
  data: string;
  mediaType: 'image/jpeg';
}

interface Assessment {
  conditions: SiteConditions;
  requestedWork: OptionalTask[];
  statedLabour: LabourAddition[];
  greenWasteM3: number | null;
  observations: string[];
  concerns: string[];
  customerNote: string;
}

const MAX_PHOTOS = 6;

/**
 * Vercel caps a function's request body at 4.5 MB. It is an infrastructure
 * limit — no config changes it, and going over returns 413 with nothing useful
 * in the UI. Six unshrunk phone photos are ~25 MB, so the upload has to fit
 * inside that budget before it ever leaves the browser.
 *
 * Budget 3.5 MB total, leaving room for the note and the JSON around it, split
 * evenly across the maximum number of photos. Base64 inflates bytes by about a
 * third, which is accounted for here.
 *
 * Quality costs nothing up to a point: Claude downsizes anything over 1568px on
 * the long edge regardless, so the first step down is free.
 */
const UPLOAD_BUDGET_BYTES = 3_500_000;
const PER_PHOTO_BUDGET = Math.floor(UPLOAD_BUDGET_BYTES / MAX_PHOTOS);

/** Progressively harder compression, stopping as soon as one fits. */
const ENCODE_STEPS: { maxEdge: number; quality: number }[] = [
  { maxEdge: 1568, quality: 0.75 }, // free: Claude downsizes to 1568 anyway
  { maxEdge: 1568, quality: 0.6 },
  { maxEdge: 1280, quality: 0.6 },
  { maxEdge: 1024, quality: 0.55 },
  { maxEdge: 800, quality: 0.5 },
];

function encode(
  bitmap: ImageBitmap,
  maxEdge: number,
  quality: number,
): string {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not read that image');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

/** Bytes the base64 payload will actually weigh on the wire. */
function base64Bytes(dataUrl: string): number {
  return dataUrl.length - dataUrl.indexOf(',') - 1;
}

async function fileToPhoto(file: File): Promise<Photo> {
  const bitmap = await createImageBitmap(file);
  try {
    let dataUrl = '';
    for (const step of ENCODE_STEPS) {
      dataUrl = encode(bitmap, step.maxEdge, step.quality);
      if (base64Bytes(dataUrl) <= PER_PHOTO_BUDGET) break;
    }
    return {
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
      previewUrl: dataUrl,
      data: dataUrl.slice(dataUrl.indexOf(',') + 1),
      mediaType: 'image/jpeg',
    };
  } finally {
    bitmap.close();
  }
}

const card = 'rounded-xl border border-black/10 bg-white p-4 sm:p-5';
const legend = 'text-xs font-semibold uppercase tracking-wider text-bark/50';
const input =
  'mt-1 w-full rounded-lg border border-black/15 px-3 py-2 text-sm outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/20';
const primary =
  'rounded-lg bg-leaf px-5 py-2.5 text-sm font-medium text-white hover:bg-leaf/90 disabled:cursor-not-allowed disabled:bg-bark/20';

function StepHeading({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <p className={`${legend} flex items-center gap-2`}>
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-leaf text-[10px] text-white">
        {n}
      </span>
      {children}
    </p>
  );
}

export default function NewQuotePage() {
  const [customer, setCustomer] = useState({ name: '', phone: '', email: '' });
  /** What Saxon types about the job. Input to the assessment, not the PDF. */
  const [jobNote, setJobNote] = useState('');
  /** What ends up on the customer's quote. Prefilled from the assessment. */
  const [quoteNote, setQuoteNote] = useState('');
  const [labourAdditions, setLabourAdditions] = useState<LabourAddition[]>([]);

  const [addressQuery, setAddressQuery] = useState('');
  const [looking, setLooking] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<PropertyLookupResult | null>(null);
  const [measurements, setMeasurements] = useState<SiteMeasurements>(EMPTY_MEASUREMENTS);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [assessing, setAssessing] = useState(false);
  const [assessError, setAssessError] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [conditions, setConditions] =
    useState<Omit<SiteConditions, 'confidence'>>(ASSUMED_CONDITIONS);

  const [adjusting, setAdjusting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Two microphones: one for the address, one for the note. Both add to what
  // is already in the field, so speaking never wipes out what you typed.
  const addressVoice = useDictation({
    onTranscript: (text) => setAddressQuery(tidyAddress(text)),
    onDone: (text) => {
      const spoken = tidyAddress(text);
      setAddressQuery(spoken);
      // Say the address, get the price — the whole point of the thing. Only
      // when it sounds like an address, so a cough cannot fire off a lookup.
      if (looksLikeAddress(spoken)) void findProperty(spoken);
    },
  });

  const noteVoice = useDictation({ onTranscript: setJobNote });

  // Anything said into the app-wide microphone that was not a command lands
  // in the note, because on this page that is what loose words are.
  useVoiceTarget((text) => setJobNote((prev) => joinDictation(prev, text)));

  /**
   * The app-wide microphone sends a spoken address here as a query string
   * rather than shouting across the app: "quote for 12 Short Street" becomes
   * /quotes/new?address=…&lookup=1 and is picked up on arrival.
   *
   * Read from `window.location` rather than `useSearchParams` so the page
   * needs no Suspense boundary, and consumed exactly once — a refresh should
   * not silently fire the lookup again.
   */
  const consumedParams = useRef(false);
  useEffect(() => {
    if (consumedParams.current) return;
    consumedParams.current = true;

    const params = new URLSearchParams(window.location.search);
    const spokenAddress = params.get('address');
    const spokenNote = params.get('note');
    if (!spokenAddress && !spokenNote) return;

    if (spokenNote) setJobNote((prev) => joinDictation(prev, spokenNote));
    if (spokenAddress) {
      setAddressQuery(spokenAddress);
      if (params.get('lookup') === '1') void findProperty(spokenAddress);
    }

    // Leave a clean URL behind.
    window.history.replaceState(null, '', window.location.pathname);
    // findProperty is stable for the life of the page and reads its address
    // from the argument, so it is deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const measurementConfidence = lookup?.confidence ?? 0;
  const conditionConfidence =
    assessment?.conditions.confidence ?? UNSEEN_CONDITION_CONFIDENCE;
  const confidence = combineConfidence(measurementConfidence, conditionConfidence);

  const request: QuoteRequest = useMemo(
    () => ({
      customer: {
        name: customer.name || 'Draft customer',
        phone: customer.phone || undefined,
        email: customer.email || undefined,
      },
      property: lookup
        ? {
            addressLine: lookup.address.addressLine,
            suburb: lookup.address.suburb,
            state: lookup.address.state,
            postcode: lookup.address.postcode,
          }
        : { addressLine: '', suburb: '', state: 'NSW', postcode: '' },
      measurements,
      conditions: { ...conditions, confidence },
      labourAdditions,
      notes: quoteNote || undefined,
    }),
    [customer, lookup, measurements, conditions, confidence, labourAdditions, quoteNote],
  );

  const quote = useMemo(() => estimateQuote(request), [request]);
  const hasQuote = lookup !== null && measurements.lawnAreaM2 > 0;
  const ready = hasQuote && customer.name.trim() !== '';

  // Takes the address as an argument so dictation can look up what was just
  // said without waiting a render for `addressQuery` to catch up.
  async function findProperty(override?: string) {
    const query = (override ?? addressQuery).trim();
    if (!query) return;
    setLooking(true);
    setLookupError(null);
    try {
      const response = await fetch(
        `/api/property/lookup?address=${encodeURIComponent(query)}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? 'Lookup failed');
      const found = data as PropertyLookupResult;
      setLookup(found);
      setMeasurements(found.measurements);
    } catch (cause) {
      setLookup(null);
      setMeasurements(EMPTY_MEASUREMENTS);
      setLookupError(cause instanceof Error ? cause.message : 'Could not find that');
    } finally {
      setLooking(false);
    }
  }

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setAssessError(null);
    try {
      const added = await Promise.all(
        Array.from(files).slice(0, MAX_PHOTOS).map(fileToPhoto),
      );
      setPhotos((prev) => [...prev, ...added].slice(0, MAX_PHOTOS));
    } catch {
      setAssessError('Could not read one of those images');
    }
  }

  async function assess() {
    if (photos.length === 0 && jobNote.trim() === '') return;
    setAssessing(true);
    setAssessError(null);
    try {
      const response = await fetch('/api/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photos: photos.map(({ data, mediaType }) => ({ data, mediaType })),
          note: jobNote,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? 'Assessment failed');
      const result = data as Assessment;

      setAssessment(result);
      setConditions({
        grassHeight: result.conditions.grassHeight,
        obstacleDensity: result.conditions.obstacleDensity,
        slope: result.conditions.slope,
        access: result.conditions.access,
      });
      setLabourAdditions(result.statedLabour);
      if (result.customerNote) setQuoteNote(result.customerNote);

      // Extra work asked for without a time gets the quantity we already
      // estimated off the plan. Weeding is the reason the lookup keeps a bed
      // area it refuses to quote by default — asking for it is the permission.
      setMeasurements((prev) => ({
        ...prev,
        weedAreaM2: result.requestedWork.includes('weed')
          ? (lookup?.estimatedBedAreaM2 ?? prev.weedAreaM2)
          : prev.weedAreaM2,
        bedEdgeMetres: result.requestedWork.includes('bedTidy')
          ? (lookup?.measurements.bedEdgeMetres ?? prev.bedEdgeMetres)
          : prev.bedEdgeMetres,
        greenWasteM3: result.greenWasteM3 ?? prev.greenWasteM3,
      }));
    } catch (cause) {
      setAssessError(cause instanceof Error ? cause.message : 'Assessment failed');
    } finally {
      setAssessing(false);
    }
  }

  async function downloadPdf() {
    setDownloading(true);
    setError(null);
    try {
      const response = await fetch('/api/quote/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new Error(detail?.error ?? `Server returned ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${quote.reference}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not build the PDF');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-leaf">New quote</h1>
        <Link href="/" className="text-sm text-bark/50 hover:text-bark">
          ← Home
        </Link>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1.05fr_1fr] lg:items-start">
        <div className="space-y-5">
          {/* ---------- 1. the address ---------- */}
          <section className={card}>
            <StepHeading n={1}>The property</StepHeading>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                className={input}
                value={addressQuery}
                onChange={(e) => setAddressQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void findProperty();
                  }
                }}
                placeholder="12 Short Street, Emu Plains 2750"
                autoFocus
              />
              <div className="flex gap-2 sm:mt-1">
                {addressVoice.supported && (
                  <MicButton
                    listening={addressVoice.listening}
                    onClick={() => addressVoice.toggle(addressQuery)}
                    title={
                      addressVoice.listening
                        ? 'Stop listening'
                        : 'Say the address'
                    }
                  />
                )}
                <button
                  type="button"
                  onClick={() => void findProperty()}
                  disabled={looking || !addressQuery.trim()}
                  className={`${primary} flex-1 whitespace-nowrap`}
                >
                  {looking ? 'Looking…' : 'Look up'}
                </button>
              </div>
            </div>
            {addressVoice.listening && (
              <p className="mt-2 text-xs text-leaf">
                Listening — say the street, suburb and postcode. It looks up on
                its own when you stop.
              </p>
            )}
            {addressVoice.error && (
              <p className="mt-2 text-xs text-red-600">{addressVoice.error}</p>
            )}
            {lookupError && <p className="mt-2 text-xs text-red-600">{lookupError}</p>}

            {lookup && (
              <div className="mt-4 rounded-lg bg-leaf-soft p-3 text-xs">
                <p className="font-semibold text-leaf">
                  {lookup.address.formatted}
                  {lookup.parcel.lotId ? ` · Lot ${lookup.parcel.lotId}` : ''}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-bark/70 sm:grid-cols-4">
                  <span>Block <b>{lookup.parcel.areaM2} m²</b></span>
                  <span>Lawn <b>{measurements.lawnAreaM2} m²</b></span>
                  <span>Edges <b>{measurements.edgeMetres} m</b></span>
                  <span>Paving <b>{measurements.hardSurfaceM2} m²</b></span>
                </div>
                <p className="mt-2 text-bark/50">
                  {lookup.buildingSource === 'openstreetmap'
                    ? 'House outline measured.'
                    : 'House size assumed — no outline on file.'}{' '}
                  Measured from the NSW cadastre.
                </p>
                {lookup.warnings.map((line) => (
                  <p key={line} className="mt-1 text-amber-800">⚠ {line}</p>
                ))}
              </div>
            )}
          </section>

          {/* ---------- 2. the photos ---------- */}
          <section className={card}>
            <StepHeading n={2}>What the job looks like</StepHeading>
            <p className="mt-2 text-xs text-bark/50">
              The plan knows how big it is. Photos and your note are how it knows
              how bad it is. Either will do — both is better.
            </p>

            <label className="mt-3 block text-sm">
              Your note
              <textarea
                className={input}
                rows={3}
                value={jobNote}
                onChange={(e) => setJobNote(e.target.value)}
                placeholder={'This one\u2019s overgrown, hasn\u2019t been done in a month. Customer wants the beds weeded, about an hour. Take the clippings. Dog in the backyard, gate code 1234.'}
              />
            </label>

            {noteVoice.supported && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <MicButton
                  listening={noteVoice.listening}
                  onClick={() => noteVoice.toggle(jobNote)}
                  label="Say it instead"
                />
                {noteVoice.listening && (
                  <span className="text-xs text-leaf">
                    Listening — talk normally, it keeps up. Press stop when done.
                  </span>
                )}
              </div>
            )}
            {noteVoice.error && (
              <p className="mt-2 text-xs text-red-600">{noteVoice.error}</p>
            )}

            <p className="mt-1 text-xs text-bark/45">
              Plain words are fine. What you say beats what the photos suggest —
              you are the one who has seen it. Give a time (&ldquo;about an
              hour&rdquo;) and it is charged as exactly that, not estimated.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded-lg border border-leaf px-4 py-2 text-sm font-medium text-leaf hover:bg-leaf-soft">
                Add photos
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => void assess()}
                disabled={assessing || (photos.length === 0 && jobNote.trim() === '')}
                className={primary}
              >
                {assessing
                  ? 'Reading it…'
                  : photos.length > 0
                    ? `Assess ${photos.length} photo${photos.length === 1 ? '' : 's'}${jobNote.trim() ? ' + note' : ''}`
                    : 'Assess the note'}
              </button>
            </div>

            {photos.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {photos.map((photo) => (
                  <div key={photo.id} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.previewUrl}
                      alt=""
                      className="h-20 w-20 rounded-lg object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setPhotos((p) => p.filter((x) => x.id !== photo.id))}
                      className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-bark text-xs text-white"
                      aria-label="Remove photo"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {assessError && <p className="mt-2 text-xs text-red-600">{assessError}</p>}

            {assessment && (
              <div className="mt-4 rounded-lg bg-leaf-soft p-3 text-xs">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-bark/70 sm:grid-cols-2">
                  {CONDITION_FIELDS.map((field) => (
                    <span key={field.key}>
                      {field.label}: <b>{conditionLabel(field.key, conditions[field.key])}</b>
                    </span>
                  ))}
                </div>
                <ul className="mt-2 space-y-1 text-bark/70">
                  {assessment.observations.map((line) => (
                    <li key={line}>· {line}</li>
                  ))}
                </ul>
                {(assessment.statedLabour.length > 0 ||
                  assessment.requestedWork.length > 0 ||
                  assessment.greenWasteM3 !== null) && (
                  <div className="mt-2 border-t border-leaf/20 pt-2">
                    <p className="font-semibold text-leaf">Added from your note</p>
                    <ul className="mt-1 space-y-1 text-bark/70">
                      {assessment.statedLabour.map((entry) => (
                        <li key={entry.description}>
                          + {entry.description} — <b>{formatMinutes(entry.minutes)}</b>{' '}
                          as you stated
                        </li>
                      ))}
                      {assessment.requestedWork.map((task) => (
                        <li key={task}>
                          + {RATE_CARD.tasks[task].label}
                          {task === 'hedge' && measurements.hedgeMetres === 0 && (
                            <b className="text-amber-800">
                              {' '}— add the hedge length under Adjust details to price it
                            </b>
                          )}
                        </li>
                      ))}
                      {assessment.greenWasteM3 !== null && (
                        <li>+ {assessment.greenWasteM3} m³ of green waste taken away</li>
                      )}
                    </ul>
                  </div>
                )}
                {assessment.concerns.length > 0 && (
                  <ul className="mt-2 space-y-1 text-amber-800">
                    {assessment.concerns.map((line) => (
                      <li key={line}>⚠ {line}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {!assessment && (
              <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                <p>
                  Conditions are currently assumed to be an average suburban
                  lawn, so the quote stays marked indicative.
                </p>
                <p className="mt-1.5">
                  No photos handy?{' '}
                  <button
                    type="button"
                    onClick={() => setAdjusting(true)}
                    className="font-semibold underline underline-offset-2"
                  >
                    Set the conditions yourself
                  </button>{' '}
                  — grass height, obstacles, slope and access. Four dropdowns,
                  and the price is just as accurate.
                </p>
              </div>
            )}
          </section>

          {/* ---------- 3. who it is for ---------- */}
          <section className={card}>
            <StepHeading n={3}>Customer</StepHeading>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="block text-sm sm:col-span-3">
                Name
                <input
                  className={input}
                  value={customer.name}
                  onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                  placeholder="Dave Thompson"
                />
              </label>
              <label className="block text-sm">
                Phone
                <input
                  className={input}
                  inputMode="tel"
                  value={customer.phone}
                  onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                Email
                <input
                  className={input}
                  inputMode="email"
                  value={customer.email}
                  onChange={(e) => setCustomer({ ...customer, email: e.target.value })}
                />
              </label>
              <label className="block text-sm sm:col-span-3">
                Note printed on the quote
                <textarea
                  className={input}
                  rows={2}
                  value={quoteNote}
                  onChange={(e) => setQuoteNote(e.target.value)}
                  placeholder="Filled in from your note once assessed — edit freely."
                />
              </label>
            </div>
          </section>

          {/* ---------- corrections ---------- */}
          <section className={card}>
            <button
              type="button"
              onClick={() => setAdjusting((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <span className={legend}>Adjust details</span>
              <span className="text-xs text-bark/50">{adjusting ? 'Hide' : 'Show'}</span>
            </button>
            <p className="mt-1 text-xs text-bark/45">
              Everything the lookup and the photos worked out, open to correction.
            </p>

            {adjusting && (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  {MEASUREMENT_FIELDS.map((field) => (
                    <label key={field.key} className="block text-sm">
                      {field.label} <span className="text-bark/40">({field.unit})</span>
                      <input
                        className={input}
                        type="number"
                        min={0}
                        step={field.key === 'greenWasteM3' ? 0.1 : 1}
                        value={measurements[field.key]}
                        onChange={(e) =>
                          setMeasurements({
                            ...measurements,
                            [field.key]: Math.max(0, Number(e.target.value) || 0),
                          } as SiteMeasurements)
                        }
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {CONDITION_FIELDS.map((field) => (
                    <label key={field.key} className="block text-sm">
                      {field.label}
                      <select
                        className={input}
                        value={conditions[field.key]}
                        onChange={(e) =>
                          setConditions({
                            ...conditions,
                            [field.key]: e.target.value,
                          } as Omit<SiteConditions, 'confidence'>)
                        }
                      >
                        {Object.entries(
                          RATE_CARD.multipliers[field.key] as Record<
                            string,
                            { label: string; factor: number }
                          >,
                        ).map(([value, option]) => (
                          <option key={value} value={value}>
                            {option.label} (×{option.factor})
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>

        {/* ---------- the quote ---------- */}
        <div className="space-y-4 lg:sticky lg:top-8">
          {!hasQuote ? (
            <div className={`${card} text-sm text-bark/50`}>
              <p className="font-medium text-bark">No quote yet</p>
              <p className="mt-1">
                Look up an address and the price appears here. Add photos and it
                sharpens.
              </p>
            </div>
          ) : (
            <>
              <div className={`${card} text-xs`}>
                <div className="flex items-baseline justify-between">
                  <span className={legend}>Confidence</span>
                  <span className="text-sm font-semibold text-leaf">
                    {Math.round(confidence * 100)}%
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bark/10">
                  <div
                    className="h-full rounded-full bg-leaf transition-all"
                    style={{ width: `${Math.round(confidence * 100)}%` }}
                  />
                </div>
                <p className="mt-2 text-bark/55">
                  Size {Math.round(measurementConfidence * 100)}% ·{' '}
                  {assessment
                    ? `condition ${Math.round(conditionConfidence * 100)}% from photos`
                    : `condition ${Math.round(conditionConfidence * 100)}% (nobody has looked)`}
                </p>
              </div>

              {quote.needsSiteVisit && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-50 p-4 text-sm">
                  <p className="font-semibold text-amber-800">
                    Quoting this as indicative
                  </p>
                  <ul className="mt-1.5 space-y-1 text-amber-900/80">
                    {quote.siteVisitReasons.map((reason) => (
                      <li key={reason}>· {reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {quote.options.map((option) => (
                <section key={option.key} className={card}>
                  <div className="flex items-baseline justify-between gap-3">
                    <h2 className="font-semibold">{option.name}</h2>
                    <p className="text-xl font-bold text-leaf">
                      {formatMoney(option.totalCents)}
                      <span className="ml-1 text-xs font-normal text-bark/50">
                        {BUSINESS.gstRegistered ? 'inc GST' : ''}
                      </span>
                    </p>
                  </div>
                  <table className="mt-3 w-full text-sm">
                    <tbody>
                      {option.items.map((item, index) => (
                        <tr key={index} className="border-t border-black/5">
                          <td className="py-1.5 pr-2">{item.description}</td>
                          <td className="py-1.5 pr-2 text-right text-bark/50">
                            {item.quantity === null
                              ? '—'
                              : formatQuantity(item.quantity, item.unit)}
                          </td>
                          <td className="py-1.5 pr-2 text-right text-bark/50">
                            {item.minutes > 0 ? formatMinutes(item.minutes) : '—'}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {formatMoney(item.amountCents)}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-black/20">
                        <td className="py-1.5 text-bark/50" colSpan={3}>
                          Subtotal ex GST
                          {option.minimumChargeApplied && ' (minimum charge)'}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {formatMoney(option.subtotalCents)}
                        </td>
                      </tr>
                      {BUSINESS.gstRegistered && (
                        <tr>
                          <td className="py-1.5 text-bark/50" colSpan={3}>GST 10%</td>
                          <td className="py-1.5 text-right tabular-nums">
                            {formatMoney(option.gstCents)}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <p className="mt-3 text-xs text-bark/50">
                    {formatMinutes(option.totalMinutes)} on site · range{' '}
                    {formatMoney(option.bandLowCents)} – {formatMoney(option.bandHighCents)}
                  </p>
                </section>
              ))}

              <div className={card}>
                <p className="text-xs text-bark/50">
                  {quote.reference} · valid until {formatBusinessDate(quote.validUntil)}
                </p>
                <button
                  type="button"
                  onClick={() => void downloadPdf()}
                  disabled={!ready || downloading}
                  className={`${primary} mt-3 w-full py-3`}
                >
                  {downloading ? 'Building PDF…' : 'Download quote PDF'}
                </button>
                {!ready && (
                  <p className="mt-2 text-xs text-bark/45">Needs a customer name.</p>
                )}
                {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
