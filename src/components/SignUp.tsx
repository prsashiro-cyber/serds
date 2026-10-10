import React, { useState } from 'react';
import { 
  ArrowLeft, 
  AlertCircle, 
  Loader2, 
  Check, 
  Plus, 
  Trash2, 
  Eye, 
  EyeOff, 
  ChevronRight,
  User,
  Radio,
  Building,
  Truck,
  Phone,
  Search,
  X,
  Shield,
  Heart
} from 'lucide-react';
import { updateStoredProfile, AllergyItem } from '../lib/userSettings';
import { useAuth } from '../contexts/AuthContext';
import { 
  subscribeToAllergiesCatalog, 
  addAllergyToCatalogInFirestore,
  DEFAULT_SYSTEM_ALLERGENS 
} from '../lib/firebase';

interface SignUpProps {
  onNavigate: (screen: 'login' | 'main' | 'responder') => void;
}

type AccountType = 'citizen' | 'responder';

const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'Unknown'];

const RESPONDER_AGENCIES = [
  { 
    code: 'CDRRMO' as const, 
    name: 'CDRRMO / EMS',
    title: 'Emergency Medical Services',
    unitPlaceholder: 'e.g. Ambulance Unit 04, Medic Van 01',
    desc: 'Medical triage, paramedic field care, patient transport' 
  },
  { 
    code: 'BFP' as const, 
    name: 'BFP Fire',
    title: 'Bureau of Fire Protection',
    unitPlaceholder: 'e.g. Fire Engine 01, Ladder Truck 02',
    desc: 'Fire suppression, search & rescue, hazardous materials' 
  },
  { 
    code: 'PNP' as const, 
    name: 'PNP Police',
    title: 'Philippine National Police',
    unitPlaceholder: 'e.g. Mobile Patrol 07, Cruiser 12',
    desc: 'Law enforcement, scene security, traffic investigation' 
  }
];

const ROLES_BY_AGENCY: Record<string, string[]> = {
  CDRRMO: [
    'ALS Paramedic / Emergency Medical Technician (EMT)',
    'BLS First Responder / Field Medic',
    'Ambulance Driver & Field Paramedic',
    'Triage & Dispatch Officer'
  ],
  BFP: [
    'Firefighter / Search & Rescue Operative',
    'Fire Truck Commander / Apparatus Operator',
    'Hazmat & Technical Rescue Specialist',
    'Emergency Incident Commander'
  ],
  PNP: [
    'Police Patrol Officer / Traffic Investigator',
    'Scene Security & Tactical Officer',
    'Law Enforcement Officer / Field Patrol',
    'Police Substation Commander'
  ]
};

export default function SignUp({ onNavigate }: SignUpProps) {
  const { register } = useAuth();

  // Navigation state
  // Responder: Step 1 (Role) -> Step 2 (Identity & Credentials) -> Step 3 (Unit & Service) -> Step 4 (Verification)
  // Citizen: Step 1 (Role) -> Step 2 (Identity) -> Step 3 (Credentials) -> Step 4 (Medical) -> Step 5 (Allergies) -> Step 6 (Contact & Review)
  const [step, setStep] = useState<number>(1);
  const [accountType, setAccountType] = useState<AccountType>('citizen');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Common identity & credentials
  const [fullName, setFullName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [callSign, setCallSign] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Citizen Medical Profile
  const [dob, setDob] = useState('');
  const [bloodType, setBloodType] = useState('O+');
  const [weightInput, setWeightInput] = useState('');
  const [heightInput, setHeightInput] = useState('');

  // Citizen Allergies
  const [selectedAllergies, setSelectedAllergies] = useState<AllergyItem[]>([]);
  const [noAllergies, setNoAllergies] = useState(false);
  const [customAllergen, setCustomAllergen] = useState('');
  const [customReaction, setCustomReaction] = useState('');
  const [customSeverity, setCustomSeverity] = useState<'Mild' | 'Moderate' | 'Severe'>('Moderate');
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [allergensList, setAllergensList] = useState<string[]>(DEFAULT_SYSTEM_ALLERGENS);
  const [allergenSearchQuery, setAllergenSearchQuery] = useState('');
  const [allergenCategory, setAllergenCategory] = useState<'All' | 'Meds' | 'Food' | 'Environmental'>('All');

  // Citizen Emergency Contact
  const [contactName, setContactName] = useState('');
  const [contactRelation, setContactRelation] = useState('Parent / Guardian');
  const [contactPhone, setContactPhone] = useState('');

  // Responder Details
  const [agency, setAgency] = useState<'BFP' | 'CDRRMO' | 'PNP'>('CDRRMO');
  const [badgeNumber, setBadgeNumber] = useState('');
  const [responderRole, setResponderRole] = useState(ROLES_BY_AGENCY['CDRRMO'][0]);
  const [assignedStation, setAssignedStation] = useState('');
  const [vehicleUnit, setVehicleUnit] = useState('');
  const [dutyShift, setDutyShift] = useState<'Day Shift (08:00 - 20:00)' | 'Night Shift (20:00 - 08:00)' | '24-Hour Duty'>('Day Shift (08:00 - 20:00)');

  const totalSteps = accountType === 'responder' ? 4 : 6;

  // Subscribe to live Firebase allergies catalog
  React.useEffect(() => {
    const unsub = subscribeToAllergiesCatalog((list) => {
      if (list && list.length > 0) {
        setAllergensList(list);
      }
    });
    return () => unsub();
  }, []);

  const handleSelectAgency = (agCode: 'BFP' | 'CDRRMO' | 'PNP') => {
    setAgency(agCode);
    const availableRoles = ROLES_BY_AGENCY[agCode] || [];
    if (availableRoles.length > 0) {
      setResponderRole(availableRoles[0]);
    }
  };

  const handleWeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawDigits = e.target.value.replace(/\D/g, '');
    if (!rawDigits) {
      setWeightInput('');
    } else {
      const num = parseInt(rawDigits, 10);
      if (num <= 500) {
        setWeightInput(`${num} kg`);
      }
    }
  };

  const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawDigits = e.target.value.replace(/\D/g, '');
    if (!rawDigits) {
      setHeightInput('');
    } else {
      const num = parseInt(rawDigits, 10);
      if (num <= 300) {
        setHeightInput(`${num} cm`);
      }
    }
  };

  const parseInteger = (str: string, fallback: number) => {
    const digits = str.replace(/\D/g, '');
    const num = parseInt(digits, 10);
    return isNaN(num) ? fallback : num;
  };

  const getAge = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const bDate = new Date(dateStr);
      const diff = Date.now() - bDate.getTime();
      const ageDate = new Date(diff);
      const age = Math.abs(ageDate.getUTCFullYear() - 1970);
      return !isNaN(age) ? `${age} yrs` : '';
    } catch {
      return '';
    }
  };

  const handleBack = () => {
    setError(null);
    if (step > 1) {
      setStep(step - 1);
    } else {
      onNavigate('login');
    }
  };

  // Responder validation: Step 2 -> Step 3
  const handleResponderCredentialsNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Please provide your full legal name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('Please provide a valid work or personal email address.');
      return;
    }
    if (!password || password.length < 6) {
      setError('Password must contain at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify.');
      return;
    }
    setError(null);
    setStep(3);
  };

  // Responder validation: Step 3 -> Step 4
  const handleResponderUnitNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!badgeNumber.trim()) {
      setError('Please provide your Badge or Personnel ID number.');
      return;
    }
    if (!vehicleUnit.trim()) {
      setError('Please specify your assigned apparatus or vehicle code (e.g. Ambulance 04).');
      return;
    }
    setError(null);
    setStep(4);
  };

  // Citizen validation: Step 2 -> Step 3
  const handleCitizenNameNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Please enter your full legal name.');
      return;
    }
    setError(null);
    setStep(3);
  };

  // Citizen validation: Step 3 -> Step 4
  const handleCitizenCredentialsNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes('@')) {
      setError('Please provide a valid email address.');
      return;
    }
    if (!password || password.length < 6) {
      setError('Password must contain at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setStep(4);
  };

  // Citizen validation: Step 4 -> Step 5
  const handleCitizenMedicalNext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dob) {
      setError('Please select your date of birth.');
      return;
    }
    setError(null);
    setStep(5);
  };

  const toggleAllergen = (allergenName: string) => {
    if (noAllergies) setNoAllergies(false);
    const exists = selectedAllergies.find(a => a.allergen === allergenName);
    if (exists) {
      setSelectedAllergies(prev => prev.filter(a => a.allergen !== allergenName));
    } else {
      setSelectedAllergies(prev => [
        ...prev,
        {
          id: `all-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          allergen: allergenName,
          reaction: 'Monitored reaction',
          severity: 'Moderate'
        }
      ]);
    }
  };

  const handleAddCustomAllergy = () => {
    if (!customAllergen.trim()) return;
    const allergenName = customAllergen.trim();
    setSelectedAllergies(prev => [
      ...prev,
      {
        id: `all-custom-${Date.now()}`,
        allergen: allergenName,
        reaction: customReaction.trim() || 'Monitored reaction',
        severity: customSeverity
      }
    ]);
    addAllergyToCatalogInFirestore(allergenName);
    setCustomAllergen('');
    setCustomReaction('');
    setShowCustomModal(false);
  };

  // Final Registration
  const handleFinalSubmit = async () => {
    setLoading(true);
    setError(null);

    const nameParts = fullName.trim().split(' ');
    const calculatedDisplayName = displayName.trim() || nameParts[0] || (accountType === 'citizen' ? 'Citizen' : 'Responder');

    if (accountType === 'citizen') {
      const finalAllergies = noAllergies ? [] : selectedAllergies;
      const profilePayload = {
        fullName: fullName.trim(),
        displayName: calculatedDisplayName,
        email: email.trim(),
        bloodType,
        birthdate: dob,
        heightCm: parseInteger(heightInput, 175),
        weightKg: parseInteger(weightInput, 70),
        allergies: finalAllergies,
        role: 'citizen' as const,
        emergencyContact: contactName.trim() ? {
          name: contactName.trim(),
          relation: contactRelation.trim() || 'Emergency Contact',
          phone: contactPhone.trim()
        } : {
          name: '',
          relation: '',
          phone: ''
        },
        emergencyCircle: contactName.trim() ? [
          {
            id: `c-prim-${Date.now()}`,
            name: contactName.trim(),
            phone: contactPhone.trim(),
            relation: contactRelation.trim() || 'Emergency Contact',
            isPrimary: true
          }
        ] : [],
        avatarUrl: ''
      };

      try {
        localStorage.removeItem('serd_app_settings');
      } catch {}

      updateStoredProfile(profilePayload);
      const res = await register(email, password, profilePayload);
      setLoading(false);

      if (res.success) {
        onNavigate('main');
      } else {
        setError(res.error || 'Registration failed. Please check your credentials.');
      }
    } else {
      // Responder Registration
      const responderProfile = {
        fullName: fullName.trim(),
        displayName: calculatedDisplayName,
        email: email.trim(),
        role: 'responder' as const,
        agency,
        badgeNumber: badgeNumber.trim(),
        responderRole,
        station: assignedStation.trim() || 'Regional Base / Field Unit',
        vehicleUnit: vehicleUnit.trim(),
        callSign: callSign.trim() || calculatedDisplayName
      };

      updateStoredProfile({
        fullName: responderProfile.fullName,
        displayName: responderProfile.displayName,
        email: responderProfile.email,
        role: 'responder',
        agency: responderProfile.agency,
        badgeNumber: responderProfile.badgeNumber,
        responderRole: responderProfile.responderRole,
        station: responderProfile.station,
        vehicleUnit: responderProfile.vehicleUnit,
        callSign: responderProfile.callSign
      });

      try {
        localStorage.setItem('serd_current_user_role', 'responder');
      } catch {}

      const res = await register(email, password, responderProfile);
      setLoading(false);

      if (res.success) {
        onNavigate('responder');
      } else {
        setError(res.error || 'Responder registration failed.');
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-white font-sans overflow-hidden select-none">
      
      {/* Top Header & Theme Red Step Bar */}
      <header className="pt-5 px-6 pb-3 border-b border-neutral-100 shrink-0">
        <div className="flex items-center justify-between mb-2.5">
          <button 
            type="button"
            onClick={handleBack}
            className="p-1.5 -ml-1.5 text-neutral-600 hover:text-neutral-900 rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          
          <span className="text-xs font-semibold text-neutral-400">
            Step {step} of {totalSteps}
          </span>

          <button 
            type="button"
            onClick={() => onNavigate('login')}
            className="text-xs font-semibold text-[#B41A46] hover:text-[#9a143a] transition-colors cursor-pointer"
          >
            Log In
          </button>
        </div>

        {/* Brand Red Progress Track */}
        <div className="w-full bg-neutral-100 h-1.5 rounded-full overflow-hidden">
          <div 
            className="h-full bg-[#B41A46] transition-all duration-300 ease-out"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
        </div>
      </header>

      {/* Main Form Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-md mx-auto w-full">
        
        {/* Error Alert */}
        {error && (
          <div className="mb-5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <div className="flex-1 font-medium leading-relaxed">
              {error}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 1: MINIMALIST ROLE SELECTION                                         */}
        {/* ========================================================================= */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-bold text-neutral-900 tracking-tight">Create your account</h1>
              <p className="text-xs text-neutral-500 mt-1">
                Select your account type to proceed with registration.
              </p>
            </div>

            <div className="space-y-3">
              {/* Option: Citizen */}
              <button
                type="button"
                onClick={() => setAccountType('citizen')}
                className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${
                  accountType === 'citizen'
                    ? 'border-[#B41A46] bg-rose-50/40 ring-1 ring-[#B41A46]'
                    : 'border-neutral-200 bg-white hover:border-neutral-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className={`text-sm font-semibold ${accountType === 'citizen' ? 'text-[#B41A46]' : 'text-neutral-900'}`}>Citizen</h3>
                    <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                      Emergency SOS assistance, personal medical pass, and live responder dispatch tracking.
                    </p>
                  </div>
                  <span className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                    accountType === 'citizen' ? 'border-[#B41A46] bg-[#B41A46]' : 'border-neutral-300'
                  }`}>
                    {accountType === 'citizen' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                </div>
              </button>

              {/* Option: Responder */}
              <button
                type="button"
                onClick={() => setAccountType('responder')}
                className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${
                  accountType === 'responder'
                    ? 'border-[#B41A46] bg-rose-50/40 ring-1 ring-[#B41A46]'
                    : 'border-neutral-200 bg-white hover:border-neutral-300'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className={`text-sm font-semibold ${accountType === 'responder' ? 'text-[#B41A46]' : 'text-neutral-900'}`}>First Responder</h3>
                    <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                      Field unit dispatch terminal for paramedics, fire rescue crews, and police officers.
                    </p>
                  </div>
                  <span className={`w-4 h-4 rounded-full border mt-0.5 flex items-center justify-center shrink-0 ${
                    accountType === 'responder' ? 'border-[#B41A46] bg-[#B41A46]' : 'border-neutral-300'
                  }`}>
                    {accountType === 'responder' && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                </div>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep(2);
              }}
              className="w-full mt-4 py-3.5 bg-[#B41A46] hover:bg-[#9a143a] text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs active:scale-[0.99]"
            >
              <span>Continue</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* RESPONDER STEP 2: IDENTITY & CREDENTIALS                                  */}
        {/* ========================================================================= */}
        {step === 2 && accountType === 'responder' && (
          <form onSubmit={handleResponderCredentialsNext} className="space-y-4">
            <div>
              <h1 className="text-xl font-bold text-neutral-900 tracking-tight">Responder Account</h1>
              <p className="text-xs text-neutral-500 mt-1">
                Enter your identity, radio call sign, and login credentials.
              </p>
            </div>

            <div className="space-y-3.5 pt-1">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Full Legal Name <span className="text-[#B41A46]">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Officer Alex Santos"
                  className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:border-[#B41A46] focus:ring-1 focus:ring-[#B41A46]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Radio Call Sign / Alias
                </label>
                <input
                  type="text"
                  value={callSign}
                  onChange={(e) => setCallSign(e.target.value)}
                  placeholder="e.g. Medic-04 or Patrol-12"
                  className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-mono font-medium text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:border-[#B41A46] focus:ring-1 focus:ring-[#B41A46]"
                />
                <span className="text-[11px] text-neutral-400 mt-1 block">Displayed on CAD dispatch and citizen communications.</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Email Address <span className="text-[#B41A46]">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@agency.gov.ph or personal email"
                  className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:border-[#B41A46] focus:ring-1 focus:ring-[#B41A46]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    Password <span className="text-[#B41A46]">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min 6 chars"
                      className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:border-[#B41A46] focus:ring-1 focus:ring-[#B41A46]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    Confirm <span className="text-[#B41A46]">*</span>
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat"
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:border-[#B41A46] focus:ring-1 focus:ring-[#B41A46]"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full mt-4 py-3.5 bg-[#B41A46] hover:bg-[#9a143a] text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs active:scale-[0.99]"
            >
              <span>Continue to Unit Assignment</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* ========================================================================= */}
        {/* RESPONDER STEP 3: UNIT & SERVICE DEPLOYMENT                               */}
        {/* ========================================================================= */}
        {step === 3 && accountType === 'responder' && (
          <form onSubmit={handleResponderUnitNext} className="space-y-4">
            <div>
              <h1 className="text-xl font-bold text-neutral-900 tracking-tight">Unit Assignment</h1>
              <p className="text-xs text-neutral-500 mt-1">
                Configure your agency branch, operational role, and vehicle apparatus.
              </p>
            </div>

            <div className="space-y-3.5 pt-1">
              {/* Branch Selector */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Service Branch
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {RESPONDER_AGENCIES.map((ag) => {
                    const isSelected = agency === ag.code;
                    return (
                      <button
                        key={ag.code}
                        type="button"
                        onClick={() => handleSelectAgency(ag.code)}
                        className={`py-2.5 px-2 rounded-xl border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#B41A46] bg-[#B41A46] text-white font-semibold shadow-2xs'
                            : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300'
                        }`}
                      >
                        <span className="block text-xs font-bold">{ag.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Operational Role */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Operational Role
                </label>
                <select
                  value={responderRole}
                  onChange={(e) => setResponderRole(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium text-neutral-900 focus:outline-none focus:bg-white focus:border-[#B41A46] focus:ring-1 focus:ring-[#B41A46] cursor-pointer"
                >
                  {(ROLES_BY_AGENCY[agency] || []).map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* Badge & Unit Code in 2 Columns */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    Badge / ID No. <span className="text-[#B41A46]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={badgeNumber}
                    onChange={(e) => setBadgeNumber(e.target.value)}
                    placeholder="e.g. EMT-882"
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-mono font-medium text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:border-[#B41A46] focus:ring-1 focus:ring-[#B41A46]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    Vehicle Unit Code <span className="text-[#B41A46]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={vehicleUnit}
                    onChange={(e) => setVehicleUnit(e.target.value)}
                    placeholder={
                      agency === 'BFP'
                        ? 'e.g. Engine 01'
                        : agency === 'PNP'
                        ? 'e.g. Patrol 07'
                        : 'e.g. Ambulance 04'
                    }
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-mono font-medium text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:border-[#B41A46] focus:ring-1 focus:ring-[#B41A46]"
                  />
                </div>
              </div>

              {/* Station Location */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Base Station / Substation Location
                </label>
                <input
                  type="text"
                  value={assignedStation}
                  onChange={(e) => setAssignedStation(e.target.value)}
                  placeholder="e.g. Central Station, Substation 4, or District Base"
                  className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:border-[#B41A46] focus:ring-1 focus:ring-[#B41A46]"
                />
              </div>

              {/* Duty Shift */}
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Duty Shift
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Day Shift (08:00 - 20:00)', 'Night Shift (20:00 - 08:00)', '24-Hour Duty'] as const).map((shift) => {
                    const isSelected = dutyShift === shift;
                    const label = shift.startsWith('Day') ? 'Day (08-20)' : shift.startsWith('Night') ? 'Night (20-08)' : '24-Hour';
                    return (
                      <button
                        key={shift}
                        type="button"
                        onClick={() => setDutyShift(shift)}
                        className={`py-2 px-1 rounded-xl border text-center transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#B41A46] bg-[#B41A46] text-white font-semibold shadow-2xs'
                            : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300'
                        }`}
                      >
                        <span className="block text-xs">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full mt-4 py-3.5 bg-[#B41A46] hover:bg-[#9a143a] text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs active:scale-[0.99]"
            >
              <span>Review & Confirm</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* ========================================================================= */}
        {/* RESPONDER STEP 4: VERIFICATION & ACTIVATION                               */}
        {/* ========================================================================= */}
        {step === 4 && accountType === 'responder' && (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-bold text-neutral-900 tracking-tight">Confirm Registration</h1>
              <p className="text-xs text-neutral-500 mt-1">
                Verify your responder credentials before deploying to the field network.
              </p>
            </div>

            <div className="border border-neutral-200 rounded-xl divide-y divide-neutral-100 overflow-hidden text-xs">
              <div className="p-3.5 flex justify-between bg-neutral-50/50">
                <span className="text-neutral-500">Officer Name</span>
                <span className="font-semibold text-neutral-900">{fullName}</span>
              </div>
              <div className="p-3.5 flex justify-between">
                <span className="text-neutral-500">Radio Call Sign</span>
                <span className="font-mono font-semibold text-[#B41A46]">{callSign || fullName.split(' ')[0]}</span>
              </div>
              <div className="p-3.5 flex justify-between bg-neutral-50/50">
                <span className="text-neutral-500">Service Branch</span>
                <span className="font-semibold text-neutral-900">
                  {RESPONDER_AGENCIES.find(a => a.code === agency)?.name}
                </span>
              </div>
              <div className="p-3.5 flex justify-between">
                <span className="text-neutral-500">Assigned Unit</span>
                <span className="font-mono font-semibold text-[#B41A46]">{vehicleUnit}</span>
              </div>
              <div className="p-3.5 flex justify-between bg-neutral-50/50">
                <span className="text-neutral-500">Badge / ID</span>
                <span className="font-mono font-semibold text-neutral-900">{badgeNumber}</span>
              </div>
              <div className="p-3.5 flex justify-between">
                <span className="text-neutral-500">Base Station</span>
                <span className="font-semibold text-neutral-900 truncate max-w-[200px]">
                  {assignedStation.trim() || 'Regional Base / Field Unit'}
                </span>
              </div>
              <div className="p-3.5 flex justify-between bg-neutral-50/50">
                <span className="text-neutral-500">Login Email</span>
                <span className="font-semibold text-neutral-900">{email}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={handleFinalSubmit}
              className="w-full mt-4 py-3.5 bg-[#B41A46] hover:bg-[#9a143a] text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 shadow-xs active:scale-[0.99]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Activating Terminal...</span>
                </>
              ) : (
                <span>Activate Responder Terminal</span>
              )}
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CITIZEN STEP 2: NAME                                                      */}
        {/* ========================================================================= */}
        {step === 2 && accountType === 'citizen' && (
          <form onSubmit={handleCitizenNameNext} className="space-y-4">
            <div>
              <h1 className="text-xl font-bold text-neutral-900 tracking-tight">Your Name</h1>
              <p className="text-xs text-neutral-500 mt-1">
                Enter your real legal name for responder medical triage and identification.
              </p>
            </div>

            <div className="space-y-3.5 pt-1">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Full Legal Name <span className="text-[#B41A46]">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Maria dela Cruz"
                  className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:border-[#B41A46] focus:ring-1 focus:ring-[#B41A46]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Preferred First Name (Optional)
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Maria"
                  className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:border-[#B41A46] focus:ring-1 focus:ring-[#B41A46]"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full mt-4 py-3.5 bg-[#B41A46] hover:bg-[#9a143a] text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs active:scale-[0.99]"
            >
              <span>Next: Login Credentials</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* ========================================================================= */}
        {/* CITIZEN STEP 3: ACCOUNT CREDENTIALS                                       */}
        {/* ========================================================================= */}
        {step === 3 && accountType === 'citizen' && (
          <form onSubmit={handleCitizenCredentialsNext} className="space-y-4">
            <div>
              <h1 className="text-xl font-bold text-neutral-900 tracking-tight">Account Credentials</h1>
              <p className="text-xs text-neutral-500 mt-1">
                Set up your email and password to access your account.
              </p>
            </div>

            <div className="space-y-3.5 pt-1">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Email Address <span className="text-[#B41A46]">*</span>
                </label>
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:border-[#B41A46] focus:ring-1 focus:ring-[#B41A46]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    Password <span className="text-[#B41A46]">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min 6 chars"
                      className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:border-[#B41A46] focus:ring-1 focus:ring-[#B41A46]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    Confirm <span className="text-[#B41A46]">*</span>
                  </label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat"
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:border-[#B41A46] focus:ring-1 focus:ring-[#B41A46]"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full mt-4 py-3.5 bg-[#B41A46] hover:bg-[#9a143a] text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs active:scale-[0.99]"
            >
              <span>Next: Medical Profile</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* ========================================================================= */}
        {/* CITIZEN STEP 4: MEDICAL PROFILE                                           */}
        {/* ========================================================================= */}
        {step === 4 && accountType === 'citizen' && (
          <form onSubmit={handleCitizenMedicalNext} className="space-y-4">
            <div>
              <h1 className="text-xl font-bold text-neutral-900 tracking-tight">Medical Profile</h1>
              <p className="text-xs text-neutral-500 mt-1">
                Critical medical details transmitted securely to responding paramedics during 911 calls.
              </p>
            </div>

            <div className="space-y-3.5 pt-1">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Date of Birth <span className="text-[#B41A46]">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium text-neutral-900 focus:outline-none focus:bg-white focus:border-[#B41A46] focus:ring-1 focus:ring-[#B41A46]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Blood Type
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {BLOOD_TYPES.map((bt) => {
                    const isSelected = bloodType === bt;
                    return (
                      <button
                        key={bt}
                        type="button"
                        onClick={() => setBloodType(bt)}
                        className={`py-2 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                          isSelected
                            ? 'border-[#B41A46] bg-[#B41A46] text-white shadow-2xs'
                            : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300'
                        }`}
                      >
                        {bt}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    Weight (kg)
                  </label>
                  <input
                    type="text"
                    value={weightInput}
                    onChange={handleWeightChange}
                    placeholder="e.g. 68 kg"
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium text-neutral-900 focus:outline-none focus:bg-white focus:border-[#B41A46] focus:ring-1 focus:ring-[#B41A46]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    Height (cm)
                  </label>
                  <input
                    type="text"
                    value={heightInput}
                    onChange={handleHeightChange}
                    placeholder="e.g. 170 cm"
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium text-neutral-900 focus:outline-none focus:bg-white focus:border-[#B41A46] focus:ring-1 focus:ring-[#B41A46]"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="w-full mt-4 py-3.5 bg-[#B41A46] hover:bg-[#9a143a] text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs active:scale-[0.99]"
            >
              <span>Next: Allergies & Medications</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* ========================================================================= */}
        {/* CITIZEN STEP 5: ALLERGIES                                                 */}
        {/* ========================================================================= */}
        {step === 5 && accountType === 'citizen' && (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-bold text-neutral-900 tracking-tight">Known Allergies</h1>
              <p className="text-xs text-neutral-500 mt-1">
                Select any known drug, food, or environmental allergies.
              </p>
            </div>

            <div className="space-y-3 pt-1">
              {/* No Allergies Checkbox */}
              <button
                type="button"
                onClick={() => {
                  setNoAllergies(!noAllergies);
                  if (!noAllergies) setSelectedAllergies([]);
                }}
                className={`w-full p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between text-xs font-medium ${
                  noAllergies
                    ? 'border-[#B41A46] bg-rose-50/40 text-[#B41A46] font-semibold'
                    : 'border-neutral-200 bg-white text-neutral-600'
                }`}
              >
                <span>No known allergies (NKA)</span>
                <span className={`w-4 h-4 rounded border flex items-center justify-center ${
                  noAllergies ? 'bg-[#B41A46] border-[#B41A46] text-white' : 'border-neutral-300'
                }`}>
                  {noAllergies && <Check className="w-3 h-3" />}
                </span>
              </button>

              {!noAllergies && (
                <>
                  <input
                    type="text"
                    value={allergenSearchQuery}
                    onChange={(e) => setAllergenSearchQuery(e.target.value)}
                    placeholder="Search allergies (e.g. Penicillin, Peanuts)..."
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:bg-white focus:border-[#B41A46] focus:ring-1 focus:ring-[#B41A46]"
                  />

                  <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-0.5">
                    {allergensList
                      .filter(a => a.toLowerCase().includes(allergenSearchQuery.toLowerCase()))
                      .map((allergen) => {
                        const isSelected = selectedAllergies.some(a => a.allergen === allergen);
                        return (
                          <button
                            key={allergen}
                            type="button"
                            onClick={() => toggleAllergen(allergen)}
                            className={`p-2 rounded-lg border text-left text-xs font-medium transition-all cursor-pointer flex items-center justify-between ${
                              isSelected
                                ? 'bg-[#B41A46] text-white border-[#B41A46]'
                                : 'bg-white border-neutral-200 text-neutral-700 hover:border-neutral-300'
                            }`}
                          >
                            <span className="truncate pr-1 text-[11px]">{allergen}</span>
                            {isSelected ? <Check className="w-3 h-3 shrink-0" /> : <Plus className="w-3 h-3 shrink-0 text-neutral-400" />}
                          </button>
                        );
                      })}
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowCustomModal(true)}
                    className="w-full py-2.5 border border-dashed border-neutral-300 hover:border-[#B41A46] rounded-xl text-xs font-medium text-neutral-600 hover:text-[#B41A46] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Custom Allergy</span>
                  </button>
                </>
              )}
            </div>

            {/* Custom Allergy Modal */}
            {showCustomModal && (
              <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl border border-neutral-200 w-full max-w-sm p-5 space-y-3.5">
                  <div className="flex items-center justify-between border-b border-neutral-100 pb-2.5">
                    <h3 className="font-semibold text-sm text-neutral-900">Custom Allergy</h3>
                    <button 
                      type="button"
                      onClick={() => setShowCustomModal(false)}
                      className="text-neutral-400 hover:text-neutral-600 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Substance / Drug Name
                    </label>
                    <input
                      type="text"
                      autoFocus
                      value={customAllergen}
                      onChange={(e) => setCustomAllergen(e.target.value)}
                      placeholder="e.g. Ciprofloxacin"
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:outline-none focus:border-[#B41A46] focus:ring-1 focus:ring-[#B41A46]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-700 mb-1">
                      Reaction
                    </label>
                    <input
                      type="text"
                      value={customReaction}
                      onChange={(e) => setCustomReaction(e.target.value)}
                      placeholder="e.g. Facial swelling, hives"
                      className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-xl text-xs font-medium focus:outline-none focus:border-[#B41A46] focus:ring-1 focus:ring-[#B41A46]"
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowCustomModal(false)}
                      className="flex-1 py-2 bg-neutral-100 text-neutral-700 text-xs font-medium rounded-xl hover:bg-neutral-200 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!customAllergen.trim()}
                      onClick={handleAddCustomAllergy}
                      className="flex-1 py-2 bg-[#B41A46] hover:bg-[#9a143a] text-white text-xs font-medium rounded-xl disabled:opacity-50 cursor-pointer"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep(6);
              }}
              className="w-full mt-4 py-3.5 bg-[#B41A46] hover:bg-[#9a143a] text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs active:scale-[0.99]"
            >
              <span>Next: Emergency Contact</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ========================================================================= */}
        {/* CITIZEN STEP 6: EMERGENCY CONTACT & REVIEW                                */}
        {/* ========================================================================= */}
        {step === 6 && accountType === 'citizen' && (
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-bold text-neutral-900 tracking-tight">Emergency Contact</h1>
              <p className="text-xs text-neutral-500 mt-1">
                Add an emergency contact who will be notified during SOS activations.
              </p>
            </div>

            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                  Contact Full Name
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="e.g. Juan dela Cruz"
                  className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium text-neutral-900 focus:outline-none focus:bg-white focus:border-[#B41A46] focus:ring-1 focus:ring-[#B41A46]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    Relationship
                  </label>
                  <input
                    type="text"
                    value={contactRelation}
                    onChange={(e) => setContactRelation(e.target.value)}
                    placeholder="e.g. Spouse"
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-medium text-neutral-900 focus:outline-none focus:bg-white focus:border-[#B41A46] focus:ring-1 focus:ring-[#B41A46]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+63 917 555 0144"
                    className="w-full px-3.5 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl text-sm font-mono font-medium text-neutral-900 focus:outline-none focus:bg-white focus:border-[#B41A46] focus:ring-1 focus:ring-[#B41A46]"
                  />
                </div>
              </div>

              {/* Review summary */}
              <div className="mt-3 border border-neutral-200 rounded-xl p-3.5 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Name</span>
                  <span className="font-semibold text-neutral-900">{fullName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Email</span>
                  <span className="font-semibold text-neutral-900">{email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Blood & Age</span>
                  <span className="font-semibold text-[#B41A46]">{bloodType} • {getAge(dob)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">Allergies</span>
                  <span className="font-semibold text-neutral-900">
                    {noAllergies ? 'None reported' : `${selectedAllergies.length} recorded`}
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={handleFinalSubmit}
              className="w-full mt-4 py-3.5 bg-[#B41A46] hover:bg-[#9a143a] text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 shadow-xs active:scale-[0.99]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creating Account...</span>
                </>
              ) : (
                <span>Complete Registration</span>
              )}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
