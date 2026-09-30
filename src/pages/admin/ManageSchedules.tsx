<<<<<<< HEAD
type ScheduleStatus = "Sent to collector" | "Pending — collector on leave";

interface Schedule {
  id: number;
  site: string;
  collector: string;
  dayTime: string;
  status: ScheduleStatus;
}

const SCHEDULES: Schedule[] = [
  { id: 1, site: "Children's Park", collector: "Team A", dayTime: "Mon, Wed, Fri · 6:00 AM", status: "Sent to collector" },
  { id: 2, site: "Twin Road, Bin 1", collector: "Team A", dayTime: "Tue, Thu · 7:30 AM", status: "Pending — collector on leave" },
  { id: 3, site: "Twin Road, Bin 2", collector: "Team A", dayTime: "Daily · 6:30 AM", status: "Sent to collector" },
];

const css = `
.sc-root, .sc-root * { box-sizing: border-box; }
.sc-root {
  --red: #a81b1e;
  --red-bright: #d0102b;
  --olive: #a5b26b;
  --amber: #f5c04a;
  --cream: #f7f0e4;
  --cream-line: #d9cfbd;
  --ink: #1b1b1b;
  min-height: 100dvh;
  background: #fff;
  color: var(--ink);
  font-family: "Fira Sans", "Segoe UI", Roboto, Arial, sans-serif;
}

.sc-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 16px 20px 12px;
  border-bottom: 5px solid var(--olive);
  gap: 16px; flex-wrap: wrap;
}
.sc-title { margin: 0; font-size: 22px; font-weight: 700; }
.sc-sub { margin: 4px 0 0; font-size: 12.5px; color: #666; max-width: 640px; }
.sc-avatar {
  width: 38px; height: 30px; border-radius: 8px;
  background: #f8ced4; color: var(--red-bright);
  font-size: 20px; display: grid; place-items: center;
  flex-shrink: 0;
}

.sc-body { padding: 16px 20px 24px; }
.sc-panel {
  background: var(--cream);
  border-radius: 8px;
  padding: 12px 14px 24px;
}

.sc-table-wrap { overflow-x: auto; }
.sc-table { width: 100%; border-collapse: collapse; font-size: 12px; min-width: 620px; }
.sc-table th {
  text-align: left; font-weight: 500; color: #666;
  padding: 4px 10px 8px; border-bottom: 1px solid #b9b2a3;
}
.sc-table td { padding: 12px 10px; border-bottom: 1px solid #b9b2a3; font-weight: 500; }
.sc-table tr:last-child td { border-bottom: none; }

.sc-badge {
  display: inline-block; padding: 4px 12px; border-radius: 8px;
  font-size: 10.5px; font-weight: 700; color: #fff;
  white-space: nowrap;
}
.sc-badge.sent { background: var(--olive); }
.sc-badge.pending { background: var(--amber); color: #3a2c00; }

@media (max-width: 640px) {
  .sc-head { align-items: flex-start; }
}
`;

function badgeClass(status: ScheduleStatus) {
  return status === "Sent to collector" ? "sent" : "pending";
}

export default function ManageSchedules() {
  return (
    <div className="sc-root">
      <style>{css}</style>

      <header className="sc-head">
        <div>
          <h1 className="sc-title">Collection schedules</h1>
          <p className="sc-sub">
            Pulls site data (D2) &amp; waste status (2.2), stores to D5 · Schedules, sends assigned tasks to Collectors
          </p>
        </div>
        <div className="sc-avatar" aria-label="Marco Reyes">MC</div>
      </header>

      <div className="sc-body">
        <section className="sc-panel">
          <div className="sc-table-wrap">
            <table className="sc-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Assigned collector</th>
                  <th>Day &amp; time</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {SCHEDULES.map((s) => (
                  <tr key={s.id}>
                    <td>{s.site}</td>
                    <td>{s.collector}</td>
                    <td>{s.dayTime}</td>
                    <td>
                      <span className={`sc-badge ${badgeClass(s.status)}`}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
=======
export default function ManageSchedules() {
  return <div>Manage Schedules</div>;
>>>>>>> e3d315ca13db7b1bea31382fed7c021dc25eecf1
}