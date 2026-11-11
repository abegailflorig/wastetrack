import type { ReactNode } from "react";
import { Link } from "react-router";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  Footprints,
  MapPin,
  Trash2,
  UsersRound,
} from "lucide-react";

import bin3 from "../../assets/bin3.png";

export default function WasteCollection() {
  return (
    <main className="flex h-[calc(100dvh-5rem)] min-h-0 flex-col overflow-hidden bg-white">
      <div className="mx-auto flex min-h-0 w-full max-w-[430px] flex-1 flex-col px-3 pb-3 pt-7 sm:px-4">
        {/* Red title bar */}
        <header className="shrink-0 rounded-t-lg bg-[#c90000] px-1 pb-3 pt-1">
          <div className="flex items-center gap-1">
            <Link
              to="/collector/map"
              aria-label="Back to route map"
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
            {/* Site summary */}
            <section className="flex items-center gap-2.5 rounded-xl border border-[#cfc5c7] bg-[#fff6f7] px-2.5 py-3 shadow-[0_3px_2px_rgba(0,0,0,0.18)]">
              <div
                aria-hidden="true"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#ffa7b1] text-[#ff1938]"
              >
                <Trash2 size={32} strokeWidth={2.2} />
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold leading-tight text-black">
                  C-Park, Bin 1
                </h2>

                <p className="mt-1 flex items-center gap-1 text-[10px] leading-tight text-neutral-700">
                  <MapPin size={10} className="shrink-0" />
                  <span>Miguel Sheker Ave</span>
                </p>

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
                  value="August 19, 2026 (Wed)"
                />

                <InformationRow
                  icon={<Clock3 size={13} />}
                  label="Time"
                  value="2:00 PM"
                />

                <InformationRow
                  icon={<UsersRound size={13} />}
                  label="Reported By"
                  value="3 resident(s)"
                />

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
                  alt="C-Park waste bin before collection"
                  className="aspect-[3/2] w-full rounded-lg object-cover"
                />
              </div>
            </section>
          </div>

          {/* Static preview button */}
          <footer className="shrink-0 bg-white px-4 pb-7 pt-5">
            <Link
              to="/collector/route"
              state={{
                site: {
                  id: 2,
                  name: "C-Park, Bin 1",
                  image: bin3,
                  address: "Miguel Sheker Ave",
                  latitude: 8.2373215,
                  longitude: 124.2480787,
                  qrCode: "QR-143",
                  residents: 3,
                  wasteLevel: "NEAR FULL",
                  lastCollection: "2 days ago, 1:00 PM",
                  collectionDate: "2026-08-19",
                  collectionTime: "2:00 PM",
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