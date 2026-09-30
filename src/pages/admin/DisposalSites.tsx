import { useState } from "react";
import { useNavigate } from "react-router";

interface Site {
  id: number;
  name: string;
}

const SITES: Site[] = [
  { id: 1, name: "Children's Park" },
  { id: 2, name: "Twin road, Bin 1" },
  { id: 3, name: "Twin road, Bin 2" },
  { id: 4, name: "Twin road, Bin 3" },
  { id: 5, name: "Twin road, Bin 4" },
  { id: 6, name: "Twin road, Bin 5" },
  { id: 7, name: "Twin road, Bin 1" },
  { id: 8, name: "St. Mary street" },
  { id: 9, name: "White Plains street" },
];

// Pins shown on the placeholder map, positioned as % of the map area.
const MAP_PINS = [
  { id: 1, x: 32, y: 78, color: "#d0102b", label: "Children's Park" },
  { id: 2, x: 58, y: 55, color: "#d0102b", label: "Twin road, Bin 1" },
  { id: 3, x: 68, y: 22, color: "#2f9e44", label: "Twin road, Bin 2" },
];

const css = `
.ds-root, .ds-root * { box-sizing: border-box; }
.ds-root {
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

.ds-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px 12px;
  border-bottom: 5px solid var(--olive);
  gap: 16px; flex-wrap: wrap;
}
.ds-title { margin: 0; font-size: 22px; font-weight: 700; }
.ds-sub { margin: 2px 0 0; font-size: 13px; color: #666; }
.ds-avatar {
  width: 38px; height: 30px; border-radius: 8px;
  background: #f8ced4; color: var(--red-bright);
  font-size: 20px; display: grid; place-items: center;
  border: 0; cursor: pointer; font-family: inherit;
}
.ds-avatar:hover { background: #f3b9c3; }
.ds-avatar:focus-visible { outline: 2px solid var(--red); outline-offset: 2px; }

.ds-body { padding: 16px 20px 24px; display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }

/* Map placeholder */
.ds-map {
  position: relative;
  flex: 2 1 420px;
  min-width: 280px;
  aspect-ratio: 4 / 3;
  border-radius: 6px;
  overflow: hidden;
  background:
    radial-gradient(circle at 20% 15%, #3f7a3f 0 10%, transparent 11%),
    radial-gradient(circle at 85% 10%, #3f7a3f 0 8%, transparent 9%),
    radial-gradient(circle at 10% 85%, #3f7a3f 0 12%, transparent 13%),
    linear-gradient(135deg, #c9a97a 0%, #d8bd93 45%, #b99a68 100%);
  border: 1px solid var(--cream-line);
}
.ds-map-note {
  position: absolute; top: 8px; left: 8px;
  background: rgba(255,255,255,.85);
  font-size: 10px; font-weight: 600; color: #555;
  padding: 3px 8px; border-radius: 4px;
}
.ds-pin {
  position: absolute;
  transform: translate(-50%, -100%);
  display: flex; flex-direction: column; align-items: center;
  gap: 2px;
}
.ds-pin-dot {
  width: 22px; height: 22px; border-radius: 50% 50% 50% 0;
  transform: rotate(-45deg);
  display: grid; place-items: center;
  color: #fff; font-size: 10px; font-weight: 700;
  box-shadow: 0 1px 3px rgba(0,0,0,.4);
}
.ds-pin-dot span { transform: rotate(45deg); }
.ds-pin-label {
  font-size: 10px; font-weight: 700; color: #fff;
  text-shadow: 0 1px 2px rgba(0,0,0,.7);
  white-space: nowrap;
}

/* Side list panel */
.ds-panel {
  flex: 1 1 220px;
  min-width: 200px;
  background: var(--cream);
  border-radius: 6px;
  padding: 14px 16px 18px;
}
.ds-panel-title {
  margin: 0 0 10px;
  font-size: 12px; font-weight: 700; color: #555;
}
.ds-list { list-style: none; margin: 0 0 18px; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.ds-list li {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 500;
}
.ds-pin-icon { width: 13px; height: 13px; flex-shrink: 0; color: var(--red-bright); }

.ds-register {
  width: 100%;
  background: var(--red); color: #fff; border: 0; cursor: pointer;
  font: inherit; font-size: 13.5px; font-weight: 700;
  padding: 11px 16px; border-radius: 6px;
}
.ds-register:hover { background: #8f1619; }
.ds-register:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }

@media (max-width: 640px) {
  .ds-body { flex-direction: column; }
}
`;

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="ds-pin-icon" aria-hidden="true">
      <path d="M12 2C7.6 2 4 5.6 4 10c0 5.4 6.7 11.2 7 11.5.3.3.7.3 1 0 .3-.3 7-6.1 7-11.5 0-4.4-3.6-8-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z" />
    </svg>
  );
}

export default function DisposalSites() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const navigate = useNavigate();

  return (
    <div className="ds-root">
      <style>{css}</style>

      <header className="ds-head">
        <div>
          <h1 className="ds-title">Disposal sites</h1>
          <p className="ds-sub">14 registered · 2 pending review</p>
        </div>
        <button
          type="button"
          className="ds-avatar"
          aria-label="Marco Reyes — manage account"
          onClick={() => navigate("/admin/account")}
        >
          MC
        </button>
      </header>

      <div className="ds-body">
        <div className="ds-map" role="img" aria-label="Map of registered disposal sites">
          <span className="ds-map-note">Map preview — connect a maps provider for live data</span>
          {MAP_PINS.map((pin) => (
            <button
              key={pin.id}
              type="button"
              className="ds-pin"
              style={{ left: `${pin.x}%`, top: `${pin.y}%`, background: "none", border: 0, padding: 0, cursor: "pointer" }}
              onClick={() => setSelectedId(pin.id)}
              aria-pressed={selectedId === pin.id}
            >
              <span className="ds-pin-dot" style={{ background: pin.color }}>
                <span>{pin.id}</span>
              </span>
              <span className="ds-pin-label">{pin.label}</span>
            </button>
          ))}
        </div>

        <aside className="ds-panel">
          <h2 className="ds-panel-title">DISPOSAL SITES</h2>
          <ul className="ds-list">
            {SITES.map((s) => (
              <li key={s.id}>
                <PinIcon />
                {s.name}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="ds-register"
            onClick={() => navigate("/admin/disposal-sites/register")}
          >
            + Register Site
          </button>
        </aside>
      </div>
    </div>
  );
}