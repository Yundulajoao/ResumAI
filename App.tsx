
/**
 * RE-INITIALIZE DATABASE SQL:
 * 
 * DROP TABLE IF EXISTS summaries CASCADE;
 * DROP TABLE IF EXISTS profiles CASCADE;
 * 
 * CREATE TABLE profiles (
 *   id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 *   full_name TEXT,
 *   role TEXT DEFAULT 'Aluno' CHECK (role IN ('Professor', 'Aluno', 'Curioso')),
 *   updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
 * );
 * 
 * CREATE TABLE summaries (
 *   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 *   user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
 *   title TEXT NOT NULL,
 *   content TEXT NOT NULL,
 *   subject TEXT NOT NULL,
 *   importance TEXT NOT NULL,
 *   created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
 *   flashcards JSONB
 * );
 * 
 * -- Enable RLS & Policies for both tables...
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, 
  Trash2, 
  FileText, 
  Camera, 
  Volume2,
  BrainCircuit, 
  X,
  Check, 
  Link as LinkIcon,
  Sparkles,
  FileDown, 
  LayoutDashboard,
  GraduationCap,
  Calendar,
  Bot,
  Loader2,
  Maximize2,
  BookMarked,
  Mail,
  Download,
  ChevronDown,
  ChevronRight,
  Lock,
  User as UserIcon,
  LogOut,
  ArrowRight,
  Zap,
  Calculator,
  Atom,
  Microscope,
  ScrollText,
  Globe,
  Book,
  AlertCircle,
  Database,
  Terminal,
  UserPlus,
  CheckCircle2,
  Cpu,
  Beaker,
  Users,
  Scale,
  Briefcase,
  UserCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Summary, Subject, Importance, Flashcard, SummaryOption, User, UserRole } from './types';
import { GeminiService } from './services/geminiService';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { jsPDF } from 'jspdf';

const gemini = new GeminiService();

const ImportanceWeight = {
  [Importance.HIGH]: 3,
  [Importance.MEDIUM]: 2,
  [Importance.LOW]: 1
};

const SubjectIcons: Record<string, React.ElementType> = {
  [Subject.MATHEMATICS]: Calculator,
  [Subject.PHYSICS]: Atom,
  [Subject.BIOLOGY]: Microscope,
  [Subject.CHEMISTRY]: Beaker,
  [Subject.HISTORY]: ScrollText,
  [Subject.GEOGRAPHY]: Globe,
  [Subject.LITERATURE]: Book,
  [Subject.PHILOSOPHY]: BrainCircuit,
  [Subject.SOCIOLOGY]: Users,
  [Subject.THEOLOGY]: GraduationCap,
  [Subject.LAW]: Scale,
  [Subject.ECONOMICS]: Database,
  [Subject.OTHERS]: FileText
};

const ImportanceColors = {
  [Importance.HIGH]: {
    bg: 'bg-rose-50',
    border: 'border-rose-100',
    text: 'text-rose-600',
    accent: 'bg-rose-500',
    badge: 'bg-rose-100 text-rose-700'
  },
  [Importance.MEDIUM]: {
    bg: 'bg-amber-50',
    border: 'border-amber-100',
    text: 'text-amber-600',
    accent: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-700'
  },
  [Importance.LOW]: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
    text: 'text-emerald-600',
    accent: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-700'
  }
};

interface UploadedFile {
  data: string;
  mime: string;
  name: string;
  id: string;
}

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSubject, setFilterSubject] = useState<string>('Todos');
  const [activeSummary, setActiveSummary] = useState<Summary | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const [creationStep, setCreationStep] = useState<'input' | 'selection'>('input');
  const [previewOptions, setPreviewOptions] = useState<SummaryOption[]>([]);
  const [previewFlashcards, setPreviewFlashcards] = useState<Flashcard[]>([]);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState<number>(0);
  const [isDetailPreviewOpen, setIsDetailPreviewOpen] = useState(false);
  const [detailOption, setDetailOption] = useState<SummaryOption | null>(null);

  const [newTitle, setNewTitle] = useState('');
  const [inputText, setInputText] = useState('');
  const [inputUrl, setInputUrl] = useState('');
  const [inputTopic, setInputTopic] = useState('');
  const [filesData, setFilesData] = useState<UploadedFile[]>([]);
  const [newSubject, setNewSubject] = useState<Subject>(Subject.OTHERS);
  const [newImportance, setNewImportance] = useState<Importance>(Importance.MEDIUM);

  const loadingMessages = [
    "Iniciando Agente AI...",
    "Interpretando seu conteúdo...",
    "Estruturando pontos essenciais...",
    "Criando flashcards memoráveis...",
    "Sincronizando estratégias..."
  ];
  const [loadingMessageIdx, setLoadingMessageIdx] = useState(0);

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', role: UserRole.ALUNO });
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<'error' | 'success' | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setIsLoadingData(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (currentUser && isSupabaseConfigured && supabase) {
      loadSummaries();
    } else {
      setSummaries([]);
      setIsLoadingData(false);
    }
  }, [currentUser]);

  const loadSummaries = async () => {
    if (!supabase) return;
    setIsLoadingData(true);
    const { data, error } = await supabase
      .from('summaries')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Erro ao carregar resumos:", error);
    } else {
      setSummaries(data || []);
    }
    setIsLoadingData(false);
  };

  useEffect(() => {
    let interval: number | undefined;
    if (isProcessing) {
      interval = window.setInterval(() => {
        setLoadingMessageIdx(prev => (prev + 1) % loadingMessages.length);
      }, 3000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isProcessing]);

  const groupedSummaries = useMemo(() => {
    let filtered = summaries.filter(s => 
      s.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
      s.content.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (filterSubject !== 'Todos') {
      filtered = filtered.filter(s => s.subject === filterSubject);
    }

    const groups: Record<string, Summary[]> = {};
    filtered.forEach(summary => {
      if (!groups[summary.subject]) groups[summary.subject] = [];
      groups[summary.subject].push(summary);
    });

    Object.keys(groups).forEach(subject => {
      groups[subject].sort((a, b) => ImportanceWeight[b.importance] - ImportanceWeight[a.importance]);
    });

    return groups;
  }, [summaries, searchTerm, filterSubject]);

  const totalFlashcards = useMemo(() => {
    return summaries.reduce((acc, curr) => acc + (curr.flashcards?.length || 0), 0);
  }, [summaries]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setIsAuthLoading(true);
    setAuthMessage(null);
    setAuthStatus(null);
    
    if (authMode === 'register') {
      const { data, error } = await supabase.auth.signUp({
        email: authForm.email,
        password: authForm.password,
        options: { 
          data: { 
            full_name: authForm.name,
            role: authForm.role
          } 
        }
      });
      if (error) {
        setAuthStatus('error');
        setAuthMessage(error.message);
      } else {
        if (data.session) {
        } else {
           setAuthStatus('success');
           setAuthMessage("Cadastro realizado com sucesso! Agora você já pode entrar.");
           setAuthMode('login');
           setAuthForm(prev => ({ ...prev, password: '' }));
        }
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: authForm.email,
        password: authForm.password,
      });
      
      if (error) {
        setAuthStatus('error');
        setAuthMessage("Não encontramos sua conta ou a senha está incorreta. Deseja criar um cadastro?");
      }
    }
    setIsAuthLoading(false);
  };

  const handleLogout = async () => {
    if (!supabase) return;
    if (confirm('Deseja sair da sua conta?')) {
      await supabase.auth.signOut();
      setActiveSummary(null);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setFilesData(prev => [...prev, {
            data: reader.result as string,
            mime: file.type,
            name: file.name,
            id: crypto.randomUUID()
          }]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removeFile = (id: string) => {
    setFilesData(prev => prev.filter(f => f.id !== id));
  };

  const handleProcess = async () => {
    if (!newTitle) return alert("Dê um título ao seu resumo!");
    setIsProcessing(true);
    setLoadingMessageIdx(0);
    try {
      const result = await gemini.processContent(
        inputText || undefined,
        filesData.map(f => ({ data: f.data, mimeType: f.mime })),
        inputUrl || undefined,
        inputTopic || undefined
      );

      if (result.options.length > 0) {
        setPreviewOptions(result.options);
        setPreviewFlashcards(result.flashcards);
        setCreationStep('selection');
      }
    } catch (error) {
      console.error(error);
      alert("Erro ao processar conteúdo.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveSelected = async () => {
    if (!supabase || !currentUser) return;
    const selected = previewOptions[selectedOptionIndex];
    const newSummaryData = {
      user_id: currentUser.id,
      title: newTitle,
      content: selected.content,
      subject: newSubject,
      importance: newImportance,
      flashcards: previewFlashcards
    };

    const { data, error } = await supabase
      .from('summaries')
      .insert([newSummaryData])
      .select()
      .single();

    if (error) {
      alert("Erro ao salvar no banco de dados.");
    } else {
      setSummaries(prev => [data, ...prev]);
      resetForm();
      setIsModalOpen(false);
    }
  };

  const resetForm = () => {
    setNewTitle('');
    setInputText('');
    setInputUrl('');
    setInputTopic('');
    setFilesData([]);
    setNewSubject(Subject.OTHERS);
    setNewImportance(Importance.MEDIUM);
    setCreationStep('input');
    setPreviewOptions([]);
    setPreviewFlashcards([]);
    setSelectedOptionIndex(0);
    setIsDetailPreviewOpen(false);
    setDetailOption(null);
  };

  const deleteSummary = async (id: string) => {
    if (!supabase) return;
    if (confirm("Deseja excluir este resumo permanentemente?")) {
      const { error } = await supabase.from('summaries').delete().eq('id', id);
      if (error) {
        alert("Erro ao deletar.");
      } else {
        setSummaries(prev => prev.filter(s => s.id !== id));
        if (activeSummary?.id === id) setActiveSummary(null);
      }
    }
  };

  const speak = async (text: string) => {
    if (isSpeaking) {
      if (currentSourceRef.current) {
        currentSourceRef.current.stop();
        setIsSpeaking(false);
      }
      return;
    }

    setIsSpeaking(true);
    try {
      const base64Audio = await gemini.generateSpeech(text);
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      const ctx = audioContextRef.current;
      const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => setIsSpeaking(false);
      currentSourceRef.current = source;
      source.start();
    } catch (error) {
      console.error("Erro no TTS:", error);
      setIsSpeaking(false);
    }
  };

  const exportToPDF = (summary: Summary) => {
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(summary.title, 20, 20);
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    const splitContent = doc.splitTextToSize(summary.content, 170);
    doc.text(splitContent, 20, 35);
    doc.save(`${summary.title}.pdf`);
  };

  const openDetailPreview = (summary: SummaryOption, index: number) => {
    setSelectedOptionIndex(index);
    setDetailOption(summary);
    setIsDetailPreviewOpen(true);
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-2xl w-full bg-white rounded-[3rem] shadow-2xl p-12 border border-slate-100">
          <div className="flex flex-col items-center text-center">
            <div className="bg-amber-100 p-6 rounded-3xl mb-8">
              <Database className="text-amber-600 w-12 h-12" />
            </div>
            <h1 className="text-3xl font-black text-slate-800 mb-4 tracking-tight">Supabase não Configurado</h1>
            <p className="text-slate-500 mb-10 max-w-md">Para salvar seus resumos na nuvem, você precisa configurar as variáveis de ambiente.</p>
            
            <div className="w-full space-y-6 text-left">
              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <Terminal size={12} /> Variáveis Necessárias
                </p>
                <ul className="space-y-2 font-mono text-xs text-indigo-600">
                  <li>SUPABASE_URL</li>
                  <li>SUPABASE_ANON_KEY</li>
                </ul>
              </div>
              
              <div className="bg-slate-900 p-6 rounded-2xl text-white">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">SQL para o Banco de Dados</p>
                <div className="max-h-40 overflow-y-auto text-[10px] font-mono leading-relaxed opacity-80 custom-scrollbar">
                  <pre>{`CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  role TEXT DEFAULT 'Aluno' CHECK (role IN ('Professor', 'Aluno', 'Curioso')),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  subject TEXT NOT NULL,
  importance TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  flashcards JSONB
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE summaries ENABLE ROW LEVEL SECURITY;
-- Adicione as políticas de RLS no painel do Supabase.`}</pre>
                </div>
              </div>
            </div>
            
            <p className="mt-10 text-xs font-bold text-slate-400 flex items-center gap-2">
              <AlertCircle size={14} /> Configure as variáveis no seu ambiente de execução.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-60">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-100 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-100 rounded-full blur-[120px]" />
        </div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-10 z-10 border border-white/20 relative">
          <div className="flex flex-col items-center mb-10">
            <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-4 rounded-3xl shadow-xl shadow-indigo-100 mb-4">
              <BrainCircuit className="text-white w-10 h-10" />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-slate-800 leading-none mb-2">ResumAI</h1>
            <p className="text-slate-400 text-sm font-semibold uppercase tracking-widest text-center">Cloud Study Architecture</p>
          </div>
          <div className="flex bg-slate-50 p-1.5 rounded-2xl mb-8">
            <button onClick={() => { setAuthMode('login'); setAuthMessage(null); setAuthStatus(null); }} className={`flex-1 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${authMode === 'login' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>Entrar</button>
            <button onClick={() => { setAuthMode('register'); setAuthMessage(null); setAuthStatus(null); }} className={`flex-1 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${authMode === 'register' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400'}`}>Cadastrar</button>
          </div>
          <form onSubmit={handleAuth} className="space-y-5">
            <AnimatePresence mode='wait'>
              {authMessage && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }} 
                  animate={{ opacity: 1, height: 'auto' }} 
                  exit={{ opacity: 0, height: 0 }} 
                  className={`border p-4 rounded-2xl overflow-hidden ${authStatus === 'success' ? 'bg-emerald-50 border-emerald-100' : 'bg-indigo-50 border-indigo-100'}`}
                >
                  <div className="flex gap-3">
                    {authStatus === 'success' ? <CheckCircle2 className="text-emerald-600 shrink-0" size={18} /> : <AlertCircle className="text-indigo-600 shrink-0" size={18} />}
                    <p className={`text-xs font-bold leading-relaxed ${authStatus === 'success' ? 'text-emerald-700' : 'text-indigo-700'}`}>{authMessage}</p>
                  </div>
                  {authMode === 'login' && authStatus !== 'success' && (
                    <button type="button" onClick={() => { setAuthMode('register'); setAuthMessage(null); }} className="mt-3 text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:underline flex items-center gap-1">
                      Mudar para Cadastro <ChevronRight size={12} />
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode='wait'>
              {authMode === 'register' && (
                <motion.div key="reg-fields" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Nome Completo</label>
                    <div className="relative group">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500" size={18} />
                      <input type="text" value={authForm.name} onChange={(e) => setAuthForm({...authForm, name: e.target.value})} placeholder="Seu nome" className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-100 font-bold" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Eu sou...</label>
                    <div className="relative group">
                      <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500" size={18} />
                      <select 
                        value={authForm.role} 
                        onChange={(e) => setAuthForm({...authForm, role: e.target.value as UserRole})} 
                        className="w-full pl-12 pr-10 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-100 font-bold appearance-none cursor-pointer"
                      >
                        {Object.values(UserRole).map(role => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={16} />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">E-mail</label>
              <div className="relative group">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500" size={18} />
                <input type="email" value={authForm.email} onChange={(e) => setAuthForm({...authForm, email: e.target.value})} placeholder="exemplo@email.com" className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-100 font-bold" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Senha</label>
              <div className="relative group">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500" size={18} />
                <input type="password" value={authForm.password} onChange={(e) => setAuthForm({...authForm, password: e.target.value})} placeholder="••••••••" className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-100 font-bold" />
              </div>
            </div>
            <button type="submit" disabled={isAuthLoading} className="w-full py-4 bg-slate-900 text-white font-black uppercase tracking-widest rounded-2xl hover:bg-black transition-all shadow-xl flex items-center justify-center gap-3 mt-4 disabled:opacity-50">
              {isAuthLoading ? <Loader2 className="animate-spin" size={18} /> : (
                authStatus === 'error' && authMode === 'login' ? <><UserPlus size={18} /> Criar Cadastro</> : (authMode === 'login' ? 'Entrar Agora' : 'Finalizar Cadastro')
              )}
              {!isAuthLoading && authStatus !== 'error' && <ArrowRight size={18} />}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-[#F8FAFC]">
      <aside className="w-full md:w-60 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0 overflow-hidden z-10 shadow-sm transition-all duration-300">
        <div className="p-5 flex items-center gap-2">
          <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-2 rounded-xl shadow-lg shadow-indigo-100">
            <BrainCircuit className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-800 leading-none">ResumAI</h1>
            <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mt-1 inline-block">Study Arch</span>
          </div>
        </div>

        <div className="flex-1 px-3 overflow-y-auto custom-scrollbar">
          <button 
            onClick={() => { resetForm(); setIsModalOpen(true); }}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md mb-6 mt-2"
          >
            <Zap size={16} className="fill-white" />
            Novo Resumo
          </button>

          <div className="space-y-4">
            <div className="px-1">
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 px-2">Menu</p>
              <button 
                onClick={() => { setActiveSummary(null); setFilterSubject('Todos'); }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${!activeSummary && filterSubject === 'Todos' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <LayoutDashboard size={14} />
                Biblioteca
              </button>
            </div>

            <div className="px-1">
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 px-2">Matérias</p>
              <div className="relative px-2">
                <select
                  value={filterSubject}
                  onChange={(e) => { setFilterSubject(e.target.value); setActiveSummary(null); }}
                  className="w-full bg-slate-50 border border-slate-100 text-slate-700 text-[11px] font-bold rounded-xl py-2.5 pl-3 pr-8 outline-none focus:ring-2 focus:ring-indigo-100 transition-all appearance-none cursor-pointer"
                >
                  {['Todos', ...Object.values(Subject)].map(subj => (
                    <option key={subj} value={subj}>{subj}</option>
                  ))}
                </select>
                <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <ChevronDown size={12} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 space-y-3">
          <div className="bg-slate-50 p-2.5 rounded-xl flex items-center gap-2 border border-slate-100">
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-[10px] shadow-sm">
              {currentUser.email.charAt(0).toUpperCase()}
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-[11px] font-bold text-slate-800 truncate">{currentUser.user_metadata?.full_name || currentUser.email}</p>
              <div className="flex items-center gap-1">
                <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${currentUser.user_metadata?.role === 'Professor' ? 'bg-indigo-100 text-indigo-700' : currentUser.user_metadata?.role === 'Curioso' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                  {currentUser.user_metadata?.role || 'Aluno'}
                </span>
              </div>
            </div>
          </div>
          <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all text-[10px] font-black uppercase tracking-widest">
            <LogOut size={14} /> Sair da conta
          </button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-6 lg:p-10 overflow-y-auto bg-[#F8FAFC]">
        {isLoadingData ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="animate-spin mb-4" size={32} />
            <p className="font-bold text-xs uppercase tracking-widest">Sincronizando com a Nuvem...</p>
          </div>
        ) : !activeSummary ? (
          <div className="max-w-[1400px] mx-auto">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-6 mb-10">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                   <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                   <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Nuvem Conectada</p>
                </div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tighter">Biblioteca Inteligente</h2>
                <p className="text-slate-400 text-xs font-medium">Seus resumos estão salvos com segurança.</p>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex gap-2">
                   <div className="bg-white border border-slate-100 px-4 py-3 rounded-2xl shadow-sm flex items-center gap-3">
                     <FileText size={16} className="text-indigo-600" />
                     <div className="text-right">
                       <p className="text-sm font-black leading-none">{summaries.length}</p>
                       <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Total</p>
                     </div>
                   </div>
                   <div className="bg-white border border-slate-100 px-4 py-3 rounded-2xl shadow-sm flex items-center gap-3">
                     <BrainCircuit size={16} className="text-violet-600" />
                     <div className="text-right">
                       <p className="text-sm font-black leading-none">{totalFlashcards}</p>
                       <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-1">Cards</p>
                     </div>
                   </div>
                </div>
                <div className="relative w-72 group">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500" size={16} />
                  <input type="text" placeholder="Pesquisar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-100 outline-none transition-all shadow-sm text-xs font-bold" />
                </div>
              </div>
            </div>

            {Object.keys(groupedSummaries).length > 0 ? (
              <div className="space-y-12">
                {(Object.entries(groupedSummaries) as [string, Summary[]][]).map(([subject, items]) => (
                  <div key={subject}>
                    <div className="flex items-center justify-between mb-4 px-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white border border-slate-100 rounded-xl flex items-center justify-center text-indigo-600 shadow-sm">
                           {(() => {
                             const Icon = SubjectIcons[subject] || GraduationCap;
                             return <Icon size={18} />;
                           })()}
                        </div>
                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-[0.15em]">{subject}</h4>
                        <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded uppercase">{items.length}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {items.map((summary: Summary) => {
                        const SubjectIcon = SubjectIcons[summary.subject] || FileText;
                        const colors = ImportanceColors[summary.importance] || ImportanceColors[Importance.MEDIUM];
                        return (
                          <div 
                            key={summary.id}
                            className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer group flex flex-col relative overflow-hidden"
                            onClick={() => setActiveSummary(summary)}
                          >
                            <div className={`absolute top-0 left-0 w-full h-1.5 ${colors.accent}`} />
                            <div className="flex justify-between items-start mb-4">
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${colors.bg} ${colors.text}`}>
                                <SubjectIcon size={24} />
                              </div>
                              <button 
                                onClick={(e) => { e.stopPropagation(); deleteSummary(summary.id); }} 
                                className="text-slate-300 hover:text-rose-500 transition-colors p-1.5 hover:bg-rose-50 rounded-lg"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                            <h3 className="text-base font-black text-slate-800 mb-2 group-hover:text-indigo-600 transition-colors leading-tight line-clamp-2">{summary.title}</h3>
                            <div className="flex items-center gap-3 text-[9px] text-slate-400 font-bold mb-4 uppercase tracking-widest">
                              <div className="flex items-center gap-1"><Calendar size={10} /> {new Date(summary.created_at || Date.now()).toLocaleDateString('pt-BR')}</div>
                            </div>
                            <p className="text-slate-500 text-xs leading-relaxed line-clamp-3 mb-6 flex-1 italic opacity-75">"{summary.content.slice(0, 100)}..."</p>
                            <div className="flex items-center justify-between pt-4 border-t border-slate-50 mt-auto">
                              <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest ${colors.badge}`}>{summary.importance}</span>
                              <div className="text-indigo-500 opacity-0 group-hover:opacity-100 transition-all translate-x-[-4px] group-hover:translate-x-0"><ChevronRight size={18} /></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-20 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-200">
                <BookMarked size={40} className="mx-auto mb-6 text-indigo-300" />
                <h3 className="text-slate-800 font-black text-xl mb-2">Sua biblioteca está vazia</h3>
                <button onClick={() => { resetForm(); setIsModalOpen(true); }} className="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl mt-6">Criar Primeiro Resumo</button>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-5xl mx-auto animate-in slide-in-from-bottom-4">
            <button onClick={() => setActiveSummary(null)} className="flex items-center gap-2 text-slate-400 hover:text-indigo-600 mb-8 font-black text-[9px] uppercase tracking-widest transition-all group">
              <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-100 group-hover:shadow-md transition-all">
                <ChevronRight className="rotate-180" size={14} />
              </div>
              Voltar para Coleção
            </button>

            <div className="bg-white rounded-[2.5rem] border border-slate-100 overflow-hidden shadow-2xl">
              <div className="p-10 border-b border-slate-100 bg-gradient-to-br from-white to-slate-50 flex flex-col md:flex-row gap-8 justify-between items-start md:items-end">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{activeSummary.subject}</span>
                  </div>
                  <h2 className="text-3xl md:text-5xl font-black text-slate-900 leading-tight mb-6 tracking-tight">{activeSummary.title}</h2>
                </div>
                
                <div className="flex flex-row md:flex-col gap-3 w-full md:w-auto">
                  <button onClick={() => speak(activeSummary.content)} disabled={isSpeaking} className={`flex-1 md:w-48 flex items-center justify-center gap-3 ${isSpeaking ? 'bg-rose-500' : 'bg-slate-900'} text-white px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl`}>
                    {isSpeaking ? <Loader2 className="animate-spin" size={16} /> : <Volume2 size={16} />} Ouvir Áudio
                  </button>
                  <button onClick={() => setIsExportMenuOpen(!isExportMenuOpen)} className="flex-1 md:w-48 flex items-center justify-between gap-3 bg-indigo-600 text-white px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl">
                    <Download size={16} /> Baixar <ChevronDown size={14} />
                  </button>
                </div>
              </div>

              <div className="p-10 lg:p-16">
                <div className="mb-20">
                  <div className="flex items-center gap-3 mb-8">
                    <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg"><FileText size={20} /></div>
                    <h4 className="text-xl font-black text-slate-800 tracking-tight">Síntese Estruturada</h4>
                  </div>
                  <div className="text-slate-700 text-lg whitespace-pre-wrap leading-relaxed font-medium">{activeSummary.content}</div>
                </div>

                <div className="bg-slate-50 rounded-[3rem] p-8 lg:p-14 border border-slate-100 shadow-inner">
                  <div className="flex items-center gap-3 mb-10">
                    <div className="bg-violet-600 p-2 rounded-xl text-white shadow-lg"><BrainCircuit size={20} /></div>
                    <h4 className="text-xl font-black text-slate-800 tracking-tight">Flashcards de Fixação</h4>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {activeSummary.flashcards?.map((card, idx) => (
                      <div key={idx} className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
                        <p className="text-slate-800 font-bold text-sm mb-5">{card.question}</p>
                        <p className="text-slate-500 text-[11px] font-medium leading-relaxed">{card.answer}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <AnimatePresence>
        {isModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] relative">
              
              <AnimatePresence>
                {isProcessing && (
                  <motion.div 
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }} 
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-[60] bg-white/95 backdrop-blur-xl flex flex-col items-center justify-center p-12 text-center"
                  >
                    <div className="relative mb-12">
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                        className="w-32 h-32 border-4 border-dashed border-indigo-200 rounded-full"
                      />
                      <motion.div 
                        animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="absolute inset-0 flex items-center justify-center"
                      >
                        <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-5 rounded-3xl shadow-2xl shadow-indigo-200">
                          <Cpu className="text-white w-10 h-10" />
                        </div>
                      </motion.div>
                      <motion.div 
                        animate={{ rotate: -360 }}
                        transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                        className="absolute -inset-4 border-2 border-indigo-50/50 rounded-full"
                      />
                    </div>
                    
                    <div className="relative h-12 flex flex-col items-center">
                      <AnimatePresence mode="wait">
                        <motion.h3 
                          key={loadingMessageIdx}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="text-2xl md:text-3xl font-black bg-gradient-to-r from-slate-900 to-indigo-600 bg-clip-text text-transparent mb-2"
                        >
                          {loadingMessages[loadingMessageIdx]}
                        </motion.h3>
                      </AnimatePresence>
                    </div>

                    <div className="mt-8 w-64 h-1.5 bg-slate-100 rounded-full overflow-hidden relative">
                      <motion.div 
                        animate={{ x: [-100, 300] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute top-0 left-0 w-24 h-full bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                      />
                    </div>
                    
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: "80%" }}
                      className="absolute top-0 left-0 h-1 bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500 opacity-20"
                      style={{ filter: "blur(2px)" }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {creationStep === 'input' ? (
                <>
                  <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-xl"><Sparkles size={24} /></div>
                      <div>
                        <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Novo Resumo Inteligente</h3>
                        <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Selecione suas fontes de conhecimento</p>
                      </div>
                    </div>
                    <button onClick={() => setIsModalOpen(false)} className="text-slate-300 hover:text-slate-600 transition-colors p-2 bg-slate-50 rounded-xl"><X size={24} /></button>
                  </div>
                  
                  <div className="p-10 space-y-10 overflow-y-auto flex-1 custom-scrollbar">
                    <div className="space-y-2 px-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Título do seu material</label>
                      <input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Ex: Anatomia Cardiovascular" className="w-full px-6 py-5 bg-slate-50 border border-slate-100 rounded-[1.5rem] focus:ring-4 focus:ring-indigo-100 outline-none font-black text-xl placeholder:text-slate-300" />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 px-2">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Área de Estudo</label>
                        <select value={newSubject} onChange={(e) => setNewSubject(e.target.value as Subject)} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-slate-700 text-sm">
                          {Object.values(Subject).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Prioridade Educacional</label>
                        <select value={newImportance} onChange={(e) => setNewImportance(e.target.value as Importance)} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold text-slate-700 text-sm">
                          <option value={Importance.LOW}>Normal</option>
                          <option value={Importance.MEDIUM}>Alta</option>
                          <option value={Importance.HIGH}>Crítica</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-5 px-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Entrada de Dados (Fontes múltiplas)</label>
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className={`flex flex-col p-4 border-2 border-dashed rounded-[2rem] gap-2 transition-all ${inputTopic ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100 bg-slate-50'}`}>
                           <Bot size={24} className={inputTopic ? 'text-indigo-600' : 'text-slate-300'} />
                           <input type="text" placeholder="Assunto..." value={inputTopic} onChange={(e) => setInputTopic(e.target.value)} className="w-full px-3 py-2 bg-white border rounded-xl text-[10px] outline-none font-bold text-indigo-600 shadow-sm" />
                        </div>
                        <input type="file" accept="image/*" multiple onChange={handleFileUpload} className="hidden" id="cam-up" />
                        <label htmlFor="cam-up" className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-[2rem] cursor-pointer bg-slate-50">
                          <Camera size={28} className="text-slate-300" /> 
                          <span className="text-[9px] mt-3 font-black uppercase tracking-widest">Imagens</span>
                        </label>
                        <div className={`flex flex-col p-4 border-2 border-dashed rounded-[2rem] gap-2 transition-all ${inputUrl ? 'border-indigo-500 bg-indigo-50' : 'border-slate-100 bg-slate-50'}`}>
                           <LinkIcon size={20} className={inputUrl ? 'text-indigo-600' : 'text-slate-300'} />
                           <input type="url" placeholder="URL..." value={inputTopic} onChange={(e) => setInputUrl(e.target.value)} className="w-full px-3 py-2 bg-white border rounded-xl text-[10px] outline-none font-bold text-indigo-600 shadow-sm" />
                        </div>
                        <input type="file" accept=".pdf,.doc,.docx" multiple onChange={handleFileUpload} className="hidden" id="doc-up" />
                        <label htmlFor="doc-up" className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-[2rem] cursor-pointer bg-slate-50">
                          <FileDown size={28} className="text-slate-300" /> 
                          <span className="text-[9px] mt-3 font-black uppercase tracking-widest">PDF/Docs</span>
                        </label>
                      </div>

                      {filesData.length > 0 && (
                        <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 flex flex-wrap gap-3">
                          {filesData.map((file) => (
                            <div key={file.id} className="relative group">
                              <div className="w-16 h-16 rounded-xl overflow-hidden border-2 border-white shadow-sm flex items-center justify-center bg-indigo-600 text-white">
                                {file.mime.startsWith('image/') ? <img src={file.data} className="w-full h-full object-cover" /> : <FileText size={24} />}
                              </div>
                              <button onClick={() => removeFile(file.id)} className="absolute -top-2 -right-2 bg-rose-500 text-white p-1 rounded-full shadow-lg"><X size={10} strokeWidth={4} /></button>
                            </div>
                          ))}
                        </div>
                      )}

                      <textarea 
                        placeholder="Ou cole o seu texto diretamente aqui..." value={inputText} onChange={(e) => setInputText(e.target.value)}
                        className="w-full px-8 py-6 bg-slate-50 border border-slate-100 rounded-[2rem] outline-none min-h-[140px] text-sm font-medium"
                      />
                    </div>
                  </div>
                  
                  <div className="p-10 bg-slate-50 border-t border-slate-100 flex gap-4">
                    <button onClick={() => setIsModalOpen(false)} className="px-8 py-4 bg-white border border-slate-200 text-slate-400 font-black rounded-2xl text-[10px] uppercase tracking-widest hover:bg-slate-100">Descartar</button>
                    <button 
                      onClick={handleProcess} disabled={isProcessing || (!inputText && filesData.length === 0 && !inputUrl && !inputTopic)}
                      className="flex-1 py-5 bg-slate-900 text-white font-black rounded-[1.5rem] hover:bg-black disabled:opacity-50 text-xs uppercase tracking-[0.2em] shadow-2xl flex items-center justify-center gap-3 transition-all"
                    >
                      <Sparkles size={18} /> GERAR COM INTELIGÊNCIA ARTIFICIAL
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="px-10 py-8 border-b border-slate-100 bg-indigo-50/20 flex items-center justify-between">
                    <div>
                      <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Estilos de Aprendizado</h3>
                      <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Escolha a profundidade do seu resumo</p>
                    </div>
                  </div>
                  
                  <div className="p-10 grid grid-cols-1 md:grid-cols-3 gap-6 overflow-y-auto flex-1 custom-scrollbar">
                    {previewOptions.map((opt, idx) => (
                      <div
                        key={idx}
                        onClick={() => setSelectedOptionIndex(idx)}
                        className={`flex flex-col p-6 rounded-[2.5rem] border-2 transition-all cursor-pointer ${selectedOptionIndex === idx ? 'border-indigo-600 bg-indigo-50/30 shadow-xl' : 'border-slate-100 hover:border-indigo-200'}`}
                      >
                        <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest mb-4 w-fit ${selectedOptionIndex === idx ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{opt.label}</span>
                        <div className="flex-1 font-medium text-slate-600 text-xs leading-relaxed line-clamp-6 italic mb-6">"{opt.content}"</div>
                        <button onClick={(e) => { e.stopPropagation(); openDetailPreview(opt, idx); }} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2"><Maximize2 size={12}/> Review Completo</button>
                      </div>
                    ))}
                  </div>
                  
                  <div className="p-10 bg-white border-t border-slate-100 flex justify-center">
                    <button 
                      onClick={handleSaveSelected} 
                      className="px-20 py-5 bg-slate-900 text-white font-black rounded-[1.8rem] hover:bg-black text-xs uppercase tracking-[0.25em] shadow-2xl active:scale-95 transition-all flex items-center gap-3"
                    >
                      <Check size={18} /> SALVAR NA MINHA NUVEM
                    </button>
                  </div>
                  
                  <AnimatePresence>
                    {isDetailPreviewOpen && detailOption && (
                      <motion.div 
                        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
                        className="absolute inset-0 z-[70] bg-white flex flex-col"
                      >
                        <div className="px-10 py-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                          <h4 className="text-xl font-black text-slate-800 uppercase tracking-tight">Visualização: {detailOption.label}</h4>
                          <button onClick={() => setIsDetailPreviewOpen(false)} className="text-slate-400 p-3 hover:bg-white rounded-2xl transition-all shadow-sm border border-slate-100"><X size={24} /></button>
                        </div>
                        <div className="p-10 lg:p-20 overflow-y-auto flex-1 custom-scrollbar">
                          <div className="max-w-3xl mx-auto text-slate-700 whitespace-pre-wrap leading-relaxed italic border-l-4 border-indigo-500 pl-10 text-base lg:text-xl font-medium">
                            {detailOption.content}
                          </div>
                        </div>
                        <div className="p-10 border-t border-slate-100 flex justify-center bg-white">
                          <button onClick={() => setIsDetailPreviewOpen(false)} className="px-12 py-4 bg-indigo-600 text-white font-black rounded-2xl text-xs uppercase tracking-widest shadow-xl">VOLTAR</button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default App;
