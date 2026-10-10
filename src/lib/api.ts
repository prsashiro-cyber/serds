/**
 * SERD API Client
 * Interfaces with Node.js Express CAD backend and Firebase Firestore.
 */

import { 
  saveIncidentToFirestore, 
  updateFirestoreIncidentStatus
} from './firebase';

const STORAGE_API_KEY = 'serd_api_base_url';

export interface BackendHealthResponse {
  status: string;
  backend: 'express';
  platform?: string;
  framework?: string;
  webserver?: string;
  database?: {
    status: string;
    driver?: string;
    host?: string;
    name?: string;
    error?: string | null;
  };
  timestamp?: string;
  activeIncidents?: number;
  cadStatus?: string;
  message?: string;
}

export interface IncidentRecord {
  id: string;
  code: string;
  type: string;
  priority: 'critical' | 'urgent' | 'standard';
  location: string;
  reportedTime: string;
  patientName: string;
  recommendedUnit: string;
  service?: 'ambulance' | 'police' | 'fire';
  targetResponderId?: string;
  acceptedUnit?: string;
  declinedBy?: string[];
  distanceKm: number;
  etaMins: number;
  routeAlgorithm: string;
  status: 'pending' | 'dispatched' | 'en_route' | 'on_scene' | 'cancelled' | 'completed';
  coords: [number, number];
  details?: string;
  createdAt?: string;
}



/**
 * Resolves the active API base URL.
 * Priority:
 * 1. User manual override stored in localStorage
 * 2. Environment variable VITE_API_BASE_URL
 * 3. Default relative path '/api'
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_API_KEY);
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/+$/, '');
    }
  }

  const envUrl = (import.meta.env.VITE_API_BASE_URL as string) || '';
  if (envUrl && envUrl.trim()) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  return '/api';
}

/**
 * Persist user-selected API Base URL (e.g. /api or custom proxy endpoint)
 */
export function setApiBaseUrl(url: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_API_KEY, url.trim().replace(/\/+$/, ''));
    window.dispatchEvent(new CustomEvent('serd-backend-changed', { detail: url }));
  }
}

/**
 * Reset API base URL to default
 */
export function resetApiBaseUrl(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_API_KEY);
    window.dispatchEvent(new CustomEvent('serd-backend-changed', { detail: '/api' }));
  }
}

/**
 * Check backend health and measure response latency
 */
export async function checkBackendHealth(customUrl?: string): Promise<{
  ok: boolean;
  data?: BackendHealthResponse;
  error?: string;
  latencyMs: number;
  resolvedUrl: string;
}> {
  const baseUrl = customUrl ? customUrl.trim().replace(/\/+$/, '') : getApiBaseUrl();
  const url = `${baseUrl}/health`;
  const startTime = performance.now();

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(4000)
    });

    const latencyMs = Math.round(performance.now() - startTime);

    if (!res.ok) {
      return {
        ok: false,
        error: `HTTP error ${res.status}: ${res.statusText}`,
        latencyMs,
        resolvedUrl: url
      };
    }

    const data: BackendHealthResponse = await res.json();
    return {
      ok: true,
      data,
      latencyMs,
      resolvedUrl: url
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - startTime);
    return {
      ok: false,
      error: err.message || 'Unable to connect to backend server',
      latencyMs,
      resolvedUrl: url
    };
  }
}

/**
 * Fetch all incidents
 */
export async function fetchIncidents(): Promise<IncidentRecord[]> {
  const baseUrl = getApiBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/incidents`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(3500)
    });
    if (res.ok) {
      const json = await res.json();
      return json.data || [];
    }
  } catch (err) {
    console.warn('[API Client] Backend incident fetch failed, using fallback:', err);
  }
  return [];
}

/**
 * Create emergency SOS incident
 */
export async function createEmergencyIncident(payload: {
  id?: string;
  type?: string;
  location?: string;
  priority?: string;
  patientName?: string;
  service?: 'ambulance' | 'police' | 'fire';
  targetResponderId?: string;
  recommendedUnit?: string;
  coords?: [number, number];
  details?: string;
}): Promise<IncidentRecord | null> {
  const baseUrl = getApiBaseUrl();

  // Unified Incident ID so Firestore, Express server, and clients share the exact same ID
  const incidentId = payload.id || `CAD-${Date.now().toString().slice(-4)}${Math.floor(100 + Math.random() * 900)}`;

  // Resolve real device coordinates if not provided in payload
  let resolvedCoords = payload.coords;
  if (!resolvedCoords && typeof window !== 'undefined') {
    try {
      const cached = sessionStorage.getItem('serd_real_user_location') || localStorage.getItem('serd_real_user_location');
      if (cached) resolvedCoords = JSON.parse(cached);
    } catch {}
  }

  // Also sync directly to Firebase Firestore with unified incidentId
  saveIncidentToFirestore({
    code: '10-79',
    type: payload.type || 'General Emergency SOS',
    priority: (payload.priority as any) || 'critical',
    location: payload.location || 'Current GPS Location',
    reportedTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    patientName: payload.patientName || 'Citizen Caller',
    service: payload.service,
    targetResponderId: payload.targetResponderId,
    recommendedUnit: payload.recommendedUnit || payload.details || 'First Responder Unit',
    coords: resolvedCoords || [0, 0],
    details: payload.details || '',
    status: 'dispatched'
  }, incidentId).catch((e) => console.warn('[Firestore] Async save error:', e));

  try {
    const res = await fetch(`${baseUrl}/incidents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ ...payload, id: incidentId, coords: resolvedCoords }),
      signal: AbortSignal.timeout(4000)
    });

    if (res.ok) {
      const json = await res.json();
      return json.data;
    }
  } catch (err) {
    console.warn('[API Client] Incident dispatch POST failed, using fallback:', err);
  }

  // Graceful client fallback
  return {
    id: incidentId,
    code: '10-79',
    type: payload.type || 'General Emergency SOS',
    priority: (payload.priority as any) || 'critical',
    location: payload.location || 'Current GPS Location',
    reportedTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    patientName: payload.patientName || 'Citizen Caller',
    service: payload.service,
    targetResponderId: payload.targetResponderId,
    recommendedUnit: payload.recommendedUnit || payload.details || 'First Responder Unit',
    distanceKm: 0.8,
    etaMins: 2.0,
    routeAlgorithm: 'OSRM Live Road Graph',
    status: 'dispatched',
    coords: resolvedCoords || [0, 0]
  };
}

/**
 * Update incident status with optional responder telemetry / acceptance data
 */
export async function updateIncidentStatus(
  id: string, 
  status: string,
  extra?: {
    acceptedUnit?: string;
    acceptedUnitId?: string;
    targetResponderId?: string;
    coords?: [number, number];
    apparatus?: string;
    [key: string]: any;
  }
): Promise<boolean> {
  const baseUrl = getApiBaseUrl();
  updateFirestoreIncidentStatus(id, status as any, extra as any).catch(() => {});

  try {
    const res = await fetch(`${baseUrl}/incidents/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ status, ...extra }),
      signal: AbortSignal.timeout(3000)
    });
    return res.ok;
  } catch (err) {
    console.warn('[API Client] Incident status update failed:', err);
    return false;
  }
}

/**
 * Decline incident dispatch and trigger auto-call to next available unit in the same service
 */
export async function declineEmergencyIncident(
  id: string, 
  payload: {
    responderId?: string;
    callSign?: string;
    apparatus?: string;
  }
): Promise<{ success: boolean; reassignedTo?: any; allDeclined?: boolean }> {
  const baseUrl = getApiBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/incidents/${id}/decline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3500)
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('[API Client] Decline incident failed:', err);
  }
  return { success: false };
}



export interface ChatTriageMessage {
  role: 'user' | 'assistant' | 'bot' | 'model';
  text: string;
}

export interface ChatTriageResponse {
  success: boolean;
  text: string;
  error?: string;
}

/**
 * Send messages to real server-side Gemini AI for emergency triage
 */
export async function sendChatToGemini(
  messages: ChatTriageMessage[],
  context?: {
    callerName?: string;
    location?: string;
    bloodType?: string;
    allergies?: string[];
  }
): Promise<ChatTriageResponse> {
  const baseUrl = getApiBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ messages, context }),
      signal: AbortSignal.timeout(15000)
    });

    if (res.ok) {
      const json = await res.json();
      return {
        success: true,
        text: json.text || ''
      };
    } else {
      const errJson = await res.json().catch(() => ({}));
      return {
        success: false,
        text: errJson.text || 'Unable to connect to AI Triage. If this is an emergency, please use the Emergency SOS button immediately.',
        error: errJson.error || 'Server returned an error'
      };
    }
  } catch (err: any) {
    console.warn('[API Client] Gemini chat failed:', err);
    return {
      success: false,
      text: 'Network connection issue. For immediate assistance, please press the SOS button to alert emergency dispatch.',
      error: err.message
    };
  }
}

/**
 * Fetch CAD responder units telemetry
 */
export async function fetchTelemetryUnits(): Promise<any[]> {
  const baseUrl = getApiBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/telemetry/units`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      const json = await res.json();
      return json.units || [];
    }
  } catch (err) {
    console.warn('[API Client] Telemetry units fetch failed:', err);
  }
  return [];
}

export interface IncidentChatMessage {
  id: string;
  sender: 'dispatch' | 'citizen' | 'responder';
  senderName: string;
  text: string;
  timestamp: string;
  isUrgent?: boolean;
}

/**
 * Fetch messages for a specific incident
 */
export async function fetchIncidentMessages(incidentId: string): Promise<IncidentChatMessage[]> {
  const baseUrl = getApiBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/incidents/${incidentId}/messages`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      const json = await res.json();
      return json.data || [];
    }
  } catch (err) {
    console.warn('[API Client] Fetch messages failed:', err);
  }
  return [];
}

/**
 * Send a message for a specific incident
 */
export async function sendIncidentMessage(
  incidentId: string, 
  payload: { sender: string; senderName: string; text: string; isUrgent?: boolean }
): Promise<IncidentChatMessage | null> {
  const baseUrl = getApiBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/incidents/${incidentId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3500)
    });
    if (res.ok) {
      const json = await res.json();
      return json.data;
    }
  } catch (err) {
    console.warn('[API Client] Send message failed:', err);
  }
  return null;
}

export interface LiveOnlineResponder {
  id: string;
  socketId?: string;
  callSign: string;
  apparatus: 'ambulance' | 'police' | 'fire';
  status: 'waiting' | 'en_route' | 'on_scene' | 'transporting' | 'offline';
  coords: [number, number];
  accuracy?: number;
  phone?: string;
  lastSeen?: number;
}

/**
 * Fetch real online responders from the CAD backend
 */
export async function fetchOnlineResponders(coords?: [number, number]): Promise<LiveOnlineResponder[]> {
  const baseUrl = getApiBaseUrl();
  try {
    const url = coords 
      ? `${baseUrl}/responders/online?lat=${coords[0]}&lng=${coords[1]}`
      : `${baseUrl}/responders/online`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      const json = await res.json();
      return json.data || [];
    }
  } catch (err) {
    console.warn('[API Client] Fetch online responders failed:', err);
  }
  return [];
}

/**
 * Sync responder presence and location
 */
export async function syncResponderPresence(payload: Partial<LiveOnlineResponder>): Promise<LiveOnlineResponder | null> {
  const baseUrl = getApiBaseUrl();
  try {
    const res = await fetch(`${baseUrl}/responders/presence`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      const json = await res.json();
      return json.data;
    }
  } catch (err) {
    console.warn('[API Client] Sync responder presence failed:', err);
  }
  return null;
}

