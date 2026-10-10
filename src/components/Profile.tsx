import React, { useState, useEffect, useRef } from 'react';
import { Screen } from '../types';
import { useUserSettings, calculateProfileCompletion, AllergyItem } from '../lib/userSettings';
import { useAuth } from '../contexts/AuthContext';
import { 
  syncUserProfileToFirestore, 
  subscribeToAllergiesCatalog, 
  addAllergyToCatalogInFirestore,
  DEFAULT_SYSTEM_ALLERGENS 
} from '../lib/firebase';
import { 
  User as UserIcon, 
  ChevronRight, 
  X, 
  PhoneCall, 
  Shield, 
  Copy, 
  Check, 
  LogOut, 
  Camera, 
  Upload, 
  RotateCw, 
  ZoomIn, 
  ZoomOut, 
  AlertCircle, 
  Edit3, 
  Trash2,
  Calendar,
  Heart,
  Plus,
  Search
} from 'lucide-react';

interface ProfileProps {
  onNavigate?: (screen: Screen | any) => void;
}

const BLOOD_TYPES = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'Unknown'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

// ============================================================================
// IMAGE CROPPER MODAL COMPONENT
// ============================================================================
interface ImageCropperModalProps {
  imageSrc: string;
  onApplyCrop: (croppedBase64: string) => void;
  onCancel: () => void;
}

function ImageCropperModal({ imageSrc, onApplyCrop, onCancel }: ImageCropperModalProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement | null>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      dragStartRef.current = {
        x: e.touches[0].clientX - offset.x,
        y: e.touches[0].clientY - offset.y
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    setOffset({
      x: e.touches[0].clientX - dragStartRef.current.x,
      y: e.touches[0].clientY - dragStartRef.current.y
    });
  };

  const handleTouchEnd = () => setIsDragging(false);

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const handleZoomChange = (newZoom: number) => {
    setZoom(Math.max(1, Math.min(3, newZoom)));
  };

  const handleSaveCrop = () => {
    if (!imgRef.current) return;
    const img = imgRef.current;
    const canvas = document.createElement('canvas');
    const CROP_SIZE = 360;
    canvas.width = CROP_SIZE;
    canvas.height = CROP_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    // Move to canvas center
    ctx.translate(CROP_SIZE / 2, CROP_SIZE / 2);
    ctx.rotate((rotation * Math.PI) / 180);

    // Viewport box is 260px in UI
    const scaleFactor = CROP_SIZE / 260;
    const renderScale = zoom * scaleFactor;

    // Apply offset rotated back
    let rotatedOffsetX = offset.x * scaleFactor;
    let rotatedOffsetY = offset.y * scaleFactor;

    if (rotation === 90) {
      const temp = rotatedOffsetX;
      rotatedOffsetX = rotatedOffsetY;
      rotatedOffsetY = -temp;
    } else if (rotation === 180) {
      rotatedOffsetX = -rotatedOffsetX;
      rotatedOffsetY = -rotatedOffsetY;
    } else if (rotation === 270) {
      const temp = rotatedOffsetX;
      rotatedOffsetX = -rotatedOffsetY;
      rotatedOffsetY = temp;
    }

    ctx.translate(rotatedOffsetX, rotatedOffsetY);

    // Calculate base draw dimensions
    const imgAspect = img.naturalWidth / img.naturalHeight;
    let drawWidth = CROP_SIZE * renderScale;
    let drawHeight = CROP_SIZE * renderScale;

    if (imgAspect > 1) {
      drawWidth = CROP_SIZE * imgAspect * renderScale;
    } else {
      drawHeight = (CROP_SIZE / imgAspect) * renderScale;
    }

    ctx.drawImage(
      img,
      -drawWidth / 2,
      -drawHeight / 2,
      drawWidth,
      drawHeight
    );

    ctx.restore();

    const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    onApplyCrop(croppedDataUrl);
  };

  return (
    <div className="fixed inset-0 z-60 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 select-none">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-sm overflow-hidden text-white flex flex-col shadow-2xl animate-[fade-in_0.15s_ease-out]">
        
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between border-b border-neutral-800">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-[#B41A46]" />
            <h3 className="font-semibold text-sm">Crop Profile Photo</h3>
          </div>
          <button 
            onClick={onCancel}
            className="text-neutral-400 hover:text-white p-1 rounded-full hover:bg-neutral-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Interactive Crop Viewport */}
        <div className="p-6 flex flex-col items-center">
          <div 
            className="relative w-64 h-64 rounded-full overflow-hidden bg-black border-2 border-[#B41A46] shadow-inner cursor-grab active:cursor-grabbing touch-none flex items-center justify-center"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* Guide Grid overlay */}
            <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 border border-white/20 z-10 opacity-30">
              <div className="border-r border-b border-white/20"></div>
              <div className="border-r border-b border-white/20"></div>
              <div className="border-b border-white/20"></div>
              <div className="border-r border-b border-white/20"></div>
              <div className="border-r border-b border-white/20"></div>
              <div className="border-b border-white/20"></div>
              <div className="border-r border-white/20"></div>
              <div className="border-r border-white/20"></div>
              <div></div>
            </div>

            <img
              ref={imgRef}
              src={imageSrc}
              alt="Crop target"
              draggable={false}
              className="max-w-none select-none transition-transform duration-75 pointer-events-none"
              style={{
                transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${zoom})`,
                minWidth: '100%',
                minHeight: '100%'
              }}
            />
          </div>

          <p className="text-[11px] text-neutral-400 mt-3 text-center">
            Drag photo to reposition inside the circle
          </p>

          {/* Controls: Zoom & Rotate */}
          <div className="w-full mt-4 space-y-3 px-2">
            <div className="flex items-center gap-3">
              <button 
                type="button"
                onClick={() => handleZoomChange(zoom - 0.2)}
                className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
                aria-label="Zoom out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              
              <input
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={zoom}
                onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                className="flex-1 accent-[#B41A46] cursor-pointer"
              />

              <button 
                type="button"
                onClick={() => handleZoomChange(zoom + 0.2)}
                className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
                aria-label="Zoom in"
              >
                <ZoomIn className="w-4 h-4" />
              </button>

              <button 
                type="button"
                onClick={handleRotate}
                className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 ml-1"
                title="Rotate 90 degrees"
                aria-label="Rotate 90 degrees"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 bg-neutral-950 border-t border-neutral-800 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 px-3 rounded-xl border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-semibold transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveCrop}
            className="flex-1 py-2.5 px-3 rounded-xl bg-[#B41A46] hover:bg-[#9a143a] text-white text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 shadow-sm"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Apply Crop</span>
          </button>
        </div>

      </div>
    </div>
  );
}

// ============================================================================
// MAIN PROFILE COMPONENT
// ============================================================================
export default function Profile({ onNavigate }: ProfileProps) {
  const { settings, updateProfile } = useUserSettings();
  const { logout, currentUser, userProfile } = useAuth();
  const { profile, location, darkMode } = settings;

  // View state
  const [showMedicalId, setShowMedicalId] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);
  const [saveSuccessToast, setSaveSuccessToast] = useState(false);

  // Edit Form Fields
  const [formFullName, setFormFullName] = useState(profile.fullName || '');
  const [formDisplayName, setFormDisplayName] = useState(profile.displayName || '');
  const [formPhone, setFormPhone] = useState(profile.phone || '');
  const [formBirthdate, setFormBirthdate] = useState(profile.birthdate || '1994-04-01');
  const [formBloodType, setFormBloodType] = useState(profile.bloodType || 'O+');
  const [formHeight, setFormHeight] = useState<number>(profile.heightCm || 180);
  const [formWeight, setFormWeight] = useState<number>(profile.weightKg || 72);
  const [formCity, setFormCity] = useState(profile.city || '');
  const [formAddress, setFormAddress] = useState(profile.address || '');
  
  // Emergency Contact in Edit
  const [formContactName, setFormContactName] = useState(profile.emergencyContact?.name || '');
  const [formContactRelation, setFormContactRelation] = useState(profile.emergencyContact?.relation || '');
  const [formContactPhone, setFormContactPhone] = useState(profile.emergencyContact?.phone || '');

  const effectiveAvatarUrl = userProfile?.avatarUrl !== undefined ? (userProfile.avatarUrl || '') : (profile.avatarUrl || '');

  // Photo & Cropper State
  const [avatarPreview, setAvatarPreview] = useState<string>(effectiveAvatarUrl);
  const [cropperRawSrc, setCropperRawSrc] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Dedicated Allergies & Reactions Modal State
  const [showAllergiesModal, setShowAllergiesModal] = useState(false);
  const [allergiesDraft, setAllergiesDraft] = useState<AllergyItem[]>(profile.allergies || []);
  const [allergySearchQuery, setAllergySearchQuery] = useState('');
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<'All' | 'Meds' | 'Food' | 'Environmental'>('All');
  const [firebaseAllergensList, setFirebaseAllergensList] = useState<string[]>(DEFAULT_SYSTEM_ALLERGENS);
  const [showAddCustomAllergy, setShowAddCustomAllergy] = useState(false);
  const [newCustomAllergen, setNewCustomAllergen] = useState('');
  const [newCustomReaction, setNewCustomReaction] = useState('');
  const [newCustomSeverity, setNewCustomSeverity] = useState<'Mild' | 'Moderate' | 'Severe'>('Moderate');

  // Real-time subscription to Firebase allergies_catalog collection
  useEffect(() => {
    const unsub = subscribeToAllergiesCatalog((list) => {
      if (list && list.length > 0) {
        setFirebaseAllergensList(list);
      }
    });
    return () => unsub();
  }, []);

  // Sync draft when allergies modal opens
  useEffect(() => {
    if (showAllergiesModal) {
      setAllergiesDraft(Array.isArray(profile.allergies) ? JSON.parse(JSON.stringify(profile.allergies)) : []);
      setAllergySearchQuery('');
      setShowAddCustomAllergy(false);
      setNewCustomAllergen('');
      setNewCustomReaction('');
      setNewCustomSeverity('Moderate');
    }
  }, [showAllergiesModal, profile.allergies]);

  // Sync general form state when Edit Profile modal opens
  useEffect(() => {
    if (isEditModalOpen) {
      setFormFullName(profile.fullName || '');
      setFormDisplayName(profile.displayName || '');
      setFormPhone(profile.phone || '');
      setFormBirthdate(profile.birthdate || '1994-04-01');
      setFormBloodType(profile.bloodType || 'O+');
      setFormHeight(profile.heightCm || 180);
      setFormWeight(profile.weightKg || 72);
      setFormCity(profile.city || '');
      setFormAddress(profile.address || '');
      setFormContactName(profile.emergencyContact?.name || '');
      setFormContactRelation(profile.emergencyContact?.relation || '');
      setFormContactPhone(profile.emergencyContact?.phone || '');
      setAvatarPreview(effectiveAvatarUrl);
      setPhotoError(null);
    }
  }, [isEditModalOpen, profile, effectiveAvatarUrl]);

  // Safe data fallbacks to prevent undefined access crashes
  const allergies = Array.isArray(profile?.allergies) ? profile.allergies : [];
  const chronicConditions = Array.isArray(profile?.chronicConditions) 
    ? profile.chronicConditions 
    : (profile?.chronicConditions ? [String(profile.chronicConditions)] : ['None Reported']);
  const emergencyContact = profile?.emergencyContact || {
    name: '',
    relation: '',
    phone: ''
  };
  const hasEmergencyContact = Boolean(emergencyContact.name?.trim());

  const completionPct = typeof profile?.profileCompletionPct === 'number' 
    ? profile.profileCompletionPct 
    : calculateProfileCompletion(profile || {});
  const strokeOffset = 138.23 * (1 - completionPct / 100);

  // Calculate age from birthdate
  const calculateAge = (birthdateStr?: string) => {
    if (!birthdateStr) return 27;
    try {
      const birth = new Date(birthdateStr);
      const now = new Date();
      let age = now.getFullYear() - birth.getFullYear();
      const m = now.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
        age--;
      }
      return isNaN(age) ? 27 : age;
    } catch {
      return 27;
    }
  };

  const age = calculateAge(profile?.birthdate);

  // Escape key closes modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowMedicalId(false);
        setIsEditModalOpen(false);
        setShowAllergiesModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Handle Photo File Selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhotoError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Check Max file size (5MB)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setPhotoError('Selected photo exceeds 5MB limit. Please choose a smaller image.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Check supported types
    if (!file.type.startsWith('image/')) {
      setPhotoError('Please upload a valid image file (JPEG, PNG, or WebP).');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setCropperRawSrc(result);
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Crop applied
  const handleCropComplete = (croppedBase64: string) => {
    setAvatarPreview(croppedBase64);
    setCropperRawSrc(null);
  };

  // Remove Photo
  const handleRemovePhoto = () => {
    setAvatarPreview('');
    setPhotoError(null);
  };

  // Save Profile Changes
  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();

    const updatedProfileData = {
      fullName: formFullName.trim(),
      displayName: formDisplayName.trim() || formFullName.trim().split(' ')[0] || 'Citizen',
      phone: formPhone.trim(),
      birthdate: formBirthdate,
      bloodType: formBloodType,
      heightCm: Number(formHeight) || 175,
      weightKg: Number(formWeight) || 70,
      city: formCity.trim(),
      address: formAddress.trim(),
      avatarUrl: avatarPreview,
      allergies: profile.allergies || [],
      emergencyContact: formContactName.trim() ? {
        name: formContactName.trim(),
        relation: formContactRelation.trim() || 'Primary Contact',
        phone: formContactPhone.trim()
      } : {
        name: '',
        relation: '',
        phone: ''
      }
    };

    // Update locally
    updateProfile(updatedProfileData);

    // Sync to Firestore if signed in
    if (currentUser?.uid) {
      syncUserProfileToFirestore({
        uid: currentUser.uid,
        email: currentUser.email || profile.email,
        ...updatedProfileData,
        updatedAt: new Date().toISOString()
      }).catch(err => console.warn('[Profile] Firestore sync notice:', err));
    }

    setIsEditModalOpen(false);
    setSaveSuccessToast(true);
    setTimeout(() => setSaveSuccessToast(false), 3000);
  };

  // Dedicated Allergies Modal Save & Sync
  const handleSaveAllergiesModal = () => {
    updateProfile({ allergies: allergiesDraft });
    if (currentUser?.uid) {
      syncUserProfileToFirestore({
        uid: currentUser.uid,
        email: currentUser.email || profile.email,
        ...profile,
        allergies: allergiesDraft,
        updatedAt: new Date().toISOString()
      }).catch(err => console.warn('[Profile] Firestore sync notice:', err));
    }
    setShowAllergiesModal(false);
    setSaveSuccessToast(true);
    setTimeout(() => setSaveSuccessToast(false), 3000);
  };

  // Toggle draft allergy selection
  const handleToggleDraftAllergy = (allergenName: string) => {
    const existingIndex = allergiesDraft.findIndex(a => a.allergen.toLowerCase() === allergenName.toLowerCase());
    if (existingIndex >= 0) {
      setAllergiesDraft(prev => prev.filter((_, idx) => idx !== existingIndex));
    } else {
      const newItem: AllergyItem = {
        id: `all-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        allergen: allergenName,
        reaction: 'Allergic reaction',
        severity: 'Moderate'
      };
      setAllergiesDraft(prev => [...prev, newItem]);
    }
  };

  // Save new custom allergy to local state AND to the Firebase allergies_catalog collection
  const handleSaveCustomAllergyToCatalog = async () => {
    if (!newCustomAllergen.trim()) return;
    const allergenName = newCustomAllergen.trim();
    const newItem: AllergyItem = {
      id: `all-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      allergen: allergenName,
      reaction: newCustomReaction.trim() || 'Allergic reaction',
      severity: newCustomSeverity
    };
    setAllergiesDraft(prev => [...prev.filter(a => a.allergen.toLowerCase() !== allergenName.toLowerCase()), newItem]);
    
    // Save to Firebase allergies_catalog collection so it persists on Firebase
    await addAllergyToCatalogInFirestore(allergenName);
    
    setNewCustomAllergen('');
    setNewCustomReaction('');
    setShowAddCustomAllergy(false);
  };

  const handleUpdateDraftAllergy = (id: string, updates: Partial<AllergyItem>) => {
    setAllergiesDraft(prev => prev.map(a => a.id === id ? { ...a, ...updates } : a));
  };

  const handleRemoveDraftAllergy = (id: string) => {
    setAllergiesDraft(prev => prev.filter(a => a.id !== id));
  };

  // Category helpers for the 60+ allergies catalog
  const isMedication = (name: string) => {
    const meds = ['penicillin', 'amoxicillin', 'cephalosporin', 'sulfa', 'aspirin', 'nsaid', 'ibuprofen', 'opioid', 'codeine', 'morphine', 'iodine', 'contrast', 'anesthetic', 'lidocaine', 'propofol', 'fluoroquinolone', 'ciprofloxacin', 'macrolide', 'azithromycin', 'tetracycline', 'doxycycline', 'vancomycin', 'ace inhibitor', 'lisinopril', 'anticonvulsant', 'insulin', 'vaccine', 'muscle relaxant', 'chemotherapy', 'statin'];
    return meds.some(m => name.toLowerCase().includes(m));
  };

  const isFood = (name: string) => {
    const foods = ['peanut', 'nut', 'shellfish', 'shrimp', 'fish', 'milk', 'dairy', 'lactose', 'egg', 'wheat', 'gluten', 'soy', 'sesame', 'mustard', 'celery', 'sulfite', 'corn', 'berry', 'strawberry', 'citrus', 'kiwi', 'banana', 'avocado', 'tomato', 'garlic', 'onion', 'msg', 'tartrazine', 'meat', 'alpha-gal'];
    return foods.some(f => name.toLowerCase().includes(f));
  };

  const isEnvironmental = (name: string) => {
    const env = ['latex', 'bee', 'wasp', 'ant', 'hornet', 'dander', 'cat', 'dog', 'horse', 'dust', 'mold', 'pollen', 'grass', 'tree', 'weed', 'cockroach', 'nickel', 'metal', 'poison', 'fragrance', 'perfume', 'sunlight', 'cold'];
    return env.some(e => name.toLowerCase().includes(e));
  };

  const filteredAllergens = firebaseAllergensList.filter(name => {
    const matchesSearch = name.toLowerCase().includes(allergySearchQuery.toLowerCase().trim());
    if (!matchesSearch) return false;
    if (selectedCategoryTab === 'Meds') return isMedication(name);
    if (selectedCategoryTab === 'Food') return isFood(name);
    if (selectedCategoryTab === 'Environmental') return isEnvironmental(name);
    return true;
  });

  // Copy plain-text medical ID summary to clipboard
  const handleCopyMedicalManifest = () => {
    const lines = [
      `Medical ID`,
      `Name: ${profile?.fullName || 'Registered Citizen'} (Age: ${age}, DOB: ${profile?.birthdate || 'N/A'})`,
      `Blood Type: ${profile?.bloodType || 'Unknown'}`,
      `Height: ${profile?.heightCm || 182} cm | Weight: ${profile?.weightKg || 72} kg`,
      `Medical Conditions: ${chronicConditions.length > 0 ? chronicConditions.join(', ') : 'None reported'}`,
      `Allergies: ${allergies.length > 0 ? allergies.map(a => `${a.allergen}${a.reaction ? ` (${a.reaction})` : ''}`).join(', ') : 'No known allergies'}`,
      hasEmergencyContact 
        ? `Emergency Contact: ${emergencyContact.name} (${emergencyContact.relation || 'Emergency Contact'}) - ${emergencyContact.phone || 'N/A'}`
        : 'Emergency Contact: None registered'
    ];
    navigator.clipboard?.writeText(lines.join('\n'));
    setCopiedPass(true);
    setTimeout(() => setCopiedPass(false), 2500);
  };

  return (
    <div className={`flex flex-col h-full ${darkMode ? 'bg-neutral-950 text-neutral-100' : 'bg-[#FAFAFA] text-gray-900'} px-6 pt-5 pb-8 overflow-y-auto transition-colors relative`}>
      
      {/* Toast Notification */}
      {saveSuccessToast && (
        <div className="fixed top-18 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 animate-[fade-in_0.2s_ease-out]">
          <Check className="w-4 h-4" />
          <span>Profile details updated successfully!</span>
        </div>
      )}

      {/* Info Section (div:nth-of-type(1)) */}
      <div className={`flex justify-between items-center mb-8 ${darkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-50'} p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.03)] border`}>
        <div>
          <p className="text-gray-400 text-[10px] uppercase font-bold tracking-wider mb-1">Welcome Back</p>
          <p className="font-semibold text-lg leading-none">{profile.displayName || profile.fullName || 'Citizen'}</p>
        </div>
        <div className="text-right">
          <p className="text-gray-400 text-[10px] uppercase font-bold tracking-wider mb-1">Current Location</p>
          <p className="font-semibold text-sm leading-none truncate max-w-[150px]">
            {location.servicesEnabled ? (location.lastKnownAddress || 'Current GPS Location') : 'Location Paused'}
          </p>
        </div>
      </div>

      {/* Emergency Help Record Header with Medical ID button (div:nth-of-type(2)) */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-medium text-gray-800 dark:text-neutral-200">Emergency Help Record</h2>
        <button
          onClick={() => setShowMedicalId(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 hover:border-neutral-300 dark:hover:border-neutral-700 text-xs font-medium transition-all shadow-2xs cursor-pointer active:scale-95"
          title="Open Medical ID Manifest"
        >
          <Shield className="w-3.5 h-3.5 text-[#B41A46] dark:text-rose-400" />
          <span>Medical ID</span>
        </button>
      </div>

      {/* Profile Card */}
      {/* Clicking this div opens Edit Profile & Photo flow */}
      <div 
        onClick={() => setIsEditModalOpen(true)}
        className={`${darkMode ? 'bg-neutral-900 border-neutral-800 hover:border-neutral-700' : 'bg-white border-gray-100'} p-4 sm:p-5 rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.04)] border flex items-center justify-between mb-6 group cursor-pointer hover:shadow-[0_8px_20px_rgb(0,0,0,0.08)] transition-all`}
        title="Edit profile"
      >
        <div className="flex items-center min-w-0 mr-3">
          {/* Avatar with photo or default icon */}
          <div className="relative w-12 h-12 sm:w-14 sm:h-14 bg-[#F9E8EC] dark:bg-rose-950/50 rounded-2xl flex items-center justify-center mr-3.5 sm:mr-4 shrink-0 group-hover:scale-105 transition-transform overflow-hidden border border-rose-200/50 dark:border-rose-900/30">
            {effectiveAvatarUrl ? (
              <img 
                src={effectiveAvatarUrl} 
                alt={profile.fullName} 
                className="w-full h-full object-cover"
              />
            ) : (
              <UserIcon className="w-6 h-6 sm:w-7 sm:h-7 text-[#B41A46] dark:text-rose-400" />
            )}
          </div>

          <div className="min-w-0">
            <h3 className="font-semibold text-sm sm:text-[15px] truncate text-gray-900 dark:text-neutral-100">{profile.fullName}</h3>
            <p className="text-gray-500 dark:text-neutral-400 text-xs mt-0.5 font-medium tracking-wide truncate">
              {profile.birthdate} • {profile.city}
            </p>
          </div>
        </div>

        {/* Right Arrow */}
        <div className="text-gray-300 dark:text-neutral-600 group-hover:text-[#B41A46] dark:group-hover:text-rose-400 transition-colors shrink-0 pl-2">
          <ChevronRight className="w-5 h-5" />
        </div>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className={`${darkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-100'} p-5 rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.04)] border relative hover:border-[#B41A46]/30 transition-all cursor-default`}>
          <p className="text-gray-400 text-[11px] uppercase font-bold tracking-wider mb-2">Age</p>
          <p className="font-semibold"><span className="text-2xl">{age}</span> <span className="text-xs font-medium text-gray-500 ml-0.5">years</span></p>
        </div>
        <div className={`${darkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-100'} p-5 rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.04)] border relative hover:border-[#B41A46]/30 transition-all cursor-default`}>
          <p className="text-gray-400 text-[11px] uppercase font-bold tracking-wider mb-2">Blood Type</p>
          <p className="font-bold text-2xl font-mono text-[#B41A46] dark:text-rose-400">{profile.bloodType}</p>
        </div>
        <div className={`${darkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-100'} p-5 rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.04)] border relative hover:border-[#B41A46]/30 transition-all cursor-default`}>
          <p className="text-gray-400 text-[11px] uppercase font-bold tracking-wider mb-2">Height</p>
          <p className="font-semibold"><span className="text-2xl font-mono">{profile.heightCm}</span> <span className="text-xs font-medium text-gray-500 ml-0.5">cm</span></p>
        </div>
        <div className={`${darkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-100'} p-5 rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.04)] border relative hover:border-[#B41A46]/30 transition-all cursor-default`}>
          <p className="text-gray-400 text-[11px] uppercase font-bold tracking-wider mb-2">Weight</p>
          <p className="font-semibold"><span className="text-2xl font-mono">{profile.weightKg}</span> <span className="text-xs font-medium text-gray-500 ml-0.5">kg</span></p>
        </div>
      </div>

      {/* Allergies & Reactions Card */}
      <div className={`${darkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-100'} p-4 sm:p-6 rounded-2xl shadow-[0_2px_10px_rgb(0,0,0,0.04)] border mb-6 transition-all`}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 sm:mb-4">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm sm:text-[15px] text-gray-900 dark:text-neutral-100">Allergies & Reactions</h3>
          </div>
          <button 
            type="button"
            onClick={() => setShowAllergiesModal(true)} 
            className="text-xs font-semibold text-[#B41A46] dark:text-rose-400 hover:underline cursor-pointer flex items-center gap-1 py-1.5 px-2 -mr-1 rounded-lg hover:bg-rose-50/50 dark:hover:bg-rose-950/30 active:scale-95 transition-all"
          >
            <span>View Details</span>
            <span aria-hidden="true">&rarr;</span>
          </button>
        </div>
        
        <div 
          onClick={() => setShowAllergiesModal(true)}
          className="cursor-pointer group"
          title="Click to view details and search allergies"
        >
          {allergies.length === 0 ? (
            <div className="py-4 px-3 rounded-xl border border-dashed border-gray-200 dark:border-neutral-800 text-center">
              <p className="text-xs text-gray-400 dark:text-neutral-500 font-medium">
                No allergies registered. Tap <span className="text-[#B41A46] dark:text-rose-400 font-semibold underline">View Details</span> to add.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-neutral-800/60">
              {allergies.map(item => (
                <div key={item.id} className="py-2.5 sm:py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-3 group-hover:opacity-95 transition-opacity">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#B41A46] shrink-0"></span>
                      <span className="font-semibold text-xs sm:text-sm text-gray-900 dark:text-neutral-100 truncate">
                        {item.allergen}
                      </span>
                    </div>
                    {item.reaction && (
                      <p className="text-[11px] text-gray-500 dark:text-neutral-400 mt-0.5 pl-3.5 truncate">
                        {item.reaction}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pl-3.5 sm:pl-0 shrink-0">
                    <span className={`text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-md ${
                      item.severity === 'Severe'
                        ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200/60 dark:border-rose-900/40'
                        : item.severity === 'Mild'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-900/30'
                        : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-900/30'
                    }`}>
                      {item.severity || 'Moderate'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Primary Emergency Contact */}
      <div className={`${darkMode ? 'bg-neutral-900 border-neutral-800' : 'bg-white border-gray-100'} p-5 rounded-2xl border shadow-2xs`}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">Emergency Contact</p>
          {!hasEmergencyContact && (
            <button
              type="button"
              onClick={() => setIsEditModalOpen(true)}
              className="text-xs font-semibold text-[#B41A46] dark:text-rose-400 hover:underline cursor-pointer"
            >
              + Add Contact
            </button>
          )}
        </div>
        {hasEmergencyContact ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">{emergencyContact.name}</p>
              <p className="text-xs text-gray-500 dark:text-neutral-400">{emergencyContact.relation || 'Emergency Contact'}</p>
            </div>
            {emergencyContact.phone ? (
              <a 
                href={`tel:${emergencyContact.phone}`}
                className="font-mono text-xs font-semibold text-[#B41A46] dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 px-3 py-1.5 rounded-lg hover:underline"
              >
                {emergencyContact.phone}
              </a>
            ) : null}
          </div>
        ) : (
          <div className="py-1">
            <p className="text-xs text-gray-400 dark:text-neutral-500 italic">No emergency contact registered</p>
          </div>
        )}
      </div>

      {/* Account & Session Actions */}
      <div className="mt-6 mb-8">
        <button
          type="button"
          onClick={async () => {
            await logout();
            onNavigate?.('login');
          }}
          className={`w-full flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-2xl border text-sm font-semibold transition-all active:scale-[0.99] cursor-pointer ${
            darkMode 
              ? 'bg-rose-950/20 hover:bg-rose-950/40 border-rose-900/40 text-rose-300' 
              : 'bg-white hover:bg-rose-50/70 border-rose-200/80 text-rose-600 shadow-[0_2px_10px_rgb(0,0,0,0.02)]'
          }`}
        >
          <LogOut className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          <span>Log Out</span>
        </button>
        <p className="text-center text-[11px] text-gray-400 dark:text-neutral-500 mt-2.5">
          Signed in as {currentUser?.email || profile?.email || 'User'}
        </p>
      </div>

      {/* ===================================================================== */}
      {/* EDIT PROFILE MODAL WITH PHOTO UPLOAD & CROP                           */}
      {/* ===================================================================== */}
      {isEditModalOpen && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsEditModalOpen(false);
          }}
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="bg-white dark:bg-neutral-900 w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-neutral-200/80 dark:border-neutral-800 overflow-hidden flex flex-col max-h-[90vh] animate-[fade-in_0.15s_ease-out]">
            
            {/* Header */}
            <div className="px-6 py-4 flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-[#B41A46] dark:text-rose-400" />
                <h3 className="font-semibold text-base tracking-tight text-neutral-900 dark:text-neutral-100">
                  Edit Personal & Medical Profile
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                aria-label="Close edit profile"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Content */}
            <form onSubmit={handleSaveProfile} className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
              
              {/* Photo Upload Section */}
              <div className="p-4 bg-gray-50/70 dark:bg-neutral-800/50 rounded-2xl border border-gray-100 dark:border-neutral-800">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block mb-3">
                  Profile Photo (Max 5 MB)
                </span>

                <div className="flex items-center gap-4">
                  {/* Photo Display */}
                  <div className="relative w-20 h-20 rounded-2xl overflow-hidden bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-center justify-center shrink-0 shadow-xs">
                    {avatarPreview ? (
                      <img 
                        src={avatarPreview} 
                        alt="Profile Preview" 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <UserIcon className="w-9 h-9 text-[#B41A46] dark:text-rose-400" />
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex-1 space-y-2">
                    <input 
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      id="profile-photo-upload"
                    />

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 bg-[#B41A46] hover:bg-[#9a143a] text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload & Crop</span>
                      </button>

                      {avatarPreview && (
                        <button
                          type="button"
                          onClick={handleRemovePhoto}
                          className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-gray-700 dark:text-neutral-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      )}
                    </div>

                    <p className="text-[11px] text-gray-500 dark:text-neutral-400">
                      Supports PNG, JPG, or WebP. Interactive zoom & crop tool provided.
                    </p>
                  </div>
                </div>

                {photoError && (
                  <div className="mt-3 p-2.5 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2 animate-[fade-in_0.15s_ease-out]">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{photoError}</span>
                  </div>
                )}
              </div>

              {/* Personal Details Section */}
              <div className="space-y-4">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                  Identity Details
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-neutral-300 uppercase tracking-wider mb-1">
                      Full Legal Name
                    </label>
                    <input
                      type="text"
                      required
                      value={formFullName}
                      onChange={(e) => setFormFullName(e.target.value)}
                      placeholder="e.g. Juan dela Cruz"
                      className="w-full px-3.5 py-2.5 bg-gray-50/50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-[#B41A46]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-neutral-300 uppercase tracking-wider mb-1">
                      Preferred / Display Name
                    </label>
                    <input
                      type="text"
                      value={formDisplayName}
                      onChange={(e) => setFormDisplayName(e.target.value)}
                      placeholder="e.g. Juan"
                      className="w-full px-3.5 py-2.5 bg-gray-50/50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-[#B41A46]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-neutral-300 uppercase tracking-wider mb-1">
                      Mobile Phone
                    </label>
                    <input
                      type="tel"
                      value={formPhone}
                      onChange={(e) => setFormPhone(e.target.value)}
                      placeholder="+63 917 555 0192"
                      className="w-full px-3.5 py-2.5 bg-gray-50/50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-[#B41A46] font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-neutral-300 uppercase tracking-wider mb-1">
                      Date of Birth
                    </label>
                    <input
                      type="date"
                      value={formBirthdate}
                      onChange={(e) => setFormBirthdate(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-gray-50/50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-[#B41A46]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-neutral-300 uppercase tracking-wider mb-1">
                    City / Address
                  </label>
                  <input
                    type="text"
                    value={formCity}
                    onChange={(e) => setFormCity(e.target.value)}
                    placeholder="e.g. Balanga City, Bataan"
                    className="w-full px-3.5 py-2.5 bg-gray-50/50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-[#B41A46]"
                  />
                </div>
              </div>

              {/* Medical Vitals Section */}
              <div className="space-y-4">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                  Medical Baseline
                </span>

                {/* Blood Type Grid */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-neutral-300 uppercase tracking-wider mb-1.5">
                    Blood Type
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                    {BLOOD_TYPES.map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setFormBloodType(type)}
                        className={`py-2 px-1 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                          formBloodType === type
                            ? 'bg-[#B41A46] text-white border-[#B41A46] shadow-xs'
                            : 'bg-gray-50/70 dark:bg-neutral-800 border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-neutral-300 hover:border-gray-300'
                        }`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-neutral-300 uppercase tracking-wider mb-1">
                      Height (cm)
                    </label>
                    <input
                      type="number"
                      value={formHeight}
                      onChange={(e) => setFormHeight(parseInt(e.target.value, 10) || 0)}
                      placeholder="180"
                      className="w-full px-3.5 py-2.5 bg-gray-50/50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-[#B41A46] font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-neutral-300 uppercase tracking-wider mb-1">
                      Weight (kg)
                    </label>
                    <input
                      type="number"
                      value={formWeight}
                      onChange={(e) => setFormWeight(parseInt(e.target.value, 10) || 0)}
                      placeholder="72"
                      className="w-full px-3.5 py-2.5 bg-gray-50/50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-[#B41A46] font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Emergency Contact Section */}
              <div className="space-y-4">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                  Primary Emergency Contact
                </span>

                <div>
                  <label className="block text-xs font-bold text-gray-700 dark:text-neutral-300 uppercase tracking-wider mb-1">
                    Contact Person Name
                  </label>
                  <input
                    type="text"
                    value={formContactName}
                    onChange={(e) => setFormContactName(e.target.value)}
                    placeholder="e.g. Maria dela Cruz"
                    className="w-full px-3.5 py-2.5 bg-gray-50/50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-[#B41A46]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-neutral-300 uppercase tracking-wider mb-1">
                      Relationship
                    </label>
                    <input
                      type="text"
                      value={formContactRelation}
                      onChange={(e) => setFormContactRelation(e.target.value)}
                      placeholder="e.g. Spouse / Parent"
                      className="w-full px-3.5 py-2.5 bg-gray-50/50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-[#B41A46]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-neutral-300 uppercase tracking-wider mb-1">
                      Contact Phone
                    </label>
                    <input
                      type="tel"
                      value={formContactPhone}
                      onChange={(e) => setFormContactPhone(e.target.value)}
                      placeholder="+63 917 555 0192"
                      className="w-full px-3.5 py-2.5 bg-gray-50/50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl text-sm font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-[#B41A46] font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Form Action Buttons */}
              <div className="pt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="flex-1 py-3 px-4 rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-100 hover:bg-gray-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-gray-700 dark:text-neutral-300 font-semibold text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 px-4 rounded-xl bg-[#B41A46] hover:bg-[#9a143a] text-white font-semibold text-xs transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Save Profile</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* CROPPER MODAL (Triggered when user selects a photo)                    */}
      {/* ===================================================================== */}
      {cropperRawSrc && (
        <ImageCropperModal
          imageSrc={cropperRawSrc}
          onApplyCrop={handleCropComplete}
          onCancel={() => setCropperRawSrc(null)}
        />
      )}

      {/* ===================================================================== */}
      {/* MINIMALIST EMERGENCY MEDICAL ID SHEET                                 */}
      {/* ===================================================================== */}
      {showMedicalId && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowMedicalId(false);
          }}
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
        >
          <div className="bg-white dark:bg-neutral-900 w-full sm:max-w-md rounded-t-[28px] sm:rounded-2xl shadow-xl border border-neutral-200/80 dark:border-neutral-800 overflow-hidden flex flex-col max-h-[85vh] animate-[fade-in_0.15s_ease-out]">
            
            {/* Mobile Drag Indicator Handle */}
            <div className="w-10 h-1 bg-gray-300 dark:bg-neutral-700 rounded-full mx-auto mt-2.5 -mb-1 sm:hidden shrink-0"></div>

            {/* Clean Header */}
            <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3.5 sm:pb-4 flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-[#B41A46]"></span>
                <h3 className="font-semibold text-sm tracking-tight text-neutral-900 dark:text-neutral-100">Medical ID</h3>
              </div>
              <button
                onClick={() => setShowMedicalId(false)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 w-8 h-8 flex items-center justify-center rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                aria-label="Close medical ID"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Medical Content */}
            <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-4 overflow-y-auto">
              {/* Primary Identity & Blood Group */}
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                    {profile?.fullName || 'Registered Citizen'}
                  </h4>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {profile?.birthdate ? `Born ${profile.birthdate} • ${age} years` : `${age} years`}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500 block mb-0.5">Blood Type</span>
                  <span className="inline-block font-mono font-semibold text-sm text-[#9c1537] dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 px-2.5 py-0.5 rounded border border-rose-200/70 dark:border-rose-900/50">
                    {profile?.bloodType || 'O Rh-'}
                  </span>
                </div>
              </div>

              {/* Physical Metrics */}
              <div className="pt-3.5 border-t border-neutral-100 dark:border-neutral-800 flex items-center space-x-8 text-xs">
                <div>
                  <span className="text-neutral-400 dark:text-neutral-500 block text-[11px] mb-0.5">Height</span>
                  <span className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm">{profile?.heightCm || 182} cm</span>
                </div>
                <div>
                  <span className="text-neutral-400 dark:text-neutral-500 block text-[11px] mb-0.5">Weight</span>
                  <span className="font-semibold text-neutral-900 dark:text-neutral-100 text-sm">{profile?.weightKg || 72} kg</span>
                </div>
              </div>

              {/* Medical Conditions */}
              <div className="pt-3.5 border-t border-neutral-100 dark:border-neutral-800">
                <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500 block mb-1">
                  Medical Conditions
                </span>
                <p className="text-xs text-neutral-900 dark:text-neutral-100 font-medium leading-relaxed">
                  {chronicConditions.length > 0 ? chronicConditions.join(', ') : 'None reported'}
                </p>
              </div>

              {/* Allergies & Reactions */}
              <div className="pt-3.5 border-t border-neutral-100 dark:border-neutral-800">
                <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500 block mb-1">
                  Allergies & Reactions
                </span>
                {allergies.length > 0 ? (
                  <div className="space-y-1.5">
                    {allergies.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs">
                        <span className="text-neutral-900 dark:text-neutral-100 font-medium">{item.allergen}</span>
                        <span className="text-neutral-500 dark:text-neutral-400 text-[11px]">
                          {item.reaction || 'Allergic reaction'} {item.severity ? `• ${item.severity}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-neutral-900 dark:text-neutral-100 font-medium">
                    No known allergies
                  </p>
                )}
              </div>

              {/* Emergency Contact */}
              <div className="pt-3.5 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500 block">
                    Emergency Contact
                  </span>
                  {hasEmergencyContact ? (
                    <>
                      <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 mt-0.5">
                        {emergencyContact.name}
                      </p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        {emergencyContact.relation || 'Emergency Contact'}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-neutral-400 dark:text-neutral-500 italic mt-0.5">
                      None registered
                    </p>
                  )}
                </div>
                {hasEmergencyContact && emergencyContact.phone ? (
                  <a
                    href={`tel:${emergencyContact.phone}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors shadow-2xs"
                  >
                    <PhoneCall className="w-3.5 h-3.5 text-[#B41A46] dark:text-rose-400" />
                    <span>Call</span>
                  </a>
                ) : null}
              </div>
            </div>

            {/* Clean Action Footer */}
            <div className="px-4 sm:px-6 py-3.5 bg-neutral-50/70 dark:bg-neutral-900/70 border-t border-neutral-100 dark:border-neutral-800 flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleCopyMedicalManifest}
                className="flex-1 flex items-center justify-center space-x-1.5 py-2 px-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200 text-xs font-medium hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors shadow-2xs cursor-pointer"
              >
                {copiedPass ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-neutral-400" />
                    <span>Copy Details</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowMedicalId(false)}
                className="flex-1 py-2 px-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 text-xs font-medium transition-colors shadow-2xs cursor-pointer"
              >
                Done
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* DEDICATED ALLERGIES & REACTIONS MODAL WITH REAL-TIME SEARCH       */}
      {/* ================================================================= */}
      {showAllergiesModal && (
        <div 
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAllergiesModal(false);
          }}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 animate-[fade-in_0.15s_ease-out]"
        >
          <div className={`${darkMode ? 'bg-neutral-900 border-neutral-800 text-neutral-100' : 'bg-white border-gray-100 text-gray-900'} rounded-t-[28px] sm:rounded-3xl w-full sm:max-w-lg shadow-2xl border-t sm:border border-gray-200/80 dark:border-neutral-800 flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden`}>
            
            {/* Mobile Drag Indicator Handle */}
            <div className="w-10 h-1 bg-gray-300 dark:bg-neutral-700 rounded-full mx-auto mt-2.5 -mb-1 sm:hidden shrink-0"></div>

            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-neutral-800 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0 pr-2">
                <div className="w-8 h-8 rounded-full bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-[#B41A46] dark:text-rose-400 shrink-0">
                  <Shield className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-sm sm:text-base leading-tight truncate">Allergies & Medical Reactions</h3>
                  <p className="text-[10px] sm:text-[11px] text-gray-400 truncate">
                    Verified medical catalog &bull; {firebaseAllergensList.length} allergens available
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAllergiesModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-neutral-200 w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3.5 sm:py-4 space-y-4 sm:space-y-5">
              
              {/* Active Configured Allergies Summary */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    My Registered Allergies ({allergiesDraft.length})
                  </span>
                  {allergiesDraft.length === 0 && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">None added yet</span>
                  )}
                </div>

                {allergiesDraft.length === 0 ? (
                  <div className="p-3.5 sm:p-4 rounded-xl border border-dashed border-gray-200 dark:border-neutral-800 text-center text-xs text-gray-400">
                    Search below to pick your allergens, drugs, or foods.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 sm:max-h-44 overflow-y-auto pr-0.5">
                    {allergiesDraft.map((item) => (
                      <div 
                        key={item.id}
                        className="p-2.5 sm:p-3 bg-gray-50/90 dark:bg-neutral-800/80 rounded-xl border border-gray-200/80 dark:border-neutral-700/80 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-gray-900 dark:text-white flex items-center gap-1.5 truncate pr-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#B41A46] shrink-0"></span>
                            <span className="truncate">{item.allergen}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveDraftAllergy(item.id)}
                            className="text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 p-1.5 rounded-lg transition-colors cursor-pointer shrink-0"
                            title="Remove allergy"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            value={item.reaction || ''}
                            onChange={(e) => handleUpdateDraftAllergy(item.id, { reaction: e.target.value })}
                            placeholder="Reaction symptom (e.g. Hives, Shock)"
                            className="flex-1 px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg text-xs font-medium text-gray-900 dark:text-white focus:outline-none focus:border-[#B41A46]"
                          />
                          <div className="flex items-center gap-1 shrink-0">
                            {(['Mild', 'Moderate', 'Severe'] as const).map((sev) => (
                              <button
                                key={sev}
                                type="button"
                                onClick={() => handleUpdateDraftAllergy(item.id, { severity: sev })}
                                className={`flex-1 sm:flex-initial px-2.5 py-1.5 text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                                  item.severity === sev
                                    ? sev === 'Severe'
                                      ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                                      : 'bg-[#B41A46] text-white border-[#B41A46] shadow-2xs'
                                    : 'bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400'
                                }`}
                              >
                                {sev}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SEARCH & MEDICAL ALLERGENS CATALOG */}
              <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-neutral-800">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    Search Medical Catalog
                  </span>
                  <span className="text-[11px] text-gray-400 font-medium">
                    {filteredAllergens.length} results
                  </span>
                </div>

                {/* Instant Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={allergySearchQuery}
                    onChange={(e) => setAllergySearchQuery(e.target.value)}
                    placeholder="Search penicillin, peanuts, latex, pollen, bee..."
                    className="w-full pl-9 pr-9 py-2.5 bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl text-xs font-medium text-gray-900 dark:text-white focus:outline-none focus:border-[#B41A46]"
                  />
                  {allergySearchQuery && (
                    <button
                      type="button"
                      onClick={() => setAllergySearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Category Filter Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                  {(['All', 'Meds', 'Food', 'Environmental'] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setSelectedCategoryTab(tab)}
                      className={`px-3 py-1.5 rounded-full font-semibold transition-all whitespace-nowrap text-xs cursor-pointer ${
                        selectedCategoryTab === tab
                          ? 'bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-2xs'
                          : 'bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-neutral-400 hover:bg-gray-200'
                      }`}
                    >
                      {tab === 'Meds' ? 'Medications & Drugs' : tab === 'Food' ? 'Foods & Ingredients' : tab === 'Environmental' ? 'Environmental' : `All (${firebaseAllergensList.length})`}
                    </button>
                  ))}
                </div>

                {/* Allergen Chips Grid with Tap to Select */}
                <div className="p-2 sm:p-2.5 bg-gray-50/70 dark:bg-neutral-800/60 rounded-2xl border border-gray-200 dark:border-neutral-700 max-h-48 sm:max-h-56 overflow-y-auto">
                  {filteredAllergens.length === 0 ? (
                    <div className="py-5 text-center space-y-2">
                      <p className="text-xs text-gray-400">
                        No catalog allergen matching "{allergySearchQuery}".
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setNewCustomAllergen(allergySearchQuery);
                          setShowAddCustomAllergy(true);
                        }}
                        className="px-3 py-1.5 bg-[#B41A46] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1 shadow-2xs active:scale-95"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add "{allergySearchQuery}" to Catalog</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {filteredAllergens.map((allergen) => {
                        const isSelected = allergiesDraft.some(a => a.allergen.toLowerCase() === allergen.toLowerCase());
                        return (
                          <button
                            key={allergen}
                            type="button"
                            onClick={() => handleToggleDraftAllergy(allergen)}
                            className={`px-2.5 py-2 sm:py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 ${
                              isSelected
                                ? 'bg-[#B41A46] text-white font-semibold shadow-2xs ring-1 ring-[#B41A46]'
                                : 'bg-white dark:bg-neutral-800 text-gray-700 dark:text-neutral-300 border border-gray-200 dark:border-neutral-700 hover:border-gray-300'
                            }`}
                          >
                            <span>{allergen}</span>
                            {isSelected ? (
                              <Check className="w-3 h-3 text-white" />
                            ) : (
                              <Plus className="w-3 h-3 text-gray-400" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Add Custom Allergy Section */}
                {!showAddCustomAllergy ? (
                  <button
                    type="button"
                    onClick={() => setShowAddCustomAllergy(true)}
                    className="w-full py-2.5 px-3 rounded-xl border border-dashed border-gray-300 dark:border-neutral-700 hover:border-[#B41A46] bg-gray-50/50 dark:bg-neutral-800/40 text-gray-700 dark:text-neutral-300 hover:text-[#B41A46] text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Not in list? Add Custom Allergy</span>
                  </button>
                ) : (
                  <div className="p-3 sm:p-3.5 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-2xl space-y-2.5 animate-[fade-in_0.15s_ease-out]">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#B41A46] dark:text-rose-400">
                        Add New Custom Allergy
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAddCustomAllergy(false)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-neutral-200 w-7 h-7 flex items-center justify-center"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <input
                      type="text"
                      value={newCustomAllergen}
                      onChange={(e) => setNewCustomAllergen(e.target.value)}
                      placeholder="Allergen name (e.g. Ciprofloxacin, Tartrazine)"
                      className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg text-xs font-semibold text-gray-900 dark:text-white focus:outline-none focus:border-[#B41A46]"
                    />

                    <input
                      type="text"
                      value={newCustomReaction}
                      onChange={(e) => setNewCustomReaction(e.target.value)}
                      placeholder="Reaction symptom (e.g. Skin Rash, Shortness of breath)"
                      className="w-full px-3 py-2 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg text-xs font-medium text-gray-900 dark:text-white focus:outline-none focus:border-[#B41A46]"
                    />

                    <div className="flex items-center gap-1.5">
                      {(['Mild', 'Moderate', 'Severe'] as const).map((sev) => (
                        <button
                          key={sev}
                          type="button"
                          onClick={() => setNewCustomSeverity(sev)}
                          className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                            newCustomSeverity === sev
                              ? 'bg-[#B41A46] text-white border-[#B41A46]'
                              : 'bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-neutral-400'
                          }`}
                        >
                          {sev}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleSaveCustomAllergyToCatalog}
                      disabled={!newCustomAllergen.trim()}
                      className="w-full py-2.5 bg-[#B41A46] hover:bg-[#9a143a] disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-2xs active:scale-98"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Save & Add to Catalog</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer Actions (Mobile Thumb Friendly) */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-100 dark:border-neutral-800 bg-gray-50/70 dark:bg-neutral-900 flex items-center justify-end gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowAllergiesModal(false)}
                className="flex-1 sm:flex-initial px-4 py-2.5 border border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-neutral-300 text-xs font-semibold rounded-xl hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer text-center"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAllergiesModal}
                className="flex-1 sm:flex-initial px-5 py-2.5 bg-[#B41A46] hover:bg-[#9a143a] text-white text-xs font-bold rounded-xl transition-all shadow-2xs cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 text-center"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Save & Sync</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
