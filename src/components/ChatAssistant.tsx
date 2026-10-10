import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Send, Bot, User, Loader2, Siren, Shield, AlertTriangle } from 'lucide-react';
import { sendChatToGemini, ChatTriageMessage } from '../lib/api';
import { useUserSettings } from '../lib/userSettings';
import { useAuth } from '../contexts/AuthContext';

interface ChatAssistantProps {
  initialMessage?: string;
  onBack: () => void;
  onNavigate?: (screen: string) => void;
  onTriggerSOS?: (serviceType?: string) => void;
}

interface Message {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  action?: string;
  actionType?: 'ambulance' | 'police' | 'fire' | 'call';
}

function parseActionTag(text: string): { cleanText: string; action?: string; actionType?: 'ambulance' | 'police' | 'fire' | 'call' } {
  const match = text.match(/\[ACTION:\s*([^\]]+)\]/i);
  if (!match) {
    return { cleanText: text };
  }
  const actionLabel = match[1].trim();
  const cleanText = text.replace(/\[ACTION:\s*([^\]]+)\]/i, '').trim();
  
  let actionType: 'ambulance' | 'police' | 'fire' | 'call' = 'ambulance';
  const lower = actionLabel.toLowerCase();
  if (lower.includes('police') || lower.includes('law') || lower.includes('patrol')) actionType = 'police';
  else if (lower.includes('fire') || lower.includes('rescue')) actionType = 'fire';
  else if (lower.includes('call') || lower.includes('hotline')) actionType = 'call';

  return { cleanText, action: actionLabel, actionType };
}

export default function ChatAssistant({ initialMessage, onBack, onNavigate, onTriggerSOS }: ChatAssistantProps) {
  const { settings } = useUserSettings();
  const { userProfile } = useAuth();
  const { profile, location } = settings;

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'bot',
      text: "Hello. I'm SERD AI, your Emergency Response & Triage Assistant. I'm here to assess your situation and route immediate help. Are you or anyone nearby in immediate danger?",
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const hasSentInitialRef = useRef(false);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const executeSend = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return;

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: textToSend.trim()
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setIsLoading(true);

    // Format chat history for Gemini API
    const historyPayload: ChatTriageMessage[] = newMessages.map(m => ({
      role: m.sender === 'bot' ? 'assistant' : 'user',
      text: m.text
    }));

    const contextPayload = {
      callerName: userProfile?.fullName || profile?.fullName || profile?.displayName || 'Citizen',
      location: location?.lastKnownAddress || 'Current GPS coordinates',
      bloodType: userProfile?.bloodType || profile?.bloodType || 'Unknown',
      allergies: (userProfile?.allergies || profile?.allergies || []).map(a => typeof a === 'string' ? a : a.allergen)
    };

    const response = await sendChatToGemini(historyPayload, contextPayload);
    setIsLoading(false);

    const { cleanText, action, actionType } = parseActionTag(response.text);

    const botMsg: Message = {
      id: `bot-${Date.now()}`,
      sender: 'bot',
      text: cleanText,
      action,
      actionType
    };

    setMessages(prev => [...prev, botMsg]);
  };

  useEffect(() => {
    if (initialMessage && !hasSentInitialRef.current) {
      hasSentInitialRef.current = true;
      executeSend(initialMessage);
    }
  }, [initialMessage]);

  const handleSend = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim()) return;
    const text = inputValue;
    setInputValue('');
    executeSend(text);
  };

  const handleExecuteAction = (actionType?: string) => {
    if (onTriggerSOS) {
      onTriggerSOS(actionType);
    } else if (onNavigate) {
      onNavigate('map');
    } else {
      onBack();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#FAFAFA] relative font-sans">
      {/* Header */}
      <div className="flex items-center justify-between p-4 px-6 bg-white shadow-xs z-10 shrink-0 border-b border-gray-100">
        <div className="flex items-center">
          <button 
            onClick={onBack} 
            className="text-gray-800 p-1.5 -ml-2 hover:bg-gray-100 rounded-full transition-colors mr-3 cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-gray-900 font-bold text-base leading-tight">SERD AI Triage</h1>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                LIVE
              </span>
            </div>
            <p className="text-gray-400 text-xs font-medium">Powered by Gemini 3.8 &bull; Emergency CAD Guidance</p>
          </div>
        </div>

        <button
          onClick={() => handleExecuteAction('ambulance')}
          className="bg-rose-50 hover:bg-rose-100 text-rose-700 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-rose-200 transition-colors cursor-pointer"
        >
          <Siren className="w-3.5 h-3.5 text-rose-600 animate-pulse" />
          <span>Quick SOS</span>
        </button>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex items-start gap-3 ${msg.sender === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 shadow-2xs ${
              msg.sender === 'bot' 
                ? 'bg-[#B41A46] text-white' 
                : 'bg-gray-200 text-gray-700'
            }`}>
              {msg.sender === 'bot' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
            </div>

            <div className={`rounded-2xl p-4 shadow-2xs max-w-[85%] sm:max-w-[75%] ${
              msg.sender === 'user' 
                ? 'bg-[#B41A46] text-white rounded-tr-xs' 
                : 'bg-white border border-gray-150 text-gray-800 rounded-tl-xs'
            }`}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap font-normal">
                {msg.text}
              </p>

              {msg.action && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <button 
                    onClick={() => handleExecuteAction(msg.actionType)}
                    className="w-full py-2.5 px-3 bg-[#B41A46] hover:bg-[#9a143a] text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Siren className="w-4 h-4 animate-bounce" />
                    <span>{msg.action}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-[#B41A46] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-white border border-gray-150 rounded-2xl rounded-tl-xs p-4 shadow-2xs">
              <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                <Loader2 className="w-4 h-4 animate-spin text-[#B41A46]" />
                <span>SERD AI is analyzing emergency symptoms & routing protocol...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-white border-t border-gray-100 shrink-0">
        <form onSubmit={handleSend} className="flex items-center bg-gray-50 rounded-2xl px-4 py-2 border border-gray-200 focus-within:border-[#B41A46] focus-within:bg-white transition-all shadow-2xs">
          <input 
            type="text" 
            placeholder="Describe what's happening or what you need..." 
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={isLoading}
            className="flex-1 bg-transparent border-none focus:outline-none text-sm text-gray-900 py-1.5 placeholder:text-gray-400"
          />
          <button 
            type="submit"
            disabled={!inputValue.trim() || isLoading} 
            className="w-9 h-9 bg-[#B41A46] rounded-xl flex items-center justify-center text-white ml-2 hover:bg-[#9a143a] transition-all disabled:opacity-40 disabled:hover:bg-[#B41A46] cursor-pointer shrink-0"
            aria-label="Send message"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 -ml-0.5" />}
          </button>
        </form>
      </div>
    </div>
  );
}
