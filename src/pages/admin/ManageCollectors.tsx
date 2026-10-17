type CollectorStatus = "Active" | "On leave";

interface Collector {
  id: number;
  name: string;
  street: string;
  sites: number;
  status: CollectorStatus;
}

const COLLECTORS: Collector[] = [
  { id: 1, name: "Team A", street: "Children's Park", sites: 5, status: "Active" },
  { id: 2, name: "Team A", street: "Twin road", sites: 3, status: "On leave" },
];

const UNASSIGNED_SITES = ["Twin Road, Bin 1"];

const css = `
.mc-root, .mc-root * { box-sizing: border-box; }
.mc-root {
  --red: #a81b1e;
  --red-bright: #d0102b;
  --cream: #f7f0e4;
  --line: #cfc8bb;
  --olive: #a5b26b;
  --amber: #f5c04a;
  --ink: #1b1b1b;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: #fff;
  color: var(--ink);
  font-family: "Fira Sans", "Segoe UI", Roboto, Arial, sans-serif;
}

.mc-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px 8px;
  border-bottom: 5px solid var(--olive);
  gap: 12px; flex-wrap: wrap;
}
.mc-title { margin: 0; font-size: 22px; font-weight: 700; }
.mc-sub { margin: 2px 0 0; font-size: 13px; color: #666; }
.mc-head-right { display: flex; align-items: center; gap: 12px; }
.mc-add {
  background: var(--red); color: #fff; border: 0; cursor: pointer;
  font: inherit; font-size: 13px; font-weight: 700;
  padding: 10px 16px; border-radius: 6px;
}
.mc-add:hover { background: #8f1619; }
.mc-add:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.mc-avatar {
  width: 38px; height: 30px; border-radius: 8px;
  background: #f8ced4; color: var(--red-bright);
  font-size: 20px; display: grid; place-items: center;
}

.mc-body { padding: 16px 16px 24px; flex: 1; }
.mc-panel {
  background: var(--cream);
  border-radius: 16px;
  padding: 18px 12px 60px;
  min-height: 420px;
}

.mc-table-wrap { overflow-x: auto; }
.mc-table { width: 100%; border-collapse: collapse; font-size: 11px; min-width: 520px; }
.mc-table th {
  text-align: left; font-weight: 500; color: #666;
  padding: 6px 8px 8px; border-bottom: 1px solid var(--line);
}
.mc-table td { padding: 10px 8px; border-bottom: 1px solid var(--line); font-weight: 500; height: 30px; }
.mc-table td.name { font-weight: 700; }
.mc-table tr.filler td { height: 32px; }

.mc-pill {
  display: inline-block; padding: 2px 10px; border-radius: 10px;
  font-size: 9.5px; font-weight: 600; color: #fff;
}
.mc-pill.active { background: var(--olive); }
.mc-pill.leave { background: var(--amber); }

.mc-manage {
  background: none; border: 0; padding: 0; cursor: pointer;
  color: var(--red-bright); font: inherit; font-size: 10.5px; font-weight: 700;
}
.mc-manage:hover { text-decoration: underline; }
.mc-manage:focus-visible { outline: 2px solid var(--red-bright); outline-offset: 2px; }

.mc-unassigned {
  margin: 20px 8px 0;
  background: #fff; border: 1px solid #777; border-radius: 10px;
  box-shadow: 0 2px 4px rgba(0,0,0,.3);
  padding: 12px 10px 14px;
  max-width: 500px;
}
.mc-unassigned h2 { margin: 0; font-size: 12px; font-weight: 700; color: #666; }
.mc-unassigned p { margin: 2px 0 0; font-size: 14px; color: var(--ink); }
`;

export default function ManageCollectors() {
  const handleAdd = () => {
    // TODO: open your "Add collector account" form or navigate to it
  };

  const handleManage = (_collector: Collector) => {
    // TODO: open the manage screen for this collector
  };

  return (
    <div className="mc-root">
      <style>{css}</style>

      <header className="mc-head">
        <div>
          <h1 className="mc-title">Collectors</h1>
          <p className="mc-sub">6 active · 1 on leave</p>
        </div>
        <div className="mc-head-right">
          <button type="button" className="mc-add" onClick={handleAdd}>
            + Add collector account
          </button>
          <div className="mc-avatar" aria-label="Marco Reyes">MC</div>
        </div>
      </header>

      <div className="mc-body">
        <section className="mc-panel">
          <div className="mc-table-wrap">
            <table className="mc-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Assigned Street</th>
                  <th>Sites</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {COLLECTORS.map((c) => (
                  <tr key={c.id}>
                    <td className="name">{c.name}</td>
                    <td>{c.street}</td>
                    <td>{c.sites}</td>
                    <td>
                      <span className={`mc-pill ${c.status === "Active" ? "active" : "leave"}`}>
                        {c.status}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="mc-manage" onClick={() => handleManage(c)}>
                        Manage
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="filler"><td colSpan={5} /></tr>
                <tr className="filler"><td colSpan={5} /></tr>
              </tbody>
            </table>
          </div>

          {UNASSIGNED_SITES.length > 0 && (
            <div className="mc-unassigned">
              <h2>UNASSIGNED SITES</h2>
              {UNASSIGNED_SITES.map((site) => (
                <p key={site}>{site} — needs a collector</p>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}