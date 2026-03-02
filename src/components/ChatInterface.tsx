import React, { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '../config';

// Provider metadata only - NO hardcoded models
const PROVIDERS = [
  { 
    id: 'ollama', 
    name: 'Ollama (Local)', 
    placeholder: 'http://localhost:11434',
    requiresKey: false
  },
  { 
    id: 'ollama-cloud', 
    name: 'Ollama Cloud', 
    placeholder: 'Enter your Ollama Cloud key',
    requiresKey: true
  },
  { 
    id: 'openai', 
    name: 'OpenAI', 
    placeholder: 'sk-...',
    requiresKey: true
  },
  { 
    id: 'anthropic', 
    name: 'Anthropic', 
    placeholder: 'sk-ant-...',
    requiresKey: true
  },
  { 
    id: 'gemini', 
    name: 'Gemini', 
    placeholder: 'AIza...',
    requiresKey: true
  },
];

// Session-level cache for fetched models
const modelCache: Record<string, { models: string[], timestamp: number }> = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface ChatInterfaceProps {
  onAddToMap?: (csvData: string, layerName: string) => void;
  onStylePatch?: (patch: any) => void;
  onQueryPlan?: (plan: any) => void;
  isOpen: boolean;
  onToggle: () => void;
  activeLayerNames: string[];
  activeLayersContext?: string;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ onAddToMap, onStylePatch, onQueryPlan, isOpen, onToggle, activeLayerNames, activeLayersContext }) => {

  const [showSettings, setShowSettings] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Array<{role: string, content: string, toolName?: string, toolData?: any, thinkingTime?: number}>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [customModel, setCustomModel] = useState(false);
  const [sessionId] = useState(() => `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  // @mention system state
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);

  // LLM Settings
  const [provider, setProvider] = useState(() => localStorage.getItem('chat_provider') || 'ollama');
  const [model, setModel] = useState(() => localStorage.getItem('chat_model') || 'llama2');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('chat_api_key') || '');
  const [ollamaUrl, setOllamaUrl] = useState(() => localStorage.getItem('chat_ollama_url') || 'http://localhost:11434');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [modelFetchError, setModelFetchError] = useState<string | null>(null);
  const [expandedWordlists, setExpandedWordlists] = useState<Record<number, boolean>>({});
  
  // File upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isLoading]);

  // @mention filtering
  const filteredLayers = activeLayerNames.filter(name =>
    name.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setMessage(val);

    // Auto-resize textarea
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      const newHeight = Math.min(inputRef.current.scrollHeight, 160);
      inputRef.current.style.height = `${newHeight}px`;
    }

    // Detect @ symbol
    const cursorPos = e.target.selectionStart || val.length;
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtPos = textBeforeCursor.lastIndexOf('@');
    if (lastAtPos !== -1) {
      const query = textBeforeCursor.slice(lastAtPos + 1);
      if (!query.includes(' ')) {
        setMentionQuery(query);
        setShowMentions(true);
        setMentionIndex(0);
        return;
      }
    }
    setShowMentions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showMentions && filteredLayers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(prev => (prev + 1) % filteredLayers.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(prev => (prev - 1 + filteredLayers.length) % filteredLayers.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(filteredLayers[mentionIndex]);
      } else if (e.key === 'Escape') {
        setShowMentions(false);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const insertMention = (layerName: string) => {
    const lastAtPos = message.lastIndexOf('@');
    const before = message.slice(0, lastAtPos);
    const afterAtEnd = message.indexOf(' ', lastAtPos);
    const after = afterAtEnd === -1 ? '' : message.slice(afterAtEnd);
    setMessage(`${before}@${layerName} ${after}`);
    setShowMentions(false);
    
    // Focus and adjust height
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.style.height = 'auto';
        const newHeight = Math.min(inputRef.current.scrollHeight, 160);
        inputRef.current.style.height = `${newHeight}px`;
      }
    }, 0);
  };

  useEffect(() => {
    localStorage.setItem('chat_provider', provider);
    localStorage.setItem('chat_model', model);
    localStorage.setItem('chat_api_key', apiKey);
    localStorage.setItem('chat_ollama_url', ollamaUrl);
  }, [provider, model, apiKey, ollamaUrl]);

  // Fetch models dynamically with caching
  const fetchModels = React.useCallback(async (forceRefresh = false) => {
    const currentProvider = PROVIDERS.find(p => p.id === provider);
    
    
    // Don't fetch if provider requires key but none is provided
    if (currentProvider?.requiresKey && !apiKey && provider !== 'ollama') {
      setAvailableModels([]);
      setModelFetchError('API key required to fetch models');
      return;
    }

    // Build cache key
    const cacheKey = `${provider}-${apiKey || 'nokey'}-${provider === 'ollama' ? ollamaUrl : ''}`;
    
    // Check cache
    if (!forceRefresh && modelCache[cacheKey]) {
      const cached = modelCache[cacheKey];
      if (Date.now() - cached.timestamp < CACHE_DURATION) {
        setAvailableModels(cached.models);
        setModelFetchError(null);
        return;
      }
    }

    setIsFetchingModels(true);
    setModelFetchError(null);
    
    try {
      const query = new URLSearchParams({
        provider: provider === 'ollama-cloud' ? 'ollama' : provider,
        ...(apiKey && { api_key: apiKey }),
        ...(provider === 'ollama' && { base_url: ollamaUrl }),
        ...(provider === 'ollama-cloud' && { base_url: 'https://api.ollama.com' })
      });

      const url = `${API_BASE_URL}/models?${query}`;
      
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.error) {
          console.error('[ChatInterface] API returned error:', data.error);
          setModelFetchError(data.error);
          setAvailableModels([]);
        } else if (data.models && data.models.length > 0) {
          setAvailableModels(data.models);
          setModelFetchError(null);
          
          // Cache the result
          modelCache[cacheKey] = {
            models: data.models,
            timestamp: Date.now()
          };
          
          // Auto-select first model if current model is not set or not in list
          if (!model || !data.models.includes(model)) {
            setModel(data.models[0]);
          }
        } else {
          console.warn('[ChatInterface] No models in response');
          setModelFetchError('No models available');
          setAvailableModels([]);
        }
      } else {
        console.error('[ChatInterface] HTTP error:', response.status);
        setModelFetchError('Failed to fetch models from provider');
        setAvailableModels([]);
      }
    } catch (error) {
      console.error('[ChatInterface] Failed to fetch models:', error);
      setModelFetchError('Network error - check backend connection');
      setAvailableModels([]);
    } finally {
      setIsFetchingModels(false);
    }
  }, [provider, apiKey, ollamaUrl, model]);

  // Fetch models when provider/credentials change
  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const handleProviderChange = (newProvider: string) => {
    setProvider(newProvider);
    setCustomModel(false);
    setModel(''); // Will be set by fetchModels
  };

  const handleSend = async () => {
    if (!message.trim() || isLoading) return;

    if (provider !== 'ollama' && !apiKey) {
      alert('Please enter an API key for ' + provider);
      setShowSettings(true);
      return;
    }

    const userMessage = { role: 'user', content: message };
    setMessages(prev => [...prev, userMessage]);
    setMessage('');
    
    // Reset height
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    
    setIsLoading(true);
    
    try {
      const response = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          model: model,
          provider: provider === 'ollama-cloud' ? 'ollama' : provider,
          api_key: apiKey || undefined,
          base_url: provider === 'ollama' ? ollamaUrl : (provider === 'ollama-cloud' ? 'https://api.ollama.com' : undefined),
          context: 'User is viewing a research platform with language, archaeology, and genetics data.' + (activeLayersContext ? `\nActive layers and columns:\n${activeLayersContext}` : ''),
          session_id: sessionId
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: data.content,
          toolName: data.tool_name,
          toolData: data.tool_data,
          thinkingTime: data.thinking_time
        }]);

        // No auto-mapping — user must click the button manually
      } else {
        const errorData = await response.json().catch(() => ({}));
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `Error: ${errorData.detail || response.statusText}` 
        }]);
      }
    } catch (error) {
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Connection failed. Please ensure the backend server is running.' 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      alert('Please upload a CSV file');
      return;
    }

    setUploadedFile(file);
    setIsLoading(true);
    
    // Read file content
    const reader = new FileReader();
    reader.onload = async (e) => {
      const csvContent = e.target?.result as string;
      
      const userMessage = { 
        role: 'user', 
        content: `I've uploaded a file: ${file.name}` 
      };
      setMessages(prev => [...prev, userMessage]);
      
      try {
        const response = await fetch(`${API_BASE_URL}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...messages, userMessage],
            model: model,
            provider: provider === 'ollama-cloud' ? 'ollama' : provider,
            api_key: apiKey || undefined,
            base_url: provider === 'ollama' ? ollamaUrl : (provider === 'ollama-cloud' ? 'https://api.ollama.com' : undefined),
            context: 'User is uploading a linguistic data file.' + (activeLayersContext ? `\nActive layers and columns:\n${activeLayersContext}` : ''),
            session_id: sessionId,
            uploaded_file: csvContent
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: data.content,
            toolData: data.tool_data,
            thinkingTime: data.thinking_time
          }]);

          // No auto-mapping — user must click the button manually
        } else {
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: 'Failed to process the uploaded file.' 
          }]);
        }
      } catch (error) {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: 'Connection error while uploading file.' 
        }]);
      } finally {
        setIsLoading(false);
        setUploadedFile(null);
      }
    };
    reader.readAsText(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const downloadCSV = (csvData: string, filename: string) => {
    const blob = new Blob([csvData], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Render message content with @mention highlights
  const renderContent = (content: string, role: string) => {
    return content.split(/(@[\w\s\-_.]+?)(?=\s|$)/g).map((part, i) => {
      if (part.startsWith('@')) {
        return (
          <span key={i} className={`px-1 rounded font-bold text-[11px] ${role === 'user' ? 'bg-white/20 text-white' : 'bg-blue-50 text-blue-600'}`}>
            {part}
          </span>
        );
      }
      return part;
    });
  };

  // If not open, render nothing (FAB is in App.tsx)
  if (!isOpen) return null;

  return (
    <div className="chat-root">
      {/* ── Header ── */}
      <div className="chat-header flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-white">
        <div className="flex items-center space-x-3 min-w-0">
          <div className="w-8 h-8 bg-linear-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200/60 shrink-0">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
          </div>
          <div className="min-w-0">
            <h3 className="font-black text-xs text-gray-800 uppercase tracking-widest">Research Assistant</h3>
            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tight truncate">{model || 'No model'}</p>
          </div>
        </div>
        <div className="flex items-center space-x-1 shrink-0">
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
            title="Settings"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          {/* ✕ Close Button — always visible */}
          <button
            onClick={onToggle}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-red-500 rounded-lg transition-all"
            title="Close (Esc)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
      
      {/* ── Body (flex column, constrained) ── */}
      <div className="chat-body bg-gray-50/30">
        {/* Settings overlay */}
        {showSettings && (
          <div className="absolute inset-0 bg-white/98 backdrop-blur-sm z-30 p-5 space-y-4 overflow-y-auto custom-scrollbar">
            <h4 className="font-black text-gray-800 text-xs uppercase tracking-widest mb-3">Configuration</h4>
            
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
              <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Provider</label>
              <select 
                value={provider}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="w-full text-xs font-bold border-2 border-gray-200 rounded-xl p-2.5 bg-white focus:border-blue-500 outline-none transition-all"
              >
                {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {provider === 'ollama' && (
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Ollama URL</label>
                <input 
                  type="text"
                  value={ollamaUrl}
                  onChange={(e) => setOllamaUrl(e.target.value)}
                  className="w-full text-xs font-bold border-2 border-gray-200 rounded-xl p-2.5 bg-white focus:border-blue-500 outline-none transition-all"
                  placeholder="http://localhost:11434"
                />
              </div>
            )}

            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Model</label>
                <div className="flex items-center space-x-2">
                  {isFetchingModels && <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
                  <button onClick={() => fetchModels(true)} disabled={isFetchingModels} className="text-[9px] font-black text-blue-500 hover:bg-blue-50 px-2 py-1 rounded transition-colors uppercase disabled:opacity-50">Refresh</button>
                  <button onClick={() => setCustomModel(!customModel)} className="text-[9px] font-black text-blue-500 hover:bg-blue-50 px-2 py-1 rounded transition-colors uppercase">{customModel ? 'List' : 'Custom'}</button>
                </div>
              </div>
              
              {modelFetchError && !customModel && (
                <div className="text-[10px] font-bold text-red-500 mb-2 p-2 bg-red-50 rounded-lg border border-red-100">⚠️ {modelFetchError}</div>
              )}
              
              {customModel ? (
                <input type="text" value={model} onChange={(e) => setModel(e.target.value)} className="w-full text-xs font-bold border-2 border-gray-200 rounded-xl p-2.5 bg-white focus:border-blue-500 outline-none transition-all" placeholder="e.g. gpt-4, llama3:8b" />
              ) : (
                <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full text-xs font-bold border-2 border-gray-200 rounded-xl p-2.5 bg-white focus:border-blue-500 outline-none transition-all" disabled={isFetchingModels || availableModels.length === 0}>
                  {availableModels.length === 0 && !isFetchingModels ? (
                    <option value="">No models detected</option>
                  ) : (
                    availableModels.map(m => <option key={m} value={m}>{m}</option>)
                  )}
                </select>
              )}
            </div>

            {provider !== 'ollama' && (
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">API Key</label>
                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full text-xs font-bold border-2 border-gray-200 rounded-xl p-2.5 bg-white focus:border-blue-500 outline-none transition-all" placeholder={PROVIDERS.find(p => p.id === provider)?.placeholder} />
              </div>
            )}

            <button onClick={() => setShowSettings(false)} className="w-full bg-linear-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:opacity-90 transition shadow-lg shadow-blue-200/50 active:scale-[0.98]">
              Save & Close
            </button>
          </div>
        )}

        {/* Messages — scrolls internally, never pushes input bar */}
        <div className="chat-messages p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center mt-16 px-6">
              <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100">
                <svg className="w-7 h-7 text-blue-600 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              </div>
              <h4 className="text-[11px] font-black text-gray-800 uppercase tracking-widest mb-2">Workspace Assistant</h4>
              <p className="text-[10px] text-gray-400 font-bold leading-relaxed">Ask questions, request maps, or perform linguistic analysis. Type <span className="text-blue-500 font-black">@</span> to reference active layers.</p>
            </div>
          )}

          {messages.map((msg, index) => (
            <div key={index} className={`flex items-start gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role !== 'user' && (
                <img
                  src="/user-ai.png"
                  alt="AI Assistant"
                  className="w-7 h-7 rounded-full object-cover ring-1 ring-gray-200 shrink-0 mt-0.5 bg-white p-0.5"
                />
              )}
              <div className={`max-w-[82%] p-3 rounded-2xl text-xs leading-relaxed shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-linear-to-br from-blue-600 to-indigo-600 text-white rounded-br-sm' 
                  : 'bg-white border border-gray-100 text-gray-800 rounded-bl-sm'
              }`}>
                <div className="whitespace-pre-wrap font-medium wrap-break-word overflow-hidden">
                  {renderContent(msg.content, msg.role)}
                </div>

                {msg.role === 'assistant' && msg.thinkingTime !== undefined && (
                  <div className="mt-2 text-[9px] text-gray-400 italic flex items-center gap-1 border-t border-gray-50 pt-1.5 font-bold">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {msg.thinkingTime}s
                  </div>
                )}
                
                {/* CSV action buttons */}
                {/* CSV action buttons (Downloads & Maps) */}
                {(msg.toolData?.can_download || msg.toolData?.latest_data || msg.toolData?.csv || msg.toolData?.result?.csv) && (
                  <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-gray-100/50">
                    <button
                      onClick={() => {
                        const csv = msg.toolData?.latest_data || msg.toolData?.csv || msg.toolData?.result?.csv;
                        if (csv) downloadCSV(csv, msg.toolData?.filename || msg.toolData?.result?.filename || `linguistic_data_${Date.now()}.csv`);
                      }}
                      className="px-3 py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-100 text-[10px] font-black rounded-lg hover:bg-emerald-100 transition-all uppercase tracking-tight flex items-center gap-1.5"
                    >
                      <span>📥 Download</span>
                      {(msg.toolData?.row_count || msg.toolData?.result?.row_count) && (
                        <span className="bg-emerald-100 px-1 rounded text-[9px]">
                          {msg.toolData?.row_count || msg.toolData?.result?.row_count}
                        </span>
                      )}
                    </button>

                    {/* Single 'Add to Map' button — user always decides */}
                    {onAddToMap && (msg.toolData?.latest_data || msg.toolData?.csv || msg.toolData?.result?.csv) && (
                      <button
                        onClick={(e) => {
                          try {
                            const csv = msg.toolData?.latest_data || msg.toolData?.csv || msg.toolData?.result?.csv;
                            const baseName = msg.toolName || msg.toolData?.tool || msg.toolData?.result?.tool || 'llm_layer';
                            // Abbreviate: split on _ or spaces, take first letter of each word, uppercase
                            const abbrev = baseName
                              .split(/[_\s]+/)
                              .filter(Boolean)
                              .map((w: string) => w[0].toUpperCase())
                              .join('');
                            const ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
                            const name = `${abbrev}_${ts.replace(':', '')}`;
                            if (csv) {
                              onAddToMap(csv, name);
                              const btn = e.currentTarget as HTMLButtonElement;
                              const oldHTML = btn.innerHTML;
                              btn.innerHTML = '✅ Added to Map';
                              btn.disabled = true;
                              setTimeout(() => { btn.innerHTML = oldHTML; btn.disabled = false; }, 2500);
                            }
                          } catch (err) { console.error('Failed to add to map:', err); }
                        }}
                        className="px-3 py-1.5 bg-blue-50 text-blue-600 border border-blue-100 text-[10px] font-black rounded-lg hover:bg-blue-100 transition-all uppercase tracking-tight disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <span>🗺️ Add to Map</span>
                        {(msg.toolData?.row_count || msg.toolData?.point_count || msg.toolData?.result?.row_count) && (
                          <span className="bg-blue-100 px-1 rounded text-[9px]">
                            {msg.toolData?.row_count || msg.toolData?.point_count || msg.toolData?.result?.row_count}
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                )}

                {/* Wordlist */}
                {(msg.toolData?.wordlist || msg.toolData?.result?.wordlist) && (msg.toolData?.wordlist || msg.toolData?.result?.wordlist).length > 0 && (
                  <div className="mt-3 p-3 bg-blue-50/50 rounded-xl text-xs border border-blue-100/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-black text-blue-700 uppercase tracking-widest text-[10px]">
                        Wordlist ({(msg.toolData?.wordlist || msg.toolData?.result?.wordlist).length} concepts)
                      </div>
                      {(msg.toolData?.wordlist || msg.toolData?.result?.wordlist).length > 15 && (
                        <button 
                          onClick={() => setExpandedWordlists(prev => ({ ...prev, [index]: !prev[index] }))}
                          className="text-blue-600 hover:text-blue-800 font-bold uppercase text-[9px] tracking-tight hover:underline"
                        >
                          {expandedWordlists[index] ? 'Collapse ↑' : `+${(msg.toolData?.wordlist || msg.toolData?.result?.wordlist).length - 15} more ↓`}
                        </button>
                      )}
                    </div>
                    <div className="text-gray-600 flex flex-wrap gap-1.5">
                      {(expandedWordlists[index] 
                        ? (msg.toolData?.wordlist || msg.toolData?.result?.wordlist) 
                        : (msg.toolData?.wordlist || msg.toolData?.result?.wordlist).slice(0, 15)
                      ).map((word: string, i: number) => (
                        <span key={i} className="bg-white/80 px-2 py-1 rounded-lg border border-blue-100/50 shadow-sm font-medium">{word}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Style Patch */}
                {msg.toolData?.type === 'style_patch' && (
                  <div className="mt-3 p-3 bg-purple-50/50 rounded-xl text-xs border border-purple-100/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-black text-purple-700 uppercase tracking-widest text-[10px]">Style Patch Generated</div>
                    </div>
                    <div className="text-gray-600 mb-2">Patch for layer <span className="font-bold">@{msg.toolData.layername}</span></div>
                    {onStylePatch && (
                      <button
                        onClick={() => {
                          onStylePatch(msg.toolData);
                          const btn = document.activeElement as HTMLButtonElement;
                          if (btn) {
                            btn.textContent = '✅ Applied!';
                            btn.disabled = true;
                            setTimeout(() => { btn.textContent = '🎨 Apply Style'; btn.disabled = false; }, 2000);
                          }
                        }}
                        className="px-3 py-1.5 bg-purple-50 text-purple-600 border border-purple-100 text-[10px] font-black rounded-lg hover:bg-purple-100 transition-all uppercase tracking-tight"
                      >
                        🎨 Apply Style
                      </button>
                    )}
                  </div>
                )}

                {/* Query Plan */}
                {msg.toolData?.type === 'query_plan' && (
                  <div className="mt-3 p-3 bg-orange-50/50 rounded-xl text-xs border border-orange-100/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-black text-orange-700 uppercase tracking-widest text-[10px]">Query Plan Generated</div>
                    </div>
                    <div className="text-gray-600 mb-2">Plan for layer <span className="font-bold">@{msg.toolData.layername}</span></div>
                    {onQueryPlan && (
                      <button
                        onClick={() => {
                          onQueryPlan(msg.toolData);
                          const btn = document.activeElement as HTMLButtonElement;
                          if (btn) {
                            btn.textContent = '✅ Executed!';
                            btn.disabled = true;
                            setTimeout(() => { btn.textContent = '⚡ Run Plan'; btn.disabled = false; }, 2000);
                          }
                        }}
                        className="px-3 py-1.5 bg-orange-50 text-orange-600 border border-orange-100 text-[10px] font-black rounded-lg hover:bg-orange-100 transition-all uppercase tracking-tight"
                      >
                        ⚡ Run Plan
                      </button>
                    )}
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <img
                  src="/user-profile.png"
                  alt="You"
                  className="w-7 h-7 rounded-full object-cover ring-1 ring-blue-200 shrink-0 mt-0.5"
                />
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start items-start gap-2">
              <img
                src="/user-ai.png"
                alt="AI Assistant"
                className="w-7 h-7 rounded-full object-cover ring-1 ring-gray-200 shrink-0 mt-0.5 bg-white p-0.5"
              />
              <div className="bg-white border border-gray-100 p-3 rounded-2xl rounded-bl-sm shadow-sm">
                <div className="flex flex-col space-y-1.5">
                  {uploadedFile && (
                    <div className="text-[10px] text-blue-500 font-bold italic">Processing {uploadedFile.name}...</div>
                  )}
                  <div className="flex space-x-1">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce [animation-delay:0.15s]" />
                    <div className="w-1.5 h-1.5 bg-blue-300 rounded-full animate-bounce [animation-delay:0.3s]" />
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
        
        {/* @Mention Dropdown */}
        {showMentions && filteredLayers.length > 0 && (
          <div className="mention-dropdown absolute bottom-16 left-4 right-4 bg-white/95 backdrop-blur-md border border-gray-200 rounded-xl shadow-2xl z-40 overflow-hidden">
            <div className="p-2 border-b bg-gray-50/80">
              <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest px-2">Reference a Layer</span>
            </div>
            <div className="max-h-48 overflow-y-auto custom-scrollbar">
              {filteredLayers.map((layer, i) => (
                <button
                  key={layer}
                  onClick={() => insertMention(layer)}
                  onMouseEnter={() => setMentionIndex(i)}
                  className={`w-full text-left px-4 py-2 text-[11px] font-bold transition-all flex items-center space-x-3 ${i === mentionIndex ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-blue-50'}`}
                >
                  <div className={`w-2 h-2 rounded-full ${i === mentionIndex ? 'bg-white' : 'bg-blue-500'}`} />
                  <span>{layer}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input bar — pinned at bottom, never pushed */}
        <div className="chat-input-bar p-3 bg-white border-t border-gray-100">
          <div className="flex space-x-2 items-center">
            <div className="flex-1 min-w-0">
              <textarea
                ref={inputRef}
                value={message}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Ask about data… type @ to mention layers"
                rows={1}
                className="w-full bg-gray-50 border-2 border-gray-100 rounded-xl px-4 py-2.5 text-xs font-medium focus:outline-none focus:border-blue-500 focus:bg-white transition-all resize-none overflow-y-auto custom-scrollbar"
                style={{ maxHeight: '160px', minHeight: '42px' }}
                disabled={isLoading}
              />
            </div>
            
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all shrink-0"
              title="Upload CSV"
              disabled={isLoading}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
            </button>
            
            <button
              onClick={handleSend}
              disabled={isLoading || !message.trim()}
              className="p-2.5 bg-linear-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:opacity-90 disabled:opacity-30 transition-all shadow-md shadow-blue-200/50 active:scale-95 shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;