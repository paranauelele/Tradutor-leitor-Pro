/**
@license
SPDX-License-Identifier: Apache-2.0
*/
import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from '@google/genai';
import {
  Languages, Wand2, ChevronRight, Loader2, Sparkles, Copy,
  CheckCircle2, Play, Pause, RotateCcw, Volume2, ChevronDown, Hash, Type
} from 'lucide-react';

const LANG_MAP: Record<string, string> = {
  'Português Brasileiro': 'pt-BR',
  'Inglês Americano': 'en-US',
  'Espanhol': 'es-ES',
  'Francês': 'fr-FR',
  'Alemão': 'de-DE',
  'Japonês': 'ja-JP',
  'Italiano': 'it-IT',
  'Português (Portugal)': 'pt-PT',
};

export default function App() {
  const [language, setLanguage] = useState('Português Brasileiro');
  const [style, setStyle] = useState('');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [speakingRate, setSpeakingRate] = useState(1);
  
  const charIndexRef = useRef(0);
  const chunksRef = useRef<string[]>([]);
  const currentChunkIndexRef = useRef(0);

  // ✅ CORREÇÃO: Carrega TODAS as vozes e trata mobile corretamente
  useEffect(() => {
    let loaded = false;
    
    const loadVoices = () => {
      if (loaded) return;
      const availableVoices = window.speechSynthesis.getVoices();
      
      if (availableVoices.length > 0) {
        loaded = true;
        setVoices(availableVoices);
        
        const targetLang = LANG_MAP[language];
        const langVoices = availableVoices.filter(v => v.lang.startsWith(targetLang));
        const bestMatch = langVoices[0] || availableVoices[0];
        if (bestMatch) setSelectedVoice(bestMatch);
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    // Fallback: tenta carregar após delay
    const timer = setTimeout(() => {
      if (!loaded) {
        loadVoices();
        if (voices.length === 0) {
          console.warn('Nenhuma voz encontrada. Verifique as permissões do navegador.');
        }
      }
    }, 1000);

    return () => {
      loaded = true;
      window.speechSynthesis.onvoiceschanged = null;
      clearTimeout(timer);
    };
  }, [language]);

  const sortedVoices = voices.filter(v => v.lang.startsWith(LANG_MAP[language]));
  const prepareChunks = (text: string) => text.match(/[^.!?]+[.!?]*|[^.!?]+/g) || [text];
  
  const playNextChunk = () => {
    if (currentChunkIndexRef.current >= chunksRef.current.length) {
      setIsSpeaking(false); setIsPaused(false); currentChunkIndexRef.current = 0; return;
    }
    const text = chunksRef.current[currentChunkIndexRef.current];
    const utterance = new SpeechSynthesisUtterance(text);
    
    const safeVoice = selectedVoice && voices.includes(selectedVoice) ? selectedVoice : voices[0];
    if (safeVoice) utterance.voice = safeVoice;
    utterance.rate = speakingRate;
    
    utterance.onstart = () => { setIsSpeaking(true); setIsPaused(false); };
    utterance.onend = () => { if (!isPaused) { currentChunkIndexRef.current++; playNextChunk(); } };
    utterance.onerror = () => { setIsSpeaking(false); setIsPaused(false); };
    window.speechSynthesis.speak(utterance);
  };

  const speak = () => {
    if (!output) return;
    if (voices.length === 0) {
      setError('Vozes ainda carregando. Tente em 2 segundos.');
      setTimeout(() => setError(null), 2000);
      return;
    }
    if (isPaused) { window.speechSynthesis.resume(); setIsPaused(false); setIsSpeaking(true); return; }
    window.speechSynthesis.cancel();
    chunksRef.current = prepareChunks(output);
    currentChunkIndexRef.current = 0;
    playNextChunk();
  };

  const pauseSpeaking = () => { window.speechSynthesis.pause(); setIsPaused(true); setIsSpeaking(false); };
  const stopSpeaking = () => { window.speechSynthesis.cancel(); setIsSpeaking(false); setIsPaused(false); currentChunkIndexRef.current = 0; };

  const translate = useCallback(async () => {
    if (!input.trim()) return;
    setIsLoading(true); setError(null); setIsCopied(false); stopSpeaking();
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error('Chave de API não configurada.');
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        config: {
          systemInstruction: `You are an elite expert translator. Provide ONLY the translated text without explanations.`,
        },
        contents: `Language: ${language}\nStyle: ${style || 'Natural'}\n\nText:\n${input}`,
      });
      setOutput(response.text || 'Erro na tradução.');
    } catch (err: any) {
      setError(err?.message || 'Falha na tradução.');
    } finally {
      setIsLoading(false);
    }
  }, [language, style, input]);

  const copyToClipboard = async () => {
    if (!output) return;
    try { await navigator.clipboard.writeText(output); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); } 
    catch (err) { console.error('Copy failed', err); }
  };

  const getStats = (text: string) => ({ chars: text.length, words: text.trim() ? text.trim().split(/\s+/).length : 0 });

  return (
    <div className="min-h-screen bg-[#020617] text-[#fcf6ba] font-sans">
      <main className="max-w-6xl mx-auto p-4 md:p-8">
        <motion.header initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-[#bf953f] to-[#aa771c]"><Sparkles className="w-8 h-8 text-black" /></div>
            <div>
              <h1 className="text-3xl md:text-5xl font-black bg-gradient-to-r from-[#bf953f] via-[#fcf6ba] to-[#aa771c] bg-clip-text text-transparent uppercase italic">AI ULTRA PRO</h1>
              <p className="text-[10px] uppercase tracking-[0.3em] font-bold opacity-70 mt-1">Gold Edition</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap items-center gap-3 w-full lg:w-auto bg-[#0f172a]/80 border border-[#bf953f]/40 rounded-2xl p-3 shadow-2xl">
            <div className="flex items-center gap-2 w-full sm:w-auto border-b sm:border-b-0 sm:border-r border-[#334155] pb-2 sm:pb-0 sm:pr-2">
              <button onClick={isSpeaking ? pauseSpeaking : speak} disabled={!output} className={`flex-1 sm:flex-none p-3 rounded-xl ${isSpeaking ? 'bg-[#bf953f] text-black' : 'bg-gradient-to-br from-[#bf953f] to-[#aa771c] text-black'}`}><Play className="w-5 h-5" /></button>
              <button onClick={stopSpeaking} disabled={!isSpeaking && !isPaused} className="p-3 rounded-xl text-[#bf953f]"><RotateCcw className="w-5 h-5" /></button>
            </div>
            <div className="relative flex-1 sm:min-w-[200px] w-full">
              <select value={selectedVoice?.name || ''} onChange={(e) => { const v = sortedVoices.find(v => v.name === e.target.value); if (v) setSelectedVoice(v); }} className="w-full bg-black/40 border border-[#334155] rounded-xl px-4 py-3 text-xs text-[#fcf6ba]">
                {sortedVoices.map(v => <option key={v.name} value={v.name}>{v.name.substring(0, 30)}</option>)}
                {sortedVoices.length === 0 && <option>Carregando vozes...</option>}
              </select>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-black/40 rounded-xl w-full sm:w-auto">
              <span className="text-[9px] text-[#bf953f]">{speakingRate}x</span>
              <input type="range" min="0.5" max="2" step="0.1" value={speakingRate} onChange={(e) => setSpeakingRate(parseFloat(e.target.value))} className="w-full accent-[#bf953f]" />
            </div>
          </div>
        </motion.header>

        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="bg-[#0f172a] border-2 border-[#bf953f]/30 rounded-3xl p-6 shadow-2xl">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full bg-[#1e293b] border border-[#334155] rounded-xl px-4 py-3 text-[#fcf6ba]">
                {Object.keys(LANG_MAP).map(lang => <option key={lang}>{lang}</option>)}
              </select>
              <input type="text" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="Estilo (opcional)..." className="w-full bg-[#1e293b] border border-[#334155] rounded-xl px-4 py-3 text-[#fcf6ba]" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Digite seu texto..." className="w-full bg-black/40 border border-[#334155] rounded-2xl p-4 text-white min-h-[150px]" />
              <div className="relative">
                <textarea readOnly value={output} placeholder="Tradução..." className="w-full bg-black/60 border border-[#bf953f]/30 rounded-2xl p-4 text-[#fcf6ba] min-h-[150px]" />
                {output && <button onClick={copyToClipboard} className="absolute top-2 right-2 p-2 bg-[#bf953f] rounded-lg text-black"><Copy className="w-4 h-4" /></button>}
              </div>
            </div>
            {error && <div className="bg-red-900/20 border border-red-500/50 p-3 rounded-xl text-red-200 text-sm">{error}</div>}
            <button onClick={translate} disabled={isLoading || !input.trim()} className="w-full bg-gradient-to-r from-[#bf953f] to-[#aa771c] py-4 rounded-2xl text-black font-bold uppercase disabled:opacity-40">
              {isLoading ? 'Processando...' : 'Traduzir'}
            </button>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
