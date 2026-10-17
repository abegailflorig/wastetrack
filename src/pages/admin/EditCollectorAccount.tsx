import { useState } from "react";
import { useNavigate, useParams } from "react-router";

interface CollectorRecord {
  id: string;
  fullName: string;
  staffId: string;
  email: string;
  contact: string;
  assignedSite: string;
  active: boolean;
  smsNotifications: boolean;
}

const COLLECTOR_RECORDS: Record<string, CollectorRecord> = {
  "1": {
    id: "COL-0014",
    fullName: "Team A",
    staffId: "",
    email: "",
    contact: "",
    assignedSite: "Children's Park",
    active: true,
    smsNotifications: true,
  },
  "2": {
    id: "COL-0015",
    fullName: "Team A",
    staffId: "",
    email: "",
    contact: "",
    assignedSite: "Twin road",
    active: false,
    smsNotifications: true,
  },
};

const css = `
.ec-root, .ec-root * { box-sizing: border-box; }
.ec-root {
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

.ec-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 5px solid var(--olive);
  gap: 16px; flex-wrap: wrap;
}
.ec-back {
  background: none; border: 0; cursor: pointer; padding: 0;
  color: var(--red-bright); font: inherit; font-size: 12px; font-weight: 700;
  margin-bottom: 6px;
}
.ec-back:hover { text-decoration: underline; }
.ec-back:focus-visible { outline: 2px solid var(--red-bright); outline-offset: 2px; }
.ec-title { margin: 0; font-size: 22px; font-weight: 700; }
.ec-avatar {
  width: 38px; height: 30px; border-radius: 8px;
  background: #f8ced4; color: var(--red-bright);
  font-size: 20px; display: grid; place-items: center;
  flex-shrink: 0;
  border: 0; cursor: pointer; font-family: inherit;
}
.ec-avatar:hover { background: #f3b9c3; }
.ec-avatar:focus-visible { outline: 2px solid var(--red); outline-offset: 2px; }

.ec-body { padding: 18px 20px 28px; display: grid; grid-template-columns: 1.3fr 1fr; gap: 16px; align-items: start; }

.ec-panel {
  background: var(--cream);
  border-radius: 8px;
  padding: 16px 18px 20px;
}
.ec-panel-title { margin: 0 0 14px; font-size: 12px; font-weight: 700; color: #555; }

.ec-field { margin-bottom: 14px; }
.ec-field label { display: block; font-size: 12px; font-weight: 600; color: #444; margin-bottom: 4px; }
.ec-field input {
  width: 100%;
  background: #fff;
  border: 1px solid var(--cream-line);
  border-radius: 4px;
  font: inherit; font-size: 13px; color: var(--ink);
  padding: 8px 10px;
}
.ec-field input:focus-visible { outline: 2px solid var(--red); outline-offset: 1px; }
.ec-field input:disabled { background: #f0ece1; color: #777; }

.ec-save {
  background: var(--red); color: #fff; border: 0; cursor: pointer;
  font: inherit; font-size: 13px; font-weight: 700;
  padding: 9px 18px; border-radius: 6px;
}
.ec-save:hover { background: #8f1619; }
.ec-save:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.ec-confirm { margin-top: 10px; font-size: 12px; font-weight: 600; color: #2f6b2f; }

.ec-side { display: flex; flex-direction: column; gap: 16px; }

.ec-toggle-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 0; border-bottom: 1px solid var(--cream-line);
}
.ec-toggle-row:last-child { border-bottom: none; }
.ec-toggle-label { font-size: 13px; font-weight: 600; }

.ec-switch { position: relative; width: 38px; height: 20px; flex-shrink: 0; }
.ec-switch input { opacity: 0; width: 0; height: 0; }
.ec-switch-track {
  position: absolute; inset: 0; border-radius: 10px; background: #ccc;
  cursor: pointer; transition: background .15s;
}
.ec-switch input:checked + .ec-switch-track { background: var(--olive); }
.ec-switch-track::before {
  content: ""; position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; border-radius: 50%; background: #fff;
  transition: transform .15s;
}
.ec-switch input:checked + .ec-switch-track::before { transform: translateX(18px); }
.ec-switch input:focus-visible + .ec-switch-track { outline: 2px solid var(--ink); outline-offset: 2px; }

.ec-edit-password {
  background: #fff; border: 1.5px solid var(--red-bright); color: var(--red-bright);
  font: inherit; font-size: 12px; font-weight: 700;
  padding: 7px 16px; border-radius: 16px; cursor: pointer;
}
.ec-edit-password:hover { background: #fbeceb; }
.ec-edit-password:focus-visible { outline: 2px solid var(--red-bright); outline-offset: 2px; }
.ec-pw-confirm { margin: 10px 0 0; font-size: 11.5px; font-weight: 600; color: #2f6b2f; }

.ec-remove-section {
  margin: 0 20px 24px;
  background: var(--cream);
  border-radius: 8px;
  padding: 14px 18px;
  display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap;
}
.ec-remove-title { margin: 0 0 4px; font-size: 13px; font-weight: 700; color: #444; }
.ec-remove-desc { margin: 0; font-size: 12px; color: #777; }
.ec-remove-btn {
  background: #fff; border: 1.5px solid var(--red-bright); color: var(--red-bright);
  font: inherit; font-size: 12.5px; font-weight: 700;
  padding: 8px 18px; border-radius: 6px; cursor: pointer;
}
.ec-remove-btn:hover { background: #fbeceb; }
.ec-remove-btn:focus-visible { outline: 2px solid var(--red-bright); outline-offset: 2px; }
.ec-remove-confirm { margin: 10px 20px 0; font-size: 12px; font-weight: 600; color: #a81b1e; }

@media (max-width: 760px) {
  .ec-body { grid-template-columns: 1fr; }
}
`;

export default function EditCollectorAccount() {
  const { collectorId } = useParams<{ collectorId: string }>();
  const navigate = useNavigate();
  const record = collectorId ? COLLECTOR_RECORDS[collectorId] : undefined;

  const [fullName, setFullName] = useState(record?.fullName ?? "");
  const [staffId, setStaffId] = useState(record?.staffId ?? "");
  const [email, setEmail] = useState(record?.email ?? "");
  const [contact, setContact] = useState(record?.contact ?? "");
  const [assignedSite, setAssignedSite] = useState(record?.assignedSite ?? "");
  const [active, setActive] = useState(record?.active ?? true);
  const [sms, setSms] = useState(record?.smsNotifications ?? true);
  const [saved, setSaved] = useState(false);
  const [passwordEdited, setPasswordEdited] = useState(false);
  const [removed, setRemoved] = useState(false);

  const handleSave = () => {
    // TODO: send the updated fields to the backend
    setSaved(true);
  };

  const handleEditPassword = () => {
    // TODO: open a password-reset flow for this collector
    setPasswordEdited(true);
  };

  const handleRemove = () => {
    // TODO: deactivate the account and unassign its sites on the backend
    setRemoved(true);
  };

  if (!record) {
    return (
      <div className="ec-root">
        <style>{css}</style>
        <div style={{ padding: 24 }}>
          <button type="button" className="ec-back" onClick={() => navigate("/admin/collectors")}>
            ← Back to Collectors
          </button>
          <p>Collector not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ec-root">
      <style>{css}</style>

      <header className="ec-head">
        <div>
          <button type="button" className="ec-back" onClick={() => navigate("/admin/collectors")}>
            ← Back to Collectors
          </button>
          <h1 className="ec-title">Manage account</h1>
        </div>
        <button
          type="button"
          className="ec-avatar"
          aria-label="Marco Reyes — manage account"
          onClick={() => navigate("/admin/account")}
        >
          MC
        </button>
      </header>

      <div className="ec-body">
        <section className="ec-panel">
          <div className="ec-field">
            <label htmlFor="ec-name">Full name</label>
            <input id="ec-name" value={fullName} onChange={(e) => { setFullName(e.target.value); setSaved(false); }} />
          </div>
          <div className="ec-field">
            <label htmlFor="ec-staff-id">Staff ID</label>
            <input id="ec-staff-id" value={staffId} onChange={(e) => { setStaffId(e.target.value); setSaved(false); }} />
          </div>
          <div className="ec-field">
            <label htmlFor="ec-email">Email address</label>
            <input id="ec-email" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setSaved(false); }} />
          </div>
          <div className="ec-field">
            <label htmlFor="ec-contact">Contact number</label>
            <input id="ec-contact" type="tel" value={contact} onChange={(e) => { setContact(e.target.value); setSaved(false); }} />
          </div>
          <div className="ec-field">
            <label htmlFor="ec-site">Assigned site</label>
            <input id="ec-site" value={assignedSite} onChange={(e) => { setAssignedSite(e.target.value); setSaved(false); }} />
          </div>

          <button type="button" className="ec-save" onClick={handleSave}>Edit account</button>
          {saved && <p className="ec-confirm">Account updated.</p>}
        </section>

        <div className="ec-side">
          <section className="ec-panel">
            <h2 className="ec-panel-title">ACCOUNT STATUS</h2>

            <div className="ec-toggle-row">
              <span className="ec-toggle-label">Active Collector</span>
              <label className="ec-switch">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                <span className="ec-switch-track" />
              </label>
            </div>

            <div className="ec-toggle-row">
              <span className="ec-toggle-label">SMS notifications</span>
              <label className="ec-switch">
                <input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} />
                <span className="ec-switch-track" />
              </label>
            </div>
          </section>

          <section className="ec-panel">
            <h2 className="ec-panel-title">LOGIN CREDENTIALS</h2>

            <div className="ec-field">
              <label htmlFor="ec-collector-id">Collector ID</label>
              <input id="ec-collector-id" value={record.id} disabled />
            </div>

            <button type="button" className="ec-edit-password" onClick={handleEditPassword}>
              Edit password
            </button>
            {passwordEdited && <p className="ec-pw-confirm">Password reset link sent.</p>}
          </section>
        </div>
      </div>

      <section className="ec-remove-section">
        <div>
          <h2 className="ec-remove-title">REMOVE COLLECTOR</h2>
          <p className="ec-remove-desc">Unassign sites and deactivate this account.</p>
        </div>
        <button type="button" className="ec-remove-btn" onClick={handleRemove}>
          Remove account
        </button>
      </section>
      {removed && <p className="ec-remove-confirm">Account removed and sites unassigned.</p>}
    </div>
  );
}