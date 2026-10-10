/**
 * SERD User Settings & Profile Persistence Engine
 * Manages reactive storage for Account, Preferences, Privacy & Security
 */

import { useState, useEffect } from 'react';

export interface AllergyItem {
  id: string;
  allergen: string;
  reaction: string;
  severity: 'Mild' | 'Moderate' | 'Severe';
}

export interface EmergencyContact {
  name: string;
  relation: string;
  phone: string;
}

export interface EmergencyCircleContact {
  id: string;
  name: string;
  phone: string;
  relation: string;
  isPrimary?: boolean;
  notes?: string;
  createdAt?: number;
}

export interface UserProfile {
  fullName: string;
  displayName: string;
  email: string;
  phone: string;
  birthdate: string;
  bloodType: string;
  heightCm: number;
  weightKg: number;
  address: string;
  city: string;
  chronicConditions?: string[];
  allergies: AllergyItem[];
  emergencyContact: EmergencyContact;
  emergencyCircle?: EmergencyCircleContact[];
  profileCompletionPct: number;
  avatarUrl?: string;
  role?: 'citizen' | 'dispatcher' | 'responder';
  agency?: string;
  badgeNumber?: string;
  responderRole?: string;
  station?: string;
  vehicleUnit?: string;
  callSign?: string;
}

export interface PrivacySecuritySettings {
  shareMedicalWithCAD: boolean;
  pinEnabled: boolean;
  pinCode: string;
  biometricLock: boolean;
  locationRetention: 'immediate' | '24hours' | '30days';
  autoBroadcastLocation: boolean;
}

export interface NotificationPreferences {
  pushEnabled: boolean;
  soundEnabled: boolean;
  sirenTone: 'standard' | 'high_urgency' | 'chime';
  vibration: boolean;
  advisoryAlerts: boolean;
  proximityRadiusMeters: number;
}

export interface LocationPreferences {
  servicesEnabled: boolean;
  highAccuracy: boolean;
  lastKnownCoords: { lat: number; lng: number } | null;
  lastKnownAddress: string;
}

export interface AppSettings {
  profile: UserProfile;
  privacy: PrivacySecuritySettings;
  notifications: NotificationPreferences;
  location: LocationPreferences;
  darkMode: boolean;
}

const STORAGE_KEY = 'serd_app_settings_v1';
const SETTINGS_EVENT = 'serd-settings-changed';

export interface ProfileRequirement {
  id: string;
  label: string;
  isComplete: boolean;
  category: 'identity' | 'medical' | 'emergency';
}

export function calculateProfileCompletion(profile: Partial<UserProfile>): number {
  if (!profile) return 0;
  
  let score = 0;
  const total = 10;

  // 1. Full Name
  if (profile.fullName && profile.fullName.trim().length > 0) score++;
  // 2. Display Name
  if (profile.displayName && profile.displayName.trim().length > 0) score++;
  // 3. Phone Number
  if (profile.phone && profile.phone.trim().length > 0) score++;
  // 4. Email Address
  if (profile.email && profile.email.trim().length > 0) score++;
  // 5. Birthdate / Age
  if (profile.birthdate && profile.birthdate.trim().length > 0) score++;
  // 6. Address / City
  if (profile.address && profile.address.trim().length > 0) score++;
  // 7. Blood Type
  if (profile.bloodType && profile.bloodType.trim().length > 0) score++;
  // 8. Height & Weight
  if (Number(profile.heightCm) > 0 && Number(profile.weightKg) > 0) score++;
  // 9. Emergency Contact (Name & Phone)
  if (profile.emergencyContact?.name?.trim() && profile.emergencyContact?.phone?.trim()) score++;
  // 10. Allergies & Medical Reaction Record
  if (profile.allergies && profile.allergies.length > 0) score++;

  return Math.round((score / total) * 100);
}

export function getProfileRequirements(profile: Partial<UserProfile>): ProfileRequirement[] {
  return [
    {
      id: 'fullName',
      label: 'Full Legal Name',
      isComplete: Boolean(profile?.fullName && profile.fullName.trim().length > 0),
      category: 'identity'
    },
    {
      id: 'displayName',
      label: 'Display Name / Nickname',
      isComplete: Boolean(profile?.displayName && profile.displayName.trim().length > 0),
      category: 'identity'
    },
    {
      id: 'phone',
      label: 'Personal Mobile Phone',
      isComplete: Boolean(profile?.phone && profile.phone.trim().length > 0),
      category: 'identity'
    },
    {
      id: 'email',
      label: 'Email Address',
      isComplete: Boolean(profile?.email && profile.email.trim().length > 0),
      category: 'identity'
    },
    {
      id: 'birthdate',
      label: 'Date of Birth',
      isComplete: Boolean(profile?.birthdate && profile.birthdate.trim().length > 0),
      category: 'identity'
    },
    {
      id: 'address',
      label: 'Residential Address & City',
      isComplete: Boolean(profile?.address && profile.address.trim().length > 0),
      category: 'identity'
    },
    {
      id: 'bloodType',
      label: 'Blood Type',
      isComplete: Boolean(profile?.bloodType && profile.bloodType.trim().length > 0),
      category: 'medical'
    },
    {
      id: 'measurements',
      label: 'Height & Weight Measurements',
      isComplete: Boolean(Number(profile?.heightCm) > 0 && Number(profile?.weightKg) > 0),
      category: 'medical'
    },
    {
      id: 'emergencyContact',
      label: 'Emergency Contact Person & Phone',
      isComplete: Boolean(profile?.emergencyContact?.name?.trim() && profile?.emergencyContact?.phone?.trim()),
      category: 'emergency'
    },
    {
      id: 'allergies',
      label: 'Allergies & Reactions Record',
      isComplete: Boolean(profile?.allergies && profile.allergies.length > 0),
      category: 'medical'
    },
  ];
}

export const DEFAULT_SETTINGS: AppSettings = {
  profile: {
    fullName: '',
    displayName: '',
    email: '',
    phone: '',
    birthdate: '',
    bloodType: '',
    heightCm: 0,
    weightKg: 0,
    address: '',
    city: '',
    chronicConditions: [],
    allergies: [],
    emergencyContact: {
      name: '',
      relation: '',
      phone: ''
    },
    emergencyCircle: [],
    avatarUrl: '',
    profileCompletionPct: 0
  },
  privacy: {
    shareMedicalWithCAD: true,
    pinEnabled: false,
    pinCode: '',
    biometricLock: false,
    locationRetention: '24hours',
    autoBroadcastLocation: true
  },
  notifications: {
    pushEnabled: true,
    soundEnabled: true,
    sirenTone: 'high_urgency',
    vibration: true,
    advisoryAlerts: true,
    proximityRadiusMeters: 500
  },
  location: {
    servicesEnabled: true,
    highAccuracy: true,
    lastKnownCoords: null,
    lastKnownAddress: 'Locating GPS coordinates...'
  },
  darkMode: false
};

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const computedPct = calculateProfileCompletion(DEFAULT_SETTINGS.profile);
      return {
        ...DEFAULT_SETTINGS,
        profile: { ...DEFAULT_SETTINGS.profile, profileCompletionPct: computedPct }
      };
    }
    const parsed = JSON.parse(raw);
    const mergedProfile = { ...DEFAULT_SETTINGS.profile, ...(parsed.profile || {}) };
    mergedProfile.avatarUrl = parsed?.profile?.avatarUrl || '';
    mergedProfile.allergies = Array.isArray(mergedProfile.allergies) 
      ? mergedProfile.allergies 
      : (DEFAULT_SETTINGS.profile.allergies || []);
    mergedProfile.chronicConditions = Array.isArray(mergedProfile.chronicConditions) 
      ? mergedProfile.chronicConditions 
      : (DEFAULT_SETTINGS.profile.chronicConditions || []);
    mergedProfile.emergencyContact = mergedProfile.emergencyContact || DEFAULT_SETTINGS.profile.emergencyContact;
    if (Array.isArray(parsed?.profile?.emergencyCircle)) {
      mergedProfile.emergencyCircle = parsed.profile.emergencyCircle;
    } else if (mergedProfile.emergencyContact?.name?.trim()) {
      mergedProfile.emergencyCircle = [
        {
          id: 'c-primary-1',
          name: mergedProfile.emergencyContact.name,
          phone: mergedProfile.emergencyContact.phone,
          relation: mergedProfile.emergencyContact.relation || 'Emergency Contact',
          isPrimary: true
        }
      ];
    } else {
      mergedProfile.emergencyCircle = [];
    }
    mergedProfile.profileCompletionPct = calculateProfileCompletion(mergedProfile);

    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      profile: mergedProfile,
      privacy: { ...DEFAULT_SETTINGS.privacy, ...(parsed.privacy || {}) },
      notifications: { ...DEFAULT_SETTINGS.notifications, ...(parsed.notifications || {}) },
      location: { ...DEFAULT_SETTINGS.location, ...(parsed.location || {}) },
    };
  } catch (err) {
    console.error('Error loading SERD settings:', err);
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    // Defer event dispatch to next tick to avoid synchronous setState during active React render phases
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: settings }));
    }, 0);
  } catch (err) {
    console.error('Error saving SERD settings:', err);
  }
}

export function getStoredProfile(): UserProfile {
  return loadSettings().profile;
}

export function updateStoredProfile(profilePartial: Partial<UserProfile>): void {
  const current = loadSettings();
  const mergedProfile = { ...current.profile, ...profilePartial };
  if (!Array.isArray(mergedProfile.allergies)) {
    mergedProfile.allergies = [];
  }
  if (!Array.isArray(mergedProfile.chronicConditions)) {
    mergedProfile.chronicConditions = [];
  }
  mergedProfile.profileCompletionPct = calculateProfileCompletion(mergedProfile);
  const next: AppSettings = { ...current, profile: mergedProfile };
  saveSettings(next);
}

export function applyTheme(darkMode: boolean): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (darkMode) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function useUserSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(() => {
    return loadSettings();
  });

  useEffect(() => {
    applyTheme(settings.darkMode);
  }, [settings.darkMode]);

  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        const updated = loadSettings();
        setSettingsState(updated);
        applyTheme(updated.darkMode);
      }
    };

    const handleCustom = (e: Event) => {
      const customEvent = e as CustomEvent<AppSettings>;
      if (customEvent.detail) {
        setSettingsState(customEvent.detail);
        applyTheme(customEvent.detail.darkMode);
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(SETTINGS_EVENT, handleCustom);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(SETTINGS_EVENT, handleCustom);
    };
  }, []);

  const updateSettings = (updater: (prev: AppSettings) => AppSettings) => {
    setSettingsState(prev => {
      const next = updater(prev);
      saveSettings(next);
      applyTheme(next.darkMode);
      return next;
    });
  };

  const updateProfile = (profilePartial: Partial<UserProfile>) => {
    updateSettings(prev => {
      const mergedProfile = { ...prev.profile, ...profilePartial };
      if (!Array.isArray(mergedProfile.allergies)) {
        mergedProfile.allergies = [];
      }
      if (!Array.isArray(mergedProfile.chronicConditions)) {
        mergedProfile.chronicConditions = [];
      }
      if (Array.isArray(profilePartial.emergencyCircle)) {
        mergedProfile.emergencyCircle = profilePartial.emergencyCircle;
        // Keep primary emergencyContact in sync
        const primary = profilePartial.emergencyCircle.find(c => c.isPrimary) || profilePartial.emergencyCircle[0];
        if (primary) {
          mergedProfile.emergencyContact = {
            name: primary.name,
            phone: primary.phone,
            relation: primary.relation || 'Emergency Contact'
          };
        } else if (!profilePartial.emergencyContact) {
          mergedProfile.emergencyContact = {
            name: '',
            relation: '',
            phone: ''
          };
        }
      }
      mergedProfile.profileCompletionPct = calculateProfileCompletion(mergedProfile);
      return {
        ...prev,
        profile: mergedProfile
      };
    });
  };

  const updateEmergencyCircle = (circle: EmergencyCircleContact[]) => {
    updateProfile({ emergencyCircle: circle });
  };

  const updatePrivacy = (privacyPartial: Partial<PrivacySecuritySettings>) => {
    updateSettings(prev => ({
      ...prev,
      privacy: { ...prev.privacy, ...privacyPartial }
    }));
  };

  const updateNotifications = (notifPartial: Partial<NotificationPreferences>) => {
    updateSettings(prev => ({
      ...prev,
      notifications: { ...prev.notifications, ...notifPartial }
    }));
  };

  const updateLocation = (locPartial: Partial<LocationPreferences>) => {
    updateSettings(prev => ({
      ...prev,
      location: { ...prev.location, ...locPartial }
    }));
  };

  const toggleDarkMode = (value?: boolean) => {
    updateSettings(prev => {
      const newDark = typeof value === 'boolean' ? value : !prev.darkMode;
      return { ...prev, darkMode: newDark };
    });
  };

  const resetAllData = () => {
    saveSettings(DEFAULT_SETTINGS);
    setSettingsState(DEFAULT_SETTINGS);
    applyTheme(DEFAULT_SETTINGS.darkMode);
  };

  const exportUserData = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(settings, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `SERD_Emergency_Profile_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return {
    settings,
    updateSettings,
    updateProfile,
    updateEmergencyCircle,
    updatePrivacy,
    updateNotifications,
    updateLocation,
    toggleDarkMode,
    resetAllData,
    exportUserData
  };
}
