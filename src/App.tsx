import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import SignUp from './components/SignUp';
import MainLayout from './components/MainLayout';
import Home from './components/Home';
import Contacts from './components/Contacts';
import Profile from './components/Profile';
import MapScreen from './components/MapScreen';
import ChatAssistant from './components/ChatAssistant';
import ResponderView from './components/ResponderView';
import { Screen, Tab } from './types';
import { useAuth } from './contexts/AuthContext';

export default function App() {
  const { currentUser, userProfile, loading } = useAuth();
  const [currentScreen, setCurrentScreen] = useState<Screen>('login');
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [initialChatMessage, setInitialChatMessage] = useState<string>('');
  const [mapAutoDispatch, setMapAutoDispatch] = useState<boolean>(false);
  const [activeEmergencyIncidentId, setActiveEmergencyIncidentId] = useState<string | null>(null);

  // Role-based routing synchronization & route guarding
  useEffect(() => {
    if (loading) return;

    if (!currentUser) {
      if (currentScreen !== 'signup') {
        setCurrentScreen('login');
      }
      return;
    }

    const storedRole = typeof localStorage !== 'undefined' ? localStorage.getItem('serd_current_user_role') : null;
    const role = userProfile?.role || (storedRole as 'citizen' | 'responder') || 'citizen';
    if (role === 'responder') {
      // Responder accounts ONLY access responder mobile view
      if (currentScreen !== 'responder') {
        setCurrentScreen('responder');
      }
    } else {
      // Citizen accounts ONLY access citizen portal
      if (currentScreen === 'responder' || currentScreen === 'login') {
        setCurrentScreen('main');
      }
    }
  }, [currentUser, userProfile?.role, loading]);

  // Early pre-cache real device GPS location so the map screen opens instantly without placeholder coordinates
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = [pos.coords.latitude, pos.coords.longitude];
          try {
            sessionStorage.setItem('serd_real_user_location', JSON.stringify(coords));
            localStorage.setItem('serd_real_user_location', JSON.stringify(coords));
          } catch {}
        },
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    }
  }, []);

  const handleNavigate = (screen: Screen | any) => {
    if (!currentUser && (screen === 'login' || screen === 'signup')) {
      setCurrentScreen(screen);
      return;
    }

    const storedRole = typeof localStorage !== 'undefined' ? localStorage.getItem('serd_current_user_role') : null;
    const role = userProfile?.role || (storedRole as 'citizen' | 'responder') || 'citizen';

    // Strict boundary: Responder accounts stay on responder mobile only
    if (role === 'responder' || screen === 'responder') {
      if (screen === 'login') {
        setCurrentScreen('login');
      } else {
        setCurrentScreen('responder');
      }
      return;
    }

    // Strict boundary: Citizen accounts stay on citizen portal only
    if (role === 'citizen') {
      if (screen === 'responder') {
        setCurrentScreen('main');
        return;
      }
    }

    if (screen === 'home' || screen === 'contacts' || screen === 'profile') {
      setCurrentScreen('main');
      setActiveTab(screen);
    } else if (screen === 'map' || screen === 'mapTab') {
      setMapAutoDispatch(false);
      setCurrentScreen('main');
      setActiveTab('mapTab');
    } else {
      setCurrentScreen(screen);
    }
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setCurrentScreen('main');
  };

  return (
    <div className="w-full h-[100dvh] bg-white overflow-hidden relative flex flex-col font-sans">
      {currentScreen === 'login' && <Login onNavigate={handleNavigate} />}
      {currentScreen === 'signup' && <SignUp onNavigate={handleNavigate} />}
      
      {currentScreen === 'main' && (
        <MainLayout activeTab={activeTab} onTabChange={handleTabChange}>
          {activeTab === 'home' && (
            <Home 
              onSOSClick={(auto, incidentId) => {
                setMapAutoDispatch(!!auto);
                if (incidentId) setActiveEmergencyIncidentId(incidentId);
                setActiveTab('mapTab');
              }} 
              onChatClick={(msg?: string) => {
                if (msg) setInitialChatMessage(msg);
                else setInitialChatMessage('');
                setCurrentScreen('chat');
              }}
              onNavigate={handleNavigate}
            />
          )}
          {activeTab === 'mapTab' && (
            <MapScreen 
              autoDispatch={mapAutoDispatch}
              initialIncidentId={activeEmergencyIncidentId}
              onBack={() => {
                setMapAutoDispatch(false);
                setActiveEmergencyIncidentId(null);
                setActiveTab('home');
              }} 
              onCancelDispatch={() => {
                setMapAutoDispatch(false);
                setActiveEmergencyIncidentId(null);
              }}
            />
          )}
          {activeTab === 'contacts' && <Contacts onNavigate={handleNavigate} />}
          {activeTab === 'profile' && <Profile onNavigate={handleNavigate} />}
        </MainLayout>
      )}

      {currentScreen === 'map' && (
        <MainLayout activeTab="mapTab" onTabChange={handleTabChange}>
          <MapScreen 
            autoDispatch={mapAutoDispatch}
            initialIncidentId={activeEmergencyIncidentId}
            onBack={() => {
              setMapAutoDispatch(false);
              setActiveEmergencyIncidentId(null);
              setCurrentScreen('main');
              setActiveTab('home');
            }} 
            onCancelDispatch={() => {
              setMapAutoDispatch(false);
              setActiveEmergencyIncidentId(null);
            }}
          />
        </MainLayout>
      )}

      {currentScreen === 'chat' && (
        <ChatAssistant 
          initialMessage={initialChatMessage} 
          onBack={() => setCurrentScreen('main')} 
          onNavigate={handleNavigate}
          onTriggerSOS={() => {
            setMapAutoDispatch(true);
            setCurrentScreen('main');
            setActiveTab('mapTab');
          }}
        />
      )}
      {currentScreen === 'responder' && <ResponderView onBack={() => setCurrentScreen('login')} />}
    </div>
  );
}
