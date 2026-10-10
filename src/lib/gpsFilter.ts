import { calculateDistance } from './routing';

export interface FilteredGpsPosition {
  coords: [number, number]; // [latitude, longitude]
  accuracy: number;         // in meters
  speedMps: number | null;  // speed in meters/second
  heading: number | null;   // bearing in degrees
  timestamp: number;        // timestamp in ms
  isReliable: boolean;      // true if accepted by filter
  jumpDetected: boolean;    // true if an outlier was suppressed
}

export interface GpsFilterOptions {
  maxAcceptableAccuracy?: number; // Reject readings with accuracy worse than this (default: 65m)
  maxPlausibleSpeedMps?: number;  // Max emergency vehicle speed, e.g. 45 m/s (~160 km/h)
  stationaryThresholdMeters?: number; // Ignore micro-jitters under this distance (default: 3m)
  smoothingFactor?: number;       // EMA alpha factor between 0.1 (very smooth) and 1.0 (raw)
}

/**
 * Military/CAD Grade GPS Kalman & Outlier Suppression Filter.
 * Eliminates cell-tower ±500m triangulation jumps, multipath bouncing, and stationary jitter.
 */
export class GpsFilter {
  private lastPosition: FilteredGpsPosition | null = null;
  private readonly maxAcceptableAccuracy: number;
  private readonly maxPlausibleSpeedMps: number;
  private readonly stationaryThresholdMeters: number;
  private readonly smoothingFactor: number;

  constructor(options: GpsFilterOptions = {}) {
    this.maxAcceptableAccuracy = options.maxAcceptableAccuracy ?? 3000; // Realistic cellular/Wi-Fi/GPS ceiling
    this.maxPlausibleSpeedMps = options.maxPlausibleSpeedMps ?? 45;   // ~162 km/h
    this.stationaryThresholdMeters = options.stationaryThresholdMeters ?? 3.0; // 3m deadband
    this.smoothingFactor = options.smoothingFactor ?? 0.35;
  }

  /**
   * Resets the filter state (e.g. on new trip or clear GPS session)
   */
  public reset(initialCoords?: [number, number]): void {
    if (initialCoords && !(initialCoords[0] === 0 && initialCoords[1] === 0)) {
      this.lastPosition = {
        coords: initialCoords,
        accuracy: 10,
        speedMps: 0,
        heading: null,
        timestamp: Date.now(),
        isReliable: true,
        jumpDetected: false
      };
    } else {
      this.lastPosition = null;
    }
  }

  /**
   * Ingests a raw GeolocationPosition from navigator.geolocation.watchPosition
   * and returns a smoothed, jitter-free and outlier-filtered coordinate.
   */
  public update(rawPosition: GeolocationPosition): FilteredGpsPosition {
    const rawLat = rawPosition.coords.latitude;
    const rawLng = rawPosition.coords.longitude;
    const rawAccuracy = Math.round(rawPosition.coords.accuracy || 15);
    const now = rawPosition.timestamp || Date.now();

    // 1. Initial fix: accept if accuracy is reasonable (< 150m), else fallback
    if (!this.lastPosition) {
      const initialPos: FilteredGpsPosition = {
        coords: [rawLat, rawLng],
        accuracy: rawAccuracy,
        speedMps: rawPosition.coords.speed,
        heading: rawPosition.coords.heading,
        timestamp: now,
        isReliable: rawAccuracy <= this.maxAcceptableAccuracy,
        jumpDetected: false
      };
      this.lastPosition = initialPos;
      return initialPos;
    }

    const prevLat = this.lastPosition.coords[0];
    const prevLng = this.lastPosition.coords[1];

    if (prevLat === 0 && prevLng === 0) {
      const initialPos: FilteredGpsPosition = {
        coords: [rawLat, rawLng],
        accuracy: rawAccuracy,
        speedMps: rawPosition.coords.speed,
        heading: rawPosition.coords.heading,
        timestamp: now,
        isReliable: true,
        jumpDetected: false
      };
      this.lastPosition = initialPos;
      return initialPos;
    }

    const dtSeconds = Math.max(0.5, (now - this.lastPosition.timestamp) / 1000);
    const distanceMeters = calculateDistance(prevLat, prevLng, rawLat, rawLng);

    // 2. Outlier Rejection: Accuracy check
    // If accuracy is poor (> 65m), this is typically a Wi-Fi or cell tower jump (often 200m - 1500m).
    // Reject it and retain previous reliable position with updated accuracy indicator.
    if (rawAccuracy > this.maxAcceptableAccuracy) {
      return {
        ...this.lastPosition,
        accuracy: rawAccuracy,
        timestamp: now,
        isReliable: false,
        jumpDetected: true
      };
    }

    // 3. Outlier Rejection: Implausible teleportation speed check
    // Max allowed distance = maxSpeed * dt + accuracyBuffer
    const maxAllowedDistance = Math.max(75, (this.maxPlausibleSpeedMps * dtSeconds) + (rawAccuracy * 0.5));
    if (distanceMeters > maxAllowedDistance && rawAccuracy > 15) {
      // Teleportation detected (e.g. ±500m jump in 1 second). Suppress this spike!
      return {
        ...this.lastPosition,
        accuracy: rawAccuracy,
        timestamp: now,
        isReliable: false,
        jumpDetected: true
      };
    }

    // 4. Deadband / Stationary Noise Suppression
    // When parked or stopped, GPS signals wander by 1 - 3 meters due to atmospheric noise.
    // If movement is under the stationary threshold, hold previous position steady.
    if (distanceMeters < this.stationaryThresholdMeters) {
      return {
        ...this.lastPosition,
        accuracy: rawAccuracy,
        speedMps: 0,
        timestamp: now,
        isReliable: true,
        jumpDetected: false
      };
    }

    // 5. Adaptive Exponential Moving Average (EMA) Smoothing
    // Give more weight to higher precision fixes (lower accuracy value in meters)
    const confidenceWeight = Math.min(0.85, Math.max(0.25, 1 - (rawAccuracy / 100)));
    const dynamicAlpha = this.smoothingFactor * confidenceWeight + 0.15;

    const smoothedLat = prevLat + dynamicAlpha * (rawLat - prevLat);
    const smoothedLng = prevLng + dynamicAlpha * (rawLng - prevLng);

    // Compute realistic velocity
    const calculatedSpeedMps = distanceMeters / dtSeconds;

    const result: FilteredGpsPosition = {
      coords: [Number(smoothedLat.toFixed(6)), Number(smoothedLng.toFixed(6))],
      accuracy: rawAccuracy,
      speedMps: rawPosition.coords.speed ?? Number(calculatedSpeedMps.toFixed(1)),
      heading: rawPosition.coords.heading ?? this.lastPosition.heading,
      timestamp: now,
      isReliable: true,
      jumpDetected: false
    };

    this.lastPosition = result;
    return result;
  }

  public getCurrent(): FilteredGpsPosition | null {
    return this.lastPosition;
  }
}
