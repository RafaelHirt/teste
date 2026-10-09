import { useState } from "react";
import { MapPin, X, Maximize2, Minus, Plus } from "lucide-react";
import geometry from "./data/goias.json";
import { aggregate, normalize } from "../shared/domain.js";
import { monthlyOverview } from "../shared/monthly.js";
import { money } from "./format.js";

export const municipalityNames = new Set(
  geometry.municipalities.map((m) => normalize(m.name)),
);
export function municipalityKey(value) {
  return normalize(String(value ?? "").replace(/\s*[-/]\s*GO\s*$/i, ""));
}

export default function GoiasMap({
  records,
  source,
  referenceDate,
  selected,
  onSelect,
}) {
  const [hovered, setHovered] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState(null);
  const groups = new Map();
  for (const record of records) {
    const key = municipalityKey(record.municipality);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  const mapped = geometry.municipalities.filter((m) =>
    groups.has(normalize(m.name)),
  );
  const active =
    hovered ??
    geometry.municipalities.find(
      (m) => municipalityKey(m.name) === municipalityKey(selected),
    );
  const activeRecords = active
    ? (groups.get(normalize(active.name)) ?? [])
    : [];
  const totals = aggregate(activeRecords);
  const monthly = monthlyOverview(activeRecords, {
    source,
    today: referenceDate,
  });
  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };
  return (
    <div className="map-canvas">
      <div className="map-caption">
        <span className="map-caption-dot" /> GOIÁS <span>246 municípios</span>
      </div>
      <div className="map-controls" aria-label="Controles do mapa">
        <button
          title="Ampliar mapa"
          aria-label="Ampliar mapa"
          onClick={() => setZoom((z) => Math.min(z + 0.4, 3))}
        >
          <Plus size={16} />
        </button>
        <button
          title="Reduzir mapa"
          aria-label="Reduzir mapa"
          onClick={() => {
            setZoom((z) => Math.max(z - 0.4, 1));
            setPan({ x: 0, y: 0 });
          }}
        >
          <Minus size={16} />
        </button>
        <button
          title="Restaurar mapa"
          aria-label="Restaurar mapa"
          onClick={reset}
        >
          <Maximize2 size={15} />
        </button>
      </div>
      <svg
        className={`goias-map ${zoom > 1 ? "draggable" : ""}`}
        viewBox="0 0 640 540"
        aria-label="Mapa de Goiás com unidades por município"
        onPointerDown={(event) => {
          if (zoom > 1 && !event.target.closest("[data-marker]")) {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDrag({ x: event.clientX, y: event.clientY, origin: pan });
          }
        }}
        onPointerMove={(event) => {
          if (drag) {
            const factor =
              640 / event.currentTarget.getBoundingClientRect().width;
            setPan({
              x: drag.origin.x + (event.clientX - drag.x) * factor,
              y: drag.origin.y + (event.clientY - drag.y) * factor,
            });
          }
        }}
        onPointerUp={() => setDrag(null)}
        onPointerCancel={() => setDrag(null)}
      >
        <defs>
          <filter id="map-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow
              dx="0"
              dy="5"
              stdDeviation="6"
              floodColor="#315d40"
              floodOpacity=".08"
            />
          </filter>
        </defs>
        <g
          transform={`translate(${320 + pan.x} ${270 + pan.y}) scale(${zoom}) translate(-320 -270)`}
        >
          <g filter="url(#map-shadow)">
            {geometry.municipalities.map((m) => (
              <path
                key={m.id}
                d={m.path}
                fillRule="evenodd"
                className={`municipality ${groups.has(normalize(m.name)) ? "has-units" : ""} ${municipalityKey(selected) === normalize(m.name) ? "selected" : ""}`}
              >
                <title>{m.name}</title>
              </path>
            ))}
          </g>
          {mapped.map((m) => {
            const rows = groups.get(normalize(m.name));
            const count = new Set(rows.map((r) => normalize(r.unit))).size;
            const chosen = municipalityKey(selected) === normalize(m.name);
            return (
              <g
                key={m.id}
                data-marker="true"
                className={`map-marker ${chosen ? "chosen" : ""}`}
                transform={`translate(${m.x} ${m.y})`}
                tabIndex={0}
                role="button"
                aria-label={`${m.name}: ${count} ${count === 1 ? "unidade" : "unidades"}`}
                onMouseEnter={() => setHovered(m)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(m)}
                onBlur={() => setHovered(null)}
                onClick={() => onSelect(chosen ? "" : m.name)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(chosen ? "" : m.name);
                  }
                }}
              >
                <circle className="marker-halo" r={chosen ? 21 : 16} />
                <circle className="marker-center" r={count > 1 ? 10 : 7} />
                {count > 1 && (
                  <text textAnchor="middle" dominantBaseline="central">
                    {count}
                  </text>
                )}
                {[
                  "Goiânia",
                  "Rio Verde",
                  "Anápolis",
                  "Porangatu",
                  "Formosa",
                  "Catalão",
                ].includes(m.name) && (
                  <text className="marker-label" x={15} y={3}>
                    {m.name}
                  </text>
                )}
                <title>
                  {m.name} · {count} unidades ·{" "}
                  {money(
                    monthlyOverview(rows, { source, today: referenceDate })
                      .value,
                  )}
                  /mês
                </title>
              </g>
            );
          })}
        </g>
        <g className="compass" transform="translate(584 65)">
          <text y="-19" textAnchor="middle">
            N
          </text>
          <path d="M0 -12L5 5L0 1L-5 5Z" />
        </g>
      </svg>
      {active && activeRecords.length > 0 && (
        <div className="map-popover">
          <MapPin size={18} />
          <div>
            <strong>{active.name}</strong>
            <span>
              {totals.units} {totals.units === 1 ? "unidade" : "unidades"} ·{" "}
              {money(monthly.value)}/mês
              {monthly.unresolved > 0 && ` · ${monthly.unresolved} a conferir`}
            </span>
          </div>
          {selected && (
            <button
              aria-label="Limpar seleção do mapa"
              onClick={() => onSelect("")}
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}
      <div className="map-legend">
        <span>
          <i className="legend-dot" /> Município com unidade
        </span>
        <span>
          <i className="legend-area" /> Limite municipal
        </span>
      </div>
    </div>
  );
}
