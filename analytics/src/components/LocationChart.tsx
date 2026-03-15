"use client";

import { useState, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  CITY_COORDS,
  BAY_AREA_CITIES,
  BAY_AREA_CENTER,
} from "@/lib/city-coordinates";

// react-simple-maps has no SSR support for geography fetching
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

  // scaleSqrt: radius proportional to sqrt of value, inversely scaled with zoom
  const radius = useCallback(
    (count: number) => {
      const minR = 6;
      const maxR = 26;
      const base = minR + (maxR - minR) * Math.sqrt(count / maxCount);
      return base / Math.sqrt(zoom);
    },
    [maxCount, zoom],
  );

  // Orange→red gradient based on count
  const bubbleColor = (count: number) => {
    const t = Math.min(count / maxCount, 1);
    const r = 255;
    const g = Math.round(140 * (1 - t) + 51 * t);
    const b = Math.round(0 * (1 - t) + 51 * t);
    return `rgb(${r},${g},${b})`;
  };

  const handleZoomIn = () => setZoom((z) => Math.min(z * 1.5, MAX_ZOOM));
  const handleZoomOut = () => setZoom((z) => Math.max(z / 1.5, MIN_ZOOM));
  const handleReset = () => {
    setZoom(DEFAULT_ZOOM);
    setCenter(DEFAULT_CENTER);
  };

  const fontSize = (r: number) => {
    const size = r > 14 ? 9 : 7;
    return `${size / Math.sqrt(zoom)}px`;
  };

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
                    fill="#111111"
                    stroke="#2a2a2a"
                    strokeWidth={0.5 / zoom}
                    style={{
                      default: { outline: "none" },
                      hover: { outline: "none", fill: "#1a1a1a" },
                      pressed: { outline: "none" },
                    }}
                  />
                ))
              }
            </Geographies>

            {bubbles.map((b, i) => {
              const r = radius(b.count);
              const isHovered = hover === b.city;
              return (
                <Marker
                  key={b.city}
                  coordinates={b.coords}
                  onMouseEnter={() => setHover(b.city)}
                  onMouseLeave={() => setHover(null)}
                >
                  {/* Glow */}
                  <circle
                    r={r + 3 / Math.sqrt(zoom)}
                    fill={bubbleColor(b.count)}
                    opacity={isHovered ? 0.3 : 0.12}
                    style={{ transition: "opacity 0.2s" }}
                  />
                  {/* Bubble */}
                  <circle
                    r={r}
                    fill={bubbleColor(b.count)}
                    opacity={isHovered ? 0.95 : 0.75}
                    stroke={isHovered ? "#fff" : bubbleColor(b.count)}
                    strokeWidth={(isHovered ? 1 : 0.5) / Math.sqrt(zoom)}
                    style={{
                      transition: "opacity 0.2s, stroke 0.2s",
                      animation: `bubble-pop 0.4s ease-out ${i * 60}ms both`,
                    }}
                  />
                  {/* Count inside bubble */}
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: fontSize(r),
                      fontWeight: 700,
                      fill: "#fff",
                      pointerEvents: "none",
                      animation: `bubble-pop 0.4s ease-out ${i * 60 + 100}ms both`,
                    }}
                  >
                    {b.count}
                  </text>
                  {/* City name label */}
                  {(isHovered || r > 12 / Math.sqrt(zoom)) && (
                    <text
                      y={-(r + 6 / Math.sqrt(zoom))}
                      textAnchor="middle"
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: `${7 / Math.sqrt(zoom)}px`,
                        fill: isHovered ? "#f0f0f0" : "var(--muted)",
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
            { label: "+", action: handleZoomIn },
            { label: "\u2013", action: handleZoomOut },
            { label: "\u25CB", action: handleReset },
          ].map(({ label, action }) => (
            <button
              key={label}
              onClick={action}
              style={{
                width: 22,
                height: 22,
                background: "var(--bg-panel)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                color: "var(--text-dim)",
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 0,
                lineHeight: 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--teal)";
                e.currentTarget.style.color = "var(--teal)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.color = "var(--text-dim)";
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Remote badge */}
        {remoteCount > 0 && (
          <div
            style={{
              position: "absolute",
              bottom: 8,
              right: 10,
              fontFamily: "var(--font-mono)",
              fontSize: "9px",
              color: "var(--text-dim)",
              background: "rgba(255,140,0,0.1)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "3px 8px",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <span style={{ color: "var(--teal)", fontWeight: 700 }}>
              {remoteCount}
            </span>
            <span>REMOTE</span>
          </div>
        )}

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
