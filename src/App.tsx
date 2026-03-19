import React, { useState, useEffect, useRef } from 'react';
import { 
  Calculator, 
  Lock, 
  ShieldAlert, 
  Plus, 
  Image as ImageIcon, 
  Video, 
  FileText, 
  Music,
  File,
  FileArchive,
  Code,
  Trash2, 
  LogOut, 
  Settings,
  ChevronLeft,
  Eye,
  EyeOff,
  AlertTriangle,
  LogIn,
  Bell,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  onAuthStateChanged, 
  signInWithPopup,
  GoogleAuthProvider,
  User 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  deleteDoc,
  serverTimestamp,
  getDocFromServer
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { cn } from './lib/utils';
import { sendSecurityAlertEmail } from './services/alertService';

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Types ---
interface UserConfig {
  pin: string;
  email: string;
  uid: string;
}

interface VaultItem {
  id: string;
  name: string;
  type: string;
  data: string;
  timestamp: any;
  uid: string;
}

interface SecurityAlert {
  id: string;
  type: string;
  email: string;
  content: string;
  timestamp: any;
  status: string;
  details: string;
}

// --- Components ---

const CalculatorButton = ({ 
  label, 
  onClick, 
  className, 
  variant = 'default' 
}: { 
  label: string; 
  onClick: () => void; 
  className?: string;
  variant?: 'default' | 'operator' | 'action' | 'zero';
}) => {
  const baseStyles = "h-16 w-16 rounded-full flex items-center justify-center text-xl font-medium transition-all active:scale-95";
  const variants = {
    default: "bg-zinc-800 text-white hover:bg-zinc-700",
    operator: "bg-orange-500 text-white hover:bg-orange-400",
    action: "bg-zinc-400 text-black hover:bg-zinc-300",
    zero: "bg-zinc-800 text-white hover:bg-zinc-700 w-36 rounded-3xl justify-start px-8"
  };

  return (
    <button 
      onClick={onClick} 
      className={cn(baseStyles, variants[variant], className)}
    >
      {label}
    </button>
  );
};

const Toast = ({ message, type, onClose }: { message: string, type: 'success' | 'error' | 'info', onClose: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 50, x: '-50%' }}
      animate={{ opacity: 1, y: 0, x: '-50%' }}
      exit={{ opacity: 0, y: 20, x: '-50%' }}
      className={cn(
        "fixed bottom-24 left-1/2 z-50 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 min-w-[300px]",
        type === 'success' ? "bg-emerald-500 text-white" : 
        type === 'error' ? "bg-red-500 text-white" : "bg-zinc-800 text-white"
      )}
    >
      {type === 'success' && <CheckCircle2 className="w-5 h-5" />}
      {type === 'error' && <XCircle className="w-5 h-5" />}
      {type === 'info' && <Bell className="w-5 h-5" />}
      <span className="text-sm font-medium">{message}</span>
    </motion.div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [config, setConfig] = useState<UserConfig | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [screen, setScreen] = useState<'calculator' | 'setup' | 'vault' | 'login'>('login');
  const [vaultTab, setVaultTab] = useState<'files' | 'alerts'>('files');
  const [calcDisplay, setCalcDisplay] = useState('0');
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Firebase Auth ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      async function testConnection() {
        try {
          await getDocFromServer(doc(db, 'test', 'connection'));
        } catch (error) {
          if (error instanceof Error && error.message.includes('the client is offline')) {
            console.error("Please check your Firebase configuration. The client is offline.");
            setToast({ message: "Firebase connection failed. Check your configuration.", type: 'error' });
          }
        }
      }
      testConnection();

      if (currentUser) {
        setUser(currentUser);
        const path = `users/${currentUser.uid}/config/main`;
        try {
          const configRef = doc(db, 'users', currentUser.uid, 'config', 'main');
          const configSnap = await getDoc(configRef);
          if (configSnap.exists()) {
            setConfig(configSnap.data() as UserConfig);
            setScreen('calculator');
          } else {
            setScreen('setup');
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, path);
        }
      } else {
        setUser(null);
        setScreen('login');
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login error:", error);
      setToast({ message: "Failed to sign in. Please try again.", type: 'error' });
    }
  };

  // --- Data Subscriptions ---
  useEffect(() => {
    if (!user || screen !== 'vault') return;

    // Vault Items
    const vaultPath = `users/${user.uid}/vault`;
    const vaultQuery = query(
      collection(db, vaultPath),
      orderBy('timestamp', 'desc')
    );
    const unsubVault = onSnapshot(vaultQuery, (snapshot) => {
      setVaultItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as VaultItem[]);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, vaultPath);
    });

    // Alerts
    const alertsPath = `users/${user.uid}/alerts`;
    const alertsQuery = query(
      collection(db, alertsPath),
      orderBy('timestamp', 'desc')
    );
    const unsubAlerts = onSnapshot(alertsQuery, (snapshot) => {
      setAlerts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as SecurityAlert[]);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, alertsPath);
    });

    return () => {
      unsubVault();
      unsubAlerts();
    };
  }, [user, screen]);

  // --- Calculator Logic ---
  const handleCalcInput = (val: string) => {
    if (val === 'C') {
      setCalcDisplay('0');
      return;
    }

    if (val === '=') {
      if (config && calcDisplay === config.pin) {
        setScreen('vault');
        setCalcDisplay('0');
        setWrongAttempts(0);
        return;
      }

      try {
        const expression = calcDisplay.replace(/×/g, '*').replace(/÷/g, '/');
        const result = eval(expression);
        setCalcDisplay(String(result));
        
        if (config && calcDisplay.length === config.pin.length) {
          handleWrongPin();
        }
      } catch {
        setCalcDisplay('Error');
      }
      return;
    }

    setCalcDisplay(prev => {
      if (prev === '0' || prev === 'Error') return val;
      return prev + val;
    });
  };

  const handleWrongPin = async () => {
    const newAttempts = wrongAttempts + 1;
    setWrongAttempts(newAttempts);
    if (newAttempts >= 3 && config && user) {
      setToast({ message: "Security alert triggered: Multiple failed attempts.", type: 'error' });
      await sendSecurityAlertEmail(
        config.email, 
        'Suspicious Activity', 
        `Multiple failed PIN attempts detected (${newAttempts}).`,
        user.uid
      );
    }
  };

  // --- Setup Logic ---
  const handleSetup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const pin = formData.get('pin') as string;
    const email = formData.get('email') as string;

    if (!pin || !email || !user) return;

    const newConfig: UserConfig = { pin, email, uid: user.uid };
    const path = `users/${user.uid}/config/main`;
    try {
      await setDoc(doc(db, 'users', user.uid, 'config', 'main'), newConfig);
      setConfig(newConfig);
      setToast({ message: "Vault secured successfully!", type: 'success' });
      setScreen('calculator');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  };

  // --- Vault Logic ---
  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <ImageIcon className="w-8 h-8 text-blue-400" />;
    if (type.startsWith('video/')) return <Video className="w-8 h-8 text-purple-400" />;
    if (type.startsWith('audio/')) return <Music className="w-8 h-8 text-emerald-400" />;
    if (type.includes('zip') || type.includes('rar') || type.includes('tar') || type.includes('compressed')) 
      return <FileArchive className="w-8 h-8 text-orange-400" />;
    if (type.includes('javascript') || type.includes('typescript') || type.includes('html') || type.includes('css') || type.includes('json') || type.includes('code')) 
      return <Code className="w-8 h-8 text-yellow-400" />;
    if (type.includes('pdf') || type.includes('text') || type.includes('word') || type.includes('document')) 
      return <FileText className="w-8 h-8 text-zinc-400" />;
    return <File className="w-8 h-8 text-zinc-500" />;
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Data = event.target?.result as string;
      const path = `users/${user.uid}/vault`;
      try {
        await addDoc(collection(db, path), {
          name: file.name,
          type: file.type,
          data: base64Data,
          timestamp: serverTimestamp(),
          uid: user.uid
        });
        setIsImporting(false);
        setToast({ message: "File imported to vault.", type: 'success' });
      } catch (error) {
        setIsImporting(false);
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteItem = async (item: VaultItem) => {
    if (!user || !config) return;
    
    const confirmed = window.confirm(`Are you sure you want to delete "${item.name}"? This will trigger a security alert.`);
    if (confirmed) {
      const path = `users/${user.uid}/vault/${item.id}`;
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'vault', item.id));
        setToast({ message: "File deleted. Security alert sent.", type: 'info' });
        await sendSecurityAlertEmail(
          config.email, 
          'File Deleted', 
          `The file "${item.name}" was deleted from your Hidden Vault Calculator.`,
          user.uid
        );
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-orange-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-orange-500/30">
      <AnimatePresence>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {/* --- Login Screen --- */}
        {screen === 'login' && (
          <motion.div 
            key="login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-screen flex flex-col items-center justify-center p-8 text-center"
          >
            <div className="bg-orange-500 p-6 rounded-[2.5rem] mb-8 shadow-2xl shadow-orange-500/20">
              <Calculator className="w-16 h-16 text-white" />
            </div>
            <h1 className="text-4xl font-bold tracking-tight mb-4">Hidden Vault</h1>
            <p className="text-zinc-400 max-w-xs mb-12">The most secure way to hide your private files behind a functional calculator.</p>
            
            <button 
              onClick={handleGoogleLogin}
              className="flex items-center gap-3 bg-white text-black px-8 py-4 rounded-2xl font-bold hover:bg-zinc-200 transition-all active:scale-95 shadow-xl"
            >
              <LogIn className="w-5 h-5" />
              Sign in with Google
            </button>
          </motion.div>
        )}

        {/* --- Setup Screen --- */}
        {screen === 'setup' && (
          <motion.div 
            key="setup"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="max-w-md mx-auto p-8 pt-20"
          >
            <div className="flex flex-col items-center mb-8">
              <div className="bg-orange-500 p-4 rounded-3xl mb-4 shadow-lg shadow-orange-500/20">
                <Calculator className="w-12 h-12 text-white" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Vault Setup</h1>
              <p className="text-zinc-400 text-center mt-2">Set your secret PIN and recovery email to secure your vault.</p>
            </div>

            <form onSubmit={handleSetup} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400 ml-1">Secret PIN</label>
                <input 
                  name="pin"
                  type="password" 
                  required
                  placeholder="Enter 4-6 digits"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-400 ml-1">Recovery Email</label>
                <input 
                  name="email"
                  type="email" 
                  required
                  defaultValue={user?.email || ''}
                  placeholder="alerts@example.com"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-2xl p-4 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-orange-500/20 transition-all active:scale-[0.98]"
              >
                Create Vault
              </button>
            </form>
          </motion.div>
        )}

        {/* --- Calculator Screen --- */}
        {screen === 'calculator' && (
          <motion.div 
            key="calculator"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="h-screen flex flex-col max-w-md mx-auto"
          >
            <div className="flex-1 flex flex-col justify-end p-8 text-right">
              <div className="text-7xl font-light tracking-tighter truncate">
                {calcDisplay}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 p-6 pb-12 bg-zinc-950 rounded-t-[3rem]">
              <CalculatorButton label="C" onClick={() => handleCalcInput('C')} variant="action" />
              <CalculatorButton label="+/-" onClick={() => {}} variant="action" />
              <CalculatorButton label="%" onClick={() => {}} variant="action" />
              <CalculatorButton label="÷" onClick={() => handleCalcInput('÷')} variant="operator" />

              <CalculatorButton label="7" onClick={() => handleCalcInput('7')} />
              <CalculatorButton label="8" onClick={() => handleCalcInput('8')} />
              <CalculatorButton label="9" onClick={() => handleCalcInput('9')} />
              <CalculatorButton label="×" onClick={() => handleCalcInput('×')} variant="operator" />

              <CalculatorButton label="4" onClick={() => handleCalcInput('4')} />
              <CalculatorButton label="5" onClick={() => handleCalcInput('5')} />
              <CalculatorButton label="6" onClick={() => handleCalcInput('6')} />
              <CalculatorButton label="-" onClick={() => handleCalcInput('-')} variant="operator" />

              <CalculatorButton label="1" onClick={() => handleCalcInput('1')} />
              <CalculatorButton label="2" onClick={() => handleCalcInput('2')} />
              <CalculatorButton label="3" onClick={() => handleCalcInput('3')} />
              <CalculatorButton label="+" onClick={() => handleCalcInput('+')} variant="operator" />

              <CalculatorButton label="0" onClick={() => handleCalcInput('0')} variant="zero" />
              <CalculatorButton label="." onClick={() => handleCalcInput('.')} />
              <CalculatorButton label="=" onClick={() => handleCalcInput('=')} variant="operator" />
            </div>
          </motion.div>
        )}

        {/* --- Vault Screen --- */}
        {screen === 'vault' && (
          <motion.div 
            key="vault"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="h-screen flex flex-col"
          >
            {/* Header */}
            <header className="p-6 flex items-center justify-between border-b border-zinc-900 bg-black/50 backdrop-blur-xl sticky top-0 z-10">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setScreen('calculator')}
                  className="p-2 hover:bg-zinc-900 rounded-full transition-colors"
                >
                  <ChevronLeft className="w-6 h-6" />
                </button>
                <h1 className="text-xl font-bold">Hidden Vault</h1>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => auth.signOut()}
                  className="p-2 hover:bg-zinc-900 rounded-full transition-colors"
                >
                  <LogOut className="w-5 h-5 text-zinc-400" />
                </button>
              </div>
            </header>

            {/* Tabs */}
            <div className="flex p-4 gap-2">
              <button 
                onClick={() => setVaultTab('files')}
                className={cn(
                  "flex-1 py-3 rounded-2xl font-medium transition-all flex items-center justify-center gap-2",
                  vaultTab === 'files' ? "bg-zinc-800 text-white" : "text-zinc-500 hover:bg-zinc-900"
                )}
              >
                <ImageIcon className="w-4 h-4" />
                Files
              </button>
              <button 
                onClick={() => setVaultTab('alerts')}
                className={cn(
                  "flex-1 py-3 rounded-2xl font-medium transition-all flex items-center justify-center gap-2",
                  vaultTab === 'alerts' ? "bg-zinc-800 text-white" : "text-zinc-500 hover:bg-zinc-900"
                )}
              >
                <Bell className="w-4 h-4" />
                Alerts
                {alerts.length > 0 && (
                  <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                    {alerts.length}
                  </span>
                )}
              </button>
            </div>

            {/* Content */}
            <main className="flex-1 overflow-y-auto p-4">
              {vaultTab === 'files' ? (
                vaultItems.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-4">
                    <div className="bg-zinc-900 p-8 rounded-full">
                      <Lock className="w-12 h-12 opacity-20" />
                    </div>
                    <p>Your vault is empty</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {vaultItems.map((item) => (
                      <motion.div 
                        layout
                        key={item.id}
                        className="aspect-square bg-zinc-900 rounded-xl overflow-hidden relative group"
                      >
                        <div className="w-full h-full flex flex-col items-center justify-center p-2">
                          {getFileIcon(item.type)}
                          <span className="text-[10px] text-zinc-400 mt-1 truncate w-full text-center">{item.name}</span>
                        </div>
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button 
                            onClick={() => handleDeleteItem(item)}
                            className="p-2 bg-red-500/20 hover:bg-red-500/40 text-red-500 rounded-full transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )
              ) : (
                <div className="space-y-4">
                  {alerts.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-500 py-20">
                      <ShieldAlert className="w-12 h-12 opacity-20 mb-4" />
                      <p>No security alerts</p>
                    </div>
                  ) : (
                    alerts.map((alert) => (
                      <div key={alert.id} className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-orange-500">{alert.type}</span>
                          <span className="text-[10px] text-zinc-500">
                            {alert.timestamp?.toDate().toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-300 mb-3">{alert.details}</p>
                        <div className="bg-black/40 p-3 rounded-xl text-[11px] text-zinc-500 font-mono whitespace-pre-wrap border border-zinc-800/50">
                          {alert.content}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </main>

            {/* Floating Action Button */}
            {vaultTab === 'files' && (
              <div className="p-6">
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleFileImport}
                  accept="image/*,video/*,.pdf,.txt"
                />
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isImporting}
                  className={cn(
                    "w-full h-16 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl flex items-center justify-center gap-3 font-bold shadow-2xl shadow-orange-500/40 transition-all active:scale-95",
                    isImporting && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isImporting ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-white"></div>
                  ) : (
                    <>
                      <Plus className="w-6 h-6" />
                      Import from Gallery
                    </>
                  )}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {wrongAttempts > 0 && screen === 'calculator' && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-full flex items-center gap-2 text-red-500 text-sm animate-pulse">
          <AlertTriangle className="w-4 h-4" />
          <span>Security monitoring active</span>
        </div>
      )}
    </div>
  );
}
