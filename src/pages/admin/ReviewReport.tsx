import { ArrowLeft, MapPin } from "lucide-react";
import { Link } from "react-router";
import SectionCard from "../../components/SectionCard";
import { img } from "../../utils";

export default function ReviewReports() {
  return (
    <main className="min-h-[100dvh] bg-white pb-8">
      <header className="flex items-center gap-2 px-5 pt-7">
        <Link
          to="/admin/reports"
          aria-label="Return to reports"
          className="rounded-full p-1 hover:bg-neutral-100"
        >
          <ArrowLeft size={19} />
        </Link>

        <h1 className="text-sm font-semibold">
          Review Report
        </h1>
      </header>

      <div className="space-y-3 p-5">
        <div className="rounded-2xl bg-[#a9bb78] p-2">
          <img
            src={img("waste-bin.jpg")}
            alt="Reported waste bin"
            className="h-32 w-full rounded-xl object-cover sm:h-44 lg:h-52"
          />
        </div>

        <SectionCard>
          <div>
            <b className="text-[10px] sm:text-xs">
              <MapPin
                size={11}
                className="mr-1 inline"
              />
              Location
            </b>

            <h2 className="text-[11px] font-bold sm:text-sm">
              Twin Road, Bin 1
            </h2>

            <p className="text-[7px] text-neutral-500 sm:text-[10px]">
              Doña Teodora Blvd
            </p>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <img
                src={img("bin1.jpg")}
                alt="Waste bin"
                className="h-14 w-full rounded object-cover sm:h-24"
              />

              <img
                src={img("map.jpg")}
                alt="Waste site location"
                className="h-14 w-full rounded object-cover sm:h-24"
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard>
          <div>
            <b className="text-[10px] sm:text-xs">
              ▣ Details
            </b>

            <div className="mt-2 divide-y text-[8px] sm:text-[11px]">
              <Row
                label="Type of Waste"
                value="Mixed/Unsorted"
              />

              <Row
                label="Waste Level (CNN Result)"
                value="FULL"
              />

              <Row
                label="Confidence Level"
                value="100%"
              />

              <Row
                label="Report ID"
                value="RPT-2026-12345"
              />

              <Row
                label="Status"
                value="Scheduled"
              />

              <Row
                label="Reported by"
                value="@username"
              />

              <Row
                label="Recorded on"
                value="8-17-2026 · 1:45 PM"
              />

              <Row
                label="Site description"
                value="kiliid sa gym"
              />
            </div>
          </div>
        </SectionCard>
      </div>
    </main>
  );
}

type RowProps = {
  label: string;
  value: string;
};

function Row({ label, value }: RowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <span className="text-neutral-500">
        {label}
      </span>

      <b className="text-right">
        {value}
      </b>
    </div>
  );
}