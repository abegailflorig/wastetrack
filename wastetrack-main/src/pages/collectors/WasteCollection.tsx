import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  Footprints,
  MapPin,
  Trash2,
  UsersRound,
} from "lucide-react";

import { supabase } from "../../lib/supabase";
import bin3 from "../../assets/bin3.png";

// Same shape the dashboard passes through router state.
type CollectionItem = {
  id: string;
  siteId: string;
  name: string;
  address: string;
  date: string;
  status: "Collected" | "Pending";
  scheduledTime?: string;
  completedTime?: string;
};

type SiteRecord = {
  site_name: string;
  location: string;
};

type ScheduleRow = {
  schedule_id: string;
  site_id: string;
  date: string;
  collection_time: string | null;
  disposal_sites: SiteRecord | SiteRecord[] | null;
};

function formatDate(value?: string) {
  if (!value) return "Not available";

  const [year, month, day] = value.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value?: string | null) {
  if (!value) return "Not set";

  const match = value.match(/^(\d{2}):(\d{2})/);

  if (!match) return value;

  const date = new Date();
  date.setHours(Number(match[1]), Number(match[2]), 0, 0);

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function WasteCollection() {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const scheduleId = searchParams.get("scheduleId");

  // Data passed from the dashboard card. Undefined after a refresh
  // or when the page is opened directly.
  const stateCollection = location.state?.collection as
    | CollectionItem
    | undefined;

  const [collection, setCollection] = useState<
    CollectionItem | undefined
  >(stateCollection);

  const [loading, setLoading] = useState(
    !stateCollection && Boolean(scheduleId)
  );
  const [error, setError] = useState<string | null>(null);

  // Fallback: if there is no router state, fetch the schedule by ID.
  useEffect(() => {
    if (stateCollection || !scheduleId) return;

    let active = true;

    async function fetchSchedule() {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from("schedules")
          .select(`
            schedule_id,
            site_id,
            date,
            collection_time,
            disposal_sites!schedules_site_id_fkey (
              site_name,
              location
            )
          `)
          .eq("schedule_id", scheduleId)
          .single();

        if (fetchError) throw fetchError;

        const row = data as unknown as ScheduleRow;

        const site = Array.isArray(row.disposal_sites)
          ? row.disposal_sites[0]
          : row.disposal_sites;

        if (active) {
          setCollection({
            id: row.schedule_id,
            siteId: row.site_id,
            name: site?.site_name ?? "Waste Disposal Site",
            address: site?.location ?? "Location not available",
            date: row.date,
            status: "Pending",
            scheduledTime: formatTime(row.collection_time),
          });
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load collection details."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void fetchSchedule();

    return () => {
      active = false;
    };
  }, [scheduleId, stateCollection]);

  const siteName = collection?.name ?? "Waste Disposal Site";
  const siteAddress = collection?.address ?? "Location not available";

  return (
    <main className="flex h-[calc(100dvh-5rem)] min-h-0 flex-col overflow-hidden bg-white">
      <div className="mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col px-3 pb-3 pt-7 sm:px-4">
        {/* Red title bar */}
        <header className="shrink-0 rounded-t-lg bg-[#c90000] px-1 pb-3 pt-1">
          <div className="flex items-center gap-1">
            <Link
              to="/collector/dashboard"
              aria-label="Back to dashboard"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white hover:bg-white/15"
            >
              <ArrowLeft size={18} strokeWidth={1.8} />
            </Link>

            <h1 className="text-sm font-bold text-white">
              Waste Collection
            </h1>
          </div>
        </header>

        {/* White content panel */}
        <div className="relative -mt-2 flex min-h-0 flex-1 flex-col rounded-t-xl border-x border-neutral-200 bg-white">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 pb-3 pt-3">
            {loading && (
              <p className="rounded-lg bg-[#faf3e8] px-4 py-5 text-center text-sm text-neutral-600">
                Loading collection details...
              </p>
            )}

            {!loading && error && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700"
              >
                <p className="font-semibold">
                  Unable to load collection details
                </p>
                <p className="mt-1">{error}</p>
              </div>
            )}

            {/* Site summary */}
            <section className="flex items-center gap-2.5 rounded-xl border border-[#cfc5c7] bg-[#fff6f7] px-2.5 py-3 shadow-[0_3px_2px_rgba(0,0,0,0.18)]">
              <div
                aria-hidden="true"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#ffa7b1] text-[#ff1938]"
              >
                <Trash2 size={32} strokeWidth={2.2} />
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="break-words text-sm font-bold leading-tight text-black">
                  {siteName}
                </h2>

                <p className="mt-1 flex items-center gap-1 text-[10px] leading-tight text-neutral-700">
                  <MapPin size={10} className="shrink-0" />
                  <span>{siteAddress}</span>
                </p>

                {/* TODO: replace with the real QR code from Supabase */}
                <p className="mt-1 text-[9px] leading-tight text-neutral-700">
                  QR-143
                </p>
              </div>
            </section>

            {/* Site information */}
            <section className="overflow-hidden rounded-lg border border-[#d0d0d0] bg-white">
              <h2 className="px-2 pb-1 pt-2 text-[11px] font-semibold text-[#c90000]">
                Site Information
              </h2>

              <div className="px-2 pb-1">
                <InformationRow
                  icon={<CalendarDays size={13} />}
                  label="Collection Date"
                  value={formatDate(collection?.date)}
                />

                <InformationRow
                  icon={<Clock3 size={13} />}
                  label="Time"
                  value={collection?.scheduledTime ?? "Not set"}
                />

                {/* TODO: replace with real data from Supabase */}
                <InformationRow
                  icon={<UsersRound size={13} />}
                  label="Reported By"
                  value="3 resident(s)"
                />

                {/* TODO: replace with the real distance */}
                <InformationRow
                  icon={<Footprints size={13} />}
                  label="Distance"
                  value="2.2 km"
                />
              </div>
            </section>

            {/* Before collection photo */}
            <section className="rounded-lg border border-[#d0d0d0] bg-white px-2 pb-4 pt-2">
              <h2 className="text-[11px] font-semibold text-[#c90000]">
                Before Collection
              </h2>

              <div className="mt-3 px-2">
                <img
                  src={bin3}
                  alt={`${siteName} before collection`}
                  className="aspect-[3/2] w-full rounded-lg object-cover"
                />
              </div>
            </section>
          </div>

          {/* Start collection */}
          <footer className="shrink-0 bg-white px-4 pb-7 pt-5">
            <Link
              to="/collector/route"
              state={{
                site: {
                  id: collection?.siteId ?? scheduleId,
                  scheduleId: collection?.id ?? scheduleId,
                  name: siteName,
                  image: bin3,
                  address: siteAddress,
                  // TODO: replace the values below with real data
                  latitude: 8.2373215,
                  longitude: 124.2480787,
                  qrCode: "QR-143",
                  residents: 3,
                  wasteLevel: "NEAR FULL",
                  lastCollection: "2 days ago, 1:00 PM",
                  collectionDate: collection?.date,
                  collectionTime: collection?.scheduledTime,
                },
              }}
              className="mx-auto flex min-h-11 w-[72%] max-w-[260px] items-center justify-center rounded-lg bg-[#c90000] px-3 text-xs font-bold text-white hover:bg-red-800"
            >
              Start Collection
            </Link>
          </footer>
        </div>
      </div>
    </main>
  );
}

type InformationRowProps = {
  icon: ReactNode;
  label: string;
  value: string;
};

function InformationRow({
  icon,
  label,
  value,
}: InformationRowProps) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] items-start gap-2 border-b border-[#eee3d8] px-1 py-2 text-[10px] last:border-b-0 sm:text-[11px]">
      <span className="flex items-center gap-1.5 text-neutral-600">
        <span className="shrink-0">{icon}</span>
        <span>{label}</span>
      </span>

      <span className="break-words text-right font-medium text-neutral-900">
        {value}
      </span>
    </div>
  );
}
