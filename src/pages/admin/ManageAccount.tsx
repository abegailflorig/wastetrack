import { useState } from "react";
import { useNavigate } from "react-router";

type Tab = "Profile" | "Notifications";

const css = `
.ma-root, .ma-root * { box-sizing: border-box; }
.ma-root {
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

.ma-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  padding: 16px 20px 12px;
  border-bottom: 5px solid var(--olive);
  gap: 16px; flex-wrap: wrap;
}
.ma-title { margin: 0; font-size: 22px; font-weight: 700; }
.ma-sub { margin: 2px 0 0; font-size: 13px; color: #666; }
.ma-avatar {
  width: 38px; height: 30px; border-radius: 8px;
  background: #f8ced4; color: var(--red-bright);
  font-size: 20px; display: grid; place-items: center;
  flex-shrink: 0;
}

.ma-body { padding: 16px 20px 24px; }

.ma-tabs { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.ma-tab {
  padding: 9px 20px; border-radius: 6px;
  font: inherit; font-size: 13.5px; font-weight: 700;
  cursor: pointer; background: #fff; color: var(--ink);
  border: 1.5px solid #ccc;
}
.ma-tab:hover { background: #f5f5f5; }
.ma-tab:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.ma-tab.selected { background: var(--red); color: #fff; border-color: var(--red); }

.ma-panels { display: grid; grid-template-columns: 1.4fr 1fr; gap: 16px; align-items: start; }
.ma-panel {
  background: var(--cream);
  border-radius: 6px;
  padding: 16px 18px 20px;
}
.ma-panel-title { margin: 0 0 14px; font-size: 12px; font-weight: 700; color: #555; }

.ma-avatar-row { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
.ma-avatar-circle {
  width: 54px; height: 54px; border-radius: 50%;
  background: #d9d9d9; flex-shrink: 0;
}
.ma-change-photo {
  background: #fff; border: 1.5px solid var(--red-bright); color: var(--red-bright);
  font: inherit; font-size: 12px; font-weight: 700;
  padding: 6px 14px; border-radius: 16px; cursor: pointer;
}
.ma-change-photo:hover { background: #fbeceb; }
.ma-change-photo:focus-visible { outline: 2px solid var(--red-bright); outline-offset: 2px; }
.ma-photo-hint { margin: 4px 0 0; font-size: 10.5px; color: #777; }

.ma-field { margin-bottom: 14px; }
.ma-field label { display: block; font-size: 12px; font-weight: 600; color: #444; margin-bottom: 4px; }
.ma-field input {
  width: 100%;
  background: #fff;
  border: 1px solid var(--cream-line);
  border-radius: 4px;
  font: inherit; font-size: 13px; color: var(--ink);
  padding: 8px 10px;
}
.ma-field input:focus-visible { outline: 2px solid var(--red); outline-offset: 1px; }

.ma-save {
  background: var(--red); color: #fff; border: 0; cursor: pointer;
  font: inherit; font-size: 13px; font-weight: 700;
  padding: 9px 18px; border-radius: 6px;
}
.ma-save:hover { background: #8f1619; }
.ma-save:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }

.ma-confirm { margin-top: 10px; font-size: 12px; font-weight: 600; color: #2f6b2f; }

.ma-toggle-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 0; border-bottom: 1px solid var(--cream-line);
}
.ma-toggle-row:last-child { border-bottom: none; }
.ma-toggle-label { font-size: 13px; font-weight: 600; }
.ma-toggle-desc { margin: 2px 0 0; font-size: 11.5px; color: #777; }

.ma-switch { position: relative; width: 38px; height: 20px; flex-shrink: 0; }
.ma-switch input { opacity: 0; width: 0; height: 0; }
.ma-switch-track {
  position: absolute; inset: 0; border-radius: 10px; background: #ccc;
  cursor: pointer; transition: background .15s;
}
.ma-switch input:checked + .ma-switch-track { background: var(--olive); }
.ma-switch-track::before {
  content: ""; position: absolute; top: 2px; left: 2px;
  width: 16px; height: 16px; border-radius: 50%; background: #fff;
  transition: transform .15s;
}
.ma-switch input:checked + .ma-switch-track::before { transform: translateX(18px); }
.ma-switch input:focus-visible + .ma-switch-track { outline: 2px solid var(--ink); outline-offset: 2px; }

@media (max-width: 760px) {
  .ma-panels { grid-template-columns: 1fr; }
}
`;

export default function ManageAccount() {
  const [tab, setTab] = useState<Tab>("Profile");

  return (
    <div className="ma-root">
      <style>{css}</style>

      <header className="ma-head">
        <div>
          <h1 className="ma-title">Manage account</h1>
          <p className="ma-sub">Your profile, security, and notification preferences</p>
        </div>
        <div className="ma-avatar" aria-label="Marco Reyes">MC</div>
      </header>

      <div className="ma-body">
        <div className="ma-tabs" role="tablist" aria-label="Account settings">
          {(["Profile", "Notifications"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`ma-tab${tab === t ? " selected" : ""}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "Profile" && <ProfilePanel />}
        {tab === "Notifications" && <NotificationsPanel />}
      </div>
    </div>
  );
}

function ProfilePanel() {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("Marco Reyes");
  const [staffId, setStaffId] = useState("");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordUpdated, setPasswordUpdated] = useState(false);

  const handleLogout = () => {
    // TODO: clear auth state on the backend/session if needed
    localStorage.removeItem("userRole");
    navigate("/login", { replace: true });
  };

  const handleUpdatePassword = () => {
    if (!currentPassword || !newPassword) return;
    // TODO: send password change to the backend
    setPasswordUpdated(true);
    setCurrentPassword("");
    setNewPassword("");
  };

  return (
    <div className="ma-panels">
      <section className="ma-panel">
        <h2 className="ma-panel-title">PROFILE INFORMATION</h2>

        <div className="ma-avatar-row">
          <div className="ma-avatar-circle" />
          <div>
            <button type="button" className="ma-change-photo">Change photo</button>
            <p className="ma-photo-hint">JPG or PNG, max 2MB</p>
          </div>
        </div>

        <div className="ma-field">
          <label htmlFor="ma-name">Full name</label>
          <input id="ma-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="ma-field">
          <label htmlFor="ma-staff-id">Staff ID</label>
          <input id="ma-staff-id" value={staffId} onChange={(e) => setStaffId(e.target.value)} />
        </div>
        <div className="ma-field">
          <label htmlFor="ma-email">Email address</label>
          <input id="ma-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="ma-field">
          <label htmlFor="ma-contact">Contact number</label>
          <input id="ma-contact" type="tel" value={contact} onChange={(e) => setContact(e.target.value)} />
        </div>

        <button type="button" className="ma-save" onClick={handleLogout}>Log out</button>
      </section>

      <section className="ma-panel">
        <h2 className="ma-panel-title">PASSWORD &amp; SECURITY</h2>

        <div className="ma-field">
          <label htmlFor="ma-current-pw">Current password</label>
          <input
            id="ma-current-pw"
            type="password"
            value={currentPassword}
            onChange={(e) => { setCurrentPassword(e.target.value); setPasswordUpdated(false); }}
          />
        </div>
        <div className="ma-field">
          <label htmlFor="ma-new-pw">New password</label>
          <input
            id="ma-new-pw"
            type="password"
            value={newPassword}
            onChange={(e) => { setNewPassword(e.target.value); setPasswordUpdated(false); }}
          />
        </div>

        <button type="button" className="ma-change-photo" onClick={handleUpdatePassword}>
          Update password
        </button>
        {passwordUpdated && <p className="ma-confirm">Password updated.</p>}
      </section>
    </div>
  );
}

function NotificationsPanel() {
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(false);
  const [binFullAlerts, setBinFullAlerts] = useState(true);

  return (
    <div className="ma-panels">
      <section className="ma-panel" style={{ gridColumn: "1 / -1", maxWidth: 480 }}>
        <h2 className="ma-panel-title">NOTIFICATION PREFERENCES</h2>

        <div className="ma-toggle-row">
          <div>
            <div className="ma-toggle-label">Email alerts</div>
            <p className="ma-toggle-desc">Get updates sent to your email address</p>
          </div>
          <label className="ma-switch">
            <input type="checkbox" checked={emailAlerts} onChange={(e) => setEmailAlerts(e.target.checked)} />
            <span className="ma-switch-track" />
          </label>
        </div>

        <div className="ma-toggle-row">
          <div>
            <div className="ma-toggle-label">SMS alerts</div>
            <p className="ma-toggle-desc">Get a text message for urgent reports</p>
          </div>
          <label className="ma-switch">
            <input type="checkbox" checked={smsAlerts} onChange={(e) => setSmsAlerts(e.target.checked)} />
            <span className="ma-switch-track" />
          </label>
        </div>

        <div className="ma-toggle-row">
          <div>
            <div className="ma-toggle-label">Bin full notifications</div>
            <p className="ma-toggle-desc">Notify me when a bin is reported full</p>
          </div>
          <label className="ma-switch">
            <input type="checkbox" checked={binFullAlerts} onChange={(e) => setBinFullAlerts(e.target.checked)} />
            <span className="ma-switch-track" />
          </label>
        </div>
      </section>
    </div>
  );
}