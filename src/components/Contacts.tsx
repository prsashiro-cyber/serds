import React, { useState, useMemo } from 'react';
import { 
  User, 
  Plus, 
  X, 
  PhoneCall, 
  MessageSquare, 
  Star, 
  Trash2, 
  Edit2, 
  Search, 
  Shield, 
  Smartphone, 
  Check, 
  AlertCircle,
  Phone
} from 'lucide-react';
import { Screen } from '../types';
import { useUserSettings, EmergencyCircleContact } from '../lib/userSettings';
import { useAuth } from '../contexts/AuthContext';
import { syncUserProfileToFirestore } from '../lib/firebase';

interface ContactsProps {
  onNavigate?: (screen: Screen) => void;
}

const RELATIONSHIP_OPTIONS = [
  'Spouse',
  'Parent',
  'Sibling',
  'Child',
  'Partner',
  'Friend',
  'Relative',
  'Doctor / Physician',
  'Caregiver',
  'Neighbor',
  'Colleague',
  'Other'
];

export default function Contacts({ onNavigate }: ContactsProps) {
  const { settings, updateEmergencyCircle } = useUserSettings();
  const { darkMode, profile, location } = settings;
  const { currentUser } = useAuth();

  // Real contacts from user settings
  const contacts: EmergencyCircleContact[] = useMemo(() => {
    return profile.emergencyCircle || [];
  }, [profile.emergencyCircle]);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<EmergencyCircleContact | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRelation, setFormRelation] = useState('Spouse');
  const [formIsPrimary, setFormIsPrimary] = useState(false);
  const [formNotes, setFormNotes] = useState('');

  // Check if device Contact Picker API is supported (Android Chrome / mobile browsers)
  const isContactPickerSupported = typeof navigator !== 'undefined' && 
    'contacts' in navigator && 
    typeof (navigator as any).contacts?.select === 'function';

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // Synchronize changes to local settings & cloud profile
  const persistContacts = async (updatedList: EmergencyCircleContact[]) => {
    updateEmergencyCircle(updatedList);

    if (currentUser?.uid) {
      const primaryContact = updatedList.find(c => c.isPrimary) || updatedList[0];
      try {
        await syncUserProfileToFirestore({
          uid: currentUser.uid,
          fullName: profile.fullName || 'Registered Citizen',
          displayName: profile.displayName || 'Citizen',
          email: profile.email || currentUser.email || '',
          emergencyCircle: updatedList,
          ...(primaryContact ? {
            emergencyContact: {
              name: primaryContact.name,
              phone: primaryContact.phone,
              relation: primaryContact.relation || 'Emergency Contact'
            }
          } : {
            emergencyContact: {
              name: '',
              phone: '',
              relation: ''
            }
          })
        });
      } catch (err) {
        console.warn('Failed to sync contacts to cloud profile:', err);
      }
    }
  };

  // Open modal for adding a new contact
  const handleOpenAddModal = () => {
    setEditingContact(null);
    setFormName('');
    setFormPhone('');
    setFormRelation(contacts.length === 0 ? 'Spouse' : 'Relative');
    setFormIsPrimary(contacts.length === 0); // Default to primary if first contact
    setFormNotes('');
    setIsAddModalOpen(true);
  };

  // Open modal for editing an existing contact
  const handleOpenEditModal = (contact: EmergencyCircleContact) => {
    setEditingContact(contact);
    setFormName(contact.name);
    setFormPhone(contact.phone);
    setFormRelation(contact.relation || 'Other');
    setFormIsPrimary(Boolean(contact.isPrimary));
    setFormNotes(contact.notes || '');
    setIsAddModalOpen(true);
  };

  // Save (Create or Update) contact
  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPhone.trim()) return;

    let updatedList: EmergencyCircleContact[];

    if (editingContact) {
      // Update existing
      updatedList = contacts.map(c => {
        if (c.id === editingContact.id) {
          return {
            ...c,
            name: formName.trim(),
            phone: formPhone.trim(),
            relation: formRelation,
            isPrimary: formIsPrimary,
            notes: formNotes.trim() || undefined
          };
        }
        // If this contact is marked primary, unmark others
        return formIsPrimary ? { ...c, isPrimary: false } : c;
      });
      showToast('Contact updated successfully');
    } else {
      // Create new
      const newContact: EmergencyCircleContact = {
        id: 'contact_' + Date.now().toString(),
        name: formName.trim(),
        phone: formPhone.trim(),
        relation: formRelation,
        isPrimary: formIsPrimary,
        notes: formNotes.trim() || undefined,
        createdAt: Date.now()
      };

      if (formIsPrimary) {
        updatedList = [...contacts.map(c => ({ ...c, isPrimary: false })), newContact];
      } else {
        updatedList = [...contacts, newContact];
      }
      showToast('New emergency contact added');
    }

    // Ensure at least one is marked primary if list not empty
    if (updatedList.length > 0 && !updatedList.some(c => c.isPrimary)) {
      updatedList[0].isPrimary = true;
    }

    await persistContacts(updatedList);
    setIsAddModalOpen(false);
  };

  // Delete a contact
  const handleDeleteContact = async (id: string) => {
    const contactToDelete = contacts.find(c => c.id === id);
    let updatedList = contacts.filter(c => c.id !== id);

    // If deleted contact was primary, promote the first remaining
    if (contactToDelete?.isPrimary && updatedList.length > 0) {
      updatedList[0].isPrimary = true;
    }

    await persistContacts(updatedList);
    setDeleteConfirmId(null);
    showToast('Emergency contact removed');
  };

  // Promote contact to Primary
  const handleSetPrimary = async (id: string) => {
    const updatedList = contacts.map(c => ({
      ...c,
      isPrimary: c.id === id
    }));
    await persistContacts(updatedList);
    showToast('Set as primary emergency contact');
  };

  // Native Device Contact Picker (Mobile Web)
  const handleImportDeviceContact = async () => {
    if (!isContactPickerSupported) return;

    try {
      const selected = await (navigator as any).contacts.select(['name', 'tel'], { multiple: false });
      if (selected && selected.length > 0) {
        const item = selected[0];
        const name = (item.name && item.name[0]) || '';
        const phone = (item.tel && item.tel[0]) || '';

        if (name || phone) {
          setEditingContact(null);
          setFormName(name);
          setFormPhone(phone);
          setFormRelation('Relative');
          setFormIsPrimary(contacts.length === 0);
          setFormNotes('Imported from phone contacts');
          setIsAddModalOpen(true);
        }
      }
    } catch (err) {
      // User cancelled picker or permission denied
      console.info('Device contact picker cancelled or dismissed:', err);
    }
  };

  // Build emergency alert SMS URL
  const getEmergencySmsUrl = (contact: EmergencyCircleContact) => {
    const patientName = profile.fullName || profile.displayName || 'Citizen';
    const locAddress = location.lastKnownAddress || 'Current GPS Location';
    const body = `EMERGENCY ALERT: This is ${patientName}. I am in an emergency situation and need assistance. My last reported location: ${locAddress}. Please contact or check on me immediately.`;
    return `sms:${contact.phone}?body=${encodeURIComponent(body)}`;
  };



  // Filtered contacts based on search query
  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim()) return contacts;
    const q = searchQuery.toLowerCase();
    return contacts.filter(c => 
      c.name.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      (c.relation && c.relation.toLowerCase().includes(q))
    );
  }, [contacts, searchQuery]);

  return (
    <div className={`flex flex-col h-full ${darkMode ? 'bg-neutral-950 text-neutral-100' : 'bg-[#FAFAFA] text-gray-900'} px-4 sm:px-6 pt-5 pb-8 overflow-y-auto relative transition-colors`}>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 animate-[fade-in_0.15s_ease-out]">
          <Check className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header & Action Bar */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-neutral-500">
            Emergency Circle ({contacts.length})
          </span>
          <p className="text-[11px] text-gray-400 dark:text-neutral-500 mt-0.5">
            Contacts notified and reachable during an emergency
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {isContactPickerSupported && (
            <button
              onClick={handleImportDeviceContact}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-gray-700 dark:text-neutral-300 text-xs font-semibold shadow-2xs hover:bg-gray-50 active:scale-95 transition-all"
              title="Import contact from phone address book"
              aria-label="Import from Phone"
            >
              <Smartphone className="w-3.5 h-3.5 text-[#B41A46]" />
              <span className="hidden sm:inline">Import</span>
            </button>
          )}

          <button
            id="add-contact-btn"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#B41A46] text-white text-xs font-semibold shadow-xs hover:bg-[#9a143a] active:scale-95 transition-all cursor-pointer"
            title="Add Emergency Contact"
            aria-label="Add Contact"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Contact</span>
          </button>
        </div>
      </div>



      {/* Search Bar (Shown when multiple contacts exist) */}
      {contacts.length > 2 && (
        <div className="relative mb-3.5 px-1">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search contacts by name or relationship..."
            className={`w-full pl-9 pr-8 py-2 rounded-xl text-xs font-medium border focus:outline-none focus:border-[#B41A46] ${
              darkMode 
                ? 'bg-neutral-900 border-neutral-800 text-white placeholder:text-neutral-500' 
                : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400'
            }`}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Contact List */}
      <div className="space-y-3 flex-1 overflow-y-auto pr-0.5 pb-4">
        {contacts.length === 0 ? (
          /* Clean Empty State */
          <div className={`p-8 text-center rounded-2xl border border-dashed my-4 ${
            darkMode ? 'bg-neutral-900/40 border-neutral-800' : 'bg-white border-gray-200'
          }`}>
            <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center mx-auto mb-3 text-[#B41A46] dark:text-rose-400">
              <Shield className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-sm text-gray-900 dark:text-white mb-1">
              No Emergency Contacts Yet
            </h3>
            <p className="text-xs text-gray-500 dark:text-neutral-400 max-w-xs mx-auto mb-5 leading-relaxed">
              Add trusted family members or friends who will be notified and directly reachable if you trigger an emergency alert.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
              <button
                onClick={handleOpenAddModal}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-[#B41A46] hover:bg-[#9a143a] text-white text-xs font-bold transition-all shadow-xs active:scale-95 inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add First Contact</span>
              </button>

              {isContactPickerSupported && (
                <button
                  onClick={handleImportDeviceContact}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-gray-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-gray-800 dark:text-neutral-200 text-xs font-semibold hover:bg-gray-50 active:scale-95 inline-flex items-center justify-center gap-1.5"
                >
                  <Smartphone className="w-3.5 h-3.5 text-[#B41A46]" />
                  <span>Import from Phone</span>
                </button>
              )}
            </div>
          </div>
        ) : filteredContacts.length === 0 ? (
          /* Search Empty State */
          <div className="p-8 text-center text-xs text-gray-400 dark:text-neutral-500">
            No contacts found matching "{searchQuery}".
          </div>
        ) : (
          /* Real Contacts Cards */
          filteredContacts.map((contact) => (
            <div 
              key={contact.id} 
              className={`p-4 rounded-2xl border shadow-[0_2px_10px_rgb(0,0,0,0.03)] transition-all ${
                darkMode 
                  ? 'bg-neutral-900 border-neutral-800 hover:border-neutral-700' 
                  : 'bg-white border-gray-100 hover:border-gray-200'
              } ${contact.isPrimary ? 'ring-1 ring-[#B41A46]/20' : ''}`}
            >
              <div className="flex items-start justify-between gap-3">
                {/* Avatar Icon */}
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                  contact.isPrimary
                    ? 'bg-[#B41A46] text-white'
                    : 'bg-[#F9E8EC] dark:bg-rose-950/40 text-[#B41A46] dark:text-rose-400'
                }`}>
                  <User className="w-5 h-5 fill-current" />
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-[14px] text-gray-900 dark:text-white truncate">
                      {contact.name}
                    </h3>
                    {contact.isPrimary && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/50 text-[#B41A46] dark:text-rose-400 border border-rose-200/60 dark:border-rose-900/40">
                        <Star className="w-2.5 h-2.5 fill-current" />
                        <span>Primary</span>
                      </span>
                    )}
                  </div>

                  <p className="text-gray-500 dark:text-neutral-400 text-xs mt-0.5 font-medium tracking-wide">
                    {contact.phone}
                  </p>

                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[11px] font-semibold text-gray-400 dark:text-neutral-500">
                      {contact.relation || 'Emergency Contact'}
                    </span>
                    {contact.notes && (
                      <span className="text-[10px] text-gray-400 dark:text-neutral-500 truncate max-w-[150px]">
                        &bull; {contact.notes}
                      </span>
                    )}
                  </div>
                </div>

                {/* Direct Action Buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Emergency SMS */}
                  <a
                    href={getEmergencySmsUrl(contact)}
                    className="w-9 h-9 rounded-xl bg-gray-50 dark:bg-neutral-800 text-gray-600 dark:text-neutral-300 flex items-center justify-center hover:bg-rose-50 hover:text-[#B41A46] dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition-colors shadow-2xs active:scale-95"
                    title={`Send SOS SMS to ${contact.name}`}
                    aria-label={`Send SMS to ${contact.name}`}
                  >
                    <MessageSquare className="w-4 h-4" />
                  </a>

                  {/* Phone Call */}
                  <a
                    href={`tel:${contact.phone}`}
                    className="w-9 h-9 rounded-xl bg-[#B41A46] text-white flex items-center justify-center hover:bg-[#9a143a] transition-colors shadow-2xs active:scale-95"
                    title={`Call ${contact.name}`}
                    aria-label={`Call ${contact.name}`}
                  >
                    <PhoneCall className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Management Controls Footer */}
              <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-neutral-800 flex items-center justify-between text-xs">
                <div>
                  {!contact.isPrimary ? (
                    <button
                      onClick={() => handleSetPrimary(contact.id)}
                      className="text-[11px] font-semibold text-gray-400 hover:text-[#B41A46] dark:hover:text-rose-400 transition-colors inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Star className="w-3 h-3" />
                      <span>Set as Primary</span>
                    </button>
                  ) : (
                    <span className="text-[11px] text-[#B41A46] dark:text-rose-400 font-semibold inline-flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      <span>Main Medical Contact</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleOpenEditModal(contact)}
                    className="text-[11px] font-medium text-gray-400 hover:text-gray-700 dark:hover:text-neutral-200 transition-colors inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3" />
                    <span>Edit</span>
                  </button>

                  <button
                    onClick={() => setDeleteConfirmId(contact.id)}
                    className="text-[11px] font-medium text-gray-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-[fade-in_0.15s_ease-out]">
          <div className={`${darkMode ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-white border-gray-100 text-gray-900'} w-full max-w-sm rounded-2xl p-6 shadow-2xl border space-y-4`}>
            <div className="flex items-center gap-2.5 text-rose-600">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-sm">Remove Emergency Contact?</h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-neutral-400 leading-relaxed">
              Are you sure you want to remove this contact from your emergency circle? They will no longer be notified during an incident.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                className="px-3.5 py-2 rounded-xl border border-gray-200 dark:border-neutral-700 text-xs font-semibold hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteContact(deleteConfirmId)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shadow-2xs"
              >
                Remove Contact
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Contact Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-[fade-in_0.15s_ease-out]">
          <div className={`${darkMode ? 'bg-neutral-900 border-neutral-800 text-white' : 'bg-white border-gray-100 text-gray-900'} w-full sm:max-w-md rounded-t-[28px] sm:rounded-3xl p-6 sm:p-7 shadow-2xl border-t sm:border relative max-h-[92vh] overflow-y-auto`}>
            
            {/* Mobile Drag Indicator Handle */}
            <div className="w-10 h-1 bg-gray-300 dark:bg-neutral-700 rounded-full mx-auto -mt-2 mb-4 sm:hidden"></div>

            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-[#B41A46]">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold leading-tight">
                    {editingContact ? 'Edit Emergency Contact' : 'Add Emergency Contact'}
                  </h2>
                  <p className="text-[11px] text-gray-400">
                    Trusted person in your safety circle
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className={`w-8 h-8 rounded-full flex items-center justify-center ${darkMode ? 'text-neutral-400 hover:text-white bg-neutral-800' : 'text-gray-400 hover:text-gray-900 bg-gray-100'}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveContact} className="space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold tracking-wider uppercase text-gray-500 dark:text-neutral-400 mb-1.5">
                  Full Name <span className="text-[#B41A46]">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Maria Santos"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className={`w-full px-4 py-3 border rounded-xl text-xs sm:text-sm focus:outline-none focus:border-[#B41A46] font-medium ${
                    darkMode ? 'bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500' : 'bg-gray-50/50 border-gray-200 text-gray-900 placeholder:text-gray-400'
                  }`}
                />
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-xs font-bold tracking-wider uppercase text-gray-500 dark:text-neutral-400 mb-1.5">
                  Phone Number <span className="text-[#B41A46]">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="tel"
                    required
                    placeholder="e.g. +63 917 123 4567"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    className={`w-full pl-9 pr-4 py-3 border rounded-xl text-xs sm:text-sm focus:outline-none focus:border-[#B41A46] font-medium ${
                      darkMode ? 'bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500' : 'bg-gray-50/50 border-gray-200 text-gray-900 placeholder:text-gray-400'
                    }`}
                  />
                </div>
              </div>

              {/* Relationship Dropdown */}
              <div>
                <label className="block text-xs font-bold tracking-wider uppercase text-gray-500 dark:text-neutral-400 mb-1.5">
                  Relationship
                </label>
                <select
                  value={formRelation}
                  onChange={(e) => setFormRelation(e.target.value)}
                  className={`w-full px-4 py-3 border rounded-xl text-xs sm:text-sm focus:outline-none focus:border-[#B41A46] font-medium ${
                    darkMode ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-gray-50/50 border-gray-200 text-gray-900'
                  }`}
                >
                  {RELATIONSHIP_OPTIONS.map((rel) => (
                    <option key={rel} value={rel}>{rel}</option>
                  ))}
                </select>
              </div>

              {/* Notes or Instructions */}
              <div>
                <label className="block text-xs font-bold tracking-wider uppercase text-gray-500 dark:text-neutral-400 mb-1.5">
                  Emergency Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Has spare house keys, lives 5 mins away"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className={`w-full px-4 py-2.5 border rounded-xl text-xs focus:outline-none focus:border-[#B41A46] font-medium ${
                    darkMode ? 'bg-neutral-800 border-neutral-700 text-white placeholder:text-neutral-500' : 'bg-gray-50/50 border-gray-200 text-gray-900 placeholder:text-gray-400'
                  }`}
                />
              </div>

              {/* Primary Contact Checkbox */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-gray-200 dark:border-neutral-800 bg-gray-50/40 dark:bg-neutral-800/40 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formIsPrimary}
                  onChange={(e) => setFormIsPrimary(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#B41A46] rounded cursor-pointer"
                />
                <div>
                  <span className="text-xs font-bold text-gray-900 dark:text-white block">
                    Set as Primary Emergency Contact
                  </span>
                  <span className="text-[11px] text-gray-500 dark:text-neutral-400 leading-tight block mt-0.5">
                    Will be synced to your Medical ID and given first priority during dispatch alerts.
                  </span>
                </div>
              </label>

              {/* Submit Button */}
              <div className="pt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-3.5 rounded-xl border border-gray-200 dark:border-neutral-700 text-xs font-semibold text-gray-700 dark:text-neutral-300 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3.5 rounded-xl bg-[#B41A46] hover:bg-[#9a143a] text-white font-bold text-xs sm:text-sm transition-all shadow-sm active:scale-95"
                >
                  {editingContact ? 'Save Changes' : 'Add to Circle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
