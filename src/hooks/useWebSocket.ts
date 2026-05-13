"use client";
import { useEffect, useRef } from "react";
import { useWsStore } from "@/store/ws";
import { useOperatorStore } from "@/store/operators";
import type { WsEvent } from "@/types";
import { MOCK_OPERATORS } from "@/lib/mock";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:3001/ws";
const USE_MOCK = process.env.NEXT_PUBLIC_MOCK_API === "true";

export function useWebSocket(eventId?: string) {
  const { setConnected, dispatch } = useWsStore();
  const { setOperators, updatePosition, updateStatus } = useOperatorStore();
  const wsRef = useRef<WebSocket | null>(null);
  const mockRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // seed mock operators
    if (USE_MOCK && eventId) {
      setOperators(MOCK_OPERATORS);
    }

    if (USE_MOCK) {
      setConnected(true);
      // Simulate realtime updates
      mockRef.current = setInterval(() => {
        const ops = Object.values(useOperatorStore.getState().operators);
        if (!ops.length) return;
        const op = ops[Math.floor(Math.random() * ops.length)];
        const evt: WsEvent = {
          type: "position.updated",
          operatorId: op.id,
          lat: op.lat + (Math.random() - 0.5) * 0.0005,
          lng: op.lng + (Math.random() - 0.5) * 0.0005,
          timestamp: new Date().toISOString(),
        };
        dispatch(evt);
        updatePosition(evt.operatorId, evt.lat, evt.lng, evt.timestamp);
      }, 2000);
      return () => {
        if (mockRef.current) clearInterval(mockRef.current);
        setConnected(false);
      };
    }

    const url = eventId ? `${WS_URL}?eventId=${eventId}` : WS_URL;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (msg) => {
      try {
        const evt: WsEvent = JSON.parse(msg.data);
        dispatch(evt);
        if (evt.type === "position.updated") {
          updatePosition(evt.operatorId, evt.lat, evt.lng, evt.timestamp);
        } else if (evt.type === "operator.status.changed") {
          updateStatus(evt.operatorId, evt.status);
        }
      } catch {
        // ignore malformed messages
      }
    };

    return () => {
      ws.close();
      setConnected(false);
    };
  }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps
}
