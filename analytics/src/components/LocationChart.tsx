"use client";

import { useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  CITY_COORDS,
  BAY_AREA_CITIES,
  BAY_AREA_CENTER,
} from "@/lib/city-coordinates";

const ComposableMap = dynamic(
  () => import("react-simple-maps").then((m) => m.ComposableMap),
  { ssr: false },
);
const Geographies = dynamic(
  () => import("react-simple-maps").then((m) => m.Geographies),
  { ssr: false },
);
const Geography = dynamic(
  () => import("react-simple-maps").then((m) => m.Geography),
  { ssr: false },
);
const Marker = dynamic(
  () => import("react-simple-maps").then((m) => m.Marker),
  { ssr: false },
);
const ZoomableGroup = dynamic(
  () => import("react-simple-maps").then((m) => m.ZoomableGroup),
  { ssr: false },
);

const GEO_URL = "https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;
const DEFAULT_ZOOM = 1;
const DEFAULT_CENTER: [number, number] = [-96, 38];

interface Props {
  data: { city: string; count: number }[];
}

interface BubbleData {
  city: string;
  count: number;
  coords: [number, number];
}

function clusterBayArea(
  data: { city: string; count: number }[],
): { city: string; count: number }[] {
  const bayAreaEntries: { city: string; count: number }[] = [];
  const rest: { city: string; count: number }[] = [];

  for (const d of data) {
    if (BAY_AREA_CITIES.has(d.city)) {
      bayAreaEntries.push(d);
    } else {
      rest.push(d);
    }
  }

  if (bayAreaEntries.length > 3) {
    const total = bayAreaEntries.reduce((s, d) => s + d.count, 0);
    return [...rest, { city: "Bay Area, CA", count: total }];
  }
  return data;
}

/**
 * Orange-to-red gradient using CSS variable palette.
 * Interpolates between --teal (#ff8c00) and --red (#ff3333).
 */
function bubbleColor(count: number, maxCount: number): string {
  const t = Math.min(count / maxCount, 1);
  const r = 255;
  const g = Math.round(140 * (1 - t) + 51 * t);
  const b = Math.round(0 * (1 - t) + 51 * t);
  return `rgb(${r},${g},${b})`;
}

export default function LocationChart({ data }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [center, setCenter] = useState<[number, number]>(DEFAULT_CENTER);

  const { bubbles, remoteCount, maxCount } = useMemo(() => {
    const remoteEntry = data.find((d) => d.city === "Remote");
    const geo = data.filter((d) => d.city !== "Remote");
    const clustered = clusterBayArea(geo);

    const mapped: BubbleData[] = [];
    for (const d of clustered) {
      const coords =
        d.city === "Bay Area, CA" ? BAY_AREA_CENTER : CITY_COORDS[d.city];
      if (coords) {
        mapped.push({ city: d.city, count: d.count, coords });
      }
    }

    const max = mapped.reduce((m, d) => Math.max(m, d.count), 1);
    return {
      bubbles: mapped,
      remoteCount: remoteEntry?.count ?? 0,
      maxCount: max,
    };
  }, [data]);

  const radius = useCallback(
    (count: number) => {
      const minR = 6;
      const maxR = 26;
      const base = minR + (maxR - minR) * Math.sqrt(count / maxCount);
      return base / Math.sqrt(zoom);
    },
    [maxCount, zoom],
  );

  const handleZoomIn = useCallback(
    () => setZoom((z) => Math.min(z * 1.5, MAX_ZOOM)),
    [],
  );
  const handleZoomOut = useCallback(
    () => setZoom((z) => Math.max(z / 1.5, MIN_ZOOM)),
    [],
  );
  const handleReset = useCallback(() => {
    setZoom(DEFAULT_ZOOM);
    setCenter(DEFAULT_CENTER);
  }, []);

  const fontSize = useCallback(
    (r: number) => {
      const size = r > 14 ? 9 : 7;
      return `${size / Math.sqrt(zoom)}px`;
    },
    [zoom],
  );

  return (
    <div
      className="panel chart-enter"
      style={{ height: "100%", position: "relative" }}
    >
      <div className="panel-header">Top Locations</div>
      <div style={{ height: "calc(100% - 37px)", position: "relative" }}>
        <ComposableMap
          projection="geoAlbersUsa"
          projectionConfig={{ scale: 1500 }}
          style={{ width: "100%", height: "100%" }}
        >
          <ZoomableGroup
            zoom={zoom}
            center={center}
            onMoveEnd={({
              coordinates,
              zoom: z,
            }: {
              coordinates: [number, number];
              zoom: number;
            }) => {
              setCenter(coordinates);
              setZoom(z);
            }}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
          >
            <Geographies geography={GEO_URL}>
              {({ geographies }: { geographies: any[] }) =>
                geographies.map((geo: any) => (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill="var(--border)"
                    stroke="var(--border-bright)"
                    strokeWidth={0.5 / zoom}
                    style={{
                      default: { outline: "none" },
                      hover: { outline: "none", fill: "var(--border-bright)" },
                      pressed: { outline: "none" },
                    }}
                  />
                ))
              }
            </Geographies>

            {bubbles.map((b, i) => {
              const r = radius(b.count);
              const isHovered = hover === b.city;
              const color = bubbleColor(b.count, maxCount);
              return (
                <Marker
                  key={b.city}
                  coordinates={b.coords}
                  onMouseEnter={() => setHover(b.city)}
                  onMouseLeave={() => setHover(null)}
                >
                  <circle
                    r={r + 3 / Math.sqrt(zoom)}
                    fill={color}
                    opacity={isHovered ? 0.3 : 0.12}
                    style={{ transition: "opacity 0.2s" }}
                  />
                  <circle
                    r={r}
                    fill={color}
                    opacity={isHovered ? 0.95 : 0.75}
                    stroke={isHovered ? "var(--text)" : color}
                    strokeWidth={(isHovered ? 1 : 0.5) / Math.sqrt(zoom)}
                    style={{
                      transition: "opacity 0.2s, stroke 0.2s",
                      animation: `bubble-pop 0.4s ease-out ${i * 60}ms both`,
                    }}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: fontSize(r),
                      fontWeight: 700,
                      fill: "var(--text)",
                      pointerEvents: "none",
                      animation: `bubble-pop 0.4s ease-out ${i * 60 + 100}ms both`,
                    }}
                  >
                    {b.count}
                  </text>
                  {(isHovered || r > 12 / Math.sqrt(zoom)) && (
                    <text
                      y={-(r + 6 / Math.sqrt(zoom))}
                      textAnchor="middle"
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: `${7 / Math.sqrt(zoom)}px`,
                        fill: isHovered ? "var(--text)" : "var(--muted)",
                        pointerEvents: "none",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {b.city}
                    </text>
                  )}
                </Marker>
              );
            })}
          </ZoomableGroup>
        </ComposableMap>

        {/* Zoom controls */}
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 10,
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            zIndex: 10,
          }}
        >
          {[
            { label: "+", action: handleZoomIn, ariaLabel: "Zoom in" },
            { label: "\u2013", action: handleZoomOut, ariaLabel: "Zoom out" },
            { label: "\u25CB", action: handleReset, ariaLabel: "Reset zoom" },
          ].map(({ label, action, ariaLabel }) => (
            <button
              key={label}
              onClick={action}
              aria-label={ariaLabel}
              className="ghost-btn"
              style={{
                width: 22,
                height: 22,
                padding: 0,
                fontSize: "11px",
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                letterSpacing: 0,
                background: "var(--bg-panel)",
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/*{remoteCount > 0 && (
          <div
            style={{
              position: "absolute",
              bottom: 8,
              right: 10,
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "var(--text-dim)",
              background: "var(--teal-dim)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "3px 8px",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <span style={{ color: "var(--teal)", fontWeight: 700 }}>{remoteCount}</span>
            <span>REMOTE</span>
          </div>
        )}*/}

        {/* Hover tooltip */}
        {hover && (
          <div
            style={{
              position: "absolute",
              top: 8,
              left: 10,
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              background: "var(--bg-panel)",
              border: "1px solid var(--border-bright)",
              borderRadius: "var(--radius)",
              padding: "5px 9px",
              pointerEvents: "none",
              zIndex: 10,
            }}
          >
            <div style={{ color: "var(--teal)", fontWeight: 600 }}>{hover}</div>
            <div style={{ color: "var(--text)", fontWeight: 700 }}>
              {bubbles.find((b) => b.city === hover)?.count ?? 0} jobs
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
