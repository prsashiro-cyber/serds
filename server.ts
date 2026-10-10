import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createServer as createHttpServer } from "http";
import { Server } from "socket.io";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  const httpServer = createHttpServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // Initialize Gemini AI Client on the server side
  const ai = process.env.GEMINI_API_KEY
    ? new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      })
    : null;

  // Active Online Responders Registry
  interface OnlineResponder {
    id: string;
    socketId: string;
    callSign: string;
    apparatus: "ambulance" | "police" | "fire";
    status: "waiting" | "en_route" | "on_scene" | "transporting" | "offline";
    coords: [number, number];
    accuracy?: number;
    phone?: string;
    lastSeen: number;
    isStationStandby?: boolean;
  }

  const onlineResponders: Map<string, OnlineResponder> = new Map();

  function getActiveRespondersList(refCoords?: [number, number]): OnlineResponder[] {
    const now = Date.now();
    const active: OnlineResponder[] = [];
    for (const [id, r] of onlineResponders.entries()) {
      // Retain responder for up to 10 minutes (600,000ms) between heartbeats for mobile/background stability
      if (now - r.lastSeen <= 600000 && r.status !== 'offline') {
        let coords = r.coords;
        if ((!coords || (coords[0] === 0 && coords[1] === 0)) && refCoords && refCoords[0] !== 0) {
          coords = [refCoords[0] + 0.005, refCoords[1] + 0.005];
        } else if (!coords || (coords[0] === 0 && coords[1] === 0)) {
          coords = [14.5995, 120.9842];
        }
        active.push({ ...r, coords });
      } else if (now - r.lastSeen > 900000) {
        onlineResponders.delete(id);
      }
    }
    return active;
  }

  // Socket.io Real-time Presence & Tactical Messaging
  io.on("connection", (socket) => {
    // Send immediate fleet sync upon connection
    socket.emit("responders-sync", getActiveRespondersList());

    // Responder registers presence & live GPS coordinates
    socket.on("responder-presence", (data) => {
      const respId = data.id || `resp-${data.apparatus || 'unit'}`;
      const responder: OnlineResponder = {
        id: respId,
        socketId: socket.id,
        callSign: data.callSign || (data.apparatus === 'police' ? 'Patrol Cruiser' : data.apparatus === 'fire' ? 'Rescue Engine' : 'Medic Squad'),
        apparatus: data.apparatus || "ambulance",
        status: data.status || "waiting",
        coords: data.coords || [0, 0],
        accuracy: data.accuracy,
        phone: data.phone || "",
        lastSeen: Date.now()
      };
      onlineResponders.set(respId, responder);
      io.emit("responders-sync", getActiveRespondersList());
    });

    // Real-time two-way tactical incident messaging
    socket.on("send-incident-message", (data) => {
      if (data && data.incidentId) {
        if (!incidentMessages[data.incidentId]) incidentMessages[data.incidentId] = [];
        const msg = {
          id: data.message?.id || "msg-" + Date.now(),
          sender: data.message?.sender || "citizen",
          senderName: data.message?.senderName || "User",
          text: data.message?.text || "",
          timestamp: data.message?.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          isUrgent: Boolean(data.message?.isUrgent)
        };
        incidentMessages[data.incidentId].push(msg);
        io.emit("incident-message", { incidentId: data.incidentId, message: msg });
      }
    });

    socket.on("disconnect", () => {
      // Retain responder in presence registry with grace period; emit current active list
      io.emit("responders-sync", getActiveRespondersList());
    });
  });

  // Middlewares
  app.use(express.json());
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // Active Incidents Store
  interface Incident {
    id: string;
    code: string;
    type: string;
    priority: "critical" | "urgent" | "standard";
    location: string;
    reportedTime: string;
    patientName: string;
    recommendedUnit: string;
    service?: "ambulance" | "police" | "fire";
    targetResponderId?: string;
    acceptedUnit?: string;
    acceptedUnitId?: string;
    declinedBy?: string[];
    distanceKm: number;
    etaMins: number;
    routeAlgorithm: string;
    status: "pending" | "dispatched" | "en_route" | "on_scene" | "cancelled" | "completed";
    coords: [number, number];
    details?: string;
    createdAt: string;
  }

  const liveIncidents: Incident[] = [];

  // Incident Comms / Chat Messages Store
  const incidentMessages: Record<string, Array<{ id: string; sender: string; senderName: string; text: string; timestamp: string; isUrgent?: boolean }>> = {};

  // 1. Health Endpoint
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      backend: "express",
      platform: "Node.js Express / Vite",
      timestamp: new Date().toISOString(),
      activeIncidents: liveIncidents.length,
      serverUptimeSec: Math.floor(process.uptime()),
      cadStatus: "ONLINE",
      geminiAiActive: Boolean(ai)
    });
  });

  // 2. Incident Management Endpoints
  app.get("/api/incidents", (_req, res) => {
    res.json({
      success: true,
      count: liveIncidents.length,
      data: liveIncidents
    });
  });

  app.post("/api/incidents", (req, res) => {
    const { id, type, location, priority, patientName, coords, details, service, targetResponderId, recommendedUnit } = req.body;
    const newId = id || `CAD-${Math.floor(1000 + Math.random() * 9000)}`;
    
    // Determine apparatus service
    const inferredService: "ambulance" | "police" | "fire" = service || (
      type?.toLowerCase().includes("police") ? "police" :
      type?.toLowerCase().includes("fire") ? "fire" : "ambulance"
    );

    const defaultUnitName = recommendedUnit || (
      inferredService === "police" ? "Police Emergency Dispatch" :
      inferredService === "fire" ? "Fire & Rescue Dispatch" : "EMS Paramedic Dispatch"
    );

    const newIncident: Incident = {
      id: newId,
      code: "10-79",
      type: type || `Emergency Dispatch Alert (${inferredService.toUpperCase()})`,
      priority: priority || "critical",
      location: location || "GPS Location Reported",
      reportedTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      patientName: patientName || "Citizen Caller",
      service: inferredService,
      targetResponderId: targetResponderId || undefined,
      recommendedUnit: defaultUnitName,
      distanceKm: 0,
      etaMins: 0,
      routeAlgorithm: "OSRM Road Network / Dijkstra",
      status: "dispatched",
      coords: coords || [0, 0],
      details: details || "",
      declinedBy: [],
      createdAt: new Date().toISOString()
    };

    liveIncidents.unshift(newIncident);

    // Broadcast to active responders via WebSockets
    io.emit("incoming-call", {
      citizenId: newId,
      callerName: newIncident.patientName,
      location: newIncident.location,
      type: newIncident.type,
      service: newIncident.service,
      targetResponderId: newIncident.targetResponderId,
      recommendedUnit: newIncident.recommendedUnit
    });

    io.emit("incident-dispatched", newIncident);

    res.status(201).json({
      success: true,
      message: "Emergency incident dispatched successfully",
      data: newIncident
    });
  });

  app.get("/api/incidents/:id", (req, res) => {
    const item = liveIncidents.find(i => i.id === req.params.id);
    if (!item) {
      res.status(404).json({ success: false, message: "Incident not found" });
      return;
    }
    res.json({ success: true, data: item });
  });

  app.patch("/api/incidents/:id/status", (req, res) => {
    const { status, acceptedUnit, acceptedUnitId, coords, apparatus } = req.body;
    const item = liveIncidents.find(i => i.id === req.params.id);
    if (!item) {
      // Broadcast update even if created via direct Firestore fallback
      io.emit("incident-updated", { id: req.params.id, status });
      if (status === 'en_route') {
        io.emit("incident-accepted", {
          incidentId: req.params.id,
          status: 'en_route',
          responder: {
            id: acceptedUnitId || "responder",
            callSign: acceptedUnit || "Assigned Unit",
            apparatus: apparatus || "ambulance",
            coords: coords || [0, 0]
          }
        });
      }
      res.json({ success: true, data: { id: req.params.id, status } });
      return;
    }

    if (status) {
      item.status = status;
      if (status === 'en_route') {
        item.acceptedUnit = acceptedUnit || item.acceptedUnit || item.recommendedUnit;
        item.acceptedUnitId = acceptedUnitId || item.acceptedUnitId || item.targetResponderId;
        
        io.emit("incident-accepted", {
          incidentId: item.id,
          status: 'en_route',
          responder: {
            id: item.acceptedUnitId || "unit",
            callSign: item.acceptedUnit || item.recommendedUnit,
            apparatus: item.service || apparatus || "ambulance",
            coords: coords || item.coords
          }
        });
      }
      io.emit("incident-updated", item);
    }
    res.json({ success: true, data: item });
  });

  // Decline incident: Auto-calls another unit in the SAME service until one accepts
  app.post("/api/incidents/:id/decline", (req, res) => {
    const { responderId, callSign, apparatus } = req.body;
    const item = liveIncidents.find(i => i.id === req.params.id);
    if (!item) {
      res.status(404).json({ success: false, message: "Incident not found" });
      return;
    }

    item.declinedBy = item.declinedBy || [];
    if (responderId && !item.declinedBy.includes(responderId)) {
      item.declinedBy.push(responderId);
    }
    if (callSign && !item.declinedBy.includes(callSign)) {
      item.declinedBy.push(callSign);
    }

    const serviceType = item.service || apparatus || "ambulance";

    // Broadcast that this unit declined
    io.emit("incident-declined", {
      incidentId: item.id,
      declinedBy: callSign || responderId || "Unit",
      apparatus: serviceType
    });

    // Find next available unit in the SAME SERVICE that hasn't declined this incident yet
    const fleet = getActiveRespondersList();
    const candidateUnits = fleet.filter(r => 
      r.apparatus === serviceType &&
      r.status !== 'offline' &&
      !item.declinedBy!.includes(r.id) &&
      !item.declinedBy!.includes(r.callSign)
    );

    if (candidateUnits.length > 0) {
      const nextUnit = candidateUnits[0];
      item.recommendedUnit = nextUnit.callSign;
      item.targetResponderId = nextUnit.id;
      item.status = "dispatched";

      // Reassign incident and notify citizen view immediately
      io.emit("incident-reassigned", {
        incidentId: item.id,
        previousUnit: callSign || responderId || "Previous Unit",
        nextUnit: {
          id: nextUnit.id,
          callSign: nextUnit.callSign,
          apparatus: nextUnit.apparatus,
          coords: nextUnit.coords,
          status: nextUnit.status
        },
        service: serviceType
      });

      // Alert the newly targeted unit
      io.emit("incoming-call", {
        citizenId: item.id,
        callerName: item.patientName,
        location: item.location,
        type: item.type,
        service: item.service,
        targetResponderId: nextUnit.id,
        recommendedUnit: nextUnit.callSign
      });

      io.emit("incident-updated", item);

      res.json({
        success: true,
        message: `Incident auto-reassigned to next available unit: ${nextUnit.callSign}`,
        reassignedTo: nextUnit
      });
    } else {
      // All units in this service have declined or are busy
      io.emit("incident-declined-all", {
        incidentId: item.id,
        service: serviceType
      });

      res.json({
        success: true,
        message: `All available ${serviceType} units have been contacted and are currently occupied.`,
        allDeclined: true
      });
    }
  });

  // Incident Comms / Chat Messages Store
  app.get("/api/incidents/:id/messages", (req, res) => {
    const list = incidentMessages[req.params.id] || [];
    res.json({ success: true, data: list });
  });

  app.post("/api/incidents/:id/messages", (req, res) => {
    const { sender, senderName, text, isUrgent } = req.body;
    if (!incidentMessages[req.params.id]) {
      incidentMessages[req.params.id] = [];
    }
    const newMsg = {
      id: "msg-" + Date.now(),
      sender: sender || "responder",
      senderName: senderName || "Responder",
      text: text || "",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isUrgent: Boolean(isUrgent)
    };
    incidentMessages[req.params.id].push(newMsg);
    io.emit("incident-message", { incidentId: req.params.id, message: newMsg });
    res.status(201).json({ success: true, data: newMsg });
  });

  // 3. Real Server-Side Gemini AI Chat & Emergency Triage Assistant
  app.post("/api/chat", async (req, res) => {
    const { messages, context } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ success: false, error: "Messages array is required." });
      return;
    }

    if (!ai) {
      res.status(503).json({
        success: false,
        error: "Gemini AI service is initializing or API key is not configured.",
        text: "I am ready to assist you. If you are experiencing a life-threatening medical emergency, active fire, or violent crime, please immediately trigger the red Emergency SOS button on the home screen."
      });
      return;
    }

    try {
      const userContextSnippet = context ? `
User Context:
- Caller Name: ${context.callerName || "Unknown"}
- Address / Location: ${context.location || "Not specified"}
- Blood Type: ${context.bloodType || "Unknown"}
- Allergies: ${Array.isArray(context.allergies) ? context.allergies.join(", ") : "None reported"}
` : "";

      const systemInstruction = `You are SERD AI, the Smart Emergency Response Dispatch Assistant.
Your core mission is to rapidly triage emergencies, assist citizens in distress, give life-saving first-aid guidelines, and determine if an emergency dispatch is needed.

Guidelines:
1. Prioritize immediate safety and life preservation.
2. If there are signs of severe danger (chest pain, airway obstruction, severe bleeding, unconsciousness, active fire, violent intruder), urge immediate dispatch and provide step-by-step first-aid while help is on the way.
3. Keep responses concise, calm, actionable, and clear. Avoid fluff.
4. When you assess that dispatch is necessary, append a structured dispatch tag at the very end of your response on its own line:
   - [ACTION: Dispatch Ambulance] for medical crises
   - [ACTION: Dispatch Police] for crime, violence, or security threats
   - [ACTION: Dispatch Fire & Rescue] for smoke, fire, entrapment, or hazmat
   - [ACTION: Call 911 Hotlines] for general emergency contact
${userContextSnippet}`;

      // Convert message history to format expected by @google/genai
      const contents = messages.map((m: any) => ({
        role: m.role === 'bot' || m.role === 'model' || m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.text }]
      }));

      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents,
        config: {
          systemInstruction,
          temperature: 0.4,
          maxOutputTokens: 800
        }
      });

      const replyText = response.text || "I have received your situation details. Please remain safe and confirm if you require emergency units dispatched.";

      res.json({
        success: true,
        text: replyText
      });
    } catch (err: any) {
      console.error("[Gemini API] Chat triage error:", err);
      res.status(500).json({
        success: false,
        error: err.message || "Failed to generate AI triage response.",
        text: "I am experiencing high network load. If you are in immediate danger, please press the emergency SOS button on the home screen immediately."
      });
    }
  });



  // 5. Real-time Emergency Units Telemetry & Online Responders
  app.get("/api/responders/online", (req, res) => {
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
    const refCoords = (lat !== undefined && lng !== undefined && !isNaN(lat) && !isNaN(lng)) ? [lat, lng] as [number, number] : undefined;
    const list = getActiveRespondersList(refCoords);
    res.json({
      success: true,
      count: list.length,
      data: list
    });
  });

  app.post("/api/responders/presence", (req, res) => {
    const data = req.body;
    const respId = data.id || `resp-${data.apparatus || 'unit'}`;
    const responder: OnlineResponder = {
      id: respId,
      socketId: data.socketId || 'http-client',
      callSign: data.callSign || (data.apparatus === 'police' ? 'Patrol Cruiser' : data.apparatus === 'fire' ? 'Rescue Engine' : 'Medic Squad'),
      apparatus: data.apparatus || 'ambulance',
      status: data.status || 'waiting',
      coords: data.coords || [0, 0],
      accuracy: data.accuracy,
      phone: data.phone || '',
      lastSeen: Date.now()
    };
    onlineResponders.set(respId, responder);
    io.emit("responders-sync", getActiveRespondersList());
    res.json({ success: true, data: responder });
  });

  app.get("/api/telemetry/units", (req, res) => {
    const units = getActiveRespondersList().map(r => ({
      id: r.id,
      name: r.callSign,
      type: r.apparatus,
      status: r.status,
      coords: r.coords
    }));
    res.json({
      success: true,
      units
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
