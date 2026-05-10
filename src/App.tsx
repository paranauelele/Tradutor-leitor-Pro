/**
@license
SPDX-License-Identifier: Apache-2.0
*/
import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from '@google/genai';
import {
  Languages,
  Wand2,
  ChevronRight,
  Loader2,
  Sparkles,
  Copy,
  CheckCircle2,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  ChevronDown,
  Hash,
  Type
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
  
  // Audio State
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [speakingRate, setSpeakingRate] = useState(1);
  
  const charIndexRef = useRef(0);
  const chunksRef = useRef<string[]>([]);
  const currentChunkIndexRef = useRef(0);

  // ✅ CORREÇÃO DE VOZES: Carrega TODAS as vozes e trata o Mobile
  useEffect(() => {
    let loadAttempts = 0;
    
    const loadVoices = () => {
      loadAttempts++;
      const availableVoices = window.speechSynthesis.getVoices();
      
      // Mostra TODAS as vozes (não filtrar apenas "Google", senão celular fica vazio)
      setVoices(availableVoices);
      
      const targetLang = LANG_MAP[language];
      const langVoices = availableVoices.filter(v => v.lang.startsWith(targetLang));
      
      // Tenta pegar a voz do idioma, se não tiver, pega a primeira que achar
      const bestMatch = langVoices[0] || availableVoices[0];
      if (bestMatch) setSelectedVoice(bestMatch);
    };

    // Carrega imediatamente
    loadVoices();
    
    // Mobile: O evento onvoiceschanged é obrigatório
    window.speechSynthesis.onvoiceschanged = loadVoices;

    // Fallback: se demorar, tenta de novo
    setTimeout(() => {
      if (voices.length === 0) loadVoices();
    }, 500);

    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [language]);

  // Filtra para o select mostrar só as do idioma
  const sortedVoices = voices.filter(v => v.lang.startsWith(LANG_MAP[language]));

  const prepareChunks = (text: string) => text.match(/[^.!?]+[.!?]*|[^.!?]+/g) || [text];
  
  const playNextChunk = () => {
    if (currentChunkIndexRef.current >= chunksRef.current.length) {
      setIsSpeaking(false); setIsPaused(false); currentChunkIndexRef.current = 0; return;
    }
    const text = chunksRef.current[currentChunkIndexRef.current];
    const utterance = new SpeechSynthesisUtterance(text);
    
    // ✅ Fallback: Garante que a voz existe antes de usar
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
    // Verifica se tem voz carregada
    if (voices.length === 0) {
      window.speechSynthesis.getVoices();
      setError('Carregando vozes... Tente clicar novamente em 2 segundos.');
      setTimeout(() => setError(null), 3000);
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
      // ✅ CORREÇÃO API: Usa VITE_ para funcionar na Vercel
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      
      if (!apiKey) throw new Error('Chave de API não configurada no ambiente.');

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        config: {
          systemInstruction: `You are an elite expert translator. Your goal is to translate text with absolute precision while perfectly capturing the requested style or tone. If the style is "Sotaque de Portugal", use European Portuguese idioms. If it's "mistério", use mysterious vocabulary. Provide ONLY the translated text without any explanations or extra characters.`,
        },
        contents: `Language: ${language}\nStyle/Tone (Optional): ${style || 'Natural'}\n\nText:\n${input}`,
      });
      setOutput(response.text || 'Ocorreu um erro na tradução.');
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Falha na tradução. Verifique sua conexão.');
    } finally {
      setIsLoading(false);
    }
  }, [language, style, input]);

  const copyToClipboard = async () => {
    if (!output) return;
    try { await navigator.clipboard.writeText(output); setIsCopied(true); setTimeout(() => setIsCopied(false), 2000); } 
    catch (err) { console.error('Failed to copy!', err); }
  };

  const getStats = (text: string) => ({ chars: text.length, words: text.trim() ? text.trim().split(/\s+/).length : 0 });
  const inputStats = getStats(input);
  const outputStats = getStats(output);

  return (
    <div className="min-h-screen bg-[#020617] text-[#fcf6ba] font-sans selection:bg-[#bf953f] selection:text-black">
      <main className="max-w-6xl mx-auto p-4 md:p-8">
        
        {/* Header Mobile-Friendly */}
        <motion.header 
          initial={{ opacity: 0, y: -20 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-[#bf953f] to-[#aa771c] shadow-lg shadow-[#bf953f]/20"><Sparkles className="w-8 h-8 text-black" /></div>
            <div>
              <h1 className="text-3xl md:text-5xl font-black tracking-tighter bg-gradient-to-r from-[#bf953f] via-[#fcf6ba] to-[#aa771c] bg-clip-text text-transparent uppercase italic leading-none">AI ULTRA PRO</h1>
              <p className="text-[10px] uppercase tracking-[0.3em] font-bold opacity-70 mt-1">Gold Edition — Elite Translation</p>
            </div>
          </div>

          {/* Controles de Áudio (Ajustados para Celular) */}
          <div className="flex flex-col sm:flex-row flex-wrap items-center gap-3 w-full lg:w-auto bg-[#0f172a]/80 border border-[#bf953f]/40 rounded-2xl p-3 lg:p-1.5 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-2 sm:gap-1 w-full sm:w-auto border-b sm:border-b-0 sm:border-r border-[#334155] pb-2 sm:pb-0 sm:pr-2">
              <button onClick={isSpeaking ? pauseSpeaking : speak} disabled={!output} 
                className={`flex-1 sm:flex-none p-3 rounded-xl flex items-center justify-center transition-all shadow-lg active:scale-95 disabled:opacity-20 ${isSpeaking ? 'bg-[#bf953f] text-black' : 'bg-gradient-to-br from-[#bf953f] to-[#aa771c] text-black'}`}>
                {isSpeaking ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>
              <button onClick={stopSpeaking} disabled={!isSpeaking && !isPaused} className="p-3 rounded-xl text-[#bf953f] hover:bg-[#bf953f]/10 transition-all active:scale-95 disabled:opacity-20"><RotateCcw className="w-5 h-5" /></button>
            </div>
            
            <div className="relative group flex-1 sm:min-w-[200px] w-full">
              <Volume2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#bf953f] pointer-events-none" />
              <select value={selectedVoice?.name || ''} onChange={(e) => { const v = sortedVoices.find(v => v.name === e.target.value); if (v) setSelectedVoice(v); }} 
                className="w-full bg-black/40 border border-[#334155] rounded-xl pl-9 pr-6 py-3 text-xs font-bold text-[#fcf6ba] focus:outline-none focus:border-[#bf953f] appearance-none cursor-pointer transition-all">
                {sortedVoices.map(v => (<option key={v.name} value={v.name} className="bg-[#0f172a]">{v.name.substring(0, 30)}</option>))}
                {sortedVoices.length === 0 && <option>Carregando vozes...</option>}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-[#bf953f] pointer-events-none opacity-40" />
            </div>

            <div className="flex items-center gap-3 px-3 py-2.5 bg-black/40 rounded-xl border border-white/5 w-full sm:min-w-[120px]">
              <span className="text-[9px] font-black tracking-widest text-[#bf953f] uppercase w-6">{speakingRate}x</span>
              <input type="range" min="0.5" max="2" step="0.1" value={speakingRate} onChange={(e) => setSpeakingRate(parseFloat(e.target.value))} className="w-full h-1 bg-[#334155] rounded-full appearance-none cursor-pointer accent-[#bf953f]" />
            </div>
          </div>
        </motion.header>

        {/* Card Principal */}
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} className="bg-[#0f172a] border-2 border-[#bf953f]/30 rounded-3xl p-6 md:p-10 shadow-2xl relative overflow-hidden">
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 opacity-60"><Languages className="w-3 h-3 text-[#bf953f]" /> Idioma de Destino</label>
                <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full bg-[#1e293b] border border-[#334155] rounded-xl px-4 py-4 text-[#fcf6ba] focus:outline-none focus:border-[#bf953f] transition-all">
                  {Object.keys(LANG_MAP).map(lang => <option key={lang}>{lang}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 opacity-60"><Wand2 className="w-3 h-3 text-[#bf953f]" /> Estilo / Tom</label>
                <input type="text" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="Ex: Tom de mistério..." className="w-full bg-[#1e293b] border border-[#334155] rounded-xl px-4 py-4 text-[#fcf6ba] focus:outline-none focus:border-[#bf953f] transition-all" />
              </div>
            </div>

            {/* Áreas de Texto (Responsivas) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 min-h-[400px]">
              <div className="flex flex-col">
                <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Insira o texto..." className="flex-1 w-full bg-black/40 border border-[#334155] rounded-3xl p-6 text-white resize-none focus:outline-none focus:border-[#bf953f]/50" />
                <div className="mt-2 text-right text-[9px] font-bold tracking-widest text-[#bf953f]/60"><span>{inputStats.words} PALAVRAS</span></div>
              </div>
              <div className="flex flex-col relative">
                <textarea readOnly value={output} placeholder="Tradução aqui..." className="flex-1 w-full bg-black/60 border border-[#bf953f]/30 rounded-3xl p-6 text-[#fcf6ba] resize-none focus:outline-none" />
                {isLoading && (<div className="absolute inset-0 bg-[#020617]/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4 z-10 rounded-3xl"><Loader2 className="w-12 h-12 text-[#bf953f] animate-spin" /><p className="text-[#bf953f] text-xs font-bold uppercase">Processando...</p></div>)}
                {output && !isLoading && (<button onClick={copyToClipboard} className="absolute top-4 right-4 p-2 rounded-lg bg-[#bf953f] text-black hover:bg-[#fcf6ba] active:scale-95 z-20">{isCopied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button>)}
              </div>
            </div>

            {error && <div className="bg-red-900/20 border border-red-500/50 p-4 rounded-xl text-red-200 text-sm">{error}</div>}

            <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} onClick={translate} disabled={isLoading || !input.trim()} className="w-full relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-[#bf953f] via-[#fcf6ba] to-[#aa771c] rounded-2xl blur-xl opacity-30 group-disabled:hidden" />
              <div className="relative w-full bg-gradient-to-r from-[#bf953f] via-[#fcf6ba] to-[#aa771c] px-8 py-5 rounded-2xl text-black font-black text-lg flex items-center justify-center gap-4 uppercase italic shadow-2xl group-disabled:opacity-40">
                {isLoading ? <span className="flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Processando</span> : <>Executar Tradução <ChevronRight className="w-6 h-6" /></>}
              </div>
            </motion.button>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
