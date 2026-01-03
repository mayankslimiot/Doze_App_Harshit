/**
 * Ring Buffer for efficient memory management
 * Maintains a fixed-size buffer that automatically removes oldest items
 */
export interface DataPoint {
  timestamp: number; // Unix timestamp in milliseconds
  value: number; // Data value (e.g., heart rate BPM)
}

const MAX_POINTS = 15000;

export class RingBuffer {
  private buffer: DataPoint[] = [];

  /**
   * Add a new data point to the buffer
   * If buffer exceeds MAX_POINTS, removes the oldest point
   */
  push(point: DataPoint): void {
    this.buffer.push(point);
    if (this.buffer.length > MAX_POINTS) {
      this.buffer.shift(); // Remove oldest point
    }
  }

  /**
   * Get all data points in the buffer
   */
  getAll(): DataPoint[] {
    return [...this.buffer]; // Return copy to prevent external mutation
  }

  /**
   * Get the last (most recent) data point
   */
  last(): DataPoint | undefined {
    return this.buffer.length > 0 ? this.buffer[this.buffer.length - 1] : undefined;
  }

  /**
   * Check if buffer is empty
   */
  isEmpty(): boolean {
    return this.buffer.length === 0;
  }

  /**
   * Get current buffer size
   */
  size(): number {
    return this.buffer.length;
  }

  /**
   * Clear all data from buffer
   */
  clear(): void {
    this.buffer = [];
  }

  /**
   * Get data points within a time range
   */
  getRange(startTime: number, endTime: number): DataPoint[] {
    return this.buffer.filter(
      (point) => point.timestamp >= startTime && point.timestamp <= endTime
    );
  }
}

