import { useMemo, useState } from "react";
import { useNavigate } from "react-router";

type FillStatus = "Empty" | "Near Full" | "Full";

interface Site {
  id: number;
  name: string;
  fillPercent: number;
  type: string;
  lastUpdated: string;
  status: FillStatus;
}

const SITES: Site[] = [
  { id: 1, name: "Children's Park", fillPercent: 50, type: "Biodegradable", lastUpdated: "12 min ago", status: "Near Full" },
  { id: 2, name: "Twin road Bin 1", fillPercent: 100, type: "Mixed / Unsorted", lastUpdated: "1 hr ago", status: "Full" },
];

const FILTERS: Array<"All" | FillStatus> = ["All", "Empty", "Near Full", "Full"];

const css = `
.ws-root, .ws-root * { box-sizing: border-box; }
.ws-root {
  --red: #a81b1e;
  --red-bright: #d0102b;
  --olive: #a5b26b;
  --cream: #f7f0e4;
  --cream-line: #d9cfbd;
  --search: #efe4d0;
  --ink: #1b1b1b;
  --muted: #555;
  min-height: 100dvh;
  background: #fff;
  color: var(--ink);
  font-family: "Fira Sans", "Segoe UI", Roboto, Arial, sans-serif;
}

.ws-head {
  display: flex; align-items: center;
  padding: 16px 20px 12px;
  border-bottom: 5px solid var(--olive);
  gap: 20px; flex-wrap: wrap;
}
.ws-head-left { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
.ws-title { margin: 0; font-size: 22px; font-weight: 700; }
.ws-sub { margin: 2px 0 0; font-size: 13px; color: #666; }
.ws-search {
  width: 260px;
  height: 36px; padding: 0 14px;
  background: var(--search);
  border: 1px solid var(--cream-line);
  border-radius: 6px;
  font: inherit; font-size: 14px; color: var(--ink);
}
.ws-search::placeholder { color: #a9a08f; }
.ws-search:focus-visible { outline: 2px solid var(--red); outline-offset: 1px; }
.ws-avatar {
  margin-left: auto;
  width: 38px; height: 30px; border-radius: 8px;
  background: #f8ced4; color: var(--red-bright);
  font-size: 20px; display: grid; place-items: center;
  flex-shrink: 0;
  border: 0; cursor: pointer; font-family: inherit;
}
.ws-avatar:hover { background: #f3b9c3; }
.ws-avatar:focus-visible { outline: 2px solid var(--red); outline-offset: 2px; }

.ws-body { padding: 16px 20px 24px; }

.ws-tabs { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.ws-tab {
  padding: 8px 18px; border-radius: 8px;
  font: inherit; font-size: 13.5px; font-weight: 700;
  cursor: pointer; background: #fff; color: var(--red);
  border: 1.5px solid var(--red);
}
.ws-tab:hover { background: #fbeceb; }
.ws-tab:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.ws-tab.selected { background: var(--red); color: #fff; }

.ws-panel {
  background: var(--cream);
  border: 2px solid #4da3e0;
  border-radius: 12px;
  padding: 14px 16px 20px;
}

.ws-table-wrap { overflow-x: auto; }
.ws-table { width: 100%; border-collapse: collapse; font-size: 12px; min-width: 620px; }
.ws-table th {
  text-align: left; font-weight: 500; color: #555;
  padding: 4px 10px 10px; border-bottom: 1px solid #b9b2a3;
}
.ws-table td { padding: 14px 10px; border-bottom: 1px solid #b9b2a3; font-weight: 500; }
.ws-table tbody tr:hover { background: rgba(168,27,30,.05); }
.ws-table tr.filler td { height: 40px; }
.ws-table tr.empty td { text-align: center; color: #777; font-style: italic; }
.ws-table tr.empty:hover { background: transparent; }

.ws-bar { width: 130px; height: 9px; background: #d9d9d9; border-radius: 5px; overflow: hidden; }
.ws-bar > span { display: block; height: 100%; }
.ws-bar.near > span { background: #f0b93a; }
.ws-bar.full > span { background: var(--red-bright); }

.ws-badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 3px 9px; border-radius: 6px;
  font-size: 10px; font-weight: 700;
  box-shadow: 0 1px 2px rgba(0,0,0,.25);
}
.ws-badge .dot { width: 6px; height: 6px; border-radius: 50%; }
.ws-badge.near { background: #fbe2b0; border: 1px solid #efc77c; color: #222; }
.ws-badge.near .dot { background: #f0b93a; }
.ws-badge.full { background: #fff; border: 1px solid var(--red-bright); color: #222; }
.ws-badge.full .dot { background: var(--red-bright); }
.ws-badge.empty { background: #e2ede0; border: 1px solid var(--olive); color: #222; }
.ws-badge.empty .dot { background: var(--olive); }

@media (max-width: 640px) {
  .ws-head-left { flex-direction: column; align-items: flex-start; gap: 8px; }
  .ws-search { width: 100%; }
}
`;

function badgeClass(status: FillStatus) {
  if (status === "Full") return "full";
  if (status === "Near Full") return "near";
  return "empty";
}

export default function ManageWasteStatus() {
  const [filter, setFilter] = useState<"All" | FillStatus>("All");
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const sites = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SITES.filter((s) => {
      const matchesFilter = filter === "All" || s.status === filter;
      const matchesQuery = !q || s.name.toLowerCase().includes(q);
      return matchesFilter && matchesQuery;
    });
  }, [filter, query]);

  return (
    <div className="ws-root">
      <style>{css}</style>

      <header className="ws-head">
        <div className="ws-head-left">
          <div>
            <h1 className="ws-title">Waste status</h1>
            <p className="ws-sub">14 disposal sites · Barangay San Miguel</p>
          </div>
          <input
            className="ws-search"
            type="search"
            placeholder="Search a Sites......"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search sites"
          />
        </div>
        <button
          type="button"
          className="ws-avatar"
          aria-label="Marco Reyes — manage account"
          onClick={() => navigate("/admin/account")}
        >
          MC
        </button>
      </header>

      <div className="ws-body">
        <div className="ws-tabs" role="tablist" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              className={`ws-tab${filter === f ? " selected" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        <section className="ws-panel">
          <div className="ws-table-wrap">
            <table className="ws-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Fill level</th>
                  <th>Type</th>
                  <th>Last updated</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => navigate(`/admin/waste-status/${s.id}`)}
                    style={{ cursor: "pointer" }}
                  >
                    <td>{s.name}</td>
                    <td>
                      <div
                        className={`ws-bar ${s.status === "Full" ? "full" : "near"}`}
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={s.fillPercent}
                        aria-label={`${s.name} fill level`}
                      >
                        <span style={{ width: `${s.fillPercent}%` }} />
                      </div>
                    </td>
                    <td>{s.type}</td>
                    <td>{s.lastUpdated}</td>
                    <td>
                      <span className={`ws-badge ${badgeClass(s.status)}`}>
                        <span className="dot" />
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {sites.length === 0 && (
                  <tr className="empty"><td colSpan={5}>No sites match this filter.</td></tr>
                )}
                <tr className="filler"><td colSpan={5} /></tr>
                <tr className="filler"><td colSpan={5} /></tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}