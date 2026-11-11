import {
  ChevronRight,
  Clock3,
  MapPin,
  Trash2,
  UserRound,
} from "lucide-react";
import { Link } from "react-router";

export type Collection = {
  name: string;
  address: string;
  time: string;
  status: string;
  tone: "red" | "orange" | "green";
  collector: string;
  level: string;
};

type CollectionCardProps = {
  item: Collection;
};

const badgeColors = {
  red: "bg-[#ff0019]",
  orange: "bg-[#ffc344]",
  green: "bg-[#a4b875]",
};

export default function CollectionCard({
  item,
}: CollectionCardProps) {
  const route =
    item.status === "Priority Collection"
      ? "full"
      : item.status === "Scheduled"
      ? "scheduled"
      : "empty";

  return (
    <article className="overflow-hidden rounded-[14px] border border-[#ff9ba7] bg-[#fff6f7] shadow-[0_3px_2px_rgba(0,0,0,0.2)]">
      {/* Status badge */}
      <div className="flex justify-end px-2 pt-1.5">
        <span
          className={`rounded-full px-2 py-0.5 text-[9px] font-semibold leading-tight text-white shadow-sm ${
            badgeColors[item.tone]
          }`}
        >
          {item.status}
        </span>
      </div>

      {/* Site information */}
      <div className="flex items-start gap-2 px-2 pb-2">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-[#ffacbb] text-[#ff0019]">
          <Trash2 size={35} strokeWidth={2.2} />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold leading-tight text-black">
            {item.name}
          </h3>

          <p className="mt-1 flex items-center gap-1 text-[10px] text-neutral-700">
            <MapPin size={10} className="shrink-0" />
            <span>{item.address}</span>
          </p>

          <p className="mt-1 flex items-center gap-1 text-[10px] text-neutral-700">
            <Clock3 size={10} className="shrink-0" />
            <span>{item.time}</span>
          </p>
        </div>
      </div>

      {/* Card footer */}
      <div className="flex items-center justify-between gap-2 border-t border-[#ffe0e6] px-3 py-1.5">
        <span className="flex items-center gap-1 text-[9px] text-neutral-700">
          <UserRound size={13} className="shrink-0" />
          Collector: {item.collector}
        </span>

        <Link
          to={`/resident/calendar/details/${route}`}
          state={{ collection: item }}
          className="flex shrink-0 items-center gap-0.5 text-[9px] font-medium text-[#ed0015]"
        >
          View details
          <ChevronRight size={12} />
        </Link>
      </div>
    </article>
  );
}