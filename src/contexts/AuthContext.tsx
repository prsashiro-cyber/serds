import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  auth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as firebaseSignOut, 
  onAuthStateChanged,
  signInAnonymously,
  syncUserProfileToFirestore,
  fetchUserProfileFromFirestore,
  User,
  FirestoreUserProfile
} from '../lib/firebase';
import { updateStoredProfile, saveSettings, DEFAULT_SETTINGS } from '../lib/userSettings';

interface AuthContextType {
  currentUser: User | null;
  userProfile: FirestoreUserProfile | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<{ success: boolean; profile?: FirestoreUserProfile | null; error?: string }>;
  register: (email: string, pass: string, profileData: Partial<FirestoreUserProfile>) => Promise<{ success: boolean; profile?: FirestoreUserProfile | null; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<FirestoreUserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!isMounted) return;
      setCurrentUser(user);

      if (user) {
        try {
          // Instant cache recovery so responder role is not lost during async reads
          try {
            const cached = localStorage.getItem(`serd_user_profile_${user.uid}`);
            if (cached) {
              const parsed = JSON.parse(cached);
              if (parsed && isMounted) {
                setUserProfile(parsed);
              }
            }
          } catch {}

          // Fetch or hydrate user profile from Firestore
          const profile = await fetchUserProfileFromFirestore(user.uid);
          if (profile && isMounted) {
            setUserProfile(profile);
            try {
              localStorage.setItem(`serd_user_profile_${user.uid}`, JSON.stringify(profile));
              if (profile.role) localStorage.setItem('serd_current_user_role', profile.role);
            } catch {}

            // Sync with local state safely
            updateStoredProfile({
              fullName: profile.fullName || user.displayName || (user.email ? user.email.split('@')[0] : 'Citizen'),
              displayName: profile.displayName || user.displayName || (user.email ? user.email.split('@')[0] : 'Citizen'),
              email: profile.email || user.email || '',
              bloodType: profile.bloodType || 'O+',
              birthdate: profile.birthdate || '1998-01-01',
              heightCm: profile.heightCm || 175,
              weightKg: profile.weightKg || 70,
              emergencyContact: profile.emergencyContact || { name: '', relation: '', phone: '' },
              emergencyCircle: Array.isArray(profile.emergencyCircle) ? profile.emergencyCircle : [],
              avatarUrl: profile.avatarUrl || '',
              role: profile.role || 'citizen',
              agency: profile.agency,
              badgeNumber: profile.badgeNumber,
              responderRole: profile.responderRole,
              station: profile.station,
              vehicleUnit: profile.vehicleUnit,
              callSign: profile.callSign
            });
          }
        } catch (err) {
          console.warn('[AuthContext] Firestore profile fetch notice:', err);
        }
      } else {
        if (isMounted) setUserProfile(null);
      }

      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const login = async (email: string, pass: string): Promise<{ success: boolean; profile?: FirestoreUserProfile | null; error?: string }> => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), pass);
      
      let profile: FirestoreUserProfile | null = null;
      try {
        const cached = localStorage.getItem(`serd_user_profile_${cred.user.uid}`);
        if (cached) profile = JSON.parse(cached);
      } catch {}

      try {
        const remoteProfile = await fetchUserProfileFromFirestore(cred.user.uid);
        if (remoteProfile) {
          profile = remoteProfile;
          try {
            localStorage.setItem(`serd_user_profile_${cred.user.uid}`, JSON.stringify(remoteProfile));
            if (remoteProfile.role) localStorage.setItem('serd_current_user_role', remoteProfile.role);
          } catch {}
        }
      } catch (err) {
        console.warn('[AuthContext] Firestore profile fetch notice:', err);
      }

      if (profile) {
        setUserProfile(profile);
        updateStoredProfile({
          fullName: profile.fullName || cred.user.displayName || (cred.user.email ? cred.user.email.split('@')[0] : 'Citizen'),
          displayName: profile.displayName || cred.user.displayName || (cred.user.email ? cred.user.email.split('@')[0] : 'Citizen'),
          email: profile.email || cred.user.email || '',
          bloodType: profile.bloodType || 'O+',
          birthdate: profile.birthdate || '1998-01-01',
          heightCm: profile.heightCm || 175,
          weightKg: profile.weightKg || 70,
          emergencyContact: profile.emergencyContact || { name: '', relation: '', phone: '' },
          emergencyCircle: Array.isArray(profile.emergencyCircle) ? profile.emergencyCircle : [],
          avatarUrl: profile.avatarUrl || ''
        });
      }
      return { success: true, profile };
    } catch (err: any) {
      console.warn('[Firebase Auth] Login error:', err.code, err.message);
      let errorMsg = 'Failed to sign in. Please verify your credentials.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errorMsg = 'Invalid email or password.';
      } else if (err.code === 'auth/operation-not-allowed') {
        errorMsg = 'Email/Password sign-in is not enabled in Firebase Console. Please verify Authentication settings.';
      }
      return { success: false, error: errorMsg };
    }
  };

  const register = async (email: string, pass: string, profileData: Partial<FirestoreUserProfile>): Promise<{ success: boolean; profile?: FirestoreUserProfile | null; error?: string }> => {
    try {
      // Pre-cache chosen role synchronously before triggering any auth state listeners
      if (profileData.role) {
        try {
          localStorage.setItem('serd_current_user_role', profileData.role);
        } catch {}
      }

      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);
      const newProfile: FirestoreUserProfile = {
        uid: cred.user.uid,
        email: email.trim(),
        fullName: profileData.fullName || 'Registered Citizen',
        displayName: profileData.displayName || profileData.fullName?.split(' ')[0] || 'Citizen',
        bloodType: profileData.bloodType || 'O+',
        birthdate: profileData.birthdate || '1995-01-01',
        heightCm: profileData.heightCm || 175,
        weightKg: profileData.weightKg || 70,
        allergies: profileData.allergies || [],
        role: profileData.role || 'citizen',
        ...(profileData.emergencyContact ? { emergencyContact: profileData.emergencyContact } : {}),
        ...(Array.isArray(profileData.emergencyCircle) ? { emergencyCircle: profileData.emergencyCircle } : {}),
        ...(profileData.agency ? { agency: profileData.agency } : {}),
        ...(profileData.badgeNumber ? { badgeNumber: profileData.badgeNumber } : {}),
        ...(profileData.responderRole ? { responderRole: profileData.responderRole } : {}),
        ...(profileData.station ? { station: profileData.station } : {}),
        ...(profileData.vehicleUnit ? { vehicleUnit: profileData.vehicleUnit } : {}),
        ...(profileData.callSign ? { callSign: profileData.callSign } : {}),
        avatarUrl: profileData.avatarUrl || ''
      };

      try {
        localStorage.setItem(`serd_user_profile_${cred.user.uid}`, JSON.stringify(newProfile));
        localStorage.setItem('serd_current_user_role', newProfile.role);
      } catch {}

      setUserProfile(newProfile);
      await syncUserProfileToFirestore(newProfile);

      return { success: true, profile: newProfile };
    } catch (err: any) {
      console.warn('[Firebase Auth] Register error:', err.code, err.message);
      let errorMsg = 'Registration failed. Please try again.';
      if (err.code === 'auth/email-already-in-use') {
        errorMsg = 'This email address is already in use.';
      } else if (err.code === 'auth/weak-password') {
        errorMsg = 'Password should be at least 6 characters.';
      } else if (err.code === 'auth/operation-not-allowed') {
        errorMsg = 'Account registration via password is not enabled. Please verify Authentication settings.';
      }
      return { success: false, error: errorMsg };
    }
  };

  const logout = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (err) {
      console.warn('[Firebase Auth] Sign out error:', err);
    }
    setCurrentUser(null);
    setUserProfile(null);
    try {
      localStorage.removeItem('serd_current_user_role');
      localStorage.removeItem('serd_app_settings');
      sessionStorage.removeItem('serd_real_user_location');
      localStorage.removeItem('serd_real_user_location');
      saveSettings(DEFAULT_SETTINGS);
    } catch {}
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        loading,
        login,
        register,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
