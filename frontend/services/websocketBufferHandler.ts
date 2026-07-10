/**
 * Shared WebSocket → buffer push logic for app resume.
 * Used when reconnecting so graph buffers get live data even if Home isn't mounted.
 */

import { addRawPoint } from './heartRateBuffer';
import { addRawPoint as addRespirationRawPoint } from './respirationBuffer';
import { addRawPoint as addStressRawPoint } from './stressBuffer';
import { addTemperaturePoint } from './temperatureBuffer';
import { addHumidityPoint } from './humidityBuffer';
import { addTvocPoint } from './tvocBuffer';

/**
 * Push health_data_update payload into heart rate, respiration, and stress buffers.
 * Same validation as Home's message handler; no UI state updates.
 */
export function pushWebSocketDataToBuffers(data: any, deviceId: string): void {
  if (!deviceId?.trim()) return;

  const id = deviceId.trim();

  let timestamp: number;
  if (data.timestamp) {
    timestamp = new Date(data.timestamp).getTime();
  } else if (data.timestampSeconds) {
    timestamp = data.timestampSeconds * 1000;
  } else {
    timestamp = Date.now();
  }

  const heartRateValue = data.heartRate ?? data.hr ?? data.bpm ?? null;
  let hrProcessed: number | null = null;
  if (heartRateValue === null || heartRateValue === 0) {
    hrProcessed = null;
  } else if (Number.isFinite(heartRateValue) && heartRateValue > 0 && heartRateValue < 250) {
    hrProcessed = Number(heartRateValue);
  }
  addRawPoint(id, timestamp, hrProcessed);

  const respirationValue = data.respiration ?? data.resp ?? null;
  let respProcessed: number | null = null;
  if (respirationValue === null || respirationValue === 0) {
    respProcessed = null;
  } else if (Number.isFinite(respirationValue) && respirationValue > 0 && respirationValue < 50) {
    respProcessed = Number(respirationValue);
  }
  addRespirationRawPoint(id, timestamp, respProcessed);

  const stressValue = data.stress ?? data.stress_level ?? data.payload?.stress_level ?? null;
  if (stressValue != null) {
    const parsed = typeof stressValue === 'string' ? parseFloat(stressValue) : Number(stressValue);
    if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      let stressTs = timestamp;
      if (data.payload?.timestamp) {
        stressTs = new Date(data.payload.timestamp).getTime();
      }
      addStressRawPoint(id, stressTs, parsed);
    }
  }

  // Environmental Metrics
  if (data.temperature !== undefined || data.temp !== undefined) {
    const tVal = data.temperature ?? data.temp;
    if (tVal != null && Number.isFinite(Number(tVal))) {
      addTemperaturePoint(id, timestamp, Number(tVal));
    }
  }

  if (data.humidity !== undefined && data.humidity != null && Number.isFinite(Number(data.humidity))) {
    addHumidityPoint(id, timestamp, Number(data.humidity));
  }

  if (data.tvoc !== undefined && data.tvoc != null && Number.isFinite(Number(data.tvoc))) {
    addTvocPoint(id, timestamp, Number(data.tvoc));
  }
}

