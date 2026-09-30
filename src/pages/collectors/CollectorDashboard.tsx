import { CalendarDays, History, MapPin } from "lucide-react";
import { Link } from "react-router";

export default function CollectorDashboard() {
  return (
    <main className="min-h-[100dvh] bg-neutral-50 p-5 pb-24">
      <header className="mb-6">
        <p className="text-xs text-neutral-500">
          Waste Collector
        </p>

        <h1 className="text-xl font-bold text-neutral-900">
          Collection Dashboard
        </h1>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <DashboardLink
          to="/collector/schedule"
          title="Collection Schedule"
          description="View assigned collection schedules"
          icon={<CalendarDays size={22} />}
        />

        <DashboardLink
          to="/collector/map"
          title="Collection Map"
          description="View assigned disposal sites"
          icon={<MapPin size={22} />}
        />

        <DashboardLink
          to="/collector/history"
          title="Collection History"
          description="View completed collections"
          icon={<History size={22} />}
        />
      </section>
    </main>
  );
}

type DashboardLinkProps = {
  to: string;
  title: string;
  description: string;
  icon: React.ReactNode;
};

function DashboardLink({
  to,
  title,
  description,
  icon,
}: DashboardLinkProps) {
  return (
    <Link
      to={to}
      className="
        flex items-center gap-3 rounded-2xl
        border border-neutral-200 bg-white p-4
        shadow-sm transition hover:border-red-200
        hover:shadow-md
      "
    >
      <div className="rounded-xl bg-red-50 p-3 text-red-600">
        {icon}
      </div>

      <div>
        <h2 className="text-sm font-semibold">
          {title}
        </h2>

        <p className="text-[10px] text-neutral-500">
          {description}
        </p>
      </div>
    </Link>
  );
}