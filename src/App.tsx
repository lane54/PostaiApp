/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Instagram, 
  Video, 
  LayoutDashboard, 
  History, 
  Settings, 
  ChevronRight, 
  ChevronLeft,
  Copy, 
  Check, 
  RefreshCw,
  Zap,
  CheckCircle2,
  ArrowRight,
  Menu,
  X,
  Plus,
  LogOut,
  CreditCard,
  TrendingUp,
  AlertCircle,
  Search,
  Filter,
  LayoutGrid,
  Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast, Toaster } from 'sonner';
import { generatePostIdeas, PostIdea, generateTrends } from './services/geminiService';
import { cn } from './lib/utils';
import { auth, db } from './firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  Timestamp
} from 'firebase/firestore';

const MP_PUBLIC_KEY = import.meta.env.VITE_MERCADOPAGO_PUBLIC_KEY || "APP_USR-251e3738-b630-4390-b396-dbdd5af08e36";

// --- Types ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  plan: 'free' | 'pro' | 'premium';
  createdAt: Timestamp;
  ideasGeneratedToday?: number;
  lastGenerationDate?: string;
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

// --- Components ---

const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  toast.error('Erro ao acessar o banco de dados. Verifique sua conexão.');
};

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'brand', size?: 'sm' | 'md' | 'lg' }>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const variants = {
      primary: 'bg-slate-900 text-white hover:bg-slate-800 shadow-sm',
      secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
      outline: 'border border-slate-200 bg-transparent hover:bg-slate-50 text-slate-600',
      ghost: 'hover:bg-slate-100 text-slate-600',
      brand: 'bg-brand-600 text-white hover:bg-brand-700 shadow-md shadow-brand-200',
    };
    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-4 py-2',
      lg: 'px-6 py-3 text-lg font-medium',
    };
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-2xl transition-all active:scale-95 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

const Card = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <div className={cn('bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm', className)}>
    {children}
  </div>
);

const Badge = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider', className)}>
    {children}
  </span>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [view, setView] = useState<'landing' | 'dashboard'>('landing');
  const [niche, setNiche] = useState('');
  const [audience, setAudience] = useState('');
  const [ideas, setIdeas] = useState<PostIdea[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [trends, setTrends] = useState<string[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  const [activeTab, setActiveTab] = useState<'generate' | 'creator-space' | 'trends'>('generate');
  const [searchTerm, setSearchTerm] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'Instagram' | 'TikTok'>('all');

  // Auth Listener
  useEffect(() => {
    // Check for payment status in URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      toast.success('Pagamento processado com sucesso! Seu plano será atualizado em instantes.');
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (params.get('payment') === 'failure') {
      toast.error('Houve um problema com seu pagamento. Tente novamente.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
      if (currentUser) {
        setView('dashboard');
        // Ensure user doc exists and fetch profile
        const userRef = doc(db, 'users', currentUser.uid);
        
        const unsubscribeProfile = onSnapshot(userRef, (snapshot) => {
          if (snapshot.exists()) {
            setUserProfile(snapshot.data() as UserProfile);
          } else {
            const newProfile = {
              uid: currentUser.uid,
              email: currentUser.email,
              displayName: currentUser.displayName,
              photoURL: currentUser.photoURL,
              plan: 'free',
              createdAt: serverTimestamp(),
              ideasGeneratedToday: 0,
              lastGenerationDate: new Date().toISOString().split('T')[0]
            };
            setDoc(userRef, newProfile);
          }
        });

        return () => unsubscribeProfile();
      } else {
        setView('landing');
        setUserProfile(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // History Listener
  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }

    const path = `users/${user.uid}/ideas`;
    const q = query(collection(db, path), orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHistory(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login error:", error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setView('landing');
  };

  const handleUpgrade = async (newPlan: 'pro' | 'premium') => {
    if (!user) return;
    setUpgrading(true);
    try {
      const response = await fetch('/api/create-preference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: newPlan,
          userId: user.uid,
          userEmail: user.email,
        }),
      });

      if (!response.ok) throw new Error('Erro ao criar preferência');

      const { init_point } = await response.json();
      window.location.href = init_point;
    } catch (error) {
      console.error(error);
      toast.error('Erro ao processar upgrade. Tente novamente.');
    } finally {
      setUpgrading(false);
    }
  };

  const handleFetchTrends = async () => {
    if (!niche) {
      toast.error('Defina o seu nicho primeiro!');
      return;
    }
    if (userProfile?.plan === 'free') {
      toast.error('Tendências estão disponíveis apenas para planos Pro e Premium!');
      setShowUpgradeModal(true);
      return;
    }
    setLoadingTrends(true);
    try {
      const newTrends = await generateTrends(niche);
      setTrends(newTrends);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao buscar tendências.');
    } finally {
      setLoadingTrends(false);
    }
  };

  const handleGenerate = async (append = false) => {
    if (!niche || !user || !userProfile) return;
    
    // Plan limits
    const today = new Date().toISOString().split('T')[0];
    const isNewDay = userProfile.lastGenerationDate !== today;
    const currentCount = isNewDay ? 0 : (userProfile.ideasGeneratedToday || 0);
    
    const limits = {
      free: 3,
      pro: 10,
      premium: 50
    };

    if (currentCount >= limits[userProfile.plan]) {
      toast.error(`Limite diário atingido para o plano ${userProfile.plan.toUpperCase()}. Faça upgrade para gerar mais!`, {
        action: {
          label: 'Upgrade',
          onClick: () => setShowUpgradeModal(true)
        }
      });
      return;
    }

    setLoading(true);
    try {
      // Generate 3 ideas for free, 5 for pro, 10 for premium
      const generationCount = userProfile.plan === 'free' ? 3 : userProfile.plan === 'pro' ? 5 : 10;
      const newIdeas = await generatePostIdeas(niche, audience || 'Pequenos criadores', generationCount);
      
      if (append) {
        setIdeas(prev => [...prev, ...newIdeas]);
      } else {
        setIdeas(newIdeas);
      }
      
      // Save to Firestore
      const path = `users/${user.uid}/ideas`;
      for (const idea of newIdeas) {
        await addDoc(collection(db, path), {
          ...idea,
          userId: user.uid,
          createdAt: serverTimestamp()
        });
      }

      // Update user generation count
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        ideasGeneratedToday: currentCount + 1,
        lastGenerationDate: today
      }, { merge: true });

      toast.success('Ideias geradas com sucesso!');
      setActiveTab('generate');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao gerar ideias. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteIdea = async (id: string) => {
    if (!user) return;
    const path = `users/${user.uid}/ideas/${id}`;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'ideas', id));
      toast.success('Ideia excluída com sucesso!');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, '_connection_test_', 'ping'));
        console.log("✅ Conexão com Firestore estabelecida com sucesso.");
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("❌ Erro de configuração do Firebase: o cliente está offline.");
          toast.error("Erro de conexão com o banco de dados. Verifique a configuração.");
        }
      }
    };
    testConnection();
  }, []);

  const handleSaveIdea = async (idea: PostIdea) => {
    if (!user) {
      toast.error('Você precisa estar logado para salvar ideias.');
      return;
    }
    const path = `users/${user.uid}/ideas`;
    try {
      await addDoc(collection(db, 'users', user.uid, 'ideas'), {
        ...idea,
        userId: user.uid,
        createdAt: serverTimestamp()
      });
      toast.success('Ideia salva no seu espaço!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <RefreshCw className="w-8 h-8 animate-spin text-brand-600" />
      </div>
    );
  }

  const UpgradeModal = () => (
    <AnimatePresence>
      {showUpgradeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-slate-900 border border-slate-800 rounded-[3rem] p-8 max-w-2xl w-full shadow-2xl overflow-hidden relative"
          >
            <button 
              onClick={() => setShowUpgradeModal(false)}
              className="absolute top-6 left-6 flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800 rounded-xl transition-all text-slate-400 hover:text-slate-200 font-bold text-xs"
            >
              <ChevronLeft className="w-4 h-4" /> Voltar
            </button>
            <button 
              onClick={() => setShowUpgradeModal(false)}
              className="absolute top-6 right-6 p-2 hover:bg-slate-800 rounded-full transition-colors"
            >
              <X className="w-6 h-6 text-slate-400 hover:text-slate-200" />
            </button>
            
            <div className="text-center mb-10">
              <Badge className="bg-brand-500/10 text-brand-400 mb-4 border border-brand-500/20">Upgrade de Plano</Badge>
              <h2 className="text-3xl font-black tracking-tight mb-2 text-white">Libere todo o seu potencial.</h2>
              <p className="text-slate-400">Escolha o plano ideal para o seu crescimento no digital.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-950/50 border border-slate-800 rounded-[2.5rem] p-6 hover:border-brand-500/50 transition-colors relative overflow-hidden">
                <div className="absolute -right-12 top-6 rotate-45 bg-brand-600 text-white px-12 py-1 text-[10px] font-black uppercase tracking-widest">
                  7 Dias Grátis
                </div>
                <h3 className="text-xl font-bold mb-1 text-white">Plano Pro</h3>
                <p className="text-3xl font-black mb-4 text-white">R$29<span className="text-sm font-normal text-slate-500">/mês</span></p>
                <ul className="space-y-2 mb-6 text-sm text-slate-400">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-brand-500" /> 10 ideias por dia</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-brand-500" /> Legendas prontas</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-brand-500" /> Histórico ilimitado</li>
                </ul>
                <Button 
                  variant="brand" 
                  className="w-full" 
                  onClick={() => handleUpgrade('pro')}
                  disabled={upgrading}
                >
                  {upgrading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Assinar Pro'}
                </Button>
              </div>
              <div className="bg-brand-600 text-white rounded-[2.5rem] p-6 shadow-xl relative overflow-hidden">
                <div className="absolute -right-12 top-6 rotate-45 bg-white text-brand-600 px-12 py-1 text-[10px] font-black uppercase tracking-widest">
                  7 Dias Grátis
                </div>
                <h3 className="text-xl font-bold mb-1">Plano Premium</h3>
                <p className="text-3xl font-black mb-4">R$49<span className="text-sm font-normal opacity-70">/mês</span></p>
                <ul className="space-y-2 mb-6 text-sm opacity-90">
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Ideias ilimitadas</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Análise de tendências</li>
                  <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Suporte prioritário</li>
                </ul>
                <Button 
                  variant="brand" 
                  className="w-full bg-white text-brand-600 hover:bg-slate-100 border-none" 
                  onClick={() => handleUpgrade('premium')}
                  disabled={upgrading}
                >
                  {upgrading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Assinar Premium'}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-brand-600 selection:text-white">
        {/* Nav */}
        <nav className="flex items-center justify-between px-6 py-6 max-w-7xl mx-auto">
          <div className="flex items-center gap-2 font-bold text-2xl tracking-tighter text-brand-500">
            <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center shadow-lg shadow-brand-900/20">
              <Sparkles className="text-white w-6 h-6" />
            </div>
            PosteAI
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-400">
            <a href="#features" className="hover:text-brand-400 transition-colors">Funcionalidades</a>
            <a href="#pricing" className="hover:text-brand-400 transition-colors">Preços</a>
          </div>
          <Button onClick={handleLogin} variant="brand" size="sm">
            Entrar com Google
          </Button>
        </nav>

        {/* Hero */}
        <section className="px-6 py-20 max-w-7xl mx-auto text-center relative overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-brand-600/10 blur-[120px] rounded-full -z-10" />
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <Badge className="bg-brand-500/10 text-brand-400 mb-6 border border-brand-500/20">Inteligência Artificial</Badge>
            <h1 className="text-6xl md:text-8xl font-black tracking-tight leading-[0.85] mb-8 text-white">
              Crie conteúdo <br />
              <span className="text-brand-500">em segundos.</span>
            </h1>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              O PosteAI gera ideias virais, legendas prontas e as melhores hashtags para o seu nicho. O fim do bloqueio criativo chegou.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" variant="brand" onClick={handleLogin} className="w-full sm:w-auto px-10">
                Começar agora <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <CheckCircle2 className="w-4 h-4 text-green-500" /> Sem cartão necessário
              </div>
            </div>
          </motion.div>

          {/* Feature Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-32 text-left">
            {[
              { icon: <Zap className="text-amber-500" />, title: "Instantâneo", desc: "Gere 5 ideias completas em menos de 10 segundos." },
              { icon: <Instagram className="text-pink-500" />, title: "Otimizado", desc: "Conteúdo formatado para Instagram Reels e TikTok." },
              { icon: <History className="text-blue-500" />, title: "Histórico", desc: "Nunca perca uma boa ideia. Tudo fica salvo no seu banco." }
            ].map((f, i) => (
              <div key={i} className="p-8 rounded-[2.5rem] bg-slate-900/50 border border-slate-800 backdrop-blur-sm">
                <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center shadow-sm mb-6">
                  {f.icon}
                </div>
                <h3 className="text-xl font-bold mb-2 text-white">{f.title}</h3>
                <p className="text-slate-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="px-6 py-32 bg-slate-900/30">
          <div className="max-w-7xl mx-auto text-center">
            <h2 className="text-4xl font-black mb-4 tracking-tight text-white">Planos que cabem no seu bolso.</h2>
            <p className="text-slate-400 mb-16">Escolha a melhor opção para o seu crescimento.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {/* Pro Plan */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-[3rem] p-10 shadow-xl relative text-left overflow-hidden backdrop-blur-sm">
                <div className="absolute -right-12 top-6 rotate-45 bg-brand-600 text-white px-12 py-1 text-[10px] font-black uppercase tracking-widest">
                  7 Dias Grátis
                </div>
                <Badge className="bg-brand-500/10 text-brand-400 mb-4 border border-brand-500/20">Mais Vendido</Badge>
                <h3 className="text-2xl font-bold mb-2 text-white">Plano Pro</h3>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-5xl font-black tracking-tighter text-white">R$29</span>
                  <span className="text-slate-500">/mês</span>
                </div>
                <ul className="space-y-4 mb-10">
                  {['10 ideias por dia', 'Legendas prontas', 'Hashtags estratégicas', 'Histórico ilimitado'].map((feature, i) => (
                    <li key={i} className="flex items-center gap-3 text-slate-400 text-sm">
                      <CheckCircle2 className="w-5 h-5 text-brand-500" /> {feature}
                    </li>
                  ))}
                </ul>
                <Button variant="brand" className="w-full" onClick={handleLogin}>Assinar Pro</Button>
              </div>

              {/* Premium Plan */}
              <div className="bg-brand-600 text-white border border-brand-500 rounded-[3rem] p-10 shadow-2xl relative text-left overflow-hidden">
                <div className="absolute -right-12 top-6 rotate-45 bg-white text-brand-600 px-12 py-1 text-[10px] font-black uppercase tracking-widest">
                  7 Dias Grátis
                </div>
                <Badge className="bg-white/20 text-white mb-4 border border-white/30">Ilimitado</Badge>
                <h3 className="text-2xl font-bold mb-2 text-white">Plano Premium</h3>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-5xl font-black tracking-tighter">R$49</span>
                  <span className="opacity-70">/mês</span>
                </div>
                <ul className="space-y-4 mb-10">
                  {['Ideias ilimitadas', 'Análise de tendências', 'Suporte prioritário', 'Acesso antecipado'].map((feature, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm opacity-90">
                      <CheckCircle2 className="w-5 h-5" /> {feature}
                    </li>
                  ))}
                </ul>
                <Button variant="brand" className="w-full bg-white text-brand-600 hover:bg-slate-100 border-none" onClick={handleLogin}>Assinar Premium</Button>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="px-6 py-20 border-t border-slate-900 max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tighter text-brand-500">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
              <Sparkles className="text-white w-5 h-5" />
            </div>
            PosteAI
          </div>
          <p className="text-sm text-slate-500">© 2026 PosteAI. Inteligência para criadores.</p>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex selection:bg-brand-600 selection:text-white font-sans text-slate-200">
      <Toaster position="top-right" richColors />
      <UpgradeModal />
      
      {/* Sidebar */}
      <aside className="w-72 border-r border-slate-800 bg-slate-900/50 hidden lg:flex flex-col p-6 sticky top-0 h-screen backdrop-blur-xl">
        <div className="flex items-center gap-3 font-black text-2xl tracking-tighter mb-10 text-white px-2">
          <div className="w-10 h-10 bg-brand-600 rounded-2xl flex items-center justify-center shadow-xl shadow-brand-900/20 rotate-3 group-hover:rotate-0 transition-transform">
            <Sparkles className="text-white w-6 h-6" />
          </div>
          PosteAI
        </div>
        
        <nav className="space-y-1.5 flex-1">
          <div className="px-3 mb-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Menu Principal</p>
          </div>
          <button 
            onClick={() => setActiveTab('generate')}
            className={cn(
              "w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all duration-200 group",
              activeTab === 'generate' 
                ? "bg-white text-slate-950 shadow-lg shadow-white/5 font-bold" 
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            )}
          >
            <LayoutDashboard className={cn("w-5 h-5", activeTab === 'generate' ? "text-brand-600" : "text-slate-500 group-hover:text-slate-300")} /> 
            <span className="text-sm">Dashboard</span>
          </button>
          <button 
            onClick={() => setActiveTab('creator-space')}
            className={cn(
              "w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all duration-200 group",
              activeTab === 'creator-space' 
                ? "bg-white text-slate-950 shadow-lg shadow-white/5 font-bold" 
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            )}
          >
            <LayoutGrid className={cn("w-5 h-5", activeTab === 'creator-space' ? "text-brand-600" : "text-slate-500 group-hover:text-slate-300")} /> 
            <span className="text-sm">Espaço do Criador</span>
          </button>
          <button 
            onClick={() => setActiveTab('trends')}
            className={cn(
              "w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all duration-200 group",
              activeTab === 'trends' 
                ? "bg-white text-slate-950 shadow-lg shadow-white/5 font-bold" 
                : "text-slate-400 hover:bg-white/5 hover:text-white"
            )}
          >
            <TrendingUp className={cn("w-5 h-5", activeTab === 'trends' ? "text-brand-600" : "text-slate-500 group-hover:text-slate-300")} /> 
            <span className="text-sm">Tendências</span>
          </button>
          
          <div className="pt-6 px-3 mb-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Conta</p>
          </div>
          <button 
            onClick={() => setShowUpgradeModal(true)}
            className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-slate-400 hover:bg-brand-500/10 hover:text-brand-400 transition-all duration-200 group"
          >
            <Zap className="w-5 h-5 text-slate-500 group-hover:text-brand-400" /> 
            <span className="text-sm">Fazer Upgrade</span>
          </button>
        </nav>

        <div className="mt-auto pt-6 border-t border-slate-800 space-y-6">
          {userProfile && (
            <div className="bg-slate-800/40 rounded-[2rem] p-5 border border-slate-700/50 backdrop-blur-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="relative">
                  <img src={userProfile.photoURL || ''} alt="" className="w-10 h-10 rounded-2xl border-2 border-slate-700 shadow-md object-cover" />
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-slate-800 rounded-full" />
                </div>
                <div className="overflow-hidden">
                  <p className="text-sm font-black text-white truncate tracking-tight">{userProfile.displayName}</p>
                  <div className="flex items-center gap-1.5">
                    <div className={cn(
                      "w-1.5 h-1.5 rounded-full",
                      userProfile.plan === 'free' ? 'bg-slate-600' : 'bg-brand-500'
                    )} />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                      {userProfile.plan}
                    </span>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[9px] text-slate-500 font-black uppercase tracking-[0.15em]">
                  <span>Limite Diário</span>
                  <span className="text-slate-300">{userProfile.ideasGeneratedToday || 0} / {userProfile.plan === 'free' ? 3 : userProfile.plan === 'pro' ? 10 : 50}</span>
                </div>
                <div className="w-full h-2 bg-slate-700/50 rounded-full overflow-hidden p-0.5">
                  <div 
                    className="h-full bg-white rounded-full transition-all duration-700 ease-out shadow-sm" 
                    style={{ width: `${Math.min(100, ((userProfile.ideasGeneratedToday || 0) / (userProfile.plan === 'free' ? 3 : userProfile.plan === 'pro' ? 10 : 50)) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 group"
          >
            <LogOut className="w-5 h-5 text-slate-600 group-hover:text-red-400" /> 
            <span className="text-sm font-medium">Sair da conta</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6 lg:p-10">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-white mb-1">
              Olá, {userProfile?.displayName?.split(' ')[0]}! <span className="inline-block animate-bounce">👋</span>
            </h1>
            <p className="text-slate-400 font-medium">O que vamos criar de incrível hoje?</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-3 bg-slate-900/50 px-5 py-2.5 rounded-2xl border border-slate-800 shadow-sm backdrop-blur-md">
              <div className="flex -space-x-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="w-6 h-6 rounded-full border-2 border-slate-800 bg-slate-800 flex items-center justify-center overflow-hidden">
                    <img src={`https://picsum.photos/seed/${i + 10}/100/100`} alt="" className="w-full h-full object-cover opacity-60" />
                  </div>
                ))}
              </div>
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-l border-slate-800 pl-3">
                +2.4k Criadores
              </span>
            </div>
            <Button variant="brand" size="sm" onClick={() => setShowUpgradeModal(true)} className="shadow-xl shadow-brand-500/20 font-bold px-6">
              <Zap className="w-4 h-4 mr-2 fill-current" /> Upgrade
            </Button>
          </div>
        </header>

        {activeTab === 'generate' ? (
          <div className="max-w-5xl">
            {/* Generator Form */}
            <Card className="mb-10 p-10 border border-slate-800 shadow-2xl shadow-black/20 rounded-[3rem] relative overflow-hidden bg-slate-900/40 backdrop-blur-xl">
              <div className="absolute top-0 right-0 w-96 h-96 bg-brand-500/5 rounded-full -mr-48 -mt-48 blur-3xl opacity-60 pointer-events-none" />
              <div className="relative z-10">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-10">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <TrendingUp className="w-3.5 h-3.5 text-brand-500" /> Seu Nicho de Atuação
                      </label>
                      <span className="text-[10px] text-slate-600 font-bold">Obrigatório</span>
                    </div>
                    <div className="relative group">
                      <div className="absolute inset-0 bg-brand-500/5 rounded-2xl blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity" />
                      <input 
                        type="text" 
                        placeholder="Ex: Fitness, Marketing, Culinária..." 
                        className="relative w-full px-7 py-5 rounded-2xl border border-slate-800 bg-slate-950/50 focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all text-lg font-medium placeholder:text-slate-600 shadow-sm text-white"
                        value={niche}
                        onChange={(e) => setNiche(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <ArrowRight className="w-3.5 h-3.5 text-brand-500" /> Público-Alvo Ideal
                      </label>
                      <span className="text-[10px] text-slate-600 font-bold">Opcional</span>
                    </div>
                    <div className="relative group">
                      <div className="absolute inset-0 bg-brand-500/5 rounded-2xl blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity" />
                      <input 
                        type="text" 
                        placeholder="Ex: Mulheres 25-35 anos, Iniciantes..." 
                        className="relative w-full px-7 py-5 rounded-2xl border border-slate-800 bg-slate-950/50 focus:outline-none focus:ring-4 focus:ring-brand-500/10 focus:border-brand-500 transition-all text-lg font-medium placeholder:text-slate-600 shadow-sm text-white"
                        value={audience}
                        onChange={(e) => setAudience(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                <Button 
                  variant="brand"
                  className="w-full py-8 text-xl font-black rounded-[2rem] shadow-2xl shadow-brand-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all" 
                  onClick={() => handleGenerate(false)}
                  disabled={loading || !niche}
                >
                  {loading ? (
                    <RefreshCw className="w-8 h-8 animate-spin" />
                  ) : (
                    <div className="flex items-center gap-4">
                      <span>Gerar Ideias de Conteúdo</span>
                      <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                        <Sparkles className="w-6 h-6" />
                      </div>
                    </div>
                  )}
                </Button>
              </div>
            </Card>

            {/* Results */}
            <div className="space-y-12">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {ideas.length > 0 && (
                    <button 
                      onClick={() => setIdeas([])}
                      className="flex items-center gap-2 px-5 py-2.5 hover:bg-slate-800 rounded-2xl transition-all text-slate-400 hover:text-white font-bold text-xs border border-slate-800 bg-slate-900/50 shadow-sm"
                    >
                      <ChevronLeft className="w-4 h-4" /> Voltar
                    </button>
                  )}
                  <div>
                    <h2 className="text-3xl font-black text-white tracking-tight">Ideias Sugeridas</h2>
                    <p className="text-slate-500 text-sm font-medium">Conteúdo pronto para ser postado.</p>
                  </div>
                </div>
                <Badge className="bg-white text-slate-950 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-white/5">
                  {ideas.length} Resultados
                </Badge>
              </div>

              <AnimatePresence mode="wait">
                {ideas.length > 0 ? (
                  <div className="space-y-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                      {ideas.map((idea, idx) => (
                        <motion.div
                          key={idx}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.1 }}
                        >
                          <Card className="group p-8 border border-slate-800 shadow-xl hover:shadow-2xl transition-all duration-300 bg-slate-900/40 backdrop-blur-md rounded-[2.5rem] relative overflow-hidden flex flex-col h-full">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/5 rounded-full -mr-16 -mt-16 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                            
                            <div className="flex items-center justify-between mb-6 relative z-10">
                              <div className="flex items-center gap-2">
                                <div className={cn(
                                  "w-8 h-8 rounded-xl flex items-center justify-center",
                                  idea.platform === 'Instagram' ? 'bg-pink-500/10 text-pink-500' : 'bg-white text-slate-950'
                                )}>
                                  {idea.platform === 'Instagram' ? <Instagram className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                                </div>
                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{idea.platform}</span>
                              </div>
                              <button 
                                onClick={() => copyToClipboard(idea.caption, idx.toString())}
                                className="p-2.5 bg-slate-800 hover:bg-brand-500/20 text-slate-500 hover:text-brand-400 rounded-xl transition-all shadow-sm"
                                title="Copiar Legenda"
                              >
                                {copiedId === idx.toString() ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                              </button>
                            </div>

                            <div className="relative z-10 flex-1">
                              <h3 className="text-xl font-black text-white mb-4 leading-tight group-hover:text-brand-400 transition-colors">{idea.title}</h3>
                              <div className="bg-slate-950/50 rounded-2xl p-5 mb-6 border border-slate-800/50">
                                <p className="text-sm text-slate-400 leading-relaxed italic">"{idea.caption}"</p>
                              </div>
                              <div className="flex flex-wrap gap-2 mb-8">
                                {idea.hashtags.map((tag, i) => (
                                  <span key={i} className="text-[10px] font-bold text-brand-400 bg-brand-500/10 px-3 py-1 rounded-lg border border-brand-500/20">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            </div>

                            <Button 
                              variant="outline" 
                              className="w-full rounded-2xl border-slate-800 text-slate-400 font-bold hover:bg-white hover:text-slate-950 hover:border-white transition-all mt-auto"
                              onClick={() => handleSaveIdea(idea)}
                            >
                              Salvar no Espaço <Plus className="ml-2 w-4 h-4" />
                            </Button>
                          </Card>
                        </motion.div>
                      ))}
                    </div>
                    
                    <div className="flex justify-center pt-10">
                      <Button 
                        variant="outline" 
                        size="lg"
                        className="rounded-full px-12 py-8 border-2 border-slate-800 text-slate-500 hover:border-brand-400 hover:text-brand-400 hover:bg-brand-500/10 transition-all font-black uppercase tracking-widest text-xs shadow-xl shadow-black/20"
                        onClick={() => handleGenerate(true)}
                        disabled={loading}
                      >
                        {loading ? (
                          <RefreshCw className="w-6 h-6 animate-spin" />
                        ) : (
                          <div className="flex items-center gap-3">
                            <span>Gerar Mais Ideias</span>
                            <Plus className="w-5 h-5" />
                          </div>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : !loading && (
                  <div className="text-center py-40 bg-slate-900/20 border-2 border-dashed border-slate-800 rounded-[4rem] shadow-inner backdrop-blur-sm">
                    <div className="w-28 h-28 bg-slate-800/50 rounded-full flex items-center justify-center mx-auto mb-8 shadow-xl shadow-black/20">
                      <Plus className="w-14 h-14 text-slate-700" />
                    </div>
                    <h3 className="text-3xl font-black text-white mb-3 tracking-tight">Pronto para viralizar?</h3>
                    <p className="text-slate-500 max-w-sm mx-auto font-medium">Preencha os campos acima e deixe a nossa IA criar o seu próximo post de sucesso.</p>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        ) : activeTab === 'creator-space' ? (
          <div className="space-y-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
              <div className="flex items-center gap-5">
                <button 
                  onClick={() => setActiveTab('generate')}
                  className="flex items-center gap-2 px-5 py-2.5 hover:bg-slate-800 rounded-2xl transition-all text-slate-400 hover:text-white font-bold text-xs border border-slate-800 bg-slate-900/50 shadow-sm"
                >
                  <ChevronLeft className="w-4 h-4" /> Voltar
                </button>
                <div>
                  <h2 className="text-4xl font-black text-white tracking-tight">Espaço do Criador</h2>
                  <p className="text-slate-400 font-medium">Sua biblioteca pessoal de conteúdos virais.</p>
                </div>
              </div>
              <Badge className="bg-brand-600 text-white px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl shadow-brand-900/20">
                {history.length} Ideias Salvas
              </Badge>
            </div>

            {/* Controls */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-8 relative group">
                <div className="absolute inset-0 bg-brand-500/5 rounded-3xl blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity" />
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-brand-400 transition-colors" />
                <input 
                  type="text" 
                  placeholder="Pesquisar ideias por título ou conteúdo..."
                  className="relative w-full pl-14 pr-8 py-5 bg-slate-900/40 border border-slate-800 rounded-3xl focus:ring-4 focus:ring-brand-500/10 focus:border-brand-600 transition-all outline-none shadow-sm text-lg font-medium placeholder:text-slate-600 text-white backdrop-blur-xl"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="lg:col-span-4 flex p-1.5 bg-slate-900/50 rounded-[1.5rem] border border-slate-800 backdrop-blur-xl">
                {(['all', 'Instagram', 'TikTok'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatformFilter(p)}
                    className={cn(
                      "flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                      platformFilter === p ? "bg-slate-800 text-white shadow-lg shadow-black/50" : "text-slate-500 hover:text-slate-300"
                    )}
                  >
                    {p === 'all' ? 'Todos' : p}
                  </button>
                ))}
              </div>
            </div>

            {history.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {history
                  .filter(item => {
                    const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                                        item.caption.toLowerCase().includes(searchTerm.toLowerCase());
                    const matchesPlatform = platformFilter === 'all' || item.platform === platformFilter;
                    return matchesSearch && matchesPlatform;
                  })
                  .map((item, idx) => (
                    <Card key={idx} className="group p-8 border border-slate-800 shadow-xl hover:shadow-2xl transition-all duration-300 bg-slate-900/40 rounded-[2.5rem] relative overflow-hidden flex flex-col h-full backdrop-blur-xl">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/5 rounded-full -mr-16 -mt-16 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                      
                      <div className="flex items-center justify-between mb-6 relative z-10">
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "w-8 h-8 rounded-xl flex items-center justify-center",
                            item.platform === 'Instagram' ? 'bg-pink-500/10 text-pink-400' : 'bg-slate-800 text-white'
                          )}>
                            {item.platform === 'Instagram' ? <Instagram className="w-4 h-4" /> : <Video className="w-4 h-4" />}
                          </div>
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{item.platform}</span>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => copyToClipboard(item.caption, (idx + 1000).toString())}
                            className="p-2.5 bg-slate-800/50 hover:bg-brand-500/20 text-slate-400 hover:text-brand-400 rounded-xl transition-all shadow-sm"
                            title="Copiar Legenda"
                          >
                            {copiedId === (idx + 1000).toString() ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                          <button 
                            onClick={() => handleDeleteIdea(item.id)}
                            className="p-2.5 bg-slate-800/50 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-xl transition-all shadow-sm"
                            title="Excluir"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="relative z-10 flex-1">
                        <h4 className="text-xl font-black text-white mb-4 line-clamp-2 leading-tight group-hover:text-brand-400 transition-colors">{item.title}</h4>
                        <div className="bg-slate-950/50 rounded-2xl p-5 mb-6 border border-slate-800/50">
                          <p className="text-sm text-slate-400 line-clamp-4 leading-relaxed italic">"{item.caption}"</p>
                        </div>
                        
                        <div className="flex justify-between items-center pt-4 border-t border-slate-800">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                            <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                              {item.createdAt?.toDate ? new Date(item.createdAt.toDate()).toLocaleDateString() : 'Recente'}
                            </span>
                          </div>
                          <button className="text-[10px] text-brand-400 font-black uppercase tracking-widest hover:text-brand-300 transition-colors">
                            Ver Detalhes
                          </button>
                        </div>
                      </div>
                    </Card>
                  ))}
              </div>
            ) : (
              <div className="text-center py-40 bg-slate-900/40 border-2 border-dashed border-slate-800 rounded-[4rem] shadow-inner backdrop-blur-xl">
                <div className="w-28 h-28 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-8 shadow-xl shadow-black/20">
                  <LayoutGrid className="w-14 h-14 text-slate-700" />
                </div>
                <h3 className="text-3xl font-black text-white mb-3 tracking-tight">Seu espaço está vazio</h3>
                <p className="text-slate-500 max-w-sm mx-auto mb-10 font-medium">Comece a gerar ideias para preencher o seu espaço de criador e dominar as redes sociais.</p>
                <Button 
                  variant="brand" 
                  size="lg"
                  className="rounded-full px-10 py-7 font-black uppercase tracking-widest text-xs shadow-2xl shadow-brand-500/30"
                  onClick={() => setActiveTab('generate')}
                >
                  Gerar Minha Primeira Ideia
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-12">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
              <div className="flex items-center gap-5">
                <button 
                  onClick={() => setActiveTab('generate')}
                  className="flex items-center gap-2 px-5 py-2.5 hover:bg-slate-800 rounded-2xl transition-all text-slate-400 hover:text-white font-bold text-xs border border-slate-800 bg-slate-900/50 shadow-sm"
                >
                  <ChevronLeft className="w-4 h-4" /> Voltar
                </button>
                <div>
                  <h2 className="text-4xl font-black text-white tracking-tight">Tendências do Momento</h2>
                  <p className="text-slate-400 font-medium">O que está bombando no seu nicho agora.</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                className="rounded-2xl border-slate-800 text-slate-400 font-bold hover:bg-brand-600 hover:text-white hover:border-brand-600 transition-all"
                onClick={handleFetchTrends} 
                disabled={loadingTrends}
              >
                {loadingTrends ? <RefreshCw className="w-5 h-5 animate-spin mr-2" /> : <RefreshCw className="w-5 h-5 mr-2" />}
                Atualizar Tendências
              </Button>
            </div>

            {trends.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {trends.map((trend, idx) => (
                  <Card key={idx} className="group p-10 border border-slate-800 shadow-xl hover:shadow-2xl transition-all duration-300 bg-slate-900/40 rounded-[3rem] relative overflow-hidden backdrop-blur-xl">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-brand-500/5 rounded-full -mr-20 -mt-20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    
                    <div className="flex items-center gap-5 mb-8 relative z-10">
                      <div className="w-14 h-14 bg-brand-600 text-white rounded-2xl flex items-center justify-center text-xl font-black shadow-lg shadow-brand-900/20">
                        {idx + 1 < 10 ? `0${idx + 1}` : idx + 1}
                      </div>
                      <Badge className="bg-brand-500/10 text-brand-400 border border-brand-500/20 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">
                        Viral Potential
                      </Badge>
                    </div>
                    <p className="text-xl font-bold text-white leading-relaxed relative z-10 group-hover:text-brand-400 transition-colors">
                      {trend}
                    </p>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-40 bg-slate-900/40 border-2 border-dashed border-slate-800 rounded-[4rem] shadow-inner backdrop-blur-xl">
                <div className="w-28 h-28 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-8 shadow-xl shadow-black/20">
                  <TrendingUp className="w-14 h-14 text-slate-700" />
                </div>
                <h3 className="text-3xl font-black text-white mb-3 tracking-tight">Descubra o que é viral</h3>
                <p className="text-slate-400 max-w-sm mx-auto mb-10 font-medium">Clique no botão acima para buscar as tendências mais quentes do seu nicho.</p>
                {userProfile?.plan === 'free' && (
                  <Button 
                    variant="outline" 
                    size="lg"
                    className="rounded-full px-10 py-7 font-black uppercase tracking-widest text-xs border-2 border-slate-800 text-slate-500 hover:border-brand-600 hover:text-brand-600 hover:bg-brand-500/10 transition-all"
                    onClick={() => setShowUpgradeModal(true)}
                  >
                    Disponível no Plano Pro
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
