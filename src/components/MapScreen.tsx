import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  User, 
  PhoneOff, 
  MessageSquare, 
  Shield, 
  Ambulance, 
  Flame, 
  Lock,
  LocateFixed,
  X,
  Send,
  Navigation,
  AlertCircle
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { io } from 'socket.io-client';
import { 
  calculateRealRoute, 
  formatDistance, 
  formatEta, 
  calculateDistance, 
  RouteResult 
} from '../lib/routing';
import { 
  createEmergencyIncident, 
  fetchOnlineResponders, 
  LiveOnlineResponder,
  sendIncidentMessage,
  fetchIncidentMessages,
  IncidentChatMessage,
  updateIncidentStatus,
  declineEmergencyIncident
} from '../lib/api';
import { useUserSettings } from '../lib/userSettings';
import { useAuth } from '../contexts/AuthContext';

export type EmergencyServiceType = 'police' | 'ambulance' | 'fire';

interface MapScreenProps {
  autoDispatch?: boolean;
  initialIncidentId?: string | null;
  onBack?: () => void;
  onCancelDispatch?: () => void;
}

// Citizen Marker on Map
export const createCitizenIcon = (zoom: number) => {
  if (zoom <= 13) {
    return L.divIcon({
      html: `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; transform: translate(-50%, -50%); user-select: none;">
          <span class="animate-ping" style="position: absolute; width: 24px; height: 24px; border-radius: 9999px; background-color: #B41A46; opacity: 0.35;"></span>
          <div style="width: 14px; height: 14px; background-color: #B41A46; border-radius: 9999px; border: 2.5px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>
        </div>
      `,
      className: '',
      iconSize: [26, 26],
      iconAnchor: [0, 0]
    });
  }

  return L.divIcon({
    html: `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: flex-end; transform: translate(-50%, -100%); user-select: none; pointer-events: none;">
        <div style="background-color: #B41A46; color: white; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 800; white-space: nowrap; margin-bottom: 2px; display: flex; align-items: center; gap: 4px; border: 1.5px solid white; box-shadow: 0 2px 8px rgba(180,26,70,0.4);">
          <span style="width: 6px; height: 6px; border-radius: 9999px; background-color: white;" class="animate-pulse"></span>
          <span>Your Location</span>
        </div>
        <div style="position: relative; display: flex; items-center; justify-content: center;">
          <span class="animate-ping" style="position: absolute; width: 22px; height: 22px; border-radius: 9999px; background-color: #B41A46; opacity: 0.35;"></span>
          <div style="width: 14px; height: 14px; background-color: #B41A46; border-radius: 9999px; border: 2.5px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>
        </div>
      </div>
    `,
    className: '',
    iconSize: [110, 50],
    iconAnchor: [0, 0]
  });
};

// Dynamic Live Responder Marker on Map
export const createResponderMarkerIcon = (
  responder: LiveOnlineResponder, 
  isSelected: boolean,
  zoom: number
) => {
  const isPolice = responder.apparatus === 'police';
  const isFire = responder.apparatus === 'fire';
  const emoji = isPolice ? '🚓' : isFire ? '🚒' : '🚑';
  const themeColor = isPolice ? '#2563eb' : isFire ? '#d97706' : '#B41A46';

  if (zoom <= 13) {
    return L.divIcon({
      html: `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; transform: translate(-50%, -50%); user-select: none;">
          ${isSelected ? `<span class="animate-ping" style="position: absolute; width: 26px; height: 26px; border-radius: 9999px; background-color: ${themeColor}; opacity: 0.35;"></span>` : ''}
          <div style="width: 14px; height: 14px; border-radius: 9999px; border: 2px solid white; background-color: ${themeColor}; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>
        </div>
      `,
      className: '',
      iconSize: [24, 24],
      iconAnchor: [0, 0]
    });
  }

  return L.divIcon({
    html: `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: flex-end; transform: translate(-50%, -100%); user-select: none;">
        <div style="background-color: ${isSelected ? '#0a0a0a' : '#ffffff'}; color: ${isSelected ? '#ffffff' : '#171717'}; padding: 2px 7px; border-radius: 8px; font-size: 10px; font-weight: 800; white-space: nowrap; margin-bottom: 3px; display: flex; align-items: center; gap: 4px; border: 1.5px solid ${isSelected ? themeColor : '#e5e5e5'}; box-shadow: 0 4px 12px rgba(0,0,0,0.18);">
          <span style="font-size: 11px;">${emoji}</span>
          <span>${responder.callSign}</span>
        </div>
        <div style="position: relative; display: flex; align-items: center; justify-content: center;">
          ${isSelected ? `<span class="animate-ping" style="position: absolute; width: 22px; height: 22px; border-radius: 9999px; background-color: ${themeColor}; opacity: 0.4;"></span>` : ''}
          <div style="width: 14px; height: 14px; border-radius: 9999px; border: 2.5px solid white; background-color: ${themeColor}; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>
        </div>
      </div>
    `,
    className: '',
    iconSize: [140, 52],
    iconAnchor: [0, 0]
  });
};

// Play audio alert tone
function playChime(freq1 = 587.33, freq2 = 880) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq1, ctx.currentTime);
    osc.frequency.setValueAtTime(freq2, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.38);
  } catch {}
}

function MapAutoCenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.panTo(center, { animate: true, duration: 0.8 });
  }, [center, map]);
  return null;
}

export default function MapScreen({ autoDispatch, initialIncidentId, onBack, onCancelDispatch }: MapScreenProps) {
  const { currentUser, userProfile } = useAuth();
  const { settings, updateLocation } = useUserSettings();
  const { location, profile } = settings;

  const hasAutoDispatchedRef = useRef<boolean>(false);
  const isCancelledRef = useRef<boolean>(false);

  // Real Citizen Device Location
  const [citizenLocation, setCitizenLocation] = useState<[number, number] | null>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = sessionStorage.getItem('serd_real_user_location') || localStorage.getItem('serd_real_user_location');
        if (cached) return JSON.parse(cached);
      } catch {}
    }
    if (location?.lastKnownCoords?.lat && location?.lastKnownCoords?.lng) {
      return [location.lastKnownCoords.lat, location.lastKnownCoords.lng];
    }
    return null;
  });

  const [userStreetAddress, setUserStreetAddress] = useState<string>(location?.lastKnownAddress || '');
  const [mapZoom, setMapZoom] = useState(15);
  const [isLocating, setIsLocating] = useState(false);

  // Real Online Responders Synced from Backend / Responder Mobile UI
  const [onlineResponders, setOnlineResponders] = useState<LiveOnlineResponder[]>([]);

  // Selected Service Filter: Ambulance, Police, Fire
  const [selectedService, setSelectedService] = useState<EmergencyServiceType>('ambulance');

  // Active Dispatch State
  const [isDispatched, setIsDispatched] = useState<boolean>(Boolean(initialIncidentId));
  const [dispatchedResponder, setDispatchedResponder] = useState<LiveOnlineResponder | null>(null);
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(initialIncidentId || null);
  const [incidentStatus, setIncidentStatus] = useState<string>('dispatched');

  // Two-way messaging with responder
  const [selectedResponder, setSelectedResponder] = useState<LiveOnlineResponder | null>(null);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const [messages, setMessages] = useState<IncidentChatMessage[]>([]);
  const [unreadMsgCount, setUnreadMsgCount] = useState<number>(0);
  const [incomingMsgToast, setIncomingMsgToast] = useState<IncidentChatMessage | null>(null);
  const [dispatchStatusToast, setDispatchStatusToast] = useState<{
    type: 'accepted' | 'reassigned' | 'alert';
    message: string;
    subtext?: string;
  } | null>(null);

  // Route calculation
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routePoints, setRoutePoints] = useState<[number, number][]>([]);

  const [showMessageModal, setShowMessageModal] = useState(false);
  const [chatMessage, setChatMessage] = useState('');
  const [messageSentToast, setMessageSentToast] = useState(false);

  // User's real name from Auth or Profile
  const citizenName = useMemo(() => {
    return userProfile?.fullName || currentUser?.displayName || (profile?.fullName ? profile.fullName : 'Citizen Caller');
  }, [userProfile, currentUser, profile]);

  // 1. Acquire Real GPS & Reverse Geocode
  const requestLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setCitizenLocation(coords);
        setIsLocating(false);

        try {
          sessionStorage.setItem('serd_real_user_location', JSON.stringify(coords));
          localStorage.setItem('serd_real_user_location', JSON.stringify(coords));
        } catch {}

        // Fetch responders situated relative to this user's real GPS
        fetchOnlineResponders(coords).then(list => {
          if (list && list.length > 0) setOnlineResponders(list);
        });

        // Real reverse geocoding via OpenStreetMap Nominatim
        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${coords[0]}&lon=${coords[1]}&format=json`)
          .then(res => res.json())
          .then(data => {
            if (data?.display_name) {
              const parts = data.display_name.split(', ');
              const concise = parts.slice(0, 3).join(', ');
              setUserStreetAddress(concise);
              updateLocation({
                lastKnownCoords: { lat: coords[0], lng: coords[1] },
                lastKnownAddress: concise
              });
            }
          })
          .catch(() => {
            const fallbackAddr = `Lat ${coords[0].toFixed(4)}, Lng ${coords[1].toFixed(4)}`;
            setUserStreetAddress(fallbackAddr);
            updateLocation({
              lastKnownCoords: { lat: coords[0], lng: coords[1] },
              lastKnownAddress: fallbackAddr
            });
          });
      },
      () => {
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    requestLocation();
  }, []);

  // 2. Fetch and Subscribe to Real Online Responders
  useEffect(() => {
    let isSubscribed = true;

    const mergeWithLocal = (incoming: LiveOnlineResponder[]) => {
      const combined = [...incoming];
      try {
        const localCached = localStorage.getItem('serd_latest_online_responder');
        if (localCached) {
          const parsed = JSON.parse(localCached);
          if (parsed && parsed.id && parsed.status !== 'offline') {
            const age = Date.now() - (parsed.timestamp || 0);
            if (age < 600000) { // 10 minutes valid
              const existingIdx = combined.findIndex(r => r.id === parsed.id);
              if (existingIdx >= 0) {
                // Keep freshest data
                combined[existingIdx] = { ...combined[existingIdx], ...parsed };
              } else {
                combined.push(parsed);
              }
            }
          }
        }
      } catch {}
      return combined;
    };

    const fetchFleet = () => {
      fetchOnlineResponders(citizenLocation || undefined).then(list => {
        if (isSubscribed && list) {
          setOnlineResponders(mergeWithLocal(list));
        }
      });
    };

    fetchFleet();
    const interval = setInterval(fetchFleet, 3000);

    const handleFocusOrVisibility = () => {
      if (document.visibilityState === 'visible') {
        fetchFleet();
      }
    };

    document.addEventListener('visibilitychange', handleFocusOrVisibility);
    window.addEventListener('focus', handleFocusOrVisibility);

    const socket = io();
    socket.on('responders-sync', (fleet: LiveOnlineResponder[]) => {
      if (isSubscribed && fleet) {
        setOnlineResponders(mergeWithLocal(fleet));
      }
    });

    return () => {
      isSubscribed = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
      window.removeEventListener('focus', handleFocusOrVisibility);
      socket.disconnect();
    };
  }, [citizenLocation]);

  // Auto-switch service if currently selected service has 0 units but another has online units
  useEffect(() => {
    if (isDispatched) return;
    if (onlineResponders.length > 0) {
      const currentHasAny = onlineResponders.some(r => r.apparatus === selectedService && r.status !== 'offline');
      if (!currentHasAny) {
        const firstActive = onlineResponders.find(r => r.status !== 'offline');
        if (firstActive) {
          setSelectedService(firstActive.apparatus);
        }
      }
    }
  }, [onlineResponders, selectedService, isDispatched]);

  // Active target responder: ONLY defined when citizen or dispatch has chosen a specific unit
  const activeTargetResponder = useMemo<LiveOnlineResponder | null>(() => {
    if (dispatchedResponder) return dispatchedResponder;
    if (selectedResponder) return selectedResponder;
    return null;
  }, [dispatchedResponder, selectedResponder]);

  // Find active online responder matching selected service (null if none online)
  const nearestMatchingResponder = useMemo<LiveOnlineResponder | null>(() => {
    const matching = onlineResponders.filter(r => r.apparatus === selectedService && r.status !== 'offline');
    if (matching.length > 0) {
      if (!citizenLocation) return matching[0];
      return matching.reduce((prev, curr) => {
        const dPrev = calculateDistance(citizenLocation[0], citizenLocation[1], prev.coords[0], prev.coords[1]);
        const dCurr = calculateDistance(citizenLocation[0], citizenLocation[1], curr.coords[0], curr.coords[1]);
        return dCurr < dPrev ? curr : prev;
      });
    }
    return null;
  }, [onlineResponders, selectedService, citizenLocation]);

  const currentResponder = activeTargetResponder || nearestMatchingResponder;

  // Calculate live road route whenever responder or citizen coords update during dispatch
  useEffect(() => {
    if (!citizenLocation || !isDispatched) return;
    const activeResp = dispatchedResponder || currentResponder;
    if (activeResp?.coords) {
      calculateRealRoute(activeResp.coords, citizenLocation)
        .then(res => {
          setRouteResult(res);
          setRoutePoints(res.coordinates);
        })
        .catch(() => {});
    } else {
      setRouteResult(null);
      setRoutePoints([]);
    }
  }, [citizenLocation, isDispatched, dispatchedResponder, currentResponder]);

  // Trigger dispatch to real CAD backend
  const triggerDispatch = async (respToUse?: LiveOnlineResponder | null) => {
    if (!citizenLocation) return null;
    const target = respToUse !== undefined ? respToUse : (activeTargetResponder || currentResponder);
    setDispatchedResponder(target);
    if (target) setSelectedResponder(target);
    setIsDispatched(true);
    playChime(659.25, 880);

    const targetDetails = target 
      ? `Dispatched: ${target.callSign} (${target.apparatus})` 
      : `Dispatched to Central CAD Command (${selectedService.toUpperCase()})`;

    const created = await createEmergencyIncident({
      type: `Emergency Dispatch - ${selectedService.toUpperCase()}`,
      location: userStreetAddress || `Coordinates [${citizenLocation[0].toFixed(4)}, ${citizenLocation[1].toFixed(4)}]`,
      patientName: citizenName,
      priority: 'critical',
      service: selectedService,
      targetResponderId: target?.id,
      recommendedUnit: target?.callSign,
      coords: citizenLocation,
      details: targetDetails
    });

    if (created?.id) {
      setActiveIncidentId(created.id);
    }

    if (target?.coords) {
      calculateRealRoute(target.coords, citizenLocation)
        .then(res => {
          setRouteResult(res);
          setRoutePoints(res.coordinates);
        })
        .catch(() => {});
    }

    return created;
  };

  // Auto-dispatch if requested from Home hold countdown and not already active
  useEffect(() => {
    if (autoDispatch && !hasAutoDispatchedRef.current && !isCancelledRef.current && !isDispatched && !activeIncidentId && citizenLocation) {
      hasAutoDispatchedRef.current = true;
      triggerDispatch();
    }
  }, [autoDispatch, isDispatched, activeIncidentId, citizenLocation]);

  // Synchronize initialIncidentId if passed dynamically
  useEffect(() => {
    if (initialIncidentId && !isCancelledRef.current) {
      setActiveIncidentId(initialIncidentId);
      setIsDispatched(true);
    }
  }, [initialIncidentId]);

  // Real-time synchronization of incident status & messages with responder mobile
  useEffect(() => {
    if (!activeIncidentId) return;

    fetchIncidentMessages(activeIncidentId).then(list => {
      if (list && list.length > 0) setMessages(list);
    });

    const socket = io();

    // Unit accepted dispatch
    socket.on('incident-accepted', (data: { incidentId: string; status: string; responder: any }) => {
      if (data && data.incidentId === activeIncidentId) {
        setIncidentStatus('en_route');
        playChime(784, 1046.5);
        if (data.responder) {
          setDispatchedResponder(data.responder);
          setSelectedResponder(data.responder);
          if (data.responder.coords && citizenLocation) {
            calculateRealRoute(data.responder.coords, citizenLocation)
              .then(res => {
                setRouteResult(res);
                setRoutePoints(res.coordinates);
              })
              .catch(() => {});
          }
        }
        setDispatchStatusToast({
          type: 'accepted',
          message: `Unit ${data.responder?.callSign || 'Assigned Unit'} Accepted!`,
          subtext: 'The emergency unit has responded to your call and is en route to your location.'
        });
        setTimeout(() => setDispatchStatusToast(null), 7000);
      }
    });

    // Auto-reassigned to another unit in the same service when previous unit declined
    socket.on('incident-reassigned', (data: { incidentId: string; previousUnit: string; nextUnit: any; service: string }) => {
      if (data && data.incidentId === activeIncidentId) {
        playChime(587.33, 440);
        if (data.nextUnit) {
          setDispatchedResponder(data.nextUnit);
          setSelectedResponder(data.nextUnit);
          if (data.nextUnit.coords && citizenLocation) {
            calculateRealRoute(data.nextUnit.coords, citizenLocation)
              .then(res => {
                setRouteResult(res);
                setRoutePoints(res.coordinates);
              })
              .catch(() => {});
          }
        }
        setDispatchStatusToast({
          type: 'reassigned',
          message: `Unit ${data.previousUnit} Unavailable`,
          subtext: `Auto-calling next available ${data.service?.toUpperCase() || ''} unit: ${data.nextUnit?.callSign}...`
        });
        setTimeout(() => setDispatchStatusToast(null), 7000);
      }
    });

    // All units in service declined / occupied
    socket.on('incident-declined-all', (data: { incidentId: string; service: string }) => {
      if (data && data.incidentId === activeIncidentId) {
        playChime(440, 330);
        setDispatchStatusToast({
          type: 'alert',
          message: `All Local ${data.service?.toUpperCase() || 'Emergency'} Units Engaged`,
          subtext: 'CAD Command is holding high-priority queue and alerting mutual aid response.'
        });
        setTimeout(() => setDispatchStatusToast(null), 8000);
      }
    });

    // Responder status update (dispatched, en_route, on_scene, transporting, completed, cancelled)
    socket.on('incident-updated', (updated: any) => {
      if (updated && updated.id === activeIncidentId) {
        setIncidentStatus(updated.status);
        playChime(659.25, 880);
        if (updated.status === 'cancelled' || updated.status === 'completed') {
          setIsDispatched(false);
          setActiveIncidentId(null);
          setDispatchedResponder(null);
          setRouteResult(null);
          setRoutePoints([]);
        }
      }
    });

    // Two-way radio messages
    socket.on('incident-message', (data: { incidentId: string; message: IncidentChatMessage }) => {
      if (data && data.incidentId === activeIncidentId) {
        setMessages(prev => {
          if (prev.some(m => m.id === data.message.id)) return prev;
          return [...prev, data.message];
        });
        if (data.message.sender !== 'citizen') {
          playChime(880, 1174.66);
          setIncomingMsgToast(data.message);
          setUnreadMsgCount(c => c + 1);
          setTimeout(() => setIncomingMsgToast(null), 6000);
        }
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [activeIncidentId, citizenLocation]);

  const handleCancelDispatch = async () => {
    isCancelledRef.current = true;
    hasAutoDispatchedRef.current = true;
    const incId = activeIncidentId;
    setIsDispatched(false);
    setActiveIncidentId(null);
    setDispatchedResponder(null);
    setRouteResult(null);
    setRoutePoints([]);
    playChime(440, 330);
    if (onCancelDispatch) {
      onCancelDispatch();
    }
    if (incId) {
      await updateIncidentStatus(incId, 'cancelled');
    }
  };

  const handleSendCommsMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const textToSend = chatMessage.trim();
    if (!textToSend) return;

    if (!activeTargetResponder) {
      setSelectionNotice('Please select an active responder unit first to start messaging.');
      setShowMessageModal(false);
      return;
    }

    let targetIncId = activeIncidentId;
    if (!targetIncId) {
      const created = await triggerDispatch(activeTargetResponder);
      if (created?.id) targetIncId = created.id;
    }

    if (targetIncId) {
      const optimisticMsg: IncidentChatMessage = {
        id: 'msg-' + Date.now(),
        sender: 'citizen',
        senderName: citizenName,
        text: textToSend,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, optimisticMsg]);
      setChatMessage('');
      setMessageSentToast(true);
      setTimeout(() => setMessageSentToast(false), 2000);

      await sendIncidentMessage(targetIncId, {
        sender: 'citizen',
        senderName: citizenName,
        text: textToSend
      });
    }
  };

  // Estimated distance & ETA
  const estDistanceMeters = (citizenLocation && currentResponder?.coords) ? calculateDistance(
    citizenLocation[0],
    citizenLocation[1],
    currentResponder.coords[0],
    currentResponder.coords[1]
  ) : 0;

  const estDurationSeconds = Math.max(60, Math.round(estDistanceMeters / 12.5));

  return (
    <div className="relative w-full h-[100dvh] bg-[#0F172A] font-sans overflow-hidden select-none">
      
      {/* Fullscreen Map Canvas */}
      <div className="absolute inset-0 z-0">
        {citizenLocation ? (
          <MapContainer
            center={citizenLocation}
            zoom={mapZoom}
            zoomControl={false}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapAutoCenter center={citizenLocation} />

            {/* Real Citizen GPS Marker */}
            <Marker position={citizenLocation} icon={createCitizenIcon(mapZoom)} zIndexOffset={900} />

            {/* Real Online Responders on Map */}
            {onlineResponders.map(resp => {
              const isSelected = activeTargetResponder?.id === resp.id;

              // Ensure coordinates are valid LatLng and not Null Island [0,0]
              const hasRealCoords = Array.isArray(resp.coords) && 
                resp.coords.length === 2 && 
                !isNaN(resp.coords[0]) && 
                !isNaN(resp.coords[1]) && 
                !(resp.coords[0] === 0 && resp.coords[1] === 0);

              const displayCoords: [number, number] = hasRealCoords 
                ? resp.coords 
                : (citizenLocation ? [citizenLocation[0] + 0.005, citizenLocation[1] + 0.005] : [14.5995, 120.9842]);

              return (
                <Marker
                  key={resp.id}
                  position={displayCoords}
                  icon={createResponderMarkerIcon(resp, isSelected, mapZoom)}
                  zIndexOffset={isSelected ? 1000 : 800}
                  eventHandlers={{
                    click: () => {
                      setSelectedResponder({ ...resp, coords: displayCoords });
                      setSelectedService(resp.apparatus);
                      setSelectionNotice(null);
                    }
                  }}
                />
              );
            })}

            {/* Real Road Route Polyline */}
            {isDispatched && routePoints.length > 0 && (
              <Polyline 
                positions={routePoints} 
                color="#B41A46" 
                weight={6} 
                opacity={0.9}
                lineCap="round"
                lineJoin="round"
              />
            )}
          </MapContainer>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-white text-center">
            <LocateFixed className="w-12 h-12 text-[#B41A46] animate-pulse mb-3" />
            <h3 className="font-bold text-base">Locking GPS Coordinates...</h3>
            <p className="text-xs text-neutral-400 mt-1 max-w-xs">
              Connecting directly to your mobile device satellite receiver
            </p>
            <button
              onClick={requestLocation}
              className="mt-4 px-4 py-2 bg-[#B41A46] text-white text-xs font-bold rounded-xl shadow-md cursor-pointer"
            >
              Grant GPS Lock
            </button>
          </div>
        )}
      </div>

      {/* Top Floating Action Bar */}
      <div className="absolute top-3 sm:top-4 left-3 sm:left-4 right-3 sm:right-4 z-20 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          {onBack && (
            <button
              onClick={onBack}
              className="w-10 h-10 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md rounded-2xl shadow-lg border border-neutral-200/80 dark:border-neutral-800 flex items-center justify-center text-neutral-800 dark:text-white cursor-pointer active:scale-95 transition-all"
              title="Back"
            >
              ✕
            </button>
          )}

          <div className="bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md rounded-2xl px-3 py-2 shadow-lg border border-neutral-200/80 dark:border-neutral-800 flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${onlineResponders.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-400'}`} />
            <span className="text-xs font-bold text-neutral-800 dark:text-white">
              {onlineResponders.length > 0 ? `${onlineResponders.length} Responders Live` : 'No Responders Online'}
            </span>
          </div>
        </div>

        <button
          onClick={requestLocation}
          className="pointer-events-auto w-10 h-10 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md rounded-2xl shadow-lg border border-neutral-200/80 dark:border-neutral-800 flex items-center justify-center text-neutral-800 dark:text-white cursor-pointer active:scale-95 transition-all"
          title="Recenter on my GPS"
        >
          <LocateFixed className={`w-5 h-5 ${isLocating ? 'animate-spin text-neutral-400' : 'text-[#B41A46]'}`} />
        </button>
      </div>

      {/* Real-time Dispatch Status Toast / Banner (Accepted, Reassigned, etc.) */}
      {dispatchStatusToast && (
        <div className="absolute top-16 sm:top-20 left-3 sm:left-4 right-3 sm:right-4 z-40 max-w-md mx-auto animate-[fade-in_0.2s_ease-out]">
          <div className={`p-3.5 rounded-2xl shadow-2xl backdrop-blur-md border flex items-start gap-3 ${
            dispatchStatusToast.type === 'accepted'
              ? 'bg-emerald-950/95 border-emerald-500/60 text-white'
              : dispatchStatusToast.type === 'reassigned'
              ? 'bg-amber-950/95 border-amber-500/60 text-white'
              : 'bg-rose-950/95 border-rose-500/60 text-white'
          }`}>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm ${
              dispatchStatusToast.type === 'accepted'
                ? 'bg-emerald-600 text-white'
                : dispatchStatusToast.type === 'reassigned'
                ? 'bg-amber-600 text-white'
                : 'bg-rose-600 text-white'
            }`}>
              {dispatchStatusToast.type === 'accepted' ? '✓' : dispatchStatusToast.type === 'reassigned' ? '↻' : '!'}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs sm:text-sm font-extrabold leading-tight">
                {dispatchStatusToast.message}
              </h4>
              {dispatchStatusToast.subtext && (
                <p className="text-[11px] text-neutral-300 mt-0.5 leading-snug">
                  {dispatchStatusToast.subtext}
                </p>
              )}
            </div>
            <button
              onClick={() => setDispatchStatusToast(null)}
              className="text-neutral-400 hover:text-white p-1 cursor-pointer text-xs"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Floating Bottom Card: Service Selector & Actions */}
      <div className="absolute bottom-3 sm:bottom-4 left-3 sm:left-4 right-3 sm:right-4 max-w-md mx-auto bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-gray-100 dark:border-neutral-800 p-4 z-20 animate-[fade-in_0.2s_ease-out]">
        
        {/* Active Responder Identity */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center space-x-3 min-w-0 flex-1">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 text-xl ${
              selectedService === 'police'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400'
                : selectedService === 'fire'
                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400'
                : 'bg-rose-50 text-[#B41A46] dark:bg-rose-950/50 dark:text-rose-400'
            }`}>
              {selectedService === 'police' ? '🚓' : selectedService === 'fire' ? '🚒' : '🚑'}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white truncate">
                {currentResponder?.callSign || (isDispatched ? 'Central CAD Dispatch' : 'No Unit Online')}
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-neutral-400 truncate">
                {isDispatched 
                  ? 'Dispatched to Central CAD Command' 
                  : currentResponder 
                    ? 'Live Field Unit Online' 
                    : `No ${selectedService} unit currently active`}
              </p>
            </div>
          </div>

          <div className="shrink-0 text-right">
            {isDispatched ? (
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-bold transition-all ${
                incidentStatus === 'on_scene'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400'
                  : incidentStatus === 'transporting'
                  ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
                  : incidentStatus === 'en_route'
                  ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-100 dark:border-rose-900/50 text-[#B41A46] dark:text-rose-400'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                  incidentStatus === 'on_scene' 
                    ? 'bg-emerald-600' 
                    : incidentStatus === 'transporting' 
                    ? 'bg-amber-600' 
                    : incidentStatus === 'en_route' 
                    ? 'bg-blue-600' 
                    : 'bg-[#B41A46]'
                }`} />
                <span>
                  {incidentStatus === 'on_scene' 
                    ? 'ON SCENE' 
                    : incidentStatus === 'transporting' 
                    ? 'TRANSPORTING' 
                    : incidentStatus === 'en_route' 
                    ? (routeResult ? `EN ROUTE • ${formatEta(routeResult.durationSeconds)}` : 'EN ROUTE') 
                    : (routeResult ? `${formatDistance(routeResult.distanceMeters)} • ${formatEta(routeResult.durationSeconds)}` : 'DISPATCHED')}
                </span>
              </div>
            ) : (currentResponder && currentResponder.coords && citizenLocation) ? (
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-gray-100 dark:bg-neutral-800 text-gray-800 dark:text-neutral-200 text-xs font-semibold">
                <span className="font-bold">{formatDistance(estDistanceMeters)}</span>
                <span className="text-gray-300 dark:text-neutral-600">&bull;</span>
                <span className="text-[#B41A46] dark:text-rose-400">{formatEta(estDurationSeconds)}</span>
              </div>
            ) : (
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-neutral-400 text-xs font-semibold">
                <span>Offline</span>
              </div>
            )}
          </div>
        </div>

        {/* Emergency Service Selector */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="font-bold uppercase tracking-wider text-gray-500 dark:text-neutral-400 text-[10px]">
              Select Service
            </span>
            {isDispatched && (
              <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1">
                <Lock className="w-3 h-3" />
                Unit Dispatched
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={isDispatched}
              onClick={() => setSelectedService('police')}
              className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                selectedService === 'police'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-300 hover:bg-gray-200'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Police</span>
            </button>

            <button
              type="button"
              disabled={isDispatched}
              onClick={() => setSelectedService('ambulance')}
              className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                selectedService === 'ambulance'
                  ? 'bg-[#B41A46] text-white shadow-xs'
                  : 'bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-300 hover:bg-gray-200'
              }`}
            >
              <Ambulance className="w-3.5 h-3.5" />
              <span>Ambulance</span>
            </button>

            <button
              type="button"
              disabled={isDispatched}
              onClick={() => setSelectedService('fire')}
              className={`py-2 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                selectedService === 'fire'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-neutral-300 hover:bg-gray-200'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Fire</span>
            </button>
          </div>
        </div>

        {/* Responder Unit Selector - Required for messaging */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="font-bold uppercase tracking-wider text-gray-500 dark:text-neutral-400 text-[10px]">
              Select Responder Unit ({onlineResponders.length})
            </span>
            {activeTargetResponder ? (
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Selected: {activeTargetResponder.callSign}
              </span>
            ) : (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                Tap unit to chat
              </span>
            )}
          </div>

          {onlineResponders.length === 0 ? (
            <div className="p-2.5 bg-gray-50 dark:bg-neutral-800/60 rounded-xl border border-gray-200 dark:border-neutral-700 text-center text-xs text-gray-400">
              No field units currently online. Please standby.
            </div>
          ) : (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {onlineResponders.map(r => {
                const isChosen = activeTargetResponder?.id === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      setSelectedResponder(r);
                      setSelectedService(r.apparatus);
                      setSelectionNotice(null);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
                      isChosen
                        ? 'bg-[#B41A46] text-white border-[#B41A46] shadow-xs'
                        : 'bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 border-gray-200 dark:border-neutral-700 hover:border-[#B41A46]'
                    }`}
                  >
                    <span>{r.apparatus === 'police' ? '🚓' : r.apparatus === 'fire' ? '🚒' : '🚑'}</span>
                    <span className="font-bold truncate max-w-[120px]">{r.callSign}</span>
                    <span className={`w-1.5 h-1.5 rounded-full ${r.status === 'waiting' ? 'bg-emerald-400' : 'bg-blue-400'}`} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Dual Actions: CALL RESPONDER MOBILE & DISPATCH / MESSAGE */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => {
              if (isDispatched) {
                handleCancelDispatch();
              } else {
                triggerDispatch(activeTargetResponder || currentResponder);
              }
            }}
            className={`py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs active:scale-95 ${
              isDispatched
                ? 'bg-neutral-900 text-neutral-300 hover:bg-neutral-800 border border-neutral-700'
                : 'bg-[#B41A46] hover:bg-[#9a143a] text-white'
            }`}
          >
            {isDispatched ? <X className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
            <span>{isDispatched ? 'CANCEL DISPATCH' : 'DISPATCH UNIT'}</span>
          </button>

          <button
            type="button"
            disabled={!activeTargetResponder}
            onClick={async () => {
              if (!activeTargetResponder) {
                setSelectionNotice('Please select an active responder unit on the map or list to start messaging.');
                return;
              }
              setSelectionNotice(null);
              if (!isDispatched || !activeIncidentId) {
                await triggerDispatch(activeTargetResponder);
              }
              setUnreadMsgCount(0);
              setShowMessageModal(true);
            }}
            className={`relative py-3 rounded-xl border font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-xs active:scale-95 ${
              activeTargetResponder
                ? 'bg-white dark:bg-neutral-900 border-[#B41A46] text-[#B41A46] dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer'
                : 'bg-gray-100 dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 text-gray-400 dark:text-neutral-500 cursor-not-allowed opacity-60'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>
              {activeTargetResponder 
                ? `MESSAGE ${activeTargetResponder.callSign.toUpperCase()}`
                : 'SELECT RESPONDER TO CHAT'}
            </span>
            {unreadMsgCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#B41A46] text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-md animate-pulse">
                {unreadMsgCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Selection Notice Toast */}
      {selectionNotice && (
        <div className="absolute top-4 left-4 right-4 z-40 bg-amber-500 text-white rounded-2xl p-3.5 shadow-xl flex items-center justify-between text-xs font-bold animate-[fade-in_0.2s_ease-out]">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{selectionNotice}</span>
          </div>
          <button onClick={() => setSelectionNotice(null)} className="ml-2 font-bold px-1.5 py-0.5 rounded hover:bg-amber-600">✕</button>
        </div>
      )}

      {/* Floating Incoming Message Toast from Responder */}
      {incomingMsgToast && !showMessageModal && (
        <div 
          onClick={() => {
            setUnreadMsgCount(0);
            setShowMessageModal(true);
          }}
          className="absolute top-4 left-4 right-4 z-40 bg-neutral-950 text-white rounded-2xl p-3.5 shadow-2xl border border-rose-500/60 animate-[fade-in_0.2s_ease-out] cursor-pointer flex items-start gap-3"
        >
          <div className="w-8 h-8 rounded-xl bg-rose-600/30 text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/50">
            <MessageSquare className="w-4 h-4 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0 pr-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase font-bold text-rose-400">
                {incomingMsgToast.senderName}
              </span>
              <span className="text-[10px] text-neutral-500 font-mono">
                {incomingMsgToast.timestamp}
              </span>
            </div>
            <p className="text-xs text-neutral-200 mt-0.5 line-clamp-2 font-medium">
              {incomingMsgToast.text}
            </p>
          </div>
        </div>
      )}

      {/* Message Modal with Real Live Chat Thread */}
      {showMessageModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 animate-[fade-in_0.15s_ease-out]">
          <div className="bg-white dark:bg-neutral-900 text-gray-900 dark:text-white rounded-t-3xl sm:rounded-3xl p-5 w-full sm:max-w-md shadow-2xl border-t sm:border border-gray-200 dark:border-neutral-800 space-y-3.5 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-gray-100 dark:border-neutral-800 pb-3 shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-[#B41A46] flex items-center justify-center shrink-0">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-bold leading-tight">
                      {activeTargetResponder?.callSign || 'Emergency Responder'}
                    </h3>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950 text-[#B41A46] dark:text-rose-400">
                      {activeTargetResponder?.apparatus || selectedService}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Direct two-way tactical radio comms • {activeTargetResponder ? `${formatDistance(estDistanceMeters)} (${formatEta(estDurationSeconds)})` : 'Live Link'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMessageModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-white bg-gray-100 dark:bg-neutral-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Conversation Thread */}
            <div className="flex-1 overflow-y-auto space-y-2 p-2.5 bg-gray-50/70 dark:bg-neutral-800/40 rounded-2xl max-h-56 min-h-[120px]">
              {messages.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-xs">
                  No radio messages yet. Send entrance guidelines or patient status updates.
                </div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`flex flex-col ${m.sender === 'citizen' ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-bold text-gray-500 dark:text-neutral-400">{m.senderName}</span>
                      <span className="text-[9px] text-gray-400">{m.timestamp}</span>
                    </div>
                    <div className={`px-3 py-2 rounded-2xl text-xs max-w-[85%] font-medium leading-relaxed ${
                      m.sender === 'citizen'
                        ? 'bg-[#B41A46] text-white rounded-tr-xs shadow-xs'
                        : 'bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 text-gray-800 dark:text-neutral-100 rounded-tl-xs shadow-xs'
                    }`}>
                      {m.text}
                    </div>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handleSendCommsMessage} className="space-y-2.5 shrink-0">
              <textarea
                required
                rows={2}
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                placeholder="Type entrance notes, gate codes, or patient changes..."
                className="w-full p-3 bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-2xl text-xs font-medium focus:outline-none focus:border-[#B41A46] dark:text-white resize-none"
              />

              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setChatMessage('Standing by the front gate in visible clothing')}
                  className="flex-1 py-1 px-2 bg-gray-100 dark:bg-neutral-800 text-[10px] font-semibold rounded-lg truncate text-gray-600 dark:text-neutral-300 hover:border-[#B41A46] cursor-pointer"
                >
                  📍 At front gate
                </button>
                <button
                  type="button"
                  onClick={() => setChatMessage('Patient is conscious and breathing steadily')}
                  className="flex-1 py-1 px-2 bg-gray-100 dark:bg-neutral-800 text-[10px] font-semibold rounded-lg truncate text-gray-600 dark:text-neutral-300 hover:border-[#B41A46] cursor-pointer"
                >
                  🫁 Breathing stable
                </button>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-[#B41A46] hover:bg-[#9a143a] text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Transmit to Unit</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
