import React from 'react';
import { Home as HomeIcon, MapPin, MessageSquare, User, Siren } from 'lucide-react';
import { Tab } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useUserSettings } from '../lib/userSettings';

interface MainLayoutProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  onNavigate?: (screen: any) => void;
  children: React.ReactNode;
}

interface NavTabItem {
  id: Tab;
  label: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavTabItem[] = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'mapTab', label: 'Map', icon: MapPin },
  { id: 'contacts', label: 'Contacts', icon: MessageSquare },
  { id: 'profile', label: 'Profile', icon: User },
];

export default function MainLayout({ activeTab, onTabChange, onNavigate, children }: MainLayoutProps) {
  const { userProfile } = useAuth();
  const { settings } = useUserSettings();
  const isResponder = userProfile?.role === 'responder' || settings.profile?.role === 'responder';

  return (
    <div className="flex flex-col h-full bg-[#FAFAFA] dark:bg-neutral-950 font-sans overflow-hidden transition-colors">
      {/* Top Navigation Bar */}
      <header className="shrink-0 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border-b border-neutral-200/80 dark:border-neutral-800 px-4 pt-3 pb-2.5 z-30 shadow-xs">
        <div className="max-w-md mx-auto flex items-center gap-2">
          <nav className="flex-1 bg-neutral-100/90 dark:bg-neutral-800/90 p-1 rounded-2xl flex items-center gap-1 border border-neutral-200/60 dark:border-neutral-700/50">
            {NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-1.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                    isActive
                      ? 'bg-white dark:bg-neutral-900 text-[#B41A46] dark:text-rose-400 shadow-xs border border-neutral-200/50 dark:border-neutral-700/50'
                      : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-white/40 dark:hover:bg-neutral-700/40'
                  }`}
                  aria-label={item.label}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-transform ${
                      isActive ? 'scale-110 text-[#B41A46] dark:text-rose-400' : ''
                    }`}
                    strokeWidth={isActive ? 2.3 : 1.8}
                  />
                  <span className="tracking-tight truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Quick Switcher for Verified Responders */}
          {isResponder && onNavigate && (
            <button
              onClick={() => onNavigate('responder')}
              className="py-2.5 px-3 bg-gradient-to-r from-blue-700 to-indigo-700 text-white rounded-2xl text-xs font-bold flex items-center gap-1.5 shadow-md hover:from-blue-800 hover:to-indigo-800 active:scale-95 transition-all cursor-pointer shrink-0"
              title="Open Responder Mobile CAD"
            >
              <Siren className="w-4 h-4 animate-pulse" />
              <span className="hidden sm:inline">CAD Mobile</span>
            </button>
          )}
        </div>
      </header>

      {/* Screen Content */}
      <main className="flex-1 min-h-0 relative overflow-hidden flex flex-col">
        {children}
      </main>
    </div>
  );
}
