import { useState } from "react";

type FillStatus = "Empty" | "Near Full" | "Full";

interface UploadedImage {
  id: number;
  site: string;
  uploadedBy: string;
  time: string;
  status: FillStatus;
}

const IMAGES: UploadedImage[] = [
  { id: 1, site: "Children's Park", uploadedBy: "Chinley Suan", time: "12 min ago", status: "Near Full" },
  { id: 2, site: "Children's Park", uploadedBy: "Chinley Suan", time: "12 min ago", status: "Full" },
  { id: 3, site: "Children's Park", uploadedBy: "Chinley Suan", time: "12 min ago", status: "Empty" },
];

const css = `
.ui-root, .ui-root * { box-sizing: border-box; }
.ui-root {
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

.ui-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px 12px;
  border-bottom: 5px solid var(--olive);
  gap: 16px; flex-wrap: wrap;
}
.ui-title { margin: 0; font-size: 22px; font-weight: 700; }
.ui-sub { margin: 2px 0 0; font-size: 13px; color: #666; }
.ui-avatar {
  width: 38px; height: 30px; border-radius: 8px;
  background: #f8ced4; color: var(--red-bright);
  font-size: 20px; display: grid; place-items: center;
}

.ui-body { padding: 18px 20px 24px; display: flex; flex-direction: column; gap: 14px; }

.ui-card {
  display: flex; align-items: center; gap: 14px;
  background: var(--cream);
  border: 2px solid transparent;
  border-radius: 8px;
  padding: 10px 14px;
}
.ui-card.selected { border-color: #4da3e0; }

.ui-thumb { width: 64px; height: 48px; border-radius: 4px; flex-shrink: 0; overflow: hidden; }
.ui-thumb svg { display: block; width: 100%; height: 100%; }

.ui-info { flex: 1; min-width: 0; }
.ui-site { margin: 0; font-size: 13.5px; font-weight: 700; }
.ui-meta { margin: 2px 0 0; font-size: 11.5px; color: #666; }

.ui-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }

.ui-badge {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 10px; border-radius: 6px;
  font-size: 10.5px; font-weight: 700;
  box-shadow: 0 1px 2px rgba(0,0,0,.2);
  white-space: nowrap;
}
.ui-badge .dot { width: 6px; height: 6px; border-radius: 50%; }
.ui-badge.near { background: #fbe2b0; border: 1px solid #efc77c; color: #222; }
.ui-badge.near .dot { background: var(--amber); }
.ui-badge.full { background: #fff; border: 1px solid var(--red-bright); color: #222; }
.ui-badge.full .dot { background: var(--red-bright); }
.ui-badge.empty { background: #e2ede0; border: 1px solid var(--olive); color: #222; }
.ui-badge.empty .dot { background: var(--olive); }

.ui-review {
  background: #fff; border: 1.5px solid var(--red-bright); color: var(--red-bright);
  font: inherit; font-size: 11.5px; font-weight: 700;
  padding: 7px 16px; border-radius: 16px; cursor: pointer;
}
.ui-review:hover { background: #fbeceb; }
.ui-review:focus-visible { outline: 2px solid var(--red-bright); outline-offset: 2px; }

@media (max-width: 560px) {
  .ui-card { flex-wrap: wrap; }
  .ui-actions { width: 100%; justify-content: space-between; margin-left: 78px; }
}
`;

function badgeClass(status: FillStatus) {
  if (status === "Full") return "full";
  if (status === "Near Full") return "near";
  return "empty";
}

function Thumbnail({ status }: { status: FillStatus }) {
  const skyColor = "#a9d4ef";
  const groundColor = status === "Empty" ? "#7fb069" : status === "Full" ? "#8a8262" : "#a3a56a";
  return (
    <svg viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="64" height="48" fill={skyColor} />
      <rect y="26" width="64" height="22" fill={groundColor} />
      <circle cx="12" cy="12" r="5" fill="#e9d55e" />
      <path d="M0 30 L14 20 L26 30 Z" fill="#4d7a4d" />
      <path d="M20 32 L34 18 L48 32 Z" fill="#3f6b3f" />
      <rect x="40" y="22" width="4" height="10" fill="#6b5637" />
      <circle cx="42" cy="18" r="6" fill="#5a8a4c" />
    </svg>
  );
}

export default function UploadedImages() {
  const [selectedId, setSelectedId] = useState<number>(IMAGES[0]?.id ?? -1);

  const handleReview = (image: UploadedImage) => {
    setSelectedId(image.id);
    // TODO: open the review screen for this image
  };

  return (
    <div className="ui-root">
      <style>{css}</style>

      <header className="ui-head">
        <div>
          <h1 className="ui-title">Uploaded images</h1>
          <p className="ui-sub">Retrieves images from D3 · Waste Images</p>
        </div>
        <div className="ui-avatar" aria-label="Marco Reyes">MC</div>
      </header>

      <div className="ui-body">
        {IMAGES.map((img) => (
          <div key={img.id} className={`ui-card${selectedId === img.id ? " selected" : ""}`}>
            <div className="ui-thumb">
              <Thumbnail status={img.status} />
            </div>
            <div className="ui-info">
              <p className="ui-site">{img.site}</p>
              <p className="ui-meta">Uploaded by {img.uploadedBy} · {img.time}</p>
            </div>
            <div className="ui-actions">
              <span className={`ui-badge ${badgeClass(img.status)}`}>
                <span className="dot" />
                {img.status}
              </span>
              <button type="button" className="ui-review" onClick={() => handleReview(img)}>
                Review
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}