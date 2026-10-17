import { useState } from "react";
import { useNavigate } from "react-router";

type SiteStatus = "Active" | "Pending review" | "Inactive";

const STATUS_OPTIONS: SiteStatus[] = ["Active", "Pending review", "Inactive"];

const css = `
.rd-root, .rd-root * { box-sizing: border-box; }
.rd-root {
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

.rd-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 5px solid var(--olive);
  gap: 16px; flex-wrap: wrap;
}
.rd-back {
  background: none; border: 0; cursor: pointer; padding: 0;
  color: var(--red-bright); font: inherit; font-size: 12px; font-weight: 700;
  margin-bottom: 6px;
}
.rd-back:hover { text-decoration: underline; }
.rd-back:focus-visible { outline: 2px solid var(--red-bright); outline-offset: 2px; }
.rd-title { margin: 0; font-size: 20px; font-weight: 700; }
.rd-sub { margin: 2px 0 0; font-size: 12.5px; color: #666; }
.rd-avatar {
  width: 38px; height: 30px; border-radius: 8px;
  background: #f8ced4; color: var(--red-bright);
  font-size: 20px; display: grid; place-items: center;
  flex-shrink: 0;
  border: 0; cursor: pointer; font-family: inherit;
}
.rd-avatar:hover { background: #f3b9c3; }
.rd-avatar:focus-visible { outline: 2px solid var(--red); outline-offset: 2px; }

.rd-body { padding: 18px 20px 28px; display: grid; grid-template-columns: 1.1fr 1fr; gap: 16px; align-items: start; }

.rd-panel {
  background: var(--cream);
  border-radius: 8px;
  padding: 16px 18px 20px;
}
.rd-panel-title { margin: 0 0 14px; font-size: 12.5px; font-weight: 700; color: #555; }

.rd-field { margin-bottom: 14px; }
.rd-field label { display: block; font-size: 12px; font-weight: 600; color: #444; margin-bottom: 4px; }
.rd-field input,
.rd-field select {
  width: 100%;
  background: #fff;
  border: 1px solid var(--cream-line);
  border-radius: 4px;
  font: inherit; font-size: 13px; color: var(--ink);
  padding: 8px 10px;
}
.rd-field input::placeholder { color: #a9a08f; }
.rd-field input:focus-visible,
.rd-field select:focus-visible { outline: 2px solid var(--red); outline-offset: 1px; }

.rd-coords { display: flex; gap: 12px; }
.rd-coords .rd-field { flex: 1; margin-bottom: 0; }

.rd-actions { display: flex; gap: 10px; margin-top: 18px; }
.rd-cancel {
  background: #fff; border: 1.5px solid var(--red-bright); color: var(--red-bright);
  font: inherit; font-size: 13px; font-weight: 700;
  padding: 9px 20px; border-radius: 6px; cursor: pointer;
}
.rd-cancel:hover { background: #fbeceb; }
.rd-cancel:focus-visible { outline: 2px solid var(--red-bright); outline-offset: 2px; }
.rd-save {
  background: var(--red); color: #fff; border: 0; cursor: pointer;
  font: inherit; font-size: 13px; font-weight: 700;
  padding: 9px 20px; border-radius: 6px;
}
.rd-save:hover { background: #8f1619; }
.rd-save:disabled { background: #c98f8f; cursor: not-allowed; }
.rd-save:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }

.rd-confirm { margin: 12px 0 0; font-size: 12.5px; font-weight: 600; color: #2f6b2f; }

.rd-map {
  border-radius: 8px; overflow: hidden;
  aspect-ratio: 4 / 3;
  background: linear-gradient(135deg, #c9a97a 0%, #d8bd93 45%, #b99a68 100%);
  position: relative;
  border: 1px solid var(--cream-line);
}
.rd-map-note {
  position: absolute; top: 8px; left: 8px;
  background: rgba(255,255,255,.85);
  font-size: 10px; font-weight: 600; color: #555;
  padding: 3px 8px; border-radius: 4px;
}
.rd-pin {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -100%);
  display: flex; flex-direction: column; align-items: center; gap: 2px;
}
.rd-pin-dot {
  width: 24px; height: 24px; border-radius: 50% 50% 50% 0;
  transform: rotate(-45deg);
  background: var(--red-bright);
  display: grid; place-items: center;
  color: #fff; font-size: 11px; font-weight: 700;
  box-shadow: 0 1px 3px rgba(0,0,0,.4);
}
.rd-pin-dot span { transform: rotate(45deg); }
.rd-pin-label {
  font-size: 10.5px; font-weight: 700; color: #fff;
  text-shadow: 0 1px 2px rgba(0,0,0,.7);
  white-space: nowrap;
}

@media (max-width: 760px) {
  .rd-body { grid-template-columns: 1fr; }
}
`;

export default function RegisterDisposalSite() {
  const navigate = useNavigate();

  const [siteName, setSiteName] = useState("");
  const [pinLocation, setPinLocation] = useState("");
  const [lat, setLat] = useState("");
  const [long, setLong] = useState("");
  const [status, setStatus] = useState<SiteStatus>("Active");
  const [saved, setSaved] = useState(false);

  const canSave = siteName.trim().length > 0 && pinLocation.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    // TODO: send { siteName, pinLocation, lat, long, status } to the backend
    setSaved(true);
  };

  const handleCancel = () => {
    navigate("/admin/disposal-sites");
  };

  return (
    <div className="rd-root">
      <style>{css}</style>

      <header className="rd-head">
        <div>
          <button type="button" className="rd-back" onClick={() => navigate("/admin/disposal-sites")}>
            ← Back to Disposal sites
          </button>
          <h1 className="rd-title">Register new disposal site</h1>
          <p className="rd-sub">Add a site so residents can pin and report to it</p>
        </div>
        <button
          type="button"
          className="rd-avatar"
          aria-label="Marco Reyes — manage account"
          onClick={() => navigate("/admin/account")}
        >
          MC
        </button>
      </header>

      <div className="rd-body">
        <section className="rd-panel">
          <h2 className="rd-panel-title">ADD/EDIT DISPOSAL SITE</h2>

          <div className="rd-field">
            <label htmlFor="rd-name">Site name</label>
            <input
              id="rd-name"
              placeholder="Ferndale street Bin"
              value={siteName}
              onChange={(e) => { setSiteName(e.target.value); setSaved(false); }}
            />
          </div>

          <div className="rd-field">
            <label htmlFor="rd-pin">Pin location</label>
            <input
              id="rd-pin"
              placeholder="Ferndale street"
              value={pinLocation}
              onChange={(e) => { setPinLocation(e.target.value); setSaved(false); }}
            />
          </div>

          <div className="rd-field">
            <label>Coordinates</label>
            <div className="rd-coords">
              <div className="rd-field">
                <input
                  aria-label="Latitude"
                  placeholder="Lat : 123456"
                  value={lat}
                  onChange={(e) => { setLat(e.target.value); setSaved(false); }}
                />
              </div>
              <div className="rd-field">
                <input
                  aria-label="Longitude"
                  placeholder="Long : 56789"
                  value={long}
                  onChange={(e) => { setLong(e.target.value); setSaved(false); }}
                />
              </div>
            </div>
          </div>

          <div className="rd-field">
            <label htmlFor="rd-status">Status</label>
            <select
              id="rd-status"
              value={status}
              onChange={(e) => { setStatus(e.target.value as SiteStatus); setSaved(false); }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="rd-actions">
            <button type="button" className="rd-cancel" onClick={handleCancel}>Cancel</button>
            <button type="button" className="rd-save" onClick={handleSave} disabled={!canSave}>
              Save disposal site
            </button>
          </div>

          {saved && <p className="rd-confirm">Disposal site saved.</p>}
        </section>

        <div className="rd-map" role="img" aria-label="Map preview of the pinned location">
          <span className="rd-map-note">Map preview — connect a maps provider for live data</span>
          {pinLocation.trim() && (
            <div className="rd-pin">
              <span className="rd-pin-dot"><span>2</span></span>
              <span className="rd-pin-label">{pinLocation}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}