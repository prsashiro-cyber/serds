import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  signInAnonymously,
  User 
} from "firebase/auth";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs,
  getDocFromServer,
  addDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  serverTimestamp,
  Timestamp
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

// Initialize Firebase using the provisioned configuration
export { firebaseConfig };
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
// CRITICAL: The app will break without specifying the firestoreDatabaseId
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);

// -------------------------------------------------------------
// Hardened Firestore Error Handler
// -------------------------------------------------------------
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Recursively removes undefined properties so setDoc/addDoc/updateDoc never fails
 * with 'Unsupported field value: undefined'
 */
export function cleanFirestoreData<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => cleanFirestoreData(item)) as unknown as T;
  }
  if (typeof data === 'object') {
    if (
      data instanceof Date || 
      typeof (data as any).toMillis === 'function' || 
      (data as any)._methodName ||
      (data as any).constructor?.name === 'FieldValue'
    ) {
      return data;
    }
    const cleaned: Record<string, any> = {};
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) {
        cleaned[key] = cleanFirestoreData(val);
      }
    }
    return cleaned as T;
  }
  return data;
}

// Validate connection to Firestore on initialization
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

// -------------------------------------------------------------
// Data Types
// -------------------------------------------------------------
export interface FirestoreIncident {
  id?: string;
  code: string;
  type: string;
  priority: 'critical' | 'urgent' | 'standard';
  location: string;
  reportedTime: string;
  patientName: string;
  recommendedUnit?: string;
  service?: 'ambulance' | 'police' | 'fire';
  targetResponderId?: string;
  acceptedUnit?: string;
  declinedBy?: string[];
  distanceKm?: number;
  etaMins?: number;
  routeAlgorithm?: string;
  status: 'pending' | 'dispatched' | 'en_route' | 'on_scene' | 'cancelled' | 'completed';
  coords: [number, number];
  details?: string;
  createdAt?: any;
}

export interface FirestoreUserProfile {
  uid: string;
  fullName: string;
  displayName: string;
  email: string;
  phone?: string;
  bloodType?: string;
  birthdate?: string;
  heightCm?: number;
  weightKg?: number;
  allergies?: Array<{ id: string; allergen: string; reaction: string; severity: string }>;
  emergencyContact?: {
    name: string;
    relation: string;
    phone: string;
  };
  emergencyCircle?: Array<{
    id: string;
    name: string;
    phone: string;
    relation: string;
    isPrimary?: boolean;
    notes?: string;
  }>;
  role?: 'citizen' | 'responder';
  agency?: string;
  badgeNumber?: string;
  responderRole?: string;
  station?: string;
  vehicleUnit?: string;
  callSign?: string;
  avatarUrl?: string;
  updatedAt?: any;
}

/**
 * Real-time listener for CAD Emergency Incidents
 */
export function subscribeToIncidents(callback: (incidents: FirestoreIncident[]) => void) {
  const path = "incidents";
  try {
    const q = query(
      collection(db, path),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    return onSnapshot(q, (snapshot) => {
      const list: FirestoreIncident[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          code: data.code || '10-79',
          type: data.type || 'General Emergency SOS',
          priority: data.priority || 'critical',
          location: data.location || 'Unknown Location',
          reportedTime: data.reportedTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          patientName: data.patientName || 'Citizen Caller',
          recommendedUnit: data.recommendedUnit || 'Assigned Responder Unit',
          service: data.service,
          targetResponderId: data.targetResponderId,
          acceptedUnit: data.acceptedUnit,
          declinedBy: Array.isArray(data.declinedBy) ? data.declinedBy : [],
          distanceKm: data.distanceKm || 0.8,
          etaMins: data.etaMins || 2.0,
          routeAlgorithm: data.routeAlgorithm || 'OSRM Road Graph',
          status: data.status || 'dispatched',
          coords: data.coords || [0, 0],
          details: data.details || '',
          createdAt: data.createdAt
        };
      });
      callback(list);
    }, (error) => {
      console.warn("[Firestore] Incidents listener error:", error.message);
      handleFirestoreError(error, OperationType.GET, path);
    });
  } catch (err) {
    console.warn("[Firestore] Error initiating incidents listener:", err);
    return () => {};
  }
}

/**
 * Save new emergency dispatch to Firestore.
 * Supports customId to ensure unified ID across Firestore, Express, and clients.
 */
export async function saveIncidentToFirestore(
  incident: Omit<FirestoreIncident, 'id' | 'createdAt'>,
  customId?: string
): Promise<string | null> {
  const path = "incidents";
  try {
    const payload = cleanFirestoreData({
      ...incident,
      createdAt: serverTimestamp(),
      reportedTime: incident.reportedTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    if (customId) {
      const docRef = doc(db, path, customId);
      await setDoc(docRef, payload);
      return customId;
    } else {
      const docRef = await addDoc(collection(db, path), payload);
      return docRef.id;
    }
  } catch (err: any) {
    console.warn("[Firestore] Failed to save incident to Firestore:", err.message);
    handleFirestoreError(err, OperationType.CREATE, path);
    return null;
  }
}

/**
 * Update incident status in Firestore
 */
export async function updateFirestoreIncidentStatus(
  incidentId: string, 
  status: FirestoreIncident['status'],
  extra?: Partial<Omit<FirestoreIncident, 'status'>>
): Promise<boolean> {
  const path = `incidents/${incidentId}`;
  try {
    const updatePayload = cleanFirestoreData({
      status,
      ...extra,
      updatedAt: serverTimestamp()
    });

    const ref = doc(db, "incidents", incidentId);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, updatePayload);
      return true;
    }

    // Fallback: If not found by direct doc ID, check if there is an incident with this code or ID in fields
    const q = query(collection(db, "incidents"), limit(25));
    const allSnaps = await getDocs(q);
    for (const d of allSnaps.docs) {
      const data = d.data();
      if (d.id === incidentId || data.id === incidentId || data.code === incidentId) {
        await updateDoc(d.ref, updatePayload);
        return true;
      }
    }

    return false;
  } catch (err) {
    console.warn("[Firestore] Failed to update incident status:", err);
    return false;
  }
}

/**
 * Marks all pending or dispatched stale incidents as completed.
 */
export async function clearAllStaleIncidents(): Promise<number> {
  const path = "incidents";
  try {
    const colRef = collection(db, path);
    const snap = await getDocs(colRef);
    let count = 0;
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if (data.status === 'dispatched' || data.status === 'pending' || data.status === 'en_route' || data.status === 'on_scene') {
        try {
          await updateDoc(docSnap.ref, {
            status: 'completed',
            updatedAt: serverTimestamp()
          });
          count++;
        } catch {}
      }
    }
    return count;
  } catch (err) {
    console.warn("[Firestore] Error clearing stale incidents:", err);
    return 0;
  }
}

/**
 * Sync user profile to Firestore
 */
export async function syncUserProfileToFirestore(profile: FirestoreUserProfile): Promise<boolean> {
  const path = `users/${profile.uid}`;
  try {
    const ref = doc(db, "users", profile.uid);
    const sanitized = cleanFirestoreData({
      ...profile,
      updatedAt: serverTimestamp()
    });
    await setDoc(ref, sanitized, { merge: true });
    return true;
  } catch (err) {
    console.warn("[Firestore] Failed to sync user profile:", err);
    handleFirestoreError(err, OperationType.WRITE, path);
    return false;
  }
}

/**
 * Fetch user profile from Firestore
 */
export async function fetchUserProfileFromFirestore(uid: string): Promise<FirestoreUserProfile | null> {
  const path = `users/${uid}`;
  try {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as FirestoreUserProfile;
    }
  } catch (err) {
    console.warn("[Firestore] Failed to fetch user profile:", err);
    handleFirestoreError(err, OperationType.GET, path);
  }
  return null;
}



export const DEFAULT_SYSTEM_ALLERGENS: string[] = [
  'Penicillin / Amoxicillin',
  'Cephalosporins (Keflex, Rocephin)',
  'Sulfa Drugs (Bactrim, Septra)',
  'Aspirin / NSAIDs (Ibuprofen, Naproxen)',
  'Opioids (Morphine, Codeine, Tramadol)',
  'Iodine / Radiocontrast Dye',
  'Local Anesthetics (Lidocaine, Novocaine)',
  'General Anesthetics (Propofol, Ketamine)',
  'Fluoroquinolones (Ciprofloxacin, Levofloxacin)',
  'Macrolides (Azithromycin, Erythromycin)',
  'Tetracyclines (Doxycycline, Minocycline)',
  'Vancomycin',
  'ACE Inhibitors (Lisinopril, Enalapril)',
  'Anticonvulsants (Carbamazepine, Phenytoin)',
  'Insulin',
  'Tetanus Toxoid Vaccine',
  'Muscle Relaxants (Succinylcholine)',
  'Chemotherapy Agents',
  'Statins (Atorvastatin)',
  'Peanuts',
  'Tree Nuts (Walnuts, Almonds, Cashews, Pistachios)',
  'Shellfish (Shrimp, Crab, Lobster, Prawns)',
  'Finfish (Salmon, Tuna, Cod, Tilapia)',
  'Cow\'s Milk / Dairy / Lactose',
  'Eggs (Egg Whites & Yolks)',
  'Wheat / Gluten (Celiac / Wheat Allergy)',
  'Soy & Soybeans',
  'Sesame & Sesame Oil',
  'Mustard & Mustard Seed',
  'Celery & Celeriac',
  'Sulfites (Wine / Food Preservatives)',
  'Corn & Corn Byproducts',
  'Strawberries & Berries',
  'Citrus Fruits (Oranges, Lemons, Grapefruits)',
  'Kiwifruit',
  'Bananas',
  'Avocados',
  'Tomatoes & Nightshades',
  'Garlic & Onions',
  'Monosodium Glutamate (MSG)',
  'Tartrazine (Yellow Dye #5)',
  'Red Meat / Alpha-Gal (Mammalian Meat)',
  'Latex & Natural Rubber',
  'Honey Bee Stings',
  'Wasp & Yellow Jacket Stings',
  'Fire Ant Bites / Stings',
  'Hornet Stings',
  'Cat Dander & Saliva',
  'Dog Dander & Saliva',
  'Horse Dander',
  'Dust Mites & Household Dust',
  'Mold Spores (Aspergillus, Cladosporium)',
  'Grass Pollen (Bermuda, Rye, Timothy)',
  'Tree Pollen (Birch, Oak, Cedar, Pine)',
  'Weed Pollen (Ragweed, Mugwort)',
  'Cockroach Allergens',
  'Nickel & Metal Alloys',
  'Poison Ivy / Poison Oak (Urushiol)',
  'Synthetic Fragrances & Perfumes',
  'Sunlight / Solar Urticaria',
  'Cold Temperature / Cold Urticaria'
];

/**
 * Fetch master allergy list
 */
export async function fetchAllergiesCatalogFromFirestore(): Promise<string[]> {
  const path = "allergies_catalog";
  try {
    const colRef = collection(db, path);
    const q = query(colRef, orderBy("name", "asc"));
    const snap = await getDocs(q);
    
    const items: string[] = [];
    if (!snap.empty) {
      snap.forEach(docSnap => {
        const data = docSnap.data();
        if (data.name && !items.includes(data.name)) items.push(data.name);
      });
    }

    for (const name of DEFAULT_SYSTEM_ALLERGENS) {
      if (!items.includes(name)) {
        items.push(name);
      }
    }

    return items.sort((a, b) => a.localeCompare(b));
  } catch (err) {
    console.warn("[Firestore] Failed to fetch allergies catalog, using defaults:", err);
    return DEFAULT_SYSTEM_ALLERGENS.slice().sort((a, b) => a.localeCompare(b));
  }
}

/**
 * Add a new allergy to the Firebase 'allergies_catalog' collection
 */
export async function addAllergyToCatalogInFirestore(name: string, category: string = 'general'): Promise<boolean> {
  const path = "allergies_catalog";
  try {
    const trimmed = name.trim();
    if (!trimmed) return false;
    const colRef = collection(db, path);
    await addDoc(colRef, cleanFirestoreData({
      name: trimmed,
      category,
      createdAt: serverTimestamp()
    }));
    return true;
  } catch (err) {
    console.warn("[Firestore] Failed to add allergy to catalog:", err);
    handleFirestoreError(err, OperationType.CREATE, path);
    return false;
  }
}

/**
 * Listen in real time to the Firebase allergies collection
 */
export function subscribeToAllergiesCatalog(callback: (allergies: string[]) => void): () => void {
  const path = "allergies_catalog";
  try {
    const colRef = collection(db, path);
    const q = query(colRef, orderBy("name", "asc"));
    return onSnapshot(q, (snap) => {
      const items: string[] = [];
      if (!snap.empty) {
        snap.forEach(docSnap => {
          const data = docSnap.data();
          if (data.name && !items.includes(data.name)) items.push(data.name);
        });
      }
      for (const def of DEFAULT_SYSTEM_ALLERGENS) {
        if (!items.includes(def)) {
          items.push(def);
        }
      }
      callback(items.sort((a, b) => a.localeCompare(b)));
    }, (err) => {
      console.warn("[Firestore] Allergies subscription notice:", err);
      handleFirestoreError(err, OperationType.GET, path);
    });
  } catch {
    callback(DEFAULT_SYSTEM_ALLERGENS.slice().sort((a, b) => a.localeCompare(b)));
    return () => {};
  }
}

export {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  signInAnonymously
};
export type { User };
