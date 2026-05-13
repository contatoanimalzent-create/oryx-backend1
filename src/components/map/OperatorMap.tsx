"use client";
import { useEffect, useRef } from "react";
import type { Operator, Zone, Faction } from "@/types";
import { OPERATOR_STATUS_COLOR } from "@/lib/utils";
import { relativeTime } from "@/lib/utils";

interface Props {
  operators: Operator[];
  zones: Zone[];
  factions: Faction[];
  center?: [number, number];
  zoom?: number;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    L: any;
  }
}

export function OperatorMap({ operators, zones, factions, center = [-23.55, -46.63], zoom = 15 }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lMapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Record<string, any>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zonesRef = useRef<any[]>([]);
  const factionMap = Object.fromEntries(factions.map((f) => [f.id, f]));

  useEffect(() => {
    if (!mapRef.current || lMapRef.current) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      const L = window.L;
      const map = L.map(mapRef.current, { zoomControl: true, attributionControl: false });
      lMapRef.current = map;

      L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
        subdomains: "abcd",
        maxZoom: 20,
      }).addTo(map);

      map.setView(center, zoom);
    };
    document.head.appendChild(script);

    return () => {
      if (lMapRef.current) {
        lMapRef.current.remove();
        lMapRef.current = null;
        markersRef.current = {};
        zonesRef.current = [];
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update operators
  useEffect(() => {
    const L = window.L;
    if (!lMapRef.current || !L) return;

    const map = lMapRef.current;
    const existingIds = new Set(Object.keys(markersRef.current));

    operators.forEach((op) => {
      const faction = factionMap[op.factionId];
      const color = faction?.color ?? "#6B7280";
      const statusClass = OPERATOR_STATUS_COLOR[op.status];
      const isOnline = op.status !== "offline";

      const iconHtml = `
        <div style="
          width:32px;height:32px;border-radius:50%;
          background:${color};
          border:3px solid ${isOnline ? color : "#4B5563"};
          display:flex;align-items:center;justify-content:center;
          font-size:9px;font-weight:700;color:white;
          box-shadow:0 0 0 2px rgba(0,0,0,0.5);
          opacity:${isOnline ? 1 : 0.5};
          cursor:pointer;
        ">${op.callsign.slice(-2)}</div>`;

      const icon = L.divIcon({ html: iconHtml, className: "", iconSize: [32, 32], iconAnchor: [16, 16] });

      const popupContent = `
        <div style="min-width:160px;font-family:monospace;font-size:12px;">
          <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${op.callsign}</div>
          <div>Facção: ${faction?.name ?? op.factionId}</div>
          <div>Status: <span class="${statusClass}">${op.status}</span></div>
          <div>Última atualização: ${relativeTime(op.lastSeen)}</div>
          ${op.batteryLevel !== undefined ? `<div>Bateria: ${op.batteryLevel}%</div>` : ""}
        </div>`;

      if (markersRef.current[op.id]) {
        markersRef.current[op.id].setLatLng([op.lat, op.lng]);
        markersRef.current[op.id].setIcon(icon);
        markersRef.current[op.id].setPopupContent(popupContent);
      } else {
        const marker = L.marker([op.lat, op.lng], { icon })
          .bindPopup(popupContent)
          .addTo(map);
        markersRef.current[op.id] = marker;
      }
      existingIds.delete(op.id);
    });

    // Remove stale markers
    existingIds.forEach((id) => {
      markersRef.current[id]?.remove();
      delete markersRef.current[id];
    });
  }, [operators, factions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Draw zones
  useEffect(() => {
    const L = window.L;
    if (!lMapRef.current || !L) return;
    const map = lMapRef.current;
    zonesRef.current.forEach((z) => z.remove());
    zonesRef.current = [];
    zones.forEach((zone) => {
      if (!zone.active || zone.coordinates.length < 3) return;
      const poly = L.polygon(zone.coordinates, {
        color: zone.color ?? "#3B82F6",
        fillColor: zone.color ?? "#3B82F6",
        fillOpacity: 0.15,
        weight: 2,
      }).bindTooltip(zone.name, { permanent: false }).addTo(map);
      zonesRef.current.push(poly);
    });
  }, [zones]);

  return <div ref={mapRef} className="w-full h-full rounded-lg overflow-hidden" />;
}
