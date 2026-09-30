import { useState } from "react";

type Severity = "critical" | "warning";

interface Alert {
  id: number;
  title: string;
  description: string;
  severity: Severity;
  read: boolean;
}

const INITIAL_ALERTS: Alert[] = [
  {
    id: 1,
    title: "Bin overfow - Children's Park Bin 1",
    description: "Reported full for 40+ minutes with no collector assigned",
    severity: "critical",
    read: false,
  },
  {
    id: 2,
    title: "Collection delayed — St. Mary Street",
    description: "Dario Cabrera marked on leave, 5 sites unattended",
    severity: "warning",
    read: false,
  },
];

const css = `
.al-root, .al-root * { box-sizing: border-box; }
.al-root {
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

.al-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px 12px;
  border-bottom: 5px solid var(--olive);
  gap: 16px; flex-wrap: wrap;
}
.al-title { margin: 0; font-size: 22px; font-weight: 700; }
.al-sub { margin: 2px 0 0; font-size: 13px; color: #666; }
.al-head-right { display: flex; align-items: center; gap: 18px; }
.al-mark-read {
  background: none; border: 0; cursor: pointer;
  color: var(--red-bright); font: inherit; font-size: 12.5px; font-weight: 700;
  text-decoration: underline;
}
.al-mark-read:disabled { color: #999; cursor: default; text-decoration: none; }
.al-mark-read:focus-visible { outline: 2px solid var(--red-bright); outline-offset: 2px; }
.al-avatar {
  width: 38px; height: 30px; border-radius: 8px;
  background: #f8ced4; color: var(--red-bright);
  font-size: 20px; display: grid; place-items: center;
}

.al-body { padding: 18px 20px 24px; display: flex; flex-direction: column; gap: 14px; }

.al-card {
  display: flex; gap: 12px;
  background: var(--cream);
  border: 1px solid var(--cream-line);
  border-radius: 6px;
  padding: 14px 16px;
}
.al-stripe { width: 5px; border-radius: 3px; flex-shrink: 0; }
.al-stripe.critical { background: var(--red-bright); }
.al-stripe.warning { background: var(--amber); }

.al-card-body { flex: 1; background: #fff; border-radius: 4px; padding: 10px 14px; display: flex; gap: 10px; align-items: flex-start; }
.al-icon { flex-shrink: 0; margin-top: 2px; }
.al-icon.critical { color: var(--red-bright); }
.al-icon.warning { color: #b8860b; }
.al-card-title { margin: 0; font-size: 15px; font-weight: 700; }
.al-card-desc { margin: 4px 0 0; font-size: 12.5px; color: #555; }

.al-panel {
  background: var(--cream);
  border-radius: 6px;
  padding: 16px 18px 18px;
}
.al-panel-title { margin: 0 0 12px; font-size: 14px; font-weight: 700; }

.al-field { margin-bottom: 12px; }
.al-field label { display: block; font-size: 11.5px; color: #666; margin-bottom: 4px; }
.al-field select,
.al-field textarea {
  width: 100%;
  background: #fff;
  border: 1px solid var(--cream-line);
  border-radius: 4px;
  font: inherit; font-size: 13px; color: var(--ink);
  padding: 8px 10px;
}
.al-field textarea { resize: vertical; min-height: 56px; }
.al-field select:focus-visible,
.al-field textarea:focus-visible { outline: 2px solid var(--red); outline-offset: 1px; }

.al-send {
  background: var(--red); color: #fff; border: 0; cursor: pointer;
  font: inherit; font-size: 13px; font-weight: 700;
  padding: 10px 18px; border-radius: 6px;
}
.al-send:hover { background: #8f1619; }
.al-send:disabled { background: #c98f8f; cursor: not-allowed; }
.al-send:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }

.al-confirm { margin: 10px 0 0; font-size: 12.5px; color: #2f6b2f; font-weight: 600; }
`;

function WarningIcon({ severity }: { severity: Severity }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className={`al-icon ${severity}`} aria-hidden="true">
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  );
}

const RECIPIENT_OPTIONS = [
  "All residents — Zone 2",
  "All residents — Zone 1",
  "Team A collectors",
  "All collectors",
];

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>(INITIAL_ALERTS);
  const [recipients, setRecipients] = useState(RECIPIENT_OPTIONS[0]);
  const [reason, setReason] = useState(
    "Collection for Children's Park has been rescheduled to 3:00 PM today."
  );
  const [sent, setSent] = useState(false);

  const unreadCount = alerts.filter((a) => !a.read).length;

  const handleMarkAllRead = () => {
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
  };

  const handleSend = () => {
    if (!reason.trim()) return;
    // TODO: send the notification to the backend
    setSent(true);
  };

  return (
    <div className="al-root">
      <style>{css}</style>

      <header className="al-head">
        <div>
          <h1 className="al-title">Alerts</h1>
          <p className="al-sub">{unreadCount} unread</p>
        </div>
        <div className="al-head-right">
          <button
            type="button"
            className="al-mark-read"
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0}
          >
            Mark all read
          </button>
          <div className="al-avatar" aria-label="Marco Reyes">MC</div>
        </div>
      </header>

      <div className="al-body">
        {alerts.map((a) => (
          <div className="al-card" key={a.id}>
            <span className={`al-stripe ${a.severity}`} />
            <div className="al-card-body">
              <WarningIcon severity={a.severity} />
              <div>
                <p className="al-card-title">{a.title}</p>
                <p className="al-card-desc">{a.description}</p>
              </div>
            </div>
          </div>
        ))}

        <section className="al-panel">
          <h2 className="al-panel-title">Send notification (to Residents / Collectors)</h2>

          <div className="al-field">
            <label htmlFor="al-recipients">Recipients</label>
            <select
              id="al-recipients"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
            >
              {RECIPIENT_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          <div className="al-field">
            <label htmlFor="al-reason">Reason:</label>
            <textarea
              id="al-reason"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setSent(false);
              }}
            />
          </div>

          <button type="button" className="al-send" onClick={handleSend} disabled={!reason.trim()}>
            Send Notification
          </button>

          {sent && <p className="al-confirm">Notification sent to {recipients}.</p>}
        </section>
      </div>
    </div>
  );
}