import { useState } from "react";
import { useNavigate } from "react-router";

const REPORT_TYPES = [
  "Weekly waste collection summary",
  "Monthly waste collection summary",
  "Overflow incident report",
  "Collector performance report",
];

const ZONES = ["All zones", "Zone 1", "Zone 2", "Zone 3"];

const css = `
.rr-root, .rr-root * { box-sizing: border-box; }
.rr-root {
  --red: #a81b1e;
  --red-bright: #d0102b;
  --olive: #a5b26b;
  --cream: #f7f0e4;
  --cream-line: #d9cfbd;
  --ink: #1b1b1b;
  min-height: 100dvh;
  background: #fff;
  color: var(--ink);
  font-family: "Fira Sans", "Segoe UI", Roboto, Arial, sans-serif;
}

.rr-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 16px 20px 12px;
  border-bottom: 5px solid var(--olive);
  gap: 16px; flex-wrap: wrap;
}
.rr-title { margin: 0; font-size: 22px; font-weight: 700; }
.rr-sub { margin: 2px 0 0; font-size: 13px; color: #666; }
.rr-avatar {
  width: 38px; height: 30px; border-radius: 8px;
  background: #f8ced4; color: var(--red-bright);
  font-size: 20px; display: grid; place-items: center;
  flex-shrink: 0;
  border: 0; cursor: pointer; font-family: inherit;
}
.rr-avatar:hover { background: #f3b9c3; }
.rr-avatar:focus-visible { outline: 2px solid var(--red); outline-offset: 2px; }

.rr-body { padding: 18px 20px 28px; display: grid; grid-template-columns: 1.1fr 1fr; gap: 16px; align-items: start; }

.rr-panel {
  background: var(--cream);
  border-radius: 8px;
  padding: 16px 18px 20px;
}
.rr-panel-title { margin: 0 0 14px; font-size: 12.5px; font-weight: 700; color: #555; }

.rr-field { margin-bottom: 14px; }
.rr-field label { display: block; font-size: 12px; font-weight: 600; color: #444; margin-bottom: 4px; }
.rr-field input,
.rr-field select {
  width: 100%;
  background: #fff;
  border: 1px solid var(--cream-line);
  border-radius: 4px;
  font: inherit; font-size: 13px; color: var(--ink);
  padding: 8px 10px;
}
.rr-field input:focus-visible,
.rr-field select:focus-visible { outline: 2px solid var(--red); outline-offset: 1px; }

.rr-actions { display: flex; gap: 10px; margin-top: 6px; }
.rr-export-csv {
  background: #fff; border: 1.5px solid var(--red-bright); color: var(--red-bright);
  font: inherit; font-size: 13px; font-weight: 700;
  padding: 9px 20px; border-radius: 6px; cursor: pointer;
}
.rr-export-csv:hover { background: #fbeceb; }
.rr-export-csv:focus-visible { outline: 2px solid var(--red-bright); outline-offset: 2px; }
.rr-export-pdf {
  background: var(--red); color: #fff; border: 0; cursor: pointer;
  font: inherit; font-size: 13px; font-weight: 700;
  padding: 9px 20px; border-radius: 6px;
}
.rr-export-pdf:hover { background: #8f1619; }
.rr-export-pdf:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }

.rr-summary-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 0; border-bottom: 1px solid var(--cream-line);
}
.rr-summary-row:last-child { border-bottom: none; }
.rr-summary-label { font-size: 13px; color: #444; }
.rr-summary-value { font-size: 14px; font-weight: 700; }

.rr-confirm { margin-top: 10px; font-size: 12px; font-weight: 600; color: #2f6b2f; }

@media (max-width: 760px) {
  .rr-body { grid-template-columns: 1fr; }
}
`;

export default function ReviewReports() {
  const navigate = useNavigate();

  const [reportType, setReportType] = useState(REPORT_TYPES[0]);
  const [dateRange, setDateRange] = useState("Aug 17 – Aug 23, 2026");
  const [zone, setZone] = useState(ZONES[0]);
  const [exported, setExported] = useState<"CSV" | "PDF" | null>(null);

  const handleExport = (format: "CSV" | "PDF") => {
    // TODO: generate and download the report from the backend
    setExported(format);
  };

  return (
    <div className="rr-root">
      <style>{css}</style>

      <header className="rr-head">
        <div>
          <h1 className="rr-title">Generate reports</h1>
          <p className="rr-sub">Retrieves data across D2, D3, D4, D5, D6 for summaries and analytics</p>
        </div>
        <button
          type="button"
          className="rr-avatar"
          aria-label="Marco Reyes — manage account"
          onClick={() => navigate("/admin/account")}
        >
          MC
        </button>
      </header>

      <div className="rr-body">
        <section className="rr-panel">
          <div className="rr-field">
            <label htmlFor="rr-type">Report type</label>
            <select
              id="rr-type"
              value={reportType}
              onChange={(e) => { setReportType(e.target.value); setExported(null); }}
            >
              {REPORT_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="rr-field">
            <label htmlFor="rr-range">Data range</label>
            <input
              id="rr-range"
              value={dateRange}
              onChange={(e) => { setDateRange(e.target.value); setExported(null); }}
            />
          </div>

          <div className="rr-field">
            <label htmlFor="rr-zone">Street / zone</label>
            <select
              id="rr-zone"
              value={zone}
              onChange={(e) => { setZone(e.target.value); setExported(null); }}
            >
              {ZONES.map((z) => (
                <option key={z} value={z}>{z}</option>
              ))}
            </select>
          </div>

          <div className="rr-actions">
            <button type="button" className="rr-export-csv" onClick={() => handleExport("CSV")}>
              Export CSV
            </button>
            <button type="button" className="rr-export-pdf" onClick={() => handleExport("PDF")}>
              Export PDF
            </button>
          </div>

          {exported && <p className="rr-confirm">{exported} report generated.</p>}
        </section>

        <section className="rr-panel">
          <h2 className="rr-panel-title">PREVIEW SUMMARY</h2>

          <div className="rr-summary-row">
            <span className="rr-summary-label">Site Collected</span>
            <span className="rr-summary-value">34 / 38</span>
          </div>
          <div className="rr-summary-row">
            <span className="rr-summary-label">Overflow reports</span>
            <span className="rr-summary-value">7</span>
          </div>
          <div className="rr-summary-row">
            <span className="rr-summary-label">Avg. response time</span>
            <span className="rr-summary-value">2.4 hrs</span>
          </div>
        </section>
      </div>
    </div>
  );
}