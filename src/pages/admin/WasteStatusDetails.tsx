import { useState } from "react";
import { useNavigate, useParams } from "react-router";

interface SiteDetail {
  id: number;
  site: string;
  submittedBy: string;
  submittedAt: string;
  cnnResult: "Full" | "Near Full" | "Empty";
  confidence: number;
  wasteTypes: string[];
  location: string;
  assignedCollector: string;
  reportedAgo: string;
}

const SITE_DETAILS: Record<string, SiteDetail> = {
  "1": {
    id: 1,
    site: "Children's Park",
    submittedBy: "Chinley Suan",
    submittedAt: "Aug 17, 2026, 3:19 PM",
    cnnResult: "Full",
    confidence: 89,
    wasteTypes: ["Biodegradable"],
    location: "Children's Park",
    assignedCollector: "Jomar Reyes",
    reportedAgo: "12 minutes ago",
  },
  "2": {
    id: 2,
    site: "Twin road Bin 1",
    submittedBy: "Abegail Florig",
    submittedAt: "Aug 17, 2026, 2:10 PM",
    cnnResult: "Full",
    confidence: 94,
    wasteTypes: ["Mixed / Unsorted"],
    location: "Twin road, Bin 1",
    assignedCollector: "Team A",
    reportedAgo: "1 hour ago",
  },
};

const css = `
.wd-root, .wd-root * { box-sizing: border-box; }
.wd-root {
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

.wd-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 5px solid var(--olive);
  gap: 16px; flex-wrap: wrap;
}
.wd-back {
  background: none; border: 0; cursor: pointer; padding: 0;
  color: var(--red-bright); font: inherit; font-size: 12px; font-weight: 700;
  margin-bottom: 6px;
}
.wd-back:hover { text-decoration: underline; }
.wd-back:focus-visible { outline: 2px solid var(--red-bright); outline-offset: 2px; }
.wd-title { margin: 0; font-size: 20px; font-weight: 700; }
.wd-sub { margin: 2px 0 0; font-size: 12.5px; color: #666; }
.wd-avatar {
  width: 38px; height: 30px; border-radius: 8px;
  background: #f8ced4; color: var(--red-bright);
  font-size: 20px; display: grid; place-items: center;
  flex-shrink: 0;
  border: 0; cursor: pointer; font-family: inherit;
}
.wd-avatar:hover { background: #f3b9c3; }
.wd-avatar:focus-visible { outline: 2px solid var(--red); outline-offset: 2px; }

.wd-body { padding: 18px 20px 28px; display: grid; grid-template-columns: 1.3fr 1fr; gap: 16px; align-items: start; }

.wd-photo {
  background: var(--cream); border: 1px solid var(--cream-line); border-radius: 8px;
  aspect-ratio: 16 / 10; display: grid; place-items: center;
  color: #8a8272; font-size: 12.5px; font-weight: 600;
  margin-bottom: 14px;
}

.wd-result-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
.wd-result-label { font-size: 13px; font-weight: 700; }
.wd-result-badge {
  display: inline-block; padding: 4px 12px; border-radius: 6px;
  font-size: 11px; font-weight: 700; color: #fff;
  background: var(--red-bright);
}

.wd-block { margin-bottom: 16px; }
.wd-block-title { margin: 0 0 8px; font-size: 11px; font-weight: 700; color: #666; letter-spacing: .02em; }
.wd-chip {
  display: inline-block; padding: 4px 12px; border-radius: 6px;
  font-size: 11.5px; font-weight: 700;
  background: #fbe2b0; border: 1px solid #efc77c; color: #333;
}

.wd-fact { display: flex; gap: 6px; font-size: 13px; margin-bottom: 4px; }
.wd-fact-label { color: #666; min-width: 130px; }
.wd-fact-value { font-weight: 600; }

.wd-side-panel {
  background: var(--cream); border: 1px solid var(--cream-line); border-radius: 8px;
  padding: 12px 14px 16px;
}

.wd-cal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.wd-cal-nav { background: none; border: 0; cursor: pointer; font-size: 13px; color: #666; padding: 2px 6px; }
.wd-cal-nav:hover { color: var(--ink); }
.wd-cal-month { font-size: 12.5px; font-weight: 700; }
.wd-cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; text-align: center; }
.wd-cal-dow { font-size: 9.5px; color: #888; font-weight: 700; padding-bottom: 3px; }
.wd-cal-day { font-size: 10.5px; padding: 4px 0; border-radius: 4px; color: var(--ink); }
.wd-cal-day.muted { color: #bbb; }
.wd-cal-day.selected { background: var(--red-bright); color: #fff; font-weight: 700; }

.wd-datetime { margin-top: 16px; display: flex; gap: 10px; }
.wd-field { flex: 1; }
.wd-field label { display: block; font-size: 10.5px; color: #666; margin-bottom: 3px; font-weight: 600; }
.wd-field input {
  width: 100%; background: #fff; border: 1px solid var(--cream-line); border-radius: 4px;
  font: inherit; font-size: 12.5px; padding: 6px 8px;
}
.wd-field input:focus-visible { outline: 2px solid var(--red); outline-offset: 1px; }

.wd-approve {
  margin-top: 14px; width: 100%;
  background: var(--red); color: #fff; border: 0; cursor: pointer;
  font: inherit; font-size: 12.5px; font-weight: 700;
  padding: 10px 14px; border-radius: 6px;
}
.wd-approve:hover { background: #8f1619; }
.wd-approve:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }

.wd-confirm { margin: 10px 0 0; font-size: 11.5px; font-weight: 600; color: #2f6b2f; text-align: center; }

@media (max-width: 760px) {
  .wd-body { grid-template-columns: 1fr; }
}
`;

const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function MiniCalendar({ selectedDay }: { selectedDay: number }) {
  // August 2026 starts on a Saturday
  const firstWeekday = 6;
  const daysInMonth = 31;
  const cells: Array<number | null> = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div>
      <div className="wd-cal-head">
        <button type="button" className="wd-cal-nav" aria-label="Previous month">‹</button>
        <span className="wd-cal-month">August 2026</span>
        <button type="button" className="wd-cal-nav" aria-label="Next month">›</button>
      </div>
      <div className="wd-cal-grid">
        {DOW.map((d) => <div className="wd-cal-dow" key={d}>{d}</div>)}
        {cells.map((day, i) => (
          <div
            key={i}
            className={`wd-cal-day${day === null ? " muted" : ""}${day === selectedDay ? " selected" : ""}`}
          >
            {day ?? ""}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WasteStatusDetails() {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const detail = siteId ? SITE_DETAILS[siteId] : undefined;

  const [date, setDate] = useState("2026-08-17");
  const [time, setTime] = useState("15:19");
  const [approved, setApproved] = useState(false);

  const handleApprove = () => {
    // TODO: send approval + assigned collector + schedule to the backend
    setApproved(true);
  };

  if (!detail) {
    return (
      <div className="wd-root">
        <style>{css}</style>
        <div style={{ padding: 24 }}>
          <button type="button" className="wd-back" onClick={() => navigate("/admin/waste-status")}>
            ← Back to Waste status
          </button>
          <p>Report not found.</p>
        </div>
      </div>
    );
  }

  const selectedDay = Number(date.split("-")[2]) || 17;

  return (
    <div className="wd-root">
      <style>{css}</style>

      <header className="wd-head">
        <div>
          <button type="button" className="wd-back" onClick={() => navigate("/admin/waste-status")}>
            ← Back to Waste status
          </button>
          <h1 className="wd-title">Report review — {detail.site}</h1>
          <p className="wd-sub">Submitted by {detail.submittedBy} · {detail.submittedAt}</p>
        </div>
        <button
          type="button"
          className="wd-avatar"
          aria-label="Marco Reyes — manage account"
          onClick={() => navigate("/admin/account")}
        >
          MC
        </button>
      </header>

      <div className="wd-body">
        <div>
          <div className="wd-photo">Uploaded bin photo</div>

          <div className="wd-result-row">
            <span className="wd-result-label">CNN result</span>
            <span className="wd-result-badge">{detail.cnnResult} · {detail.confidence}% confidence</span>
          </div>

          <div className="wd-block">
            <h2 className="wd-block-title">TYPES OF WASTE DETECTED</h2>
            {detail.wasteTypes.map((t) => (
              <span className="wd-chip" key={t}>{t}</span>
            ))}
          </div>

          <div className="wd-block">
            <h2 className="wd-block-title">SITE DETAILS</h2>
            <div className="wd-fact">
              <span className="wd-fact-label">Location:</span>
              <span className="wd-fact-value">{detail.location}</span>
            </div>
            <div className="wd-fact">
              <span className="wd-fact-label">Assigned Collector:</span>
              <span className="wd-fact-value">{detail.assignedCollector}</span>
            </div>
            <div className="wd-fact">
              <span className="wd-fact-label">Reported:</span>
              <span className="wd-fact-value">{detail.reportedAgo}</span>
            </div>
          </div>
        </div>

        <aside className="wd-side-panel">
          <MiniCalendar selectedDay={selectedDay} />

          <div className="wd-datetime">
            <div className="wd-field">
              <label htmlFor="wd-date">Date:</label>
              <input id="wd-date" type="date" value={date} onChange={(e) => { setDate(e.target.value); setApproved(false); }} />
            </div>
            <div className="wd-field">
              <label htmlFor="wd-time">Time:</label>
              <input id="wd-time" type="time" value={time} onChange={(e) => { setTime(e.target.value); setApproved(false); }} />
            </div>
          </div>

          <button type="button" className="wd-approve" onClick={handleApprove}>
            Approve &amp; assign collector
          </button>
          {approved && <p className="wd-confirm">Approved and assigned for {date} at {time}.</p>}
        </aside>
      </div>
    </div>
  );
}