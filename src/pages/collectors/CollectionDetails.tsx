import { ArrowLeft, CheckCircle, MapPin } from "lucide-react";
import { Link, useParams } from "react-router";

export default function CollectionDetails() {
  const { scheduleId } = useParams();

  return (
    <main className="min-h-[100dvh] bg-neutral-50 p-5 pb-24">
      <header className="mb-5 flex items-center gap-3">
        <Link
          to="/collector/schedule"
          className="rounded-full bg-white p-2 shadow-sm"
          aria-label="Return to schedule"
        >
          <ArrowLeft size={18} />
        </Link>

        <div>
          <h1 className="text-lg font-bold">
            Collection Details
          </h1>

          <p className="text-[10px] text-neutral-500">
            Schedule ID: {scheduleId}
          </p>
        </div>
      </header>

      <section className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-start gap-3">
          <div className="rounded-xl bg-red-50 p-3 text-red-600">
            <MapPin size={21} />
          </div>

          <div>
            <h2 className="text-sm font-bold">
              Twin Road, Bin 1
            </h2>

            <p className="text-xs text-neutral-500">
              Doña Teodora Boulevard
            </p>
          </div>
        </div>

        <div className="space-y-2 border-t pt-4 text-xs">
          <Row label="Date" value="September 21, 2026" />
          <Row label="Time" value="8:00 AM" />
          <Row label="Waste level" value="Full" />
          <Row label="Status" value="Pending" />
        </div>

        <button
          type="button"
          className="
            mt-6 flex w-full items-center justify-center
            gap-2 rounded-full bg-[#d00000] py-3
            text-xs font-semibold text-white
          "
        >
          <CheckCircle size={17} />
          Mark as Collected
        </button>
      </section>
    </main>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-neutral-500">
        {label}
      </span>

      <strong>{value}</strong>
    </div>
  );
}