import { useState } from "react";
import { useNavigate } from "react-router";

function generateCollectorId() {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `COL-${num}`;
}

const css = `
.ca-root, .ca-root * { box-sizing: border-box; }
.ca-root {
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

.ca-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px 12px;
  border-bottom: 5px solid var(--olive);
  gap: 16px; flex-wrap: wrap;
}
.ca-back {
  background: none; border: 0; cursor: pointer; padding: 0;
  color: var(--red-bright); font: inherit; font-size: 12px; font-weight: 700;
  margin-bottom: 6px;
}
.ca-back:hover { text-decoration: underline; }
.ca-back:focus-visible { outline: 2px solid var(--red-bright); outline-offset: 2px; }
.ca-title { margin: 0; font-size: 22px; font-weight: 700; }
.ca-avatar {
  width: 38px; height: 30px; border-radius: 8px;
  background: #f8ced4; color: var(--red-bright);
  font-size: 20px; display: grid; place-items: center;
  flex-shrink: 0;
  border: 0; cursor: pointer; font-family: inherit;
}
.ca-avatar:hover { background: #f3b9c3; }
.ca-avatar:focus-visible { outline: 2px solid var(--red); outline-offset: 2px; }

.ca-body { padding: 18px 20px 28px; display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; align-items: start; }

.ca-panel {
  background: var(--cream);
  border-radius: 8px;
  padding: 16px 18px 20px;
}
.ca-panel-title { margin: 0 0 14px; font-size: 12.5px; font-weight: 700; color: #555; }

.ca-field { margin-bottom: 14px; }
.ca-field label { display: block; font-size: 12px; font-weight: 600; color: #444; margin-bottom: 4px; }
.ca-field input,
.ca-field select {
  width: 100%;
  background: #fff;
  border: 1px solid var(--cream-line);
  border-radius: 4px;
  font: inherit; font-size: 13px; color: var(--ink);
  padding: 8px 10px;
}
.ca-field input::placeholder { color: #a9a08f; }
.ca-field input:focus-visible,
.ca-field select:focus-visible { outline: 2px solid var(--red); outline-offset: 1px; }
.ca-field input:disabled { background: #f0ece1; color: #777; }

.ca-actions { display: flex; gap: 10px; margin-top: 18px; }
.ca-cancel {
  background: #fff; border: 1.5px solid var(--red-bright); color: var(--red-bright);
  font: inherit; font-size: 13px; font-weight: 700;
  padding: 9px 20px; border-radius: 6px; cursor: pointer;
}
.ca-cancel:hover { background: #fbeceb; }
.ca-cancel:focus-visible { outline: 2px solid var(--red-bright); outline-offset: 2px; }
.ca-save {
  background: var(--red); color: #fff; border: 0; cursor: pointer;
  font: inherit; font-size: 13px; font-weight: 700;
  padding: 9px 20px; border-radius: 6px;
}
.ca-save:hover { background: #8f1619; }
.ca-save:disabled { background: #c98f8f; cursor: not-allowed; }
.ca-save:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }

.ca-confirm { margin: 12px 0 0; font-size: 12.5px; font-weight: 600; color: #2f6b2f; }

.ca-add-password {
  background: #fff; border: 1.5px solid var(--red-bright); color: var(--red-bright);
  font: inherit; font-size: 12.5px; font-weight: 700;
  padding: 8px 18px; border-radius: 16px; cursor: pointer;
}
.ca-add-password:hover { background: #fbeceb; }
.ca-add-password:focus-visible { outline: 2px solid var(--red-bright); outline-offset: 2px; }

.ca-pw-confirm { margin: 10px 0 0; font-size: 11.5px; font-weight: 600; color: #2f6b2f; }

@media (max-width: 760px) {
  .ca-body { grid-template-columns: 1fr; }
}
`;

export default function CollectorsAccount() {
  const navigate = useNavigate();

  const [collectorId] = useState(generateCollectorId);
  const [fullName, setFullName] = useState("");
  const [staffId, setStaffId] = useState("");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [assignedSite, setAssignedSite] = useState("");
  const [saved, setSaved] = useState(false);
  const [passwordAdded, setPasswordAdded] = useState(false);

  const canSave = fullName.trim().length > 0 && email.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    // TODO: send { collectorId, fullName, staffId, email, contact, assignedSite } to the backend
    setSaved(true);
  };

  const handleCancel = () => {
    navigate("/admin/collectors");
  };

  const handleAddPassword = () => {
    // TODO: open a password-set flow or send a reset link to the collector's email
    setPasswordAdded(true);
  };

  return (
    <div className="ca-root">
      <style>{css}</style>

      <header className="ca-head">
        <div>
          <button type="button" className="ca-back" onClick={() => navigate("/admin/collectors")}>
            ← Back to Collectors
          </button>
          <h1 className="ca-title">Collectors account</h1>
        </div>
        <button
          type="button"
          className="ca-avatar"
          aria-label="Marco Reyes — manage account"
          onClick={() => navigate("/admin/account")}
        >
          MC
        </button>
      </header>

      <div className="ca-body">
        <section className="ca-panel">
          <div className="ca-field">
            <label htmlFor="ca-name">Full name</label>
            <input
              id="ca-name"
              value={fullName}
              onChange={(e) => { setFullName(e.target.value); setSaved(false); }}
            />
          </div>

          <div className="ca-field">
            <label htmlFor="ca-staff-id">Staff ID</label>
            <input
              id="ca-staff-id"
              value={staffId}
              onChange={(e) => { setStaffId(e.target.value); setSaved(false); }}
            />
          </div>

          <div className="ca-field">
            <label htmlFor="ca-email">Email address</label>
            <input
              id="ca-email"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setSaved(false); }}
            />
          </div>

          <div className="ca-field">
            <label htmlFor="ca-contact">Contact number</label>
            <input
              id="ca-contact"
              type="tel"
              value={contact}
              onChange={(e) => { setContact(e.target.value); setSaved(false); }}
            />
          </div>

          <div className="ca-field">
            <label htmlFor="ca-site">Assigned site</label>
            <input
              id="ca-site"
              value={assignedSite}
              onChange={(e) => { setAssignedSite(e.target.value); setSaved(false); }}
            />
          </div>

          <div className="ca-actions">
            <button type="button" className="ca-cancel" onClick={handleCancel}>Cancel</button>
            <button type="button" className="ca-save" onClick={handleSave} disabled={!canSave}>
              Add account
            </button>
          </div>

          {saved && <p className="ca-confirm">Collector account created.</p>}
        </section>

        <section className="ca-panel">
          <h2 className="ca-panel-title">LOGIN CREDENTIALS</h2>

          <div className="ca-field">
            <label htmlFor="ca-collector-id">Collector ID</label>
            <input id="ca-collector-id" value={collectorId} disabled />
          </div>

          <button type="button" className="ca-add-password" onClick={handleAddPassword}>
            Add password
          </button>

          {passwordAdded && <p className="ca-pw-confirm">Password link sent.</p>}
        </section>
      </div>
    </div>
  );
}