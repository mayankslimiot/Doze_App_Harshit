import React, { useRef, useCallback, useEffect, useState } from 'react';
import { RingBuffer, DataPoint } from '@/utils/RingBuffer';
import { loadHistory } from '@/utils/historyLoader';
import { isDuplicate } from '@/utils/deduplication';
import { connectWebSocket, removeWebSocketHandler } from '@/services/websocketService';

/**
 * Custom hook to manage heart rate data with ring buffer
 * Handles WebSocket live data and history loading
 */
export function useHeartRateRingBuffer(deviceId: string | null, isLoggedIn: boolean) {
  const ringBufferRef = useRef<RingBuffer>(new RingBuffer());
  const [renderTrigger, setRenderTrigger] = useState(0);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const initializedRef = useRef(false);

  // Force re-render when data changes (throttled)
  const triggerRender = useCallback(() => {
    setRenderTrigger((prev) => {
      const next = prev + 1;
      console.log(`[useHeartRateRingBuffer] 🎯 renderTrigger updating: ${prev} → ${next}, Buffer size: ${ringBufferRef.current.size()}`);
      return next;
    });
  }, []);

  // Initialize: Load history if buffer is empty
  useEffect(() => {
    if (!deviceId || !isLoggedIn || initializedRef.current) return;

    const initialize = async () => {
      if (ringBufferRef.current.isEmpty()) {
        setIsLoadingHistory(true);
        try {
          await loadHistory(deviceId, ringBufferRef.current);
          triggerRender();
        } catch (error) {
          console.error('[useHeartRateRingBuffer] Error loading history:', error);
        } finally {
          setIsLoadingHistory(false);
          initializedRef.current = true;
        }
      } else {
        initializedRef.current = true;
      }
    };

    initialize();
  }, [deviceId, isLoggedIn, triggerRender]);

  // Throttle render updates (use ref to persist across renders)
  const lastRenderTimeRef = useRef<number>(0);
  const pendingRenderRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const RENDER_THROTTLE_MS = 250; // Update UI max every 250ms for responsive real-time feel

  // WebSocket message handler
  const messageHandler = useCallback(
    (data: any) => {
      const heartRateValue = data.heartRate ?? data.hr ?? data.bpm ?? null;

      if (heartRateValue != null && heartRateValue > 0 && heartRateValue < 250) {
        // Extract timestamp
        let updateTimestamp: number;
        if (data.timestamp) {
          updateTimestamp = new Date(data.timestamp).getTime();
        } else if (data.timestampSeconds) {
          updateTimestamp = data.timestampSeconds * 1000;
        } else {
          updateTimestamp = Date.now();
        }

        const newPoint: DataPoint = {
          timestamp: updateTimestamp,
          value: Number(heartRateValue),
        };

        // Check for duplicates before adding
        const lastPoint = ringBufferRef.current.last();
        const wasDuplicate = isDuplicate(lastPoint, newPoint);
        const bufferSizeBefore = ringBufferRef.current.size();
        
        // Only push if not duplicate
        if (!wasDuplicate) {
          ringBufferRef.current.push(newPoint);
          console.log(`[useHeartRateRingBuffer] ✅ Pushed new point: ${newPoint.value} BPM at ${new Date(newPoint.timestamp).toISOString()}, Buffer size: ${ringBufferRef.current.size()}`);
        } else {
          console.log(`[useHeartRateRingBuffer] ⏭️ Duplicate point skipped: ${newPoint.value} BPM at ${new Date(newPoint.timestamp).toISOString()}`);
        }
        
        // ALWAYS trigger render when we receive valid data, even if duplicate
        // This ensures UI stays responsive and shows latest state
        // The duplicate check only prevents buffer pollution, not UI updates
        const now = Date.now();
        const timeSinceLastRender = now - lastRenderTimeRef.current;
        
        if (timeSinceLastRender > RENDER_THROTTLE_MS) {
          // Throttle window passed, render immediately
          if (pendingRenderRef.current) {
            clearTimeout(pendingRenderRef.current);
            pendingRenderRef.current = null;
          }
          console.log(`[useHeartRateRingBuffer] 🔄 Triggering immediate render (throttle passed), Buffer size: ${ringBufferRef.current.size()}, renderTrigger will be: ${renderTrigger + 1}`);
          triggerRender();
          lastRenderTimeRef.current = now;
        } else {
          // Within throttle window, schedule render for end of window
          // CRITICAL: Always ensure one render fires - reschedule if needed to capture latest data
          if (pendingRenderRef.current) {
            // Cancel existing timeout and reschedule with latest data
            clearTimeout(pendingRenderRef.current);
            pendingRenderRef.current = null;
          }
          // Schedule new timeout to ensure latest data is captured
          const remainingTime = RENDER_THROTTLE_MS - timeSinceLastRender;
          pendingRenderRef.current = setTimeout(() => {
            console.log(`[useHeartRateRingBuffer] 🔄 Triggering scheduled render, Buffer size: ${ringBufferRef.current.size()}, renderTrigger will be: ${renderTrigger + 1}`);
            triggerRender();
            lastRenderTimeRef.current = Date.now();
            pendingRenderRef.current = null;
          }, remainingTime);
        }
      }
    },
    [triggerRender]
  );

  // Setup WebSocket connection - register handler as early as possible
  // Don't wait for initialization to complete to avoid missing early messages
  useEffect(() => {
    if (!deviceId || !isLoggedIn) {
      return;
    }

    // Register handler immediately, even if initialization is in progress
    // This ensures we don't miss early WebSocket messages
    console.log('[useHeartRateRingBuffer] 🔌 Connecting WebSocket for device:', deviceId, 'Initialized:', initializedRef.current);

    connectWebSocket(deviceId, messageHandler)
      .then((socket) => {
        console.log('[useHeartRateRingBuffer] WebSocket connected:', socket ? '✅' : '❌');
      })
      .catch((error) => {
        console.error('[useHeartRateRingBuffer] ❌ WebSocket connection error:', error);
      });

    return () => {
      console.log('[useHeartRateRingBuffer] 🧹 Cleaning up WebSocket handler');
      removeWebSocketHandler(messageHandler);
    };
  }, [deviceId, isLoggedIn, messageHandler]);

  // Clear buffer when device changes
  useEffect(() => {
    ringBufferRef.current.clear();
    initializedRef.current = false;
    setRenderTrigger(0);
    if (pendingRenderRef.current) {
      clearTimeout(pendingRenderRef.current);
      pendingRenderRef.current = null;
    }
  }, [deviceId]);

  // Create reactive snapshot of buffer data that updates with renderTrigger
  // This ensures useMemo dependencies detect changes
  // IMPORTANT: Always return a new array reference to ensure React detects changes
  const currentData = React.useMemo(() => {
    const data = ringBufferRef.current.getAll();
    // Force new array reference - even though getAll() already returns a copy,
    // this ensures React's dependency tracking works correctly
    const snapshot = [...data];
    console.log(`[useHeartRateRingBuffer] 📊 currentData snapshot created: ${snapshot.length} points, renderTrigger: ${renderTrigger}`);
    return snapshot;
  }, [renderTrigger]);

  return {
    ringBuffer: ringBufferRef.current, // Keep for backward compatibility (isEmpty, last, etc.)
    currentData, // Reactive snapshot - use this in useMemo dependencies
    isLoadingHistory,
    renderTrigger,
  };
}

