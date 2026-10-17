import { useState } from "react";

type ReportType =
  | "Weekly waste collection summary"
  | "Waste overflow summary"
  | "Collection response summary";

const reportTypes: ReportType[] = [
  "Weekly waste collection summary",
  "Waste overflow summary",
  "Collection response summary",
];

const preview = {
  collected: 34,
  totalSites: 38,
  overflowReports: 7,
  averageResponseHours: 2.4,
};

function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  return new Date(year, month - 1, day).toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  );
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export default function ReviewReports() {
  const [reportType, setReportType] = useState<ReportType>(
    "Weekly waste collection summary"
  );
  const [startDate, setStartDate] = useState("2026-08-17");
  const [endDate, setEndDate] = useState("2026-08-23");
  const [zone, setZone] = useState("All zones");
  const [message, setMessage] = useState("");

  const validDateRange =
    Boolean(startDate && endDate) && startDate <= endDate;

  const dateRange = validDateRange
    ? `${formatDate(startDate)} – ${formatDate(endDate)}`
    : "Select a valid date range";

  function exportCSV() {
    if (!validDateRange) {
      return;
    }

    const rows: (string | number)[][] = [
      ["Report type", reportType],
      ["Date range", dateRange],
      ["Street / zone", zone],
      [],
      ["Metric", "Value"],
      [
        "Sites collected",
        `${preview.collected} / ${preview.totalSites}`,
      ],
      ["Overflow reports", preview.overflowReports],
      [
        "Average response time",
        `${preview.averageResponseHours} hrs`,
      ],
    ];

    const csv = rows
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `waste-report-${startDate}-${endDate}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("CSV downloaded.");
  }

  function exportPDF() {
    if (!validDateRange) {
      return;
    }

    setMessage("");
    window.print();
  }

  return (
    <div className="min-h-[100dvh] bg-white text-black">
      <style>{`
        @media print {
          @page {
            size: A4;
            margin: 20mm;
          }

          body * {
            visibility: hidden;
          }

          #waste-report-print,
          #waste-report-print * {
            visibility: visible;
          }

          #waste-report-print {
            position: absolute;
            inset: 0 auto auto 0;
            width: 100%;
            padding: 0;
            color: black;
            background: white;
            box-shadow: none;
            border-radius: 0;
          }

          .waste-print-only {
            display: block !important;
          }

          .waste-screen-only {
            display: none !important;
          }
        }
      `}</style>

      {/* Page header */}
      <header className="flex items-center justify-between gap-4 border-b-[6px] border-[#a5b57c] px-5 pb-2 pt-5">
        <div>
          <h1 className="text-xl font-bold">
            Generate reports
          </h1>

          <p className="mt-1 text-xs text-neutral-500">
            Retrieves data across D2, D3, D4, D5, D6 for
            summaries and analytics
          </p>
        </div>

        <div
          aria-label="Marco Reyes"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#ffd0d8] text-xl font-semibold text-[#e00000]"
        >
          MC
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-[1fr_0.96fr]">
        {/* Report settings */}
        <section
          aria-label="Report settings"
          className="rounded-2xl bg-[#faf3e7] p-4"
        >
          <div className="space-y-3">
            <div>
              <label
                htmlFor="report-type"
                className="mb-1 block text-[11px] text-neutral-600"
              >
                Report type
              </label>

              <select
                id="report-type"
                value={reportType}
                onChange={(event) => {
                  setReportType(event.target.value as ReportType);
                  setMessage("");
                }}
                className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-2 text-xs outline-none focus:border-red-500"
              >
                {reportTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <fieldset>
              <legend className="mb-1 text-[11px] text-neutral-600">
                Date range
              </legend>

              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  aria-label="Start date"
                  value={startDate}
                  onChange={(event) => {
                    setStartDate(event.target.value);
                    setMessage("");
                  }}
                  className="h-9 min-w-0 w-full rounded-lg border border-neutral-300 bg-white px-2 text-xs outline-none focus:border-red-500"
                />

                <input
                  type="date"
                  aria-label="End date"
                  min={startDate || undefined}
                  value={endDate}
                  onChange={(event) => {
                    setEndDate(event.target.value);
                    setMessage("");
                  }}
                  className="h-9 min-w-0 w-full rounded-lg border border-neutral-300 bg-white px-2 text-xs outline-none focus:border-red-500"
                />
              </div>

              {!validDateRange && (
                <p role="alert" className="mt-1 text-xs text-red-600">
                  Choose an end date on or after the start date.
                </p>
              )}
            </fieldset>

            <div>
              <label
                htmlFor="report-zone"
                className="mb-1 block text-[11px] text-neutral-600"
              >
                Street / zone
              </label>

              <select
                id="report-zone"
                value={zone}
                onChange={(event) => {
                  setZone(event.target.value);
                  setMessage("");
                }}
                className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-2 text-xs outline-none focus:border-red-500"
              >
                <option>All zones</option>
                <option>Doña Teodora Blvd</option>
                <option>Miguel Sheker Ave</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={exportCSV}
              disabled={!validDateRange}
              className="rounded-lg border border-[#ff0019] bg-white px-3 py-2 text-xs font-medium text-[#ed0015] hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export CSV
            </button>

            <button
              type="button"
              onClick={exportPDF}
              disabled={!validDateRange}
              className="rounded-lg bg-[#ed0015] px-3 py-2 text-xs font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export PDF
            </button>
          </div>

          {message && (
            <p role="status" className="mt-3 text-xs text-green-700">
              {message}
            </p>
          )}
        </section>

        {/* Preview summary */}
        <section
          id="waste-report-print"
          aria-labelledby="preview-title"
          className="rounded-2xl bg-[#faf3e7] p-4"
        >
          <div className="waste-print-only mb-6 hidden">
            <h1 className="text-xl font-bold">
              Waste Track
            </h1>

            <h2 className="mt-2 text-lg font-semibold">
              {reportType}
            </h2>

            <p className="mt-2 text-sm">{dateRange}</p>
            <p className="text-sm">Street / zone: {zone}</p>
          </div>

          <h2
            id="preview-title"
            className="text-sm font-bold uppercase text-[#656161]"
          >
            Preview Summary
          </h2>

          <dl className="mt-5 space-y-6">
            <SummaryRow
              label="Site Collected"
              value={`${preview.collected} / ${preview.totalSites}`}
            />

            <SummaryRow
              label="Overflow reports"
              value={String(preview.overflowReports)}
            />

            <SummaryRow
              label="Avg. response time"
              value={`${preview.averageResponseHours} hrs`}
            />
          </dl>
        </section>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-4">
      <dt className="text-sm">{label}</dt>
      <dd className="min-w-[60px] text-left text-sm font-bold">
        {value}
      </dd>
    </div>
  );
}