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
  
  // Audio State
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [speakingRate, setSpeakingRate] = useState(1);
  
  const charIndexRef = useRef(0);
  const chunksRef = useRef<string[]>([]);
  const currentChunkIndexRef = useRef(0);

  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      const eliteVoices = availableVoices.filter(v => 
        v.name.toLowerCase().includes('google') || 
        v.name.toLowerCase().includes('natural') ||
        v.name.toLowerCase().includes('premium')
      );
      setVoices(eliteVoices);
      const targetLang = LANG_MAP[language];
      const langVoices = eliteVoices.filter(v => v.lang.startsWith(targetLang));
      const bestMatch = langVoices.find(v => v.name.toLowerCase().includes('google')) || langVoices[0];
      if (bestMatch) setSelectedVoice(bestMatch);
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [language]);

  const sortedVoices = voices.filter(v => v.lang.startsWith(LANG_MAP[language]));
  const prepareChunks = (text: string) => text.match(/[^.!?]+[.!?]*|[^.!?]+/g) || [text];
  
  const playNextChunk = () => {
    if (currentChunkIndexRef.current >= chunksRef.current.length) {
      setIsSpeaking(false); setIsPaused(false); currentChunkIndexRef.current = 0; return;
    }
    const text = chunksRef.current[currentChunkIndexRef.current];
    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = speakingRate;
    utterance.onstart = () => { setIsSpeaking(true); setIsPaused(false); };
    utterance.onend = () => { if (!isPaused) { currentChunkIndexRef.current++; playNextChunk(); } };
    utterance.onerror = () => { setIsSpeaking(false); setIsPaused(false); };
    window.speechSynthesis.speak(utterance);
  };

  const speak = () => {
    if (!output) return;
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
      // ✅ CORREÇÃO: Vite expõe variáveis com prefixo VITE_ via import.meta.env
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
    try {
      await navigator.clipboard.writeText(output);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) { console.error('Failed to copy!', err); }
  };

  const getStats = (text: string) => ({ chars: text.length, words: text.trim() ? text.trim().split(/\s+/).length : 0 });
  const inputStats = getStats(input);
  const outputStats = getStats(output);

  return (
    <div className="min-h-screen bg-[#020617] text-[#fcf6ba] font-sans selection:bg-[#bf953f] selection:text-black">
      <main className="max-w-6xl mx-auto p-4 md:p-8">
        <motion.header initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8 relative z-[60]">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-gradient-to-br from-[#bf953f] to-[#aa771c] shadow-lg shadow-[#bf953f]/20"><Sparkles className="w-8 h-8 text-black" /></div>
            <div>
              <h1 className="text-3xl md:text-5xl font-black tracking-tighter bg-gradient-to-r from-[#bf953f] via-[#fcf6ba] to-[#aa771c] bg-clip-text text-transparent uppercase italic leading-none">AI ULTRA PRO</h1>
              <p className="text-[10px] uppercase tracking-[0.3em] font-bold opacity-70 mt-1">Gold Edition — Elite Translation</p>
            </div>
            <AnimatePresence>{output && (<motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#bf953f] animate-pulse" /><span className="text-[10px] font-black tracking-widest text-[#bf953f] uppercase">Engine: {selectedVoice?.name.split(' ')[0] || 'Premium'}</span></motion.div>)}</AnimatePresence>
          </div>
          <div className="flex flex-wrap items-center gap-3 bg-[#0f172a]/80 border-2 border-[#bf953f]/40 rounded-2xl p-1.5 pr-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-1 border-r border-[#334155] pr-2">
              <button onClick={isSpeaking ? pauseSpeaking : speak} disabled={!output} className={`p-3 rounded-xl flex items-center justify-center transition-all shadow-lg active:scale-95 disabled:opacity-20 disabled:grayscale ${isSpeaking ? 'bg-[#bf953f] text-black' : 'bg-gradient-to-br from-[#bf953f] to-[#aa771c] text-black'}`} title={isSpeaking ? "Pausar" : "Ouvir"}>
                {isSpeaking ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>
              <button onClick={stopSpeaking} disabled={!isSpeaking && !isPaused} className="p-3 rounded-xl text-[#bf953f] hover:bg-[#bf953f]/10 transition-all active:scale-95 disabled:opacity-20" title="Sair / Reset"><RotateCcw className="w-5 h-5" /></button>
            </div>
            <div className="relative group min-w-[200px]">
              <Volume2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#bf953f] pointer-events-none" />
              <select value={selectedVoice?.name || ''} onChange={(e) => { const v = sortedVoices.find(v => v.name === e.target.value); if (v) setSelectedVoice(v); }} className="w-full bg-black/40 border border-[#334155] rounded-xl pl-9 pr-6 py-3 text-xs font-bold text-[#fcf6ba] focus:outline-none focus:border-[#bf953f] appearance-none cursor-pointer uppercase tracking-tighter transition-all hover:bg-black/60">
                {sortedVoices.map(v => (<option key={v.name} value={v.name} className="bg-[#0f172a]">{v.name.includes('Google') ? '★ ' : ''}{v.name.substring(0, 20)}...</option>))}
                {sortedVoices.length === 0 && <option>Nenhuma Voz Detectada</option>}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-[#bf953f] pointer-events-none opacity-40 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex items-center gap-3 px-3 py-2.5 bg-black/40 rounded-xl border border-white/5 min-w-[120px]">
              <span className="text-[9px] font-black tracking-widest text-[#bf953f] uppercase w-6">{speakingRate}x</span>
              <input type="range" min="0.5" max="2" step="0.1" value={speakingRate} onChange={(e) => setSpeakingRate(parseFloat(e.target.value))} className="w-20 h-1 bg-[#334155] rounded-full appearance-none cursor-pointer accent-[#bf953f]" />
            </div>
          </div>
        </motion.header>

        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }} className="bg-[#0f172a] border-2 border-[#bf953f]/30 rounded-3xl p-6 md:p-10 shadow-2xl relative overflow-hidden backdrop-blur-sm">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#bf953f]/5 blur-3xl -z-10 rounded-full" />
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-[#aa771c]/5 blur-3xl -z-10 rounded-full" />
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 opacity-60"><Languages className="w-3 h-3 text-[#bf953f]" /> Idioma de Destino</label>
                <div className="relative group">
                  <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full bg-[#1e293b] border border-[#334155] rounded-xl px-4 py-4 text-[#fcf6ba] focus:outline-none focus:border-[#bf953f] transition-all appearance-none cursor-pointer font-medium">
                    {Object.keys(LANG_MAP).map(lang => <option key={lang}>{lang}</option>)}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40"><ChevronRight className="w-4 h-4 rotate-90" /></div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 opacity-60"><Wand2 className="w-3 h-3 text-[#bf953f]" /> Estilo / Tom Personalizado</label>
                <input type="text" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="Ex: Sotaque de Portugal, tom de mistério..." className="w-full bg-[#1e293b] border border-[#334155] rounded-xl px-4 py-4 text-[#fcf6ba] focus:outline-none focus:border-[#bf953f] transition-all placeholder:text-[#475569] font-medium" />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:h-[450px]">
              <div className="flex flex-col h-full group">
                <div className="flex-1 bg-black/40 rounded-3xl border border-[#334155] focus-within:border-[#bf953f]/50 transition-all overflow-hidden flex flex-col shadow-lg">
                  <div className="px-6 py-3 bg-[#0f172a]/80 border-b border-[#334155] text-[10px] font-bold uppercase tracking-widest opacity-50 group-focus-within:opacity-100 group-focus-within:text-[#bf953f] flex justify-between items-center shrink-0"><span>Entrada Original</span><Type className="w-3 h-3 opacity-20" /></div>
                  <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Insira o texto para tradução de elite..." className="flex-1 w-full bg-transparent p-6 text-white resize-none focus:outline-none font-medium leading-relaxed" />
                  <div className="px-6 py-3 bg-black/20 border-t border-white/5 flex items-center justify-end gap-5 text-[9px] font-bold tracking-widest text-[#bf953f]/60 shrink-0"><span className="flex items-center gap-1.5"><Hash className="w-2.5 h-2.5" /> {inputStats.words} PALAVRAS</span><span className="flex items-center gap-1.5"><Type className="w-2.5 h-2.5" /> {inputStats.chars} CARACTERES</span></div>
                </div>
              </div>
              <div className="flex flex-col h-full group">
                <div className="flex-1 bg-black/60 rounded-3xl border border-[#bf953f]/30 transition-all overflow-hidden relative flex flex-col shadow-2xl">
                  <div className="px-6 py-3 bg-[#1e293b]/80 border-b border-[#334155] text-[10px] font-bold uppercase tracking-widest opacity-70 group-hover:opacity-100 group-hover:text-[#bf953f] flex justify-between items-center shrink-0"><span>Tradução Gold Effect</span><div className="flex items-center gap-2">{(isSpeaking || isPaused) && (<div className={`w-1.5 h-1.5 bg-[#bf953f] rounded-full ${isSpeaking ? 'animate-pulse' : 'opacity-40'}`} />)}<Sparkles className="w-3 h-3 text-[#bf953f]" /></div></div>
                  <textarea readOnly value={output} placeholder="Ouro puro processado..." className="flex-1 w-full bg-transparent p-6 text-[#fcf6ba] resize-none focus:outline-none font-medium leading-relaxed placeholder:opacity-20" />
                  {isLoading && (<div className="absolute inset-0 bg-[#020617]/80 backdrop-blur-[4px] flex flex-col items-center justify-center gap-4 z-10"><Loader2 className="w-16 h-16 text-[#bf953f] animate-spin" /><p className="text-[#bf953f] text-xs font-bold uppercase tracking-[0.3em] animate-pulse">Refinando Ouro...</p></div>)}
                  <AnimatePresence>{output && !isLoading && (<motion.button initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} onClick={copyToClipboard} className="absolute top-4 right-4 p-2.5 rounded-xl bg-[#bf953f] text-black shadow-lg hover:bg-[#fcf6ba] transition-all active:scale-95 z-20" title="Copiar Tradução">{isCopied ? <CheckCircle2 className="w-5 h-5" /> : <Copy className="w-5 h-5" />}</motion.button>)}</AnimatePresence>
                  <div className="px-6 py-3 bg-black/40 border-t border-[#bf953f]/10 flex items-center justify-end gap-5 text-[9px] font-bold tracking-widest text-[#bf953f] shrink-0"><span className="flex items-center gap-1.5"><Hash className="w-2.5 h-2.5 opacity-50" /> {outputStats.words} PALAVRAS</span><span className="flex items-center gap-1.5"><Type className="w-2.5 h-2.5 opacity-50" /> {outputStats.chars} CARACTERES</span></div>
                </div>
              </div>
            </div>

            <AnimatePresence>{error && (<motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-red-900/20 border border-red-500/50 p-4 rounded-xl text-red-200 text-sm font-medium">{error}</motion.div>)}</AnimatePresence>

            <div className="relative">
              <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }} onClick={translate} disabled={isLoading || !input.trim()} className="w-full relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-[#bf953f] via-[#fcf6ba] to-[#aa771c] rounded-2xl blur-xl group-hover:blur-2xl transition-all opacity-30 group-disabled:hidden" />
                <div className="relative w-full bg-gradient-to-r from-[#bf953f] via-[#fcf6ba] to-[#aa771c] px-8 py-6 rounded-2xl text-black font-black text-xl flex items-center justify-center gap-4 uppercase italic tracking-tighter shadow-2xl group-disabled:opacity-40 group-disabled:cursor-not-allowed group-disabled:grayscale">
                  {isLoading ? (<span className="flex items-center gap-3"><Loader2 className="w-6 h-6 animate-spin" /> Processando...</span>) : (<>Executar Tradução de Elite <ChevronRight className="w-7 h-7" /></>)}
                </div>
              </motion.button>
            </div>
          </div>
        </motion.div>

        <footer className="mt-12 flex flex-col items-center gap-4">
          <div className="h-px w-24 bg-gradient-to-r from-transparent via-[#bf953f]/40 to-transparent" />
          <p className="text-[10px] uppercase tracking-[0.5em] opacity-40 font-black">AI ULTRA PRO • Gold Edition Premium Service</p>
        </footer>
      </main>
    </div>
  );
}