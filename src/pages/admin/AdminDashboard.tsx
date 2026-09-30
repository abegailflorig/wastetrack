import { useState } from "react";
import { useNavigate } from "react-router";

interface Stat {
  value: string;
  label: string;
  color: string;
  to?: string;
}

const STATS: Stat[] = [
  {
    value: "3",
    label: "Bins Full",
    color: "#d0102b",
    to: "/admin/waste-status?filter=Full",
  },
  {
    value: "7",
    label: "Bins Half Full",
    color: "#f0b93a",
    to: "/admin/waste-status?filter=Near Full",
  },
  {
    value: "4",
    label: "Pending reports",
    color: "#d0102b",
    to: "/admin/reports",
  },
  {
    value: "44%",
    label: "Todays's collection progress",
    color: "#111111",
  },
];

type ReportLevel = "Full" | "Near Full";

interface Report {
  site: string;
  by: string;
  time: string;
  level: ReportLevel;
}

const RECENT_REPORTS: Report[] = [
  {
    site: "Children's Park",
    by: "Chinley Suan",
    time: "12 min ago",
    level: "Near Full",
  },
  {
    site: "Twin road Bin 1",
    by: "Abegail Florig",
    time: "1 hr ago",
    level: "Full",
  },
];

const collected = 4;
const totalSites = 9;

const css = `
.ad-root, .ad-root * { box-sizing: border-box; }

.ad-root {
  --red: #a81b1e;
  --red-bright: #d0102b;
  --cream: #f7f0e4;
  --cream-line: #d9cfbd;
  --search: #efe4d0;
  --ink: #1b1b1b;
  --muted: #555;

  min-height: 100dvh;
  background: #fff;
  color: var(--ink);
  padding: 22px 20px 28px;
  font-family: "Fira Sans", "Segoe UI", Roboto, Arial, sans-serif;
}

.ad-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.ad-title {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
}

.ad-avatar {
  width: 46px;
  height: 34px;
  border-radius: 10px;
  background: #f8ced4;
  color: var(--red-bright);
  font-size: 22px;
  display: grid;
  place-items: center;
  border: 0;
  cursor: pointer;
  font-family: inherit;
}

.ad-avatar:hover {
  background: #f3b9c3;
}

.ad-avatar:focus-visible {
  outline: 2px solid var(--red);
  outline-offset: 2px;
}

.ad-search-row {
  display: flex;
  align-items: center;
  gap: 22px;
  margin-top: 8px;
}

.ad-overview {
  font-size: 11.5px;
  line-height: 1.3;
}

.ad-search {
  flex: 1;
  max-width: 450px;
  height: 36px;
  padding: 0 14px;
  background: var(--search);
  border: 1px solid var(--cream-line);
  border-radius: 6px;
  font: inherit;
  font-size: 15px;
  color: var(--ink);
}

.ad-search::placeholder {
  color: #a9a08f;
}

.ad-search:focus-visible {
  outline: 2px solid var(--red);
  outline-offset: 1px;
}

.ad-stats {
  margin-top: 18px;
  background: var(--cream);
  border-radius: 6px;
  padding: 8px 16px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 26px;
}

.ad-stat {
  background: #fff;
  border: 1px solid var(--cream-line);
  border-radius: 8px;
  box-shadow: 0 2px 0 #cfc7a8;
  padding: 10px 16px 12px;
  text-align: left;
  font-family: inherit;
  cursor: default;
}

.ad-stat.clickable {
  cursor: pointer;
}

.ad-stat.clickable:hover {
  background: #fdfbf6;
  box-shadow: 0 2px 0 #b9b191;
}

.ad-stat.clickable:focus-visible {
  outline: 2px solid var(--red);
  outline-offset: 2px;
}

.ad-stat-value {
  font-size: 26px;
  font-weight: 600;
  line-height: 1.15;
}

.ad-stat-label {
  margin-top: 6px;
  font-size: 11.5px;
  font-weight: 500;
  color: var(--muted);
}

.ad-panels {
  margin-top: 18px;
  display: grid;
  grid-template-columns: 1.85fr 1fr;
  gap: 12px;
  align-items: start;
}

.ad-panel {
  background: var(--cream);
  border: 1px solid var(--cream-line);
  border-radius: 6px;
  padding: 10px 10px 14px;
}

.ad-panel-title {
  margin: 0;
  font-size: 11.5px;
  font-weight: 600;
  color: #4a4a4a;
}

.ad-table-wrap {
  overflow-x: auto;
}

.ad-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 14px;
  font-size: 11px;
  min-width: 420px;
}

.ad-table th {
  text-align: left;
  font-weight: 500;
  color: #555;
  padding: 4px 8px 6px;
  border-bottom: 1px solid #b9b2a3;
}

.ad-table td {
  padding: 12px 8px 8px;
  border-bottom: 1px solid #b9b2a3;
  font-weight: 500;
}

.ad-table tr.filler td {
  height: 46px;
}

.ad-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 700;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
}

.ad-badge .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.ad-badge.near {
  background: #fbe2b0;
  border: 1px solid #efc77c;
  color: #222;
}

.ad-badge.near .dot {
  background: #f0b93a;
}

.ad-badge.full {
  background: #fff;
  border: 1px solid var(--red-bright);
  color: #222;
}

.ad-badge.full .dot {
  background: var(--red-bright);
}

.ad-progress-text {
  margin-top: 14px;
  font-size: 11.5px;
  font-weight: 500;
}

.ad-bar {
  margin-top: 8px;
  height: 5px;
  background: #d9d9d9;
  border-radius: 3px;
  overflow: hidden;
}

.ad-bar > span {
  display: block;
  height: 100%;
  background: var(--red-bright);
}

@media (max-width: 900px) {
  .ad-stats {
    grid-template-columns: repeat(2, 1fr);
    gap: 14px;
  }

  .ad-panels {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .ad-search-row {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }

  .ad-search {
    max-width: none;
  }
}
`;

export default function AdminDashboard() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const q = query.trim().toLowerCase();

  const reports = RECENT_REPORTS.filter(
    (r) =>
      !q ||
      r.site.toLowerCase().includes(q) ||
      r.by.toLowerCase().includes(q)
  );

  const progress = Math.round((collected / totalSites) * 100);

  return (
    <div className="ad-root">
      <style>{css}</style>

      <div className="ad-head">
        <h1 className="ad-title">Dashboard</h1>

        <button
          type="button"
          className="ad-avatar"
          aria-label="Marco Reyes — manage account"
          onClick={() => navigate("/admin/account")}
        >
          MC
        </button>
      </div>

      <div className="ad-search-row">
        <div className="ad-overview">
          Overview for
          <br />
          Brgy. San Miguel
        </div>

        <input
          className="ad-search"
          type="search"
          placeholder="Search Sites, collectors....."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search sites or collectors"
        />
      </div>

      <section className="ad-stats" aria-label="Summary">
        {STATS.map((s) => (
          <button
            key={s.label}
            type="button"
            className={`ad-stat${s.to ? " clickable" : ""}`}
            onClick={s.to ? () => navigate(s.to as string) : undefined}
            disabled={!s.to}
          >
            <div
              className="ad-stat-value"
              style={{ color: s.color }}
            >
              {s.value}
            </div>

            <div className="ad-stat-label">
              {s.label}
            </div>
          </button>
        ))}
      </section>

      <div className="ad-panels">
        <section className="ad-panel">
          <h2 className="ad-panel-title">RECENT REPORTS</h2>

          <div className="ad-table-wrap">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Reported by</th>
                  <th>Time</th>
                  <th>Level</th>
                </tr>
              </thead>

              <tbody>
                {reports.map((r) => (
                  <tr key={r.site}>
                    <td>{r.site}</td>
                    <td>{r.by}</td>
                    <td>{r.time}</td>
                    <td>
                      <span
                        className={`ad-badge ${
                          r.level === "Full" ? "full" : "near"
                        }`}
                      >
                        <span className="dot" />
                        {r.level}
                      </span>
                    </td>
                  </tr>
                ))}

                <tr className="filler">
                  <td colSpan={4} />
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="ad-panel">
          <h2 className="ad-panel-title">COLLECTION PROGRESS</h2>

          <p className="ad-progress-text">
            {collected} of {totalSites} sites collected today
          </p>

          <div
            className="ad-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
        </section>
      </div>
    </div>
  );
}