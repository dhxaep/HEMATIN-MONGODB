'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Camera, Home as HomeIcon, History, Plus, LayoutGrid, Settings, Sparkles, AlertTriangle,
  ShieldCheck, Target, CreditCard, Download, Upload,
  RefreshCw, Trash2, X, CheckCircle2, Info, Lock, Calendar, PieChart,
  BarChart3, Wallet, Smartphone, PiggyBank, Save, AlertCircle, ArrowDownLeft,
  ArrowUpRight, Receipt, Megaphone, Clock, Sliders, BellRing, OctagonAlert, ChevronRight, ChevronLeft, Check,
  Eye, EyeOff, Search, ChevronUp, ChevronDown, Heart, Pencil, Database, WifiOff,
  Bot, Play, TrendingUp, ArrowRight, RotateCcw, Share, MoreVertical, Filter
} from 'lucide-react';
import Chart from 'chart.js/auto';
import { marked } from 'marked';
import { api, Transaction, BudgetSetup, SavingGoal, DebtItem } from '../lib/api';
import {
  getTodayIso,
  getYesterdayIso,
  getIsoDate,
  parseAnyDateToIso,
  formatDisplayDate,
  formatDayDividerLabel,
  getCurrentWeekRangeIso,
  getCurrentMonthRangeIso,
} from '../lib/date';
import { extractTextFromReceipt } from '../lib/ocrPreprocess';
import {
  SakugaButton,
  SakugaToggle,
  SakugaTabs,
  SakugaProgress,
  SakugaToastHost,
  SakugaTooltip,
  showSakugaToast,
} from '../components/SakugaControls';

const APP_VERSION = 'v2.0';

const TX_CATEGORIES = [
  'Makanan',
  'Transport',
  'Tagihan',
  'Hiburan',
  'Kebutuhan',
  'Gaji',
  'Tabungan',
  'Lainnya',
];

const PAGE_HEADERS: Record<
  'home' | 'riwayat' | 'fitur' | 'setting',
  { title: string; subtitle: string }
> = {
  home: {
    title: 'Dashboard Keuangan',
    subtitle: 'Ringkasan saldo, batas anggaran aktif, kalender harian, dan transaksi terbaru',
  },
  riwayat: {
    title: 'Riwayat Transaksi',
    subtitle: 'Cari, filter kategori & tanggal, edit, atau hapus catatan di MongoDB',
  },
  fitur: {
    title: 'Analitik & Fitur Cerdas',
    subtitle: 'Grafik tren keuangan, AI Advisor (Gemini), target tabungan, dan hutang-piutang',
  },
  setting: {
    title: 'Pengaturan & Database',
    subtitle: 'Kelola auto-save, backup JSON, reset anggaran, dan panduan aplikasi',
  },
};

const sendAppNotification = (title: string, body: string) => {
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/favicon.png',
        badge: '/favicon.png',
      });
    } catch (e) {
      console.warn('System Notification Error:', e);
    }
  }
};

export default function Home() {
  const [activeTab, setActiveTab] = useState<'home' | 'riwayat' | 'fitur' | 'setting'>('home');

  // --- MONGODB BACKEND DATA STATES ---
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgetSetup, setBudgetSetup] = useState<BudgetSetup>({
    mode: null,
    limitValue: 0,
    dateLimits: {},
    tabunganBalance: 0,
    autoSaveRemainingLimit: true,
  });
  const [savingGoals, setSavingGoals] = useState<SavingGoal[]>([]);
  const [debts, setDebts] = useState<DebtItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isBackendConnected, setIsBackendConnected] = useState(true);
  const [backendError, setBackendError] = useState<string | null>(null);

  // --- UI PREFERENCE STATES (Preferensi lokal browser) ---
  const [hideBalance, setHideBalance] = useState(false);

  // --- RIWAYAT TRANSAKSI CONTROL STATES ---
  const [historySearch, setHistorySearch] = useState('');
  const [historyCategoryFilter, setHistoryCategoryFilter] = useState('semua');
  const [historyDateFilter, setHistoryDateFilter] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'semua' | 'pemasukan' | 'pengeluaran'>('semua');
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false);

  // --- ONBOARDING & MODALS ---
  const [needsSetup, setNeedsSetup] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<string>('default');
  const [showNotifPermModal, setShowNotifPermModal] = useState(false);
  const [showPatchNotesModal, setShowPatchNotesModal] = useState(false);
  const [showPwaModal, setShowPwaModal] = useState(false);
  const [pwaOsTab, setPwaOsTab] = useState<'android' | 'ios'>('android');
  const [expandedSettings, setExpandedSettings] = useState<Record<string, boolean>>({});
  const toggleSetting = (key: string) => setExpandedSettings((p) => ({ ...p, [key]: !p[key] }));

  // --- TUTORIAL / SPOTLIGHT STATES & REFS ---
  const [showTutorialModal, setShowTutorialModal] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [spotlightPos, setSpotlightPos] = useState({
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    windowHeight: 800,
    windowWidth: 1200,
    isCircle: false,
  });

  const targetSaldoRef = useRef<HTMLDivElement>(null);
  const targetLimitRef = useRef<HTMLDivElement>(null);
  const targetCalendarRef = useRef<HTMLDivElement>(null);
  const targetFabRef = useRef<HTMLButtonElement>(null);
  const targetRiwayatRef = useRef<HTMLButtonElement>(null);
  const targetFiturRef = useRef<HTMLButtonElement>(null);
  const targetAiOcrRef = useRef<HTMLDivElement>(null);
  const targetChartRef = useRef<HTMLDivElement>(null);
  const targetGoalRef = useRef<HTMLDivElement>(null);
  const targetSettingRef = useRef<HTMLButtonElement>(null);

  const desktopFabRef = useRef<HTMLButtonElement>(null);
  const desktopRiwayatRef = useRef<HTMLButtonElement>(null);
  const desktopSettingRef = useRef<HTMLButtonElement>(null);

  // --- LIVE CLOCK & DATE STATE ---
  const [currentTime, setCurrentTime] = useState('');
  const [currentDateFormatted, setCurrentDateFormatted] = useState('');

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const timeStr = now
        .toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        .replace(/:/g, '.');
      const dateStr = now.toLocaleDateString('id-ID', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      setCurrentTime(timeStr);
      setCurrentDateFormatted(dateStr);
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // --- ANTI-PINCH ZOOM FOR TOUCH DEVICES ONLY ---
  useEffect(() => {
    const preventTouchZoom = (e: Event) => {
      const touchEv = e as TouchEvent;
      if (touchEv.touches && touchEv.touches.length > 1) e.preventDefault();
    };
    const options: AddEventListenerOptions = { passive: false };
    document.addEventListener('touchstart', preventTouchZoom, options);
    document.addEventListener('touchmove', preventTouchZoom, options);
    document.addEventListener('gesturestart', preventTouchZoom as EventListener, options);
    document.addEventListener('gesturechange', preventTouchZoom as EventListener, options);
    document.addEventListener('gestureend', preventTouchZoom as EventListener, options);

    return () => {
      document.removeEventListener('touchstart', preventTouchZoom);
      document.removeEventListener('touchmove', preventTouchZoom);
      document.removeEventListener('gesturestart', preventTouchZoom as EventListener);
      document.removeEventListener('gesturechange', preventTouchZoom as EventListener);
      document.removeEventListener('gestureend', preventTouchZoom as EventListener);
    };
  }, []);

  // Setup Budget Form
  const [setupSelectedMode, setSetupSelectedMode] = useState<'harian' | 'mingguan' | 'bulanan'>('harian');
  const [setupLimitInput, setSetupLimitInput] = useState('');

  // Calendar states (all ISO YYYY-MM-DD)
  const [currentCalDate, setCurrentCalDate] = useState(new Date());
  const [selectedDateIso, setSelectedDateIso] = useState(getTodayIso());
  const [dailyLimitInput, setDailyLimitInput] = useState('');

  // Chart state
  const [chartTimeframe, setChartTimeframe] = useState<'harian' | 'bulanan' | 'tahunan'>('harian');

  // Create / Edit Transaction Modal States
  const [showTxModal, setShowTxModal] = useState(false);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [txModalTab, setTxModalTab] = useState<'pengeluaran' | 'pemasukan' | 'struk'>('pengeluaran');
  const [txCategory, setTxCategory] = useState('Makanan');
  const [txAmount, setTxAmount] = useState('');
  const [txNote, setTxNote] = useState('');
  const [txDate, setTxDate] = useState(getTodayIso());
  const [ocrRawPreview, setOcrRawPreview] = useState('');
  const [ocrDetectedDate, setOcrDetectedDate] = useState('');

  // AI Advisor states (Gemini)
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiModelUsed, setAiModelUsed] = useState<string>('Gemini AI');
  const [aiResponseHTML, setAiResponseHTML] = useState(
    'Halo! Saya <strong>AI Financial Advisor (Gemini)</strong> pribadi kamu. Tanyakan saran penghematan, analisis pengeluaran, atau strategi menabung berdasarkan data live di MongoDB.'
  );
  const [isAiLoading, setIsAiLoading] = useState(false);
  const typingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Saving goal modal & deposit modal
  const [showGoalModal, setShowGoalModal] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [goalIcon, setGoalIcon] = useState('target');
  const [depositGoalTarget, setDepositGoalTarget] = useState<SavingGoal | null>(null);
  const [depositAmountInput, setDepositAmountInput] = useState('');

  // Debt modal
  const [showDebtModal, setShowDebtModal] = useState(false);
  const [debtPerson, setDebtPerson] = useState('');
  const [debtAmount, setDebtAmount] = useState('');
  const [debtType, setDebtType] = useState<'hutang' | 'piutang'>('hutang');
  const [debtNote, setDebtNote] = useState('');

  // OCR Struk scanner states
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState('');

  // Toast & Custom Sakuga Confirm Modal
  const [toasts, setToasts] = useState<{ id: string; msg: string; type: 'success' | 'error' | 'warn' }[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    tone?: 'danger' | 'warn';
  } | null>(null);
  const confirmResolverRef = useRef<((ok: boolean) => void) | null>(null);

  const askConfirm = useCallback(
    (opts: { title: string; message: string; confirmLabel?: string; tone?: 'danger' | 'warn' }) =>
      new Promise<boolean>((resolve) => {
        confirmResolverRef.current = resolve;
        setConfirmDialog(opts);
      }),
    []
  );

  const resolveConfirm = (ok: boolean) => {
    setConfirmDialog(null);
    confirmResolverRef.current?.(ok);
    confirmResolverRef.current = null;
  };

  // Canvas & File Input Refs
  const categoryChartRef = useRef<HTMLCanvasElement | null>(null);
  const todayDoughnutRef = useRef<HTMLCanvasElement | null>(null);
  const categoryChartInstance = useRef<Chart | null>(null);
  const todayDoughnutInstance = useRef<Chart | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((msg: string, type: 'success' | 'error' | 'warn' = 'success') => {
    showSakugaToast(msg);
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, msg, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3400);
  }, []);

  const formatNumber = (num: number) => Number(num || 0).toLocaleString('id-ID');
  const getRawNumericValue = (val: string) => Number(val.replace(/\D/g, '')) || 0;

  const handleCurrencyInput = (val: string, setter: (v: string) => void) => {
    const raw = val.replace(/\D/g, '');
    if (!raw) return setter('');
    setter(raw.replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
  };

  // --- ONBOARDING FLOW ---
  const checkNextOnboardingStep = useCallback(
    (currentSetup?: BudgetSetup) => {
      const setupToCheck = currentSetup ?? budgetSetup;
      if (!setupToCheck || !setupToCheck.mode) {
        setNeedsSetup(true);
        return;
      }

      const seenVersion = localStorage.getItem('dompetin_seen_patch_version');
      if (seenVersion !== APP_VERSION) {
        setShowPatchNotesModal(true);
        sendAppNotification(
          `Pembaruan Hematin ${APP_VERSION} (MongoDB Edition)`,
          'Data kini tersimpan aman di MongoDB via ExpressJS REST API dengan tampilan Desktop Dashboard.'
        );
        return;
      }

      const pwaShown = localStorage.getItem('dompetin_pwa_warn_shown');
      if (!pwaShown) {
        setShowPwaModal(true);
        return;
      }

      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        const notifDismissed = sessionStorage.getItem('dompetin_notif_modal_dismissed');
        if (!notifDismissed) {
          setShowNotifPermModal(true);
          return;
        }
      }

      const savedTutorial = localStorage.getItem('local_tutorial_completed');
      if (savedTutorial !== 'true') {
        setTutorialStep(0);
        setShowTutorialModal(true);
      }
    },
    [budgetSetup]
  );

  // --- LOAD ALL DATA FROM EXPRESS + MONGODB ---
  const loadAllData = useCallback(async () => {
    setIsSyncing(true);
    try {
      const [health, txList, budgetData, goalList, debtList] = await Promise.all([
        api.healthCheck(),
        api.getTransactions(),
        api.getBudget(),
        api.getGoals(),
        api.getDebts(),
      ]);

      setIsBackendConnected(health.database === 'connected');
      setBackendError(health.database === 'connected' ? null : 'MongoDB belum terhubung.');
      setTransactions(txList);
      setBudgetSetup(budgetData);
      setSavingGoals(goalList);
      setDebts(debtList);
      setIsLoaded(true);

      if (budgetData.autoSaveRemainingLimit && budgetData.mode === 'harian' && budgetData.limitValue > 0) {
        try {
          const autoRes = await api.runAutoSave(getTodayIso(), getYesterdayIso());
          if (autoRes.executed && autoRes.transaction && autoRes.amount) {
            setTransactions((prev) => [autoRes.transaction!, ...prev]);
            if (autoRes.goal) {
              setSavingGoals((prev) =>
                prev.map((g) => (g.id === autoRes.goal!.id ? autoRes.goal! : g))
              );
            }
            showToast(
              `Sisa limit kemarin (Rp ${formatNumber(autoRes.amount)}) otomatis dipotong & masuk Tabungan!`,
              'success'
            );
            sendAppNotification(
              'Sisa Limit Otomatis Masuk Tabungan',
              `Rp ${formatNumber(autoRes.amount)} dari sisa limit kemarin telah dimasukkan ke Tabungan.`
            );
          }
        } catch {
          // Silent skip if auto-save skipped
        }
      }

      checkNextOnboardingStep(budgetData);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal terhubung ke server backend';
      setIsBackendConnected(false);
      setBackendError(msg);
      setIsLoaded(true);
      showToast(msg, 'error');
    } finally {
      setIsSyncing(false);
    }
  }, [checkNextOnboardingStep, showToast]);

  // --- INITIAL MOUNT ---
  useEffect(() => {
    if (typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      setPwaOsTab('ios');
    }

    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
    }

    const savedHideBalance = localStorage.getItem('local_hide_balance');
    if (savedHideBalance !== null) setHideBalance(savedHideBalance === 'true');

    loadAllData();

    return () => {
      if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Simpan preferensi UI saja ke localStorage setelah initial load selesai
  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem('local_hide_balance', String(hideBalance));
  }, [hideBalance, isLoaded]);

  // --- HANDLERS FOR ONBOARDING MODALS ---
  const handleClosePwaModal = () => {
    localStorage.setItem('dompetin_pwa_warn_shown', 'true');
    setShowPwaModal(false);
    setTimeout(() => checkNextOnboardingStep(budgetSetup), 200);
  };

  const handleRequestNotifPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const res = await Notification.requestPermission();
        setNotificationPermission(res);
        setShowNotifPermModal(false);
        if (res === 'granted') {
          showToast('Notifikasi Aplikasi Berhasil Diaktifkan!', 'success');
          sendAppNotification(
            'Notifikasi Hematin Aktif',
            'Kamu akan menerima notifikasi otomatis saat limit terlampaui atau darurat keuangan.'
          );
        } else {
          showToast('Izin notifikasi aplikasi ditolak.', 'warn');
        }
      } catch (err) {
        console.error(err);
      }
    } else {
      showToast('Browser ini tidak mendukung Web Notifications.', 'warn');
      setShowNotifPermModal(false);
    }
    setTimeout(() => checkNextOnboardingStep(budgetSetup), 200);
  };

  const handleDismissNotifPermModal = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('dompetin_notif_modal_dismissed', 'true');
    }
    setShowNotifPermModal(false);
    setTimeout(() => checkNextOnboardingStep(budgetSetup), 200);
  };

  const handleAcceptPatchNotes = () => {
    localStorage.setItem('dompetin_seen_patch_version', APP_VERSION);
    setShowPatchNotesModal(false);
    showToast(`Selamat menggunakan Hematin ${APP_VERSION}!`, 'success');
    setTimeout(() => checkNextOnboardingStep(budgetSetup), 200);
  };

  // --- CALCULATED TOTALS ---
  const totalIncome = transactions
    .filter((t) => t.type === 'pemasukan')
    .reduce((a, b) => a + b.amount, 0);
  const totalExpense = transactions
    .filter((t) => t.type === 'pengeluaran')
    .reduce((a, b) => a + b.amount, 0);
  const balance = totalIncome - totalExpense;

  const expenseRatio = totalIncome > 0 ? (totalExpense / totalIncome) * 100 : totalExpense > 0 ? 100 : 0;
  const showDangerBanner = balance < 0 || (totalIncome > 0 && totalExpense > 0 && expenseRatio >= 85);
  const showWarningBanner =
    !showDangerBanner && totalIncome > 0 && totalExpense > 0 && expenseRatio >= 65 && expenseRatio < 85;

  // --- BUDGET LIMIT CALCULATION ---
  const todayIso = getTodayIso();
  const weekRange = getCurrentWeekRangeIso();
  const monthRange = getCurrentMonthRangeIso();

  let activeLimit = budgetSetup.limitValue || 20000;
  let periodSpent = 0;
  let periodLabel = 'Hari Ini';

  if (budgetSetup.mode === 'mingguan') {
    periodLabel = 'Minggu Ini';
    activeLimit = budgetSetup.limitValue || 150000;
    periodSpent = transactions
      .filter((t) => t.type === 'pengeluaran' && t.date >= weekRange.startIso && t.date <= weekRange.endIso)
      .reduce((a, b) => a + b.amount, 0);
  } else if (budgetSetup.mode === 'bulanan') {
    periodLabel = 'Bulan Ini';
    activeLimit = budgetSetup.limitValue || 500000;
    periodSpent = transactions
      .filter((t) => t.type === 'pengeluaran' && t.date >= monthRange.startIso && t.date <= monthRange.endIso)
      .reduce((a, b) => a + b.amount, 0);
  } else {
    periodLabel = 'Hari Ini';
    activeLimit = (budgetSetup.dateLimits && budgetSetup.dateLimits[todayIso]) || budgetSetup.limitValue || 20000;
    periodSpent = transactions
      .filter((t) => t.type === 'pengeluaran' && t.date === todayIso)
      .reduce((a, b) => a + b.amount, 0);
  }

  const periodRemain = activeLimit - periodSpent;
  const activeLimitPercentage =
    activeLimit > 0 ? Math.min(Math.round((periodSpent / activeLimit) * 100), 100) : 0;

  // AUTOMATIC APP NOTIFICATIONS FOR CAPACITY LIMIT & FINANCIAL EMERGENCY
  useEffect(() => {
    if (!isLoaded) return;

    if (budgetSetup.mode && activeLimit > 0 && periodSpent >= activeLimit) {
      const notifCapKey = `notif_cap_sent_${budgetSetup.mode}_${todayIso}`;
      if (!localStorage.getItem(notifCapKey)) {
        showToast(`PERINGATAN: Limit pengeluaran ${periodLabel.toLowerCase()} sudah mencapai 100%!`, 'error');
        sendAppNotification(
          'Limit Anggaran Terlampaui',
          `Total pengeluaran ${periodLabel.toLowerCase()} (Rp ${formatNumber(periodSpent)}) mencapai limit (Rp ${formatNumber(activeLimit)}).`
        );
        localStorage.setItem(notifCapKey, 'true');
      }
    }

    if (totalIncome > 0 && totalExpense > 0 && expenseRatio >= 90) {
      const notifEmKey = `notif_em_90_${new Date().getMonth()}_${new Date().getFullYear()}`;
      if (!localStorage.getItem(notifEmKey)) {
        showToast(`DARURAT KEUANGAN: Pengeluaran menyentuh ${expenseRatio.toFixed(0)}% dari pemasukan!`, 'error');
        sendAppNotification(
          'PERINGATAN DARURAT KEUANGAN (90%)',
          `Total pengeluaran (Rp ${formatNumber(totalExpense)}) telah menyentuh ${expenseRatio.toFixed(0)}% dari pemasukan!`
        );
        localStorage.setItem(notifEmKey, 'true');
      }
    }
  }, [isLoaded, budgetSetup.mode, activeLimit, periodSpent, periodLabel, todayIso, totalIncome, totalExpense, expenseRatio, showToast]);

  // --- TRANSACTION MODAL OPEN HELPERS ---
  const openCreateTxModal = () => {
    setEditingTxId(null);
    setTxModalTab('pengeluaran');
    setTxCategory('Makanan');
    setTxAmount('');
    setTxNote('');
    setTxDate(getTodayIso());
    setOcrRawPreview('');
    setOcrDetectedDate('');
    setShowTxModal(true);
  };

  const openOcrTxModal = () => {
    setEditingTxId(null);
    setTxModalTab('struk');
    setTxCategory('Makanan');
    setTxAmount('');
    setTxNote('');
    setTxDate(getTodayIso());
    setOcrRawPreview('');
    setOcrDetectedDate('');
    setShowTxModal(true);
  };

  const openEditTxModal = (tx: Transaction) => {
    setEditingTxId(tx.id);
    setTxModalTab(tx.type);
    setTxCategory(TX_CATEGORIES.includes(tx.category) ? tx.category : 'Lainnya');
    setTxAmount(formatNumber(tx.amount));
    setTxNote(tx.note);
    setTxDate(parseAnyDateToIso(tx.date) || getTodayIso());
    setOcrRawPreview('');
    setOcrDetectedDate('');
    setShowTxModal(true);
  };

  // --- CREATE OR UPDATE TRANSACTION (MONGODB API) ---
  const handleSaveTransaction = async () => {
    const amount = getRawNumericValue(txAmount);
    if (!amount) return showToast('Masukkan nominal transaksi!', 'warn');

    const type: 'pemasukan' | 'pengeluaran' = txModalTab === 'pemasukan' ? 'pemasukan' : 'pengeluaran';
    const payload = {
      type,
      category: txCategory,
      amount,
      note: txNote.trim() || (type === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran'),
      date: txDate || getTodayIso(),
    };

    try {
      setIsSyncing(true);
      if (editingTxId) {
        const updated = await api.updateTransaction(editingTxId, payload);
        setTransactions((prev) =>
          prev
            .map((t) => (t.id === editingTxId ? updated : t))
            .sort((a, b) => b.date.localeCompare(a.date))
        );
        showToast('Transaksi berhasil diperbarui!', 'success');
      } else {
        const created = await api.createTransaction(payload);
        setTransactions((prev) =>
          [created, ...prev].sort((a, b) => b.date.localeCompare(a.date))
        );
        showToast('Transaksi berhasil disimpan ke MongoDB!', 'success');
      }

      setTxAmount('');
      setTxNote('');
      setOcrRawPreview('');
      setEditingTxId(null);
      setShowTxModal(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan transaksi', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    const targetTx = transactions.find((t) => t.id === id);
    const itemLabel = targetTx ? `"${targetTx.note}" (Rp ${formatNumber(targetTx.amount)})` : 'transaksi ini';
    const ok = await askConfirm({
      title: 'Hapus Transaksi',
      message: `Yakin ingin menghapus ${itemLabel}?`,
      confirmLabel: 'Hapus',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      setIsSyncing(true);
      await api.deleteTransaction(id);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      showToast('Transaksi berhasil dihapus!', 'warn');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus transaksi', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // --- TUTORIAL STEPS (Semua SVG Lucide, nol emoji) ---
  const tutorialSteps = [
    {
      title: 'Saldo & Sensor Mata',
      icon: <Wallet size={16} />,
      color: '#ecfdf5',
      content: (
        <p className="sk-helper" style={{ fontSize: 12.5, margin: 0 }}>
          Lihat <strong>Kartu Saldo</strong> utama — tekan tombol ikon mata{' '}
          <Eye size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /> untuk menyensor nominal saldo agar aman dari pandangan orang lain.
        </p>
      ),
      targetRef: targetSaldoRef,
      targetTab: 'home' as const,
    },
    {
      title: 'Limit Budget Aktif',
      icon: <BarChart3 size={16} />,
      color: '#f4f3fc',
      content: (
        <p className="sk-helper" style={{ fontSize: 12.5, margin: 0 }}>
          Pantau <strong>Batas Limit Anggaran</strong> (Harian/Mingguan/Bulanan) lengkap dengan persentase sisa budget yang aman digunakan.
        </p>
      ),
      targetRef: targetLimitRef,
      targetTab: 'home' as const,
    },
    {
      title: 'Kalender & Limit Harian',
      icon: <Calendar size={16} />,
      color: '#f4f3fc',
      content: (
        <p className="sk-helper" style={{ fontSize: 12.5, margin: 0 }}>
          Klik tanggal berapa saja di <strong>Kalender</strong> untuk melihat histori pengeluaran hari itu atau menyesuaikan limit khusus hari tersebut.
        </p>
      ),
      targetRef: targetCalendarRef,
      targetTab: 'home' as const,
    },
    {
      title: 'Catat Transaksi & Scan Struk',
      icon: <Plus size={16} />,
      color: '#fff1f7',
      content: (
        <p className="sk-helper" style={{ fontSize: 12.5, margin: 0 }}>
          Tekan tombol <strong>Catat Transaksi</strong> untuk mencatat Pengeluaran, Pemasukan, atau <strong>Scan Struk Belanja OCR</strong> yang otomatis membaca total dan toko.
        </p>
      ),
      targetRef: targetFabRef,
      desktopTargetRef: desktopFabRef,
      targetTab: 'home' as const,
    },
    {
      title: 'Riwayat, Pembatas Hari & Filter',
      icon: <Receipt size={16} />,
      color: '#f4f3fc',
      content: (
        <p className="sk-helper" style={{ fontSize: 12.5, margin: 0 }}>
          Di <strong>Menu Riwayat</strong>, transaksi tampil berurutan ke bawah dengan pembatas per hari otomatis. Kamu juga bisa cari kata kunci, filter kategori, tanggal, serta edit lewat ikon{' '}
          <Pencil size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />.
        </p>
      ),
      targetRef: targetRiwayatRef,
      desktopTargetRef: desktopRiwayatRef,
      targetTab: 'riwayat' as const,
    },
    {
      title: 'AI Financial Advisor (Gemini)',
      icon: <Bot size={16} />,
      color: '#f4f3fc',
      content: (
        <p className="sk-helper" style={{ fontSize: 12.5, margin: 0 }}>
          Konsultasi finansial langsung dengan <strong>AI Financial Advisor berbasis Google Gemini</strong> menggunakan data transaksi live kamu di MongoDB.
        </p>
      ),
      targetRef: targetAiOcrRef,
      targetTab: 'fitur' as const,
    },
    {
      title: 'Diagram Grafik Keuangan',
      icon: <TrendingUp size={16} />,
      color: '#f4f3fc',
      content: (
        <p className="sk-helper" style={{ fontSize: 12.5, margin: 0 }}>
          Lihat visualisasi perbandingan Pemasukan vs Pengeluaran kamu secara <strong>Harian, Bulanan, hingga Tahunan</strong> secara otomatis.
        </p>
      ),
      targetRef: targetChartRef,
      targetTab: 'fitur' as const,
    },
    {
      title: 'Target Tabungan Impian',
      icon: <Target size={16} />,
      color: '#ecfdf5',
      content: (
        <p className="sk-helper" style={{ fontSize: 12.5, margin: 0 }}>
          Catat wishlist barang impian kamu di <strong>Target Tabungan</strong> dan nyalakan sakelar <strong>Auto Pindah Sisa Limit</strong> kapan saja.
        </p>
      ),
      targetRef: targetGoalRef,
      targetTab: 'fitur' as const,
    },
    {
      title: 'Pengaturan & Backup Data',
      icon: <Settings size={16} />,
      color: '#fff1f7',
      content: (
        <p className="sk-helper" style={{ fontSize: 12.5, margin: 0 }}>
          Atur Export/Import file JSON cadangan ke MongoDB, reset budget, notifikasi, dan <strong>putar ulang tutorial</strong> ini.
        </p>
      ),
      targetRef: targetSettingRef,
      desktopTargetRef: desktopSettingRef,
      targetTab: 'setting' as const,
    },
  ];

  useEffect(() => {
    if (!showTutorialModal) return;

    const currentStepObj = tutorialSteps[tutorialStep];
    const targetTab = currentStepObj.targetTab;
    if (activeTab !== targetTab) {
      setActiveTab(targetTab);
    }

    const resolveTargetEl = () => {
      if (currentStepObj.desktopTargetRef?.current) {
        const dRect = currentStepObj.desktopTargetRef.current.getBoundingClientRect();
        if (dRect.width > 0 && dRect.height > 0) {
          return { el: currentStepObj.desktopTargetRef.current, isCircle: false, isFixedNav: true };
        }
      }
      if (currentStepObj.targetRef?.current) {
        return {
          el: currentStepObj.targetRef.current,
          isCircle: currentStepObj.targetRef === targetFabRef,
          isFixedNav: tutorialStep === 3 || tutorialStep === 4 || tutorialStep === 8,
        };
      }
      return null;
    };

    const updateSpotlight = () => {
      const resolved = resolveTargetEl();
      if (resolved?.el) {
        const rect = resolved.el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          setSpotlightPos({
            x: rect.left,
            y: rect.top,
            w: rect.width,
            h: rect.height,
            windowHeight: window.innerHeight,
            windowWidth: window.innerWidth,
            isCircle: resolved.isCircle,
          });
        }
      }
    };

    const resolvedInitial = resolveTargetEl();
    if (resolvedInitial?.el && !resolvedInitial.isFixedNav) {
      resolvedInitial.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    let animId: number;
    const startTime = performance.now();
    const tick = () => {
      updateSpotlight();
      if (performance.now() - startTime < 800) {
        animId = requestAnimationFrame(tick);
      }
    };
    animId = requestAnimationFrame(tick);

    window.addEventListener('resize', updateSpotlight);
    window.addEventListener('scroll', updateSpotlight, true);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', updateSpotlight);
      window.removeEventListener('scroll', updateSpotlight, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showTutorialModal, tutorialStep, activeTab]);

  const handleFinishTutorial = () => {
    setShowTutorialModal(false);
    setActiveTab('home');
    localStorage.setItem('local_tutorial_completed', 'true');
  };

  const handleNextTutorialStep = () => {
    if (tutorialStep < tutorialSteps.length - 1) setTutorialStep((prev) => prev + 1);
    else handleFinishTutorial();
  };

  const handlePrevTutorialStep = () => {
    if (tutorialStep > 0) setTutorialStep((prev) => prev - 1);
  };

  // --- RIWAYAT FILTERING (Selalu tampil ke bawah dengan pembatas per hari) ---
  const matchesHistoryFilter = (t: Transaction) => {
    if (historyTypeFilter !== 'semua' && t.type !== historyTypeFilter) {
      return false;
    }

    if (historyCategoryFilter !== 'semua' && t.category !== historyCategoryFilter) {
      return false;
    }

    const q = historySearch.toLowerCase().trim();
    const matchQuery =
      !q ||
      t.note.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      t.amount.toString().includes(q);

    const matchDate = !historyDateFilter || t.date === historyDateFilter;
    return matchQuery && matchDate;
  };

  const filteredHistoryTransactions = transactions.filter(matchesHistoryFilter);

  const filteredIncomeTotal = filteredHistoryTransactions
    .filter((t) => t.type === 'pemasukan')
    .reduce((a, b) => a + b.amount, 0);
  const filteredExpenseTotal = filteredHistoryTransactions
    .filter((t) => t.type === 'pengeluaran')
    .reduce((a, b) => a + b.amount, 0);

  const groupedHistoryTransactions = filteredHistoryTransactions.reduce<Record<string, Transaction[]>>(
    (acc, t) => {
      if (!acc[t.date]) acc[t.date] = [];
      acc[t.date].push(t);
      return acc;
    },
    {}
  );

  const sortedHistoryDateKeys = Object.keys(groupedHistoryTransactions).sort((a, b) =>
    b.localeCompare(a)
  );

  const hasActiveHistoryFilter = Boolean(
    historySearch ||
      historyDateFilter ||
      historyCategoryFilter !== 'semua' ||
      historyTypeFilter !== 'semua'
  );

  const handleResetHistoryFilters = () => {
    setHistorySearch('');
    setHistoryCategoryFilter('semua');
    setHistoryDateFilter('');
    setHistoryTypeFilter('semua');
  };

  const handleBulkDeleteHistory = async () => {
    if (transactions.length === 0) return showToast('Belum ada transaksi untuk dihapus.', 'warn');

    const confirmMsg = hasActiveHistoryFilter
      ? 'Yakin ingin menghapus semua transaksi sesuai filter saat ini?'
      : 'Yakin ingin menghapus SELURUH riwayat transaksi di MongoDB?';

    const ok = await askConfirm({
      title: hasActiveHistoryFilter ? 'Hapus Riwayat Terfilter' : 'Hapus Semua Riwayat',
      message: confirmMsg,
      confirmLabel: 'Hapus',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      setIsSyncing(true);
      if (hasActiveHistoryFilter) {
        await api.bulkDeleteTransactions({
          type: historyTypeFilter !== 'semua' ? historyTypeFilter : undefined,
          category: historyCategoryFilter !== 'semua' ? historyCategoryFilter : undefined,
          search: historySearch || undefined,
          date: historyDateFilter || undefined,
        });
        const fresh = await api.getTransactions();
        setTransactions(fresh);
        showToast('Transaksi terpilih berhasil dihapus!', 'warn');
      } else {
        await api.bulkDeleteTransactions({ all: true });
        setTransactions([]);
        showToast('Seluruh riwayat transaksi berhasil dihapus!', 'warn');
      }
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus riwayat', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // --- BUDGET SETUP LOGIC ---
  const handleSaveSetup = async () => {
    const limitVal = getRawNumericValue(setupLimitInput);
    if (!limitVal) return showToast('Masukkan nominal limit!', 'warn');

    try {
      setIsSyncing(true);
      const updated = await api.updateBudget({
        mode: setupSelectedMode,
        limitValue: limitVal,
      });
      setBudgetSetup(updated);
      setNeedsSetup(false);
      setSetupLimitInput('');
      showToast('Budget berhasil disimpan ke MongoDB!', 'success');
      setTimeout(() => checkNextOnboardingStep(updated), 200);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan setup budget', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleResetBudget = async () => {
    const ok = await askConfirm({
      title: 'Reset Pengaturan Budget',
      message: 'Yakin ingin reset pengaturan budget? Mode dan limit akan dikosongkan.',
      confirmLabel: 'Reset',
      tone: 'warn',
    });
    if (!ok) return;
    try {
      setIsSyncing(true);
      const resetData = await api.resetBudget();
      setBudgetSetup(resetData);
      setNeedsSetup(true);
      showToast('Budget berhasil di-reset!', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal mereset budget', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveDailyLimit = async () => {
    const limitVal = getRawNumericValue(dailyLimitInput);
    if (!limitVal) return showToast('Masukkan nominal limit harian!', 'warn');

    try {
      setIsSyncing(true);
      const updated = await api.setDailyLimit(selectedDateIso, limitVal);
      setBudgetSetup(updated);
      showToast(
        `Limit khusus ${formatDisplayDate(selectedDateIso)} diset ke Rp ${formatNumber(limitVal)}!`,
        'success'
      );
      setDailyLimitInput('');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal mengatur limit harian', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleResetDailyLimit = async () => {
    try {
      setIsSyncing(true);
      const updated = await api.deleteDailyLimit(selectedDateIso);
      setBudgetSetup(updated);
      setDailyLimitInput('');
      showToast(
        `Limit khusus ${formatDisplayDate(selectedDateIso)} dikembalikan ke default.`,
        'success'
      );
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal mereset limit harian', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleViewSelectedDateHistory = () => {
    setHistoryTypeFilter('semua');
    setHistoryCategoryFilter('semua');
    setHistorySearch('');
    setHistoryDateFilter(selectedDateIso);
    setActiveTab('riwayat');
  };

  const handleToggleAutoSave = async () => {
    const nextState = !budgetSetup.autoSaveRemainingLimit;
    try {
      setIsSyncing(true);
      const updated = await api.updateBudget({ autoSaveRemainingLimit: nextState });
      setBudgetSetup(updated);
      showToast(
        nextState
          ? 'Fitur Otomatis Pindah Sisa Limit ke Tabungan DIAKTIFKAN!'
          : 'Fitur Otomatis Tabungan DIMATIKAN.',
        nextState ? 'success' : 'warn'
      );
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal mengubah pengaturan auto-save', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // --- SAVING GOALS LOGIC ---
  const handleAddGoal = async () => {
    const targetVal = getRawNumericValue(goalTarget);
    if (!goalTitle.trim() || !targetVal) return showToast('Isi judul & target tabungan!', 'warn');

    try {
      setIsSyncing(true);
      const created = await api.createGoal({
        title: goalTitle.trim(),
        targetAmount: targetVal,
        icon: goalIcon || 'target',
      });
      setSavingGoals((prev) => [...prev, created]);
      setGoalTitle('');
      setGoalTarget('');
      setShowGoalModal(false);
      showToast('Target tabungan baru ditambahkan!', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal menambah target tabungan', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleConfirmDepositGoal = async () => {
    if (!depositGoalTarget) return;
    const val = getRawNumericValue(depositAmountInput);
    if (!val) return showToast('Masukkan nominal setoran!', 'warn');

    try {
      setIsSyncing(true);
      const updated = await api.depositGoal(depositGoalTarget.id, val);
      setSavingGoals((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
      setDepositGoalTarget(null);
      setDepositAmountInput('');
      showToast(`Berhasil menambah setoran Rp ${formatNumber(val)}!`, 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal menyetor tabungan', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteGoal = async (id: string) => {
    const ok = await askConfirm({
      title: 'Hapus Target Tabungan',
      message: 'Yakin ingin menghapus target tabungan ini?',
      confirmLabel: 'Hapus',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      setIsSyncing(true);
      await api.deleteGoal(id);
      setSavingGoals((prev) => prev.filter((g) => g.id !== id));
      showToast('Target tabungan dihapus', 'warn');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus target tabungan', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // --- DEBTS LOGIC ---
  const handleAddDebt = async () => {
    const amtVal = getRawNumericValue(debtAmount);
    if (!debtPerson.trim() || !amtVal) return showToast('Isi nama & nominal utang!', 'warn');

    try {
      setIsSyncing(true);
      const created = await api.createDebt({
        person: debtPerson.trim(),
        amount: amtVal,
        type: debtType,
        note: debtNote.trim(),
        dueDate: getTodayIso(),
      });
      setDebts((prev) => [created, ...prev]);
      setDebtPerson('');
      setDebtAmount('');
      setDebtNote('');
      setShowDebtModal(false);
      showToast('Catatan hutang/piutang berhasil dibuat!', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal membuat catatan hutang', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleToggleDebtPaid = async (id: string) => {
    try {
      setIsSyncing(true);
      const updated = await api.toggleDebtPaid(id);
      setDebts((prev) => prev.map((d) => (d.id === id ? updated : d)));
      showToast(`Status diperbarui menjadi ${updated.isPaid ? 'LUNAS' : 'BELUM LUNAS'}!`, 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal mengubah status hutang', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteDebt = async (id: string) => {
    const ok = await askConfirm({
      title: 'Hapus Catatan Hutang',
      message: 'Yakin ingin menghapus catatan hutang/piutang ini?',
      confirmLabel: 'Hapus',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      setIsSyncing(true);
      await api.deleteDebt(id);
      setDebts((prev) => prev.filter((d) => d.id !== id));
      showToast('Catatan utang dihapus', 'warn');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus catatan hutang', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // --- IMPORT / EXPORT DATA (MONGODB) ---
  const handleExportData = async () => {
    try {
      setIsSyncing(true);
      const dataObj = await api.exportData();
      const jsonStr = JSON.stringify(dataObj, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hematin_backup_${getTodayIso()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Data berhasil diekspor dari MongoDB!', 'success');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal mengekspor data', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleImportData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const content = evt.target?.result as string;
        const parsed = JSON.parse(content);
        setIsSyncing(true);
        await api.importData(parsed);
        await loadAllData();
        showToast('Data backup berhasil di-import ke MongoDB!', 'success');
      } catch (err: unknown) {
        showToast(
          'Gagal import JSON: ' + (err instanceof Error ? err.message : 'Format tidak valid'),
          'error'
        );
      } finally {
        setIsSyncing(false);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleClearAllData = async () => {
    const ok = await askConfirm({
      title: 'Hapus Semua Data MongoDB',
      message: 'BAHAYA: Seluruh transaksi, target tabungan, hutang, dan pengaturan di MongoDB akan dihapus permanen. Lanjutkan?',
      confirmLabel: 'Hapus Semua',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      setIsSyncing(true);
      await api.clearAllData();
      localStorage.removeItem('local_tutorial_completed');
      await loadAllData();
      showToast('Seluruh data di MongoDB telah dibersihkan.', 'warn');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Gagal menghapus semua data', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // --- CHARTS UPDATE ---
  useEffect(() => {
    if (activeTab === 'fitur' && categoryChartRef.current) {
      if (categoryChartInstance.current) categoryChartInstance.current.destroy();
      const ctxBar = categoryChartRef.current.getContext('2d');
      if (ctxBar) {
        let labels: string[] = [];
        let incData: number[] = [];
        let expData: number[] = [];

        if (chartTimeframe === 'harian') {
          const daysMap: Record<string, { inc: number; exp: number; label: string }> = {};
          for (let i = 6; i >= 0; i -= 1) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const isoKey = getIsoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
            const label = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
            daysMap[isoKey] = { inc: 0, exp: 0, label };
          }
          transactions.forEach((t) => {
            const iso = parseAnyDateToIso(t.date);
            if (iso && daysMap[iso]) {
              if (t.type === 'pemasukan') daysMap[iso].inc += t.amount;
              else daysMap[iso].exp += t.amount;
            }
          });
          labels = Object.values(daysMap).map((v) => v.label);
          incData = Object.values(daysMap).map((v) => v.inc);
          expData = Object.values(daysMap).map((v) => v.exp);
        } else if (chartTimeframe === 'bulanan') {
          labels = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
          incData = new Array(12).fill(0);
          expData = new Array(12).fill(0);
          const currentYear = new Date().getFullYear();
          transactions.forEach((t) => {
            const iso = parseAnyDateToIso(t.date);
            if (iso) {
              const [y, m] = iso.split('-').map((n) => parseInt(n, 10));
              if (y === currentYear && m >= 1 && m <= 12) {
                if (t.type === 'pemasukan') incData[m - 1] += t.amount;
                else expData[m - 1] += t.amount;
              }
            }
          });
        } else {
          const currentYear = new Date().getFullYear();
          const yearSet = new Set<number>();
          for (let y = currentYear - 4; y <= currentYear; y += 1) yearSet.add(y);
          transactions.forEach((t) => {
            const iso = parseAnyDateToIso(t.date);
            if (iso) {
              const y = parseInt(iso.slice(0, 4), 10);
              if (y > 2000 && y < 2100) yearSet.add(y);
            }
          });
          const sortedYears = Array.from(yearSet).sort((a, b) => a - b);
          labels = sortedYears.map(String);
          incData = new Array(sortedYears.length).fill(0);
          expData = new Array(sortedYears.length).fill(0);
          transactions.forEach((t) => {
            const iso = parseAnyDateToIso(t.date);
            if (iso) {
              const y = parseInt(iso.slice(0, 4), 10);
              const idx = sortedYears.indexOf(y);
              if (idx !== -1) {
                if (t.type === 'pemasukan') incData[idx] += t.amount;
                else expData[idx] += t.amount;
              }
            }
          });
        }

        categoryChartInstance.current = new Chart(ctxBar, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: 'Pemasukan',
                data: incData,
                backgroundColor: '#8f8df7',
                borderColor: '#1d1a4a',
                borderWidth: 2.5,
                borderRadius: 8,
              },
              {
                label: 'Pengeluaran',
                data: expData,
                backgroundColor: '#ff5fa8',
                borderColor: '#1d1a4a',
                borderWidth: 2.5,
                borderRadius: 8,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                labels: {
                  color: '#1d1a4a',
                  font: { weight: 'bold' },
                },
              },
              tooltip: {
                backgroundColor: '#1d1a4a',
                titleColor: '#ffffff',
                bodyColor: '#ffffff',
                callbacks: {
                  label: (context) => {
                    const val = context.raw as number;
                    return ` ${context.dataset.label}: Rp ${val.toLocaleString('id-ID')}`;
                  },
                },
              },
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { color: '#8580b0', font: { weight: 'bold' } },
              },
              y: {
                grid: { color: '#eceaf7' },
                ticks: {
                  color: '#8580b0',
                  callback: (value) => {
                    const val = Number(value);
                    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}Jt`;
                    if (val >= 1000) return `${(val / 1000).toFixed(0)}rb`;
                    return val;
                  },
                },
              },
            },
          },
        });
      }
    }

    if (activeTab === 'home' && todayDoughnutRef.current) {
      if (todayDoughnutInstance.current) todayDoughnutInstance.current.destroy();
      const ctxDoughnut = todayDoughnutRef.current.getContext('2d');
      if (ctxDoughnut) {
        const catsMap: Record<string, number> = {};
        transactions.forEach((t) => {
          if (t.type === 'pengeluaran' && t.date === todayIso) {
            const key = t.category || 'Lainnya';
            catsMap[key] = (catsMap[key] || 0) + t.amount;
          }
        });
        const hasTodayExpense = Object.keys(catsMap).length > 0;
        const dLabels = hasTodayExpense ? Object.keys(catsMap) : ['Belum Ada Pengeluaran Hari Ini'];
        const dData = hasTodayExpense ? Object.values(catsMap) : [1];
        const dBg = hasTodayExpense
          ? ['#ff5fa8', '#8f8df7', '#b8b3ff', '#34d399', '#fbbf24', '#60a5fa']
          : ['#eceaf7'];

        todayDoughnutInstance.current = new Chart(ctxDoughnut, {
          type: 'doughnut',
          data: {
            labels: dLabels,
            datasets: [
              {
                data: dData,
                backgroundColor: dBg,
                borderWidth: hasTodayExpense ? 2.5 : 1.5,
                borderColor: hasTodayExpense ? '#1d1a4a' : '#dcdaf0',
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
              legend: {
                labels: {
                  color: '#1d1a4a',
                  font: { weight: 'bold' },
                },
              },
              tooltip: {
                backgroundColor: '#1d1a4a',
                callbacks: {
                  label: (context) => {
                    if (!hasTodayExpense) return ' Belum ada pengeluaran';
                    const val = context.raw as number;
                    return ` ${context.label}: Rp ${val.toLocaleString('id-ID')}`;
                  },
                },
              },
            },
          },
        });
      }
    }

    return () => {
      if (categoryChartInstance.current) {
        categoryChartInstance.current.destroy();
        categoryChartInstance.current = null;
      }
      if (todayDoughnutInstance.current) {
        todayDoughnutInstance.current.destroy();
        todayDoughnutInstance.current = null;
      }
    };
  }, [transactions, chartTimeframe, activeTab, todayIso]);

  // --- AI ADVISOR LOGIC (WAJIB GOOGLE GEMINI API) ---
  const handleAskAI = async () => {
    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }

    setIsAiLoading(true);
    setAiResponseHTML(
      '<p style="color:#000; font-weight:700;">Gemini AI sedang menganalisis data keuanganmu dari MongoDB...</p>'
    );

    const promptText =
      aiPrompt.trim() ||
      'Berikan analisis singkat kondisi keuangan saya saat ini dan saran praktis cara berhemat.';

    try {
      const result = await api.askAiAdvisor(promptText);
      const rawText = result.reply || 'Maaf, Gemini AI tidak memberikan respon.';
      if (result.model) setAiModelUsed(result.model);

      let i = 0;
      typingIntervalRef.current = setInterval(() => {
        if (i < rawText.length) {
          const partial = rawText.slice(0, i + 10);
          setAiResponseHTML(marked.parse(partial) as string);
          i += 10;
        } else {
          if (typingIntervalRef.current) {
            clearInterval(typingIntervalRef.current);
            typingIntervalRef.current = null;
          }
          setAiResponseHTML(marked.parse(rawText) as string);
        }
      }, 15);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Gagal menghubungi Gemini AI';
      setAiResponseHTML(`<p style="color:red; font-weight:700;">Gagal memproses Gemini AI: ${msg}</p>`);
    } finally {
      setIsAiLoading(false);
    }
  };

  // --- OCR STRUK SCANNER LOGIC ---
  const handleOcrFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOcrLoading(true);
    setOcrProgress('Membaca gambar struk...');
    setOcrRawPreview('');

    try {
      const rawText = await extractTextFromReceipt(file, setOcrProgress);
      setOcrRawPreview(rawText);
      setOcrProgress('Menganalisis toko, item & total belanja...');

      const parsed = await api.parseReceiptOcr(rawText);
      const totalAmount = Math.round(Number(parsed.total) || 0);
      const noteStr = `${parsed.toko || 'Struk Belanja'} (${parsed.items || 'Belanjaan'})`;

      setTxNote(noteStr.slice(0, 280));
      if (parsed.category && TX_CATEGORIES.includes(parsed.category)) {
        setTxCategory(parsed.category);
      }
      // Selalu pakai tanggal hari ini agar otomatis terhitung di Limit Budget Aktif,
      // namun simpan tanggal struk bila berbeda sebagai opsi 1 klik.
      const today = getTodayIso();
      setTxDate(today);
      setOcrDetectedDate(parsed.date && parsed.date !== today ? parsed.date : '');
      setTxModalTab('pengeluaran');

      if (totalAmount > 0) {
        setTxAmount(formatNumber(totalAmount));
        showToast(`Struk Dibaca! ${parsed.toko} — Total: Rp ${formatNumber(totalAmount)}`, 'success');
      } else {
        setTxAmount('');
        showToast('Toko & catatan terbaca, namun total tidak terdeteksi otomatis. Silakan isi nominal manual.', 'warn');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memproses foto struk';
      showToast('Error OCR Struk: ' + msg, 'error');
    } finally {
      setIsOcrLoading(false);
      setOcrProgress('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const defaultDailyRef = budgetSetup.limitValue || 0;

  const dailyExpenseByDate: Record<string, number> = {};
  const dailyTxCountByDate: Record<string, number> = {};
  for (const tx of transactions) {
    dailyTxCountByDate[tx.date] = (dailyTxCountByDate[tx.date] || 0) + 1;
    if (tx.type === 'pengeluaran') {
      dailyExpenseByDate[tx.date] = (dailyExpenseByDate[tx.date] || 0) + tx.amount;
    }
  }

  const hasCustomSelectedLimit = Boolean(
    budgetSetup.dateLimits &&
      Object.prototype.hasOwnProperty.call(budgetSetup.dateLimits, selectedDateIso) &&
      Number(budgetSetup.dateLimits[selectedDateIso]) > 0
  );
  const selectedDateLimit = hasCustomSelectedLimit
    ? Number(budgetSetup.dateLimits[selectedDateIso])
    : defaultDailyRef;
  const selectedDateSpent = dailyExpenseByDate[selectedDateIso] || 0;
  const selectedDateRemain = selectedDateLimit - selectedDateSpent;
  const selectedDateTxCount = dailyTxCountByDate[selectedDateIso] || 0;

  const renderGoalIcon = (iconKey: string) => {
    if (iconKey === 'phone') return <Smartphone size={17} style={{ color: '#8f8df7' }} />;
    if (iconKey === 'shield') return <ShieldCheck size={17} style={{ color: '#10b981' }} />;
    if (iconKey === 'pig') return <PiggyBank size={17} style={{ color: '#ff5fa8' }} />;
    return <Target size={17} style={{ color: '#1d1a4a' }} />;
  };

  const renderTxRow = (t: Transaction) => (
    <div key={t.id} className="tx-item">
      <div style={{ minWidth: 0, flex: 1, paddingRight: 10 }}>
        <div className="tx-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {t.note}
        </div>
        <div className="tx-cat" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span className="tx-category-pill">{t.category}</span>
          <span>{formatDisplayDate(t.date)}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div className={`tx-amt ${t.type === 'pemasukan' ? 'tx-in' : 'tx-out'}`}>
          {t.type === 'pemasukan' ? '+' : '-'} Rp {formatNumber(t.amount)}
        </div>
        <button
          onClick={() => openEditTxModal(t)}
          className="sk-icon-btn"
          title="Edit Transaksi"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={() => handleDeleteTransaction(t.id)}
          className="sk-icon-btn danger"
          title="Hapus Transaksi Ini"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );

  const recentFiveTransactions = transactions.slice(0, 5);

  return (
    <>
      {/* OFFICIAL SAKUGA VFX TOAST HOST (OUTSIDE GRID) */}
      <SakugaToastHost />
      <div className="app-shell">

      {/* SETUP BUDGET OVERLAY */}
      {needsSetup && (
        <div className="setup-overlay active">
          <div className="setup-card">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
              <Lock size={30} style={{ color: 'var(--sk-ink)' }} />
            </div>
            <h2>Setup Budget</h2>
            <p className="sk-helper" style={{ fontSize: 12.5, marginBottom: 14, textAlign: 'center' }}>
              Pilih mode pengelolaan anggaran harian/mingguan/bulanan (tersimpan di MongoDB).
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <SakugaTabs
                label="Mode Budget"
                value={setupSelectedMode}
                options={[
                  { value: 'harian', label: 'Harian' },
                  { value: 'mingguan', label: 'Mingguan' },
                  { value: 'bulanan', label: 'Bulanan' },
                ]}
                onChange={(val) => setSetupSelectedMode(val as 'harian' | 'mingguan' | 'bulanan')}
              />
            </div>
            <div className="form-group">
              <label>Nominal Limit (Rp)</label>
              <input
                type="text"
                placeholder="Contoh: 50.000"
                value={setupLimitInput}
                onChange={(e) => handleCurrencyInput(e.target.value, setSetupLimitInput)}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
              <SakugaButton
                doneOnClick
                disabled={isSyncing}
                onClick={handleSaveSetup}
              >
                {isSyncing ? 'Menyimpan...' : 'Simpan & Kunci'}
              </SakugaButton>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- DESKTOP SIDEBAR (>= 1024px) ----------------- */}
      <aside className="desktop-sidebar">
        <div className="sidebar-brand">
          <img src="/favicon.png" alt="Hematin Logo" className="brand-logo-img" style={{ width: 42, height: 42 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="brand-name" style={{ fontSize: 21 }}>Hematin</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <span className="brand-tagline">MongoDB API</span>
              <span
                title={isBackendConnected ? 'Terhubung ke Express + MongoDB Lokal' : 'Backend offline'}
                className={`sk-tag ${isBackendConnected ? 'sk-tag-live' : 'sk-tag-offline'}`}
                style={{ padding: '1px 6px', fontSize: 10 }}
              >
                {isBackendConnected ? <Database size={10} /> : <WifiOff size={10} />}
                {isSyncing ? 'SYNC' : isBackendConnected ? 'LIVE' : 'OFFLINE'}
              </span>
            </div>
          </div>
        </div>

        {/* QUICK PRIMARY CTAs — REAL SAKUGA VFX BUTTONS */}
        <div className="sidebar-cta-group">
          <div ref={desktopFabRef as unknown as React.RefObject<HTMLDivElement>} style={{ width: '100%' }}>
            <SakugaButton full onClick={openCreateTxModal}>
              + Catat Transaksi
            </SakugaButton>
          </div>
          <SakugaButton full variant="secondary" onClick={openOcrTxModal}>
            Scan Struk OCR
          </SakugaButton>
        </div>

        {/* NAVIGATION */}
        <nav className="sidebar-nav" aria-label="Navigasi Utama Desktop">
          <button
            className={`sidebar-nav-btn ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => setActiveTab('home')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <HomeIcon size={17} />
              <span>Dashboard</span>
            </span>
          </button>

          <button
            ref={desktopRiwayatRef}
            className={`sidebar-nav-btn ${activeTab === 'riwayat' ? 'active' : ''}`}
            onClick={() => setActiveTab('riwayat')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <History size={17} />
              <span>Riwayat</span>
            </span>
            <span className="sidebar-count-pill">{transactions.length}</span>
          </button>

          <button
            className={`sidebar-nav-btn ${activeTab === 'fitur' ? 'active' : ''}`}
            onClick={() => setActiveTab('fitur')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <LayoutGrid size={17} />
              <span>Analitik &amp; Fitur</span>
            </span>
          </button>

          <button
            ref={desktopSettingRef}
            className={`sidebar-nav-btn ${activeTab === 'setting' ? 'active' : ''}`}
            onClick={() => setActiveTab('setting')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Settings size={17} />
              <span>Pengaturan</span>
            </span>
          </button>
        </nav>

        {/* SIDEBAR FOOTER */}
        <div className="sidebar-footer">
          <SakugaButton full size="sm" variant="secondary" onClick={() => setShowAIModal(true)}>
            Tanya AI Advisor
          </SakugaButton>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <span className="sk-tag">{APP_VERSION}</span>
          </div>
        </div>
      </aside>

      {/* ----------------- MAIN CONTENT WORKSPACE ----------------- */}
      <main className="desktop-main">
        {/* DESKTOP TOP HEADER BAR (>= 1024px) */}
        <header className="desktop-topbar">
          <div>
            <h1 className="sk-display" style={{ fontSize: 28, fontStyle: 'italic', fontWeight: 800, color: 'var(--sk-ink)', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
              {PAGE_HEADERS[activeTab].title}
            </h1>
            <p className="sk-helper" style={{ marginTop: 5, maxWidth: 560 }}>
              {PAGE_HEADERS[activeTab].subtitle}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div className="sk-pill" style={{ cursor: 'default' }}>
              <Clock size={13} style={{ color: 'var(--sk-pri)' }} />
              <span>{currentTime}</span>
              <span style={{ color: 'var(--sk-line)' }}>|</span>
              <span style={{ textTransform: 'capitalize', color: 'var(--sk-mute)' }}>{currentDateFormatted}</span>
            </div>
            <button
              className="sk-pill"
              onClick={loadAllData}
              disabled={isSyncing}
              title="Sinkronkan ulang dari MongoDB"
            >
              <RefreshCw size={13} />
              <span>{isSyncing ? 'Syncing...' : 'Refresh'}</span>
            </button>
          </div>
        </header>

        {/* SAKUGA SYNCING PROGRESS BAR */}
        {isSyncing && (
          <div className="sk-loading-stage" style={{ marginBottom: 16 }}>
            <span className="sk-loading-label">Menyinkronkan data MongoDB...</span>
            <SakugaProgress value={0.25} loading={true} label="Sinkronisasi MongoDB" width="100%" />
          </div>
        )}

        {/* MOBILE TOP BRAND HEADER (< 1024px) */}
        <div className="top-brand-bar">
          <div className="brand-logo-title">
            <img src="/favicon.png" alt="Hematin Logo" className="brand-logo-img" />
            <div>
              <div className="brand-name">Hematin</div>
              <div className="brand-tagline" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span>MongoDB API</span>
                <span
                  title={isBackendConnected ? 'Terhubung ke Express + MongoDB' : 'Backend offline'}
                  className={`sk-tag ${isBackendConnected ? 'sk-tag-live' : 'sk-tag-offline'}`}
                  style={{ padding: '0px 6px', fontSize: 9.5 }}
                >
                  {isBackendConnected ? <Database size={9} /> : <WifiOff size={9} />}
                  {isSyncing ? 'SYNC' : isBackendConnected ? 'LIVE' : 'OFFLINE'}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, gap: 4 }}>
            <div className="sk-tag" style={{ color: 'var(--sk-ink)' }}>
              <Clock size={11} style={{ color: 'var(--sk-pri)' }} /> {currentTime}
            </div>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--sk-mute)', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
              {currentDateFormatted}
            </div>
          </div>
        </div>

        {/* BACKEND OFFLINE NOTICE BANNER */}
        {!isBackendConnected && backendError && (
          <div
            className="risk-banner danger"
            style={{ justifyContent: 'space-between' }}
          >
            <div className="risk-desc" style={{ color: '#be185d' }}>
              <strong>Server Offline:</strong> {backendError}
            </div>
            <button
              className="btn-back-styled"
              style={{ fontSize: 11.5, padding: '6px 12px', whiteSpace: 'nowrap' }}
              onClick={loadAllData}
            >
              <RefreshCw size={12} />
              Coba Lagi
            </button>
          </div>
        )}

        {/* ----------------- TAB 1: HOME / DASHBOARD ----------------- */}
        {activeTab === 'home' && (
          <div>
            {showDangerBanner && (
              <div className="risk-banner danger">
                <div className="risk-icon-box">
                  <OctagonAlert size={20} style={{ color: '#db2777' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="risk-title" style={{ color: '#be185d' }}>
                    Peringatan Bahaya!
                  </div>
                  <div className="risk-desc">
                    {balance < 0
                      ? `Saldo kamu saat ini minus (Rp ${formatNumber(balance)})!`
                      : `Pengeluaran kamu sudah menyentuh ${expenseRatio.toFixed(0)}% dari total pemasukan!`}
                  </div>
                </div>
              </div>
            )}
            {showWarningBanner && (
              <div className="risk-banner warning">
                <div className="risk-icon-box">
                  <AlertTriangle size={20} style={{ color: '#d97706' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div className="risk-title" style={{ color: '#b45309' }}>
                    Waspada Keuangan!
                  </div>
                  <div className="risk-desc">
                    Pengeluaran kamu sudah menyentuh <strong>{expenseRatio.toFixed(0)}%</strong> dari total pemasukan!
                  </div>
                </div>
              </div>
            )}

            {/* 3 KPI SUMMARY CARDS */}
            <div className="summary-grid">
              <div ref={targetSaldoRef} className="sum-card sum-card-balance">
                <div className="sum-title" style={{ justifyContent: 'space-between' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <div className="sum-title-icon">
                      <Wallet size={14} />
                    </div>
                    <span>Saldo Saat Ini</span>
                  </span>
                  <button
                    onClick={() => setHideBalance(!hideBalance)}
                    title={hideBalance ? 'Tampilkan Saldo' : 'Sembunyikan Saldo'}
                    className="sk-icon-btn"
                  >
                    {hideBalance ? (
                      <EyeOff size={14} style={{ color: '#db2777' }} />
                    ) : (
                      <Eye size={14} style={{ color: '#8f8df7' }} />
                    )}
                  </button>
                </div>
                <div className="sum-val">
                  {hideBalance ? 'Rp ••••••••' : `Rp ${formatNumber(balance)}`}
                </div>
              </div>

              <div className="sum-card">
                <div className="sum-title">
                  <div className="sum-title-icon income">
                    <ArrowDownLeft size={14} />
                  </div>
                  <span>Total Pemasukan</span>
                </div>
                <div className="sum-val income">
                  {hideBalance ? 'Rp ••••••••' : `Rp ${formatNumber(totalIncome)}`}
                </div>
              </div>

              <div className="sum-card">
                <div className="sum-title">
                  <div className="sum-title-icon expense">
                    <ArrowUpRight size={14} />
                  </div>
                  <span>Total Pengeluaran</span>
                </div>
                <div className="sum-val expense">
                  {hideBalance ? 'Rp ••••••••' : `Rp ${formatNumber(totalExpense)}`}
                </div>
              </div>
            </div>

            {/* DESKTOP 2-COLUMN WORKSPACE GRID */}
            <div className="desktop-home-grid">
              {/* LEFT COLUMN: BUDGET LIMIT + KALENDER */}
              <div className="desktop-col-stack">
                <div ref={targetLimitRef} className="card">
                  <div className="box-header" style={{ marginBottom: 12 }}>
                    <div className="box-title">
                      <div className="box-title-icon pri">
                        <BarChart3 size={17} />
                      </div>
                      <div>
                        <div className="box-title-text">
                          Limit Budget Aktif
                        </div>
                        <div className="sk-helper" style={{ fontSize: 12 }}>
                          Mode {budgetSetup.mode ? budgetSetup.mode : 'harian'} • Target Rp {formatNumber(activeLimit)}
                        </div>
                      </div>
                    </div>
                    <SakugaTooltip
                      align="right"
                      text="Pantau persentase pemakaian limit periode aktif. Bar akan meledak saat mencapai 100%."
                      label="Info Limit Budget"
                    />
                  </div>

                  <div className="sk-stage-box">
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, fontWeight: 600, marginBottom: 12, color: 'var(--sk-ink)' }}>
                      <span>
                        Terpakai:{' '}
                        <strong style={{ color: activeLimitPercentage > 90 ? '#db2777' : 'var(--sk-ink)' }}>
                          Rp {formatNumber(periodSpent)}
                        </strong>
                      </span>
                      <span>
                        Sisa:{' '}
                        <strong style={{ color: periodRemain >= 0 ? '#059669' : '#db2777' }}>
                          Rp {formatNumber(periodRemain)}
                        </strong>
                      </span>
                    </div>
                    <SakugaProgress
                      value={activeLimitPercentage / 100}
                      label={`Limit Budget ${periodLabel}`}
                      width="100%"
                    />
                  </div>
                </div>

                {/* KALENDER INTERAKTIF & LIMIT HARIAN */}
                <div ref={targetCalendarRef} className="card">
                  <div className="box-title" style={{ marginBottom: 12 }}>
                    <div className="box-title-icon">
                      <Calendar size={17} />
                    </div>
                    <div>
                      <div className="box-title-text">
                        Kalender &amp; Limit Harian
                      </div>
                    </div>
                  </div>
                  <div className="calendar-header">
                    <button
                      className="sk-pill"
                      onClick={() => {
                        const d = new Date(currentCalDate);
                        d.setMonth(d.getMonth() - 1);
                        setCurrentCalDate(d);
                      }}
                    >
                      <ChevronLeft size={13} /> Prev
                    </button>
                    <div style={{ fontWeight: 700, fontSize: 13.5, textTransform: 'capitalize', color: 'var(--sk-ink)' }}>
                      {currentCalDate.toLocaleString('id-ID', { month: 'long', year: 'numeric' })}
                    </div>
                    <button
                      className="sk-pill"
                      onClick={() => {
                        const d = new Date(currentCalDate);
                        d.setMonth(d.getMonth() + 1);
                        setCurrentCalDate(d);
                      }}
                    >
                      Next <ChevronRight size={13} />
                    </button>
                  </div>

                  <div className="calendar-grid">
                    {['MIN', 'SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB'].map((d) => (
                      <div key={d} className="day-name">
                        {d}
                      </div>
                    ))}
                    {Array.from({
                      length: new Date(currentCalDate.getFullYear(), currentCalDate.getMonth(), 1).getDay(),
                    }).map((_, i) => (
                      <div key={`empty-${i}`} />
                    ))}
                    {Array.from({
                      length: new Date(currentCalDate.getFullYear(), currentCalDate.getMonth() + 1, 0).getDate(),
                    }).map((_, idx) => {
                      const dayNum = idx + 1;
                      const cellIso = getIsoDate(currentCalDate.getFullYear(), currentCalDate.getMonth() + 1, dayNum);
                      const isToday = todayIso === cellIso;
                      const isSelected = selectedDateIso === cellIso;
                      const hasCellCustomLimit = Boolean(
                        budgetSetup.dateLimits &&
                          Object.prototype.hasOwnProperty.call(budgetSetup.dateLimits, cellIso) &&
                          Number(budgetSetup.dateLimits[cellIso]) > 0
                      );
                      const cellLimit = hasCellCustomLimit
                        ? Number(budgetSetup.dateLimits[cellIso])
                        : defaultDailyRef;
                      const cellSpent = dailyExpenseByDate[cellIso] || 0;
                      const isCellOverLimit = cellLimit > 0 && cellSpent > cellLimit;
                      const hasCellSpend = cellSpent > 0;

                      return (
                        <div
                          key={dayNum}
                          className={`date-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelectedDateIso(cellIso)}
                          title={`${formatDisplayDate(cellIso)} • Terpakai: Rp ${formatNumber(cellSpent)}`}
                        >
                          <span>{dayNum}</span>
                          <span className="cal-dot-row">
                            {isCellOverLimit ? (
                              <span className="cal-dot" style={{ background: '#ff5fa8' }} />
                            ) : hasCellSpend ? (
                              <span className="cal-dot" style={{ background: '#10b981' }} />
                            ) : null}
                            {hasCellCustomLimit && (
                              <span className="cal-dot" style={{ background: '#8f8df7' }} />
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="cal-legend">
                    <span className="cal-legend-item">
                      <span className="cal-dot" style={{ background: '#10b981' }} />
                      Aman
                    </span>
                    <span className="cal-legend-item">
                      <span className="cal-dot" style={{ background: '#ff5fa8' }} />
                      Over-limit
                    </span>
                    <span className="cal-legend-item">
                      <span className="cal-dot" style={{ background: '#8f8df7' }} />
                      Limit Khusus
                    </span>
                  </div>

                  <div className="sk-stage-box" style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--sk-ink)' }}>
                        {formatDisplayDate(selectedDateIso)}
                      </div>
                      <span className={`cal-status-badge ${hasCustomSelectedLimit ? 'custom' : ''}`}>
                        {hasCustomSelectedLimit ? 'Limit Khusus' : 'Ikut Default'}
                      </span>
                    </div>

                    <div style={{ marginBottom: 12, background: 'var(--sk-card)', padding: '10px 12px', border: '1.5px solid var(--sk-line)', borderRadius: 11 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12.5, fontWeight: 600 }}>
                        <span style={{ color: 'var(--sk-mute)' }}>{hasCustomSelectedLimit ? 'Limit Khusus Hari Ini' : 'Limit Harian Default'}</span>
                        <span>Rp {formatNumber(selectedDateLimit)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12.5, fontWeight: 600 }}>
                        <span style={{ color: 'var(--sk-mute)' }}>Terpakai</span>
                        <span style={{ color: '#db2777' }}>Rp {formatNumber(selectedDateSpent)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, paddingTop: 6, marginTop: 4, borderTop: '1.5px dashed var(--sk-line)' }}>
                        <span>Sisa</span>
                        <span style={{ color: selectedDateRemain >= 0 ? '#059669' : '#db2777' }}>
                          Rp {formatNumber(selectedDateRemain)}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        placeholder="Limit khusus tanggal ini..."
                        value={dailyLimitInput}
                        onChange={(e) => handleCurrencyInput(e.target.value, setDailyLimitInput)}
                        style={{ flex: 1, minWidth: 140 }}
                      />
                      <SakugaButton
                        size="sm"
                        doneOnClick
                        disabled={isSyncing}
                        onClick={handleSaveDailyLimit}
                      >
                        Ubah
                      </SakugaButton>
                      {hasCustomSelectedLimit && (
                        <SakugaButton
                          size="sm"
                          variant="secondary"
                          disabled={isSyncing}
                          onClick={handleResetDailyLimit}
                        >
                          Reset
                        </SakugaButton>
                      )}
                    </div>

                    <div className="card-footer-bar" style={{ marginTop: 12, paddingTop: 10 }}>
                      <span className="sk-helper" style={{ fontSize: 11.5 }}>
                        Hanya mengubah tanggal ini (global di Pengaturan).
                      </span>
                      <button
                        type="button"
                        className="sk-pill"
                        onClick={handleViewSelectedDateHistory}
                      >
                        <span>Lihat Transaksi ({selectedDateTxCount})</span>
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: DOUGHNUT CHART + RECENT TRANSACTIONS PREVIEW */}
              <div className="desktop-col-stack">
                <div className="card">
                  <div className="box-title" style={{ marginBottom: 14 }}>
                    <div className="box-title-icon acc">
                      <PieChart size={17} />
                    </div>
                    <div>
                      <div className="box-title-text">
                        Pengeluaran Hari Ini
                      </div>
                    </div>
                  </div>
                  <div className="chart-container" style={{ height: 240 }}>
                    <canvas ref={todayDoughnutRef}></canvas>
                  </div>
                </div>

                <div className="card">
                  <div className="box-header" style={{ marginBottom: 12, flexWrap: 'nowrap' }}>
                    <div className="box-title" style={{ minWidth: 0 }}>
                      <div className="box-title-icon mint">
                        <Receipt size={17} />
                      </div>
                      <div className="box-title-text" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        Transaksi Terbaru
                      </div>
                    </div>
                    <button
                      className="sk-pill"
                      style={{ flexShrink: 0 }}
                      onClick={() => setActiveTab('riwayat')}
                    >
                      <span>Lihat Semua</span>
                      <ArrowRight size={12} />
                    </button>
                  </div>

                  {recentFiveTransactions.length === 0 ? (
                    <div className="sk-empty-box">
                      <div className="sk-helper" style={{ marginBottom: 14 }}>
                        Belum ada transaksi tercatat.
                      </div>
                      <SakugaButton onClick={openCreateTxModal}>
                        + Tambah Transaksi
                      </SakugaButton>
                    </div>
                  ) : (
                    <div>{recentFiveTransactions.map(renderTxRow)}</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ----------------- TAB 2: RIWAYAT (Selalu ke bawah dengan pembatas per hari) ----------------- */}
        {activeTab === 'riwayat' && (
          <div className="card" style={{ position: 'relative' }}>
            <div className="riwayat-header-row">
              <div
                className="box-title"
                onClick={() => setIsHistoryCollapsed(!isHistoryCollapsed)}
                style={{ cursor: 'pointer', minWidth: 0, flex: 1 }}
              >
                <div className="box-title-icon mint" style={{ flexShrink: 0 }}>
                  <Receipt size={17} />
                </div>
                <div className="box-title-text riwayat-header-title">
                  Riwayat Transaksi
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <button
                  className="sk-pill sk-pill-accent desktop-only"
                  onClick={openCreateTxModal}
                >
                  <Plus size={13} /> Tambah
                </button>
                <button
                  onClick={handleBulkDeleteHistory}
                  className="sk-pill sk-pill-danger"
                  title="Hapus Riwayat Terfilter / Semua"
                >
                  <Trash2 size={13} />
                  <span className="desktop-only" style={{ fontSize: 12 }}>Hapus Terfilter</span>
                </button>
                <button
                  onClick={() => setIsHistoryCollapsed(!isHistoryCollapsed)}
                  className="sk-icon-btn"
                  title={isHistoryCollapsed ? 'Buka Riwayat Transaksi' : 'Tutup Riwayat Transaksi'}
                >
                  {isHistoryCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                </button>
              </div>
            </div>

            {/* RINGKASAN FILTER TRANSAKSI */}
            <div className="riwayat-summary-strip">
              <div className="riwayat-stat-box riwayat-stat-total">
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--sk-mute)' }}>Total Data</div>
                <div className="riwayat-stat-val" style={{ color: 'var(--sk-ink)' }}>{filteredHistoryTransactions.length} Transaksi</div>
              </div>
              <div className="riwayat-stat-box" style={{ background: 'var(--sk-mint-soft)', borderColor: '#a7f3d0' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#047857' }}>Pemasukan</div>
                <div className="riwayat-stat-val" style={{ color: '#059669' }}>Rp {formatNumber(filteredIncomeTotal)}</div>
              </div>
              <div className="riwayat-stat-box" style={{ background: 'var(--sk-pink-soft)', borderColor: '#fbcfe8' }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#be185d' }}>Pengeluaran</div>
                <div className="riwayat-stat-val" style={{ color: '#db2777' }}>Rp {formatNumber(filteredExpenseTotal)}</div>
              </div>
            </div>

            {/* TOOLBAR SEARCH + FILTER TIPE + FILTER KATEGORI + FILTER TANGGAL */}
            <div className="riwayat-filter-panel">
              <div className="riwayat-search-wrap">
                <span className="riwayat-search-icon">
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  className="riwayat-search-input"
                  placeholder="Cari catatan, kategori, nominal..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                />
                {historySearch && (
                  <button
                    type="button"
                    className="riwayat-search-clear"
                    onClick={() => setHistorySearch('')}
                    title="Hapus pencarian"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>

              <SakugaTabs
                full
                label="Filter tipe transaksi"
                value={historyTypeFilter}
                options={[
                  { value: 'semua', label: 'Semua' },
                  { value: 'pengeluaran', label: 'Pengeluaran' },
                  { value: 'pemasukan', label: 'Pemasukan' },
                ]}
                onChange={(val) => setHistoryTypeFilter(val as 'semua' | 'pengeluaran' | 'pemasukan')}
              />

              <div className="riwayat-select-grid">
                <select
                  className="category-filter-select"
                  value={historyCategoryFilter}
                  onChange={(e) => setHistoryCategoryFilter(e.target.value)}
                  style={{ borderColor: historyCategoryFilter !== 'semua' ? 'var(--sk-pri)' : undefined }}
                  title="Filter berdasarkan kategori"
                >
                  <option value="semua">Semua Kategori</option>
                  {TX_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>

                <input
                  type="date"
                  className="date-filter-input"
                  value={historyDateFilter}
                  onChange={(e) => setHistoryDateFilter(e.target.value)}
                  style={{ borderColor: historyDateFilter ? 'var(--sk-pri)' : undefined }}
                  title="Filter berdasarkan tanggal"
                />
              </div>

              {hasActiveHistoryFilter && (
                <button
                  type="button"
                  className="sk-pill riwayat-reset-btn"
                  onClick={handleResetHistoryFilters}
                  title="Reset semua filter"
                >
                  <RotateCcw size={12} />
                  <span>Reset Filter</span>
                </button>
              )}
            </div>

            {/* INDIKATOR FILTER AKTIF */}
            {hasActiveHistoryFilter && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, fontSize: 11.5, fontWeight: 600, alignItems: 'center', color: 'var(--sk-mute)' }}>
                <Filter size={13} />
                {historySearch && (
                  <span className="sk-tag" style={{ color: 'var(--sk-ink)' }}>
                    Cari: &quot;{historySearch}&quot;
                    <button onClick={() => setHistorySearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', color: 'var(--sk-ink)' }}>
                      <X size={12} />
                    </button>
                  </span>
                )}
                {historyCategoryFilter !== 'semua' && (
                  <span className="sk-tag" style={{ color: 'var(--sk-ink)' }}>
                    Kategori: {historyCategoryFilter}
                    <button onClick={() => setHistoryCategoryFilter('semua')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', color: 'var(--sk-ink)' }}>
                      <X size={12} />
                    </button>
                  </span>
                )}
                {historyDateFilter && (
                  <span className="sk-tag" style={{ color: 'var(--sk-ink)' }}>
                    Tanggal: {formatDisplayDate(historyDateFilter)}
                    <button onClick={() => setHistoryDateFilter('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', color: 'var(--sk-ink)' }}>
                      <X size={12} />
                    </button>
                  </span>
                )}
              </div>
            )}

            {/* LIST TRANSAKSI KE BAWAH DENGAN PEMBATAS PER HARI */}
            {!isHistoryCollapsed && (
              <div>
                {filteredHistoryTransactions.length === 0 ? (
                  <div className="sk-empty-box">
                    <div className="sk-helper">
                      {transactions.length === 0
                        ? 'Belum ada catatan transaksi di MongoDB.'
                        : 'Tidak ditemukan transaksi yang sesuai dengan filter.'}
                    </div>
                  </div>
                ) : (
                  sortedHistoryDateKeys.map((dateGroup) => {
                    const dayItems = groupedHistoryTransactions[dateGroup];
                    return (
                      <div key={dateGroup} style={{ marginBottom: 18 }}>
                        <div className="day-divider-bar">
                          <div className="day-divider-line" />
                          <div className={`day-divider-pill ${dateGroup === todayIso ? 'today' : ''}`}>
                            <Calendar size={13} style={{ color: 'var(--sk-pri)' }} />
                            <span>{formatDayDividerLabel(dateGroup)}</span>
                            <span style={{ fontSize: 10.5, color: 'var(--sk-mute)' }}>({dayItems.length})</span>
                          </div>
                          <div className="day-divider-line" />
                        </div>
                        {dayItems.map(renderTxRow)}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* ----------------- TAB 3: FITUR & ANALITIK ----------------- */}
        {activeTab === 'fitur' && (
          <div style={{ width: '100%' }}>
            <div className="desktop-fitur-top">
              {/* FINANCIAL DIAGRAM ANALYTICS */}
              <div ref={targetChartRef} className="card">
                <div className="box-title" style={{ marginBottom: 14 }}>
                  <div className="box-title-icon pri">
                    <BarChart3 size={17} />
                  </div>
                  <div className="box-title-text">
                    Diagram Perbandingan
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
                  <SakugaTabs
                    label="Rentang Grafik"
                    value={chartTimeframe}
                    options={[
                      { value: 'harian', label: 'Harian' },
                      { value: 'bulanan', label: 'Bulanan' },
                      { value: 'tahunan', label: 'Tahunan' },
                    ]}
                    onChange={(val) => setChartTimeframe(val as 'harian' | 'bulanan' | 'tahunan')}
                  />
                </div>
                <div className="chart-container">
                  <canvas ref={categoryChartRef}></canvas>
                </div>
              </div>

              {/* ASISTEN CERDAS: HANYA AI ADVISOR (GEMINI) & SCAN STRUK OCR */}
              <div ref={targetAiOcrRef} className="card">
                <div className="box-title" style={{ marginBottom: 14 }}>
                  <div className="box-title-icon acc">
                    <Sliders size={17} />
                  </div>
                  <div className="box-title-text">
                    Asisten Cerdas
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <button
                    type="button"
                    className="feature-card-btn"
                    onClick={() => setShowAIModal(true)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className="feature-icon-badge">
                        <Bot size={20} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--sk-ink)' }}>AI Advisor (Gemini)</div>
                        <div className="sk-helper" style={{ fontSize: 12 }}>
                          Konsultasi finansial &amp; tips berhemat langsung menggunakan Google Gemini AI.
                        </div>
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    className="feature-card-btn"
                    onClick={openOcrTxModal}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className="feature-icon-badge acc">
                        <Camera size={20} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--sk-ink)' }}>Scan Struk Belanja OCR</div>
                        <div className="sk-helper" style={{ fontSize: 12 }}>
                          Upload foto struk otomatis baca toko, kategori, tanggal &amp; total belanja.
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>

            {/* ROW 2: TARGET TABUNGAN + HUTANG PIUTANG */}
            <div className="desktop-fitur-bottom">
              {/* TARGET TABUNGAN FITUR */}
              <div ref={targetGoalRef} className="card">
                <div className="box-header" style={{ marginBottom: 10 }}>
                  <div className="box-title">
                    <div className="box-title-icon mint">
                      <Target size={17} />
                    </div>
                    <div className="box-title-text">
                      Target Tabungan
                    </div>
                  </div>
                  <SakugaButton size="sm" onClick={() => setShowGoalModal(true)}>
                    + Target Baru
                  </SakugaButton>
                </div>
                <p className="sk-helper" style={{ fontSize: 12.5, marginBottom: 12 }}>
                  Catat target &amp; impian keuanganmu di MongoDB. Aktifkan sakelar di bawah agar sisa limit harian otomatis dialokasikan.
                </p>

                <div className="sk-stage-box" style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--sk-ink)', display: 'flex', alignItems: 'center', gap: 7 }}>
                      <PiggyBank size={16} style={{ color: 'var(--sk-acc)' }} /> Auto Pindah Sisa Limit
                      <SakugaTooltip
                        text="Jika nyala, sisa limit harian kemarin otomatis dipindahkan ke tabungan."
                        label="Info Auto Save"
                      />
                    </div>
                    <SakugaToggle
                      checked={Boolean(budgetSetup.autoSaveRemainingLimit)}
                      label="Auto Pindah Sisa Limit"
                      onChange={() => {
                        handleToggleAutoSave();
                      }}
                    />
                  </div>
                  <div className="sk-helper" style={{ fontSize: 12 }}>
                    {budgetSetup.autoSaveRemainingLimit ? (
                      <span>
                        Status <strong style={{ color: 'var(--sk-ink)' }}>NYALA</strong>: Sisa limit kemarin otomatis memotong saldo &amp; masuk tabungan.
                      </span>
                    ) : (
                      <span>
                        Status <strong style={{ color: 'var(--sk-ink)' }}>MATI</strong>: Sisa limit harian tidak dipindahkan otomatis.
                      </span>
                    )}
                  </div>
                </div>

                {savingGoals.length === 0 ? (
                  <div className="sk-empty-box">
                    <div className="sk-helper">
                      Belum ada target tabungan. Klik <strong>+ Target Baru</strong> untuk mulai menabung!
                    </div>
                  </div>
                ) : (
                  savingGoals.map((g) => {
                    const percent =
                      g.targetAmount > 0 ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100)) : 0;
                    return (
                      <div
                        key={g.id}
                        style={{
                          background: 'var(--sk-card)',
                          border: '1.5px solid var(--sk-line)',
                          borderRadius: 15,
                          padding: 13,
                          marginBottom: 10,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 7, color: 'var(--sk-ink)' }}>
                            {renderGoalIcon(g.icon)} {g.title}
                          </span>
                          <span className="sk-helper" style={{ fontSize: 12 }}>
                            Rp {formatNumber(g.currentAmount)} / Rp {formatNumber(g.targetAmount)}
                          </span>
                        </div>
                        <div style={{ margin: '10px 0 12px' }}>
                          <SakugaProgress value={percent / 100} label={g.title} width="100%" />
                        </div>
                        <div className="modal-btn-row">
                          <SakugaButton
                            full
                            size="sm"
                            onClick={() => {
                              setDepositGoalTarget(g);
                              setDepositAmountInput('');
                            }}
                          >
                            + Deposit
                          </SakugaButton>
                          <SakugaButton
                            full
                            size="sm"
                            variant="secondary"
                            onClick={() => handleDeleteGoal(g.id)}
                          >
                            Hapus
                          </SakugaButton>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* HUTANG-PIUTANG FITUR */}
              <div className="card">
                <div className="box-header" style={{ marginBottom: 12 }}>
                  <div className="box-title">
                    <div className="box-title-icon acc">
                      <CreditCard size={17} />
                    </div>
                    <div className="box-title-text">
                      Hutang &amp; Piutang
                    </div>
                  </div>
                  <SakugaButton size="sm" variant="secondary" onClick={() => setShowDebtModal(true)}>
                    + Tambah
                  </SakugaButton>
                </div>

                {debts.length === 0 ? (
                  <div className="sk-empty-box">
                    <div className="sk-helper">Belum ada catatan hutang/piutang.</div>
                  </div>
                ) : (
                  debts.map((d) => (
                    <div key={d.id} className="tx-item" style={{ opacity: d.isPaid ? 0.65 : 1 }}>
                      <div>
                        <div className="tx-name" style={{ textDecoration: d.isPaid ? 'line-through' : 'none' }}>
                          {d.type === 'hutang' ? 'Saya Berhutang ke' : 'Diutangi oleh'}: {d.person}
                        </div>
                        <div className="tx-cat">
                          {d.note || 'Tanpa Catatan'} • {formatDisplayDate(d.dueDate)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className={`tx-amt ${d.type === 'hutang' ? 'tx-out' : 'tx-in'}`}>
                          Rp {formatNumber(d.amount)}
                        </div>
                        <div style={{ display: 'flex', gap: 5, marginTop: 5, justifyContent: 'flex-end' }}>
                          <button
                            onClick={() => handleToggleDebtPaid(d.id)}
                            className={`sk-pill ${d.isPaid ? 'sk-tag-live' : ''}`}
                            style={{ height: 24, padding: '0 9px', fontSize: 10.5 }}
                          >
                            {d.isPaid ? 'LUNAS' : 'BELUM'}
                          </button>
                          <button
                            onClick={() => handleDeleteDebt(d.id)}
                            className="sk-pill sk-pill-danger"
                            style={{ height: 24, padding: '0 9px', fontSize: 10.5 }}
                          >
                            Hapus
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ----------------- TAB 4: SETTING (Tanpa setting layout riwayat) ----------------- */}
        {activeTab === 'setting' && (
          <div className="card">
            <div className="box-header" style={{ marginBottom: 16 }}>
              <div className="box-title">
                <div className="box-title-icon">
                  <Settings size={17} />
                </div>
                <div className="box-title-text">
                  Pengaturan &amp; Data
                </div>
              </div>
              <span className="sk-tag">{APP_VERSION}</span>
            </div>

            <div className="desktop-settings-grid">
              {/* TUTORIAL APLIKASI CARD */}
              <div className="sk-setting-card" onClick={() => toggleSetting('tutor')}>
                <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--sk-ink)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={16} style={{ color: 'var(--sk-pri)' }} /> Tutorial Penggunaan Aplikasi
                  </div>
                  {expandedSettings['tutor'] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
                {expandedSettings['tutor'] && (
                  <div style={{ marginTop: 12, cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
                    <div className="sk-helper" style={{ fontSize: 12.5, marginBottom: 10 }}>
                      Pelajari kembali panduan penggunaan fitur-fitur Hematin kapan saja.
                    </div>
                    <button
                      className="btn-back-styled sk-btn-pri"
                      style={{ width: '100%' }}
                      onClick={() => {
                        setTutorialStep(0);
                        setShowTutorialModal(true);
                      }}
                    >
                      <Play size={14} /> Putar Tutorial Aplikasi
                    </button>
                  </div>
                )}
              </div>

              {/* PENGATURAN AUTO TABUNGAN SISA LIMIT */}
              <div className="sk-setting-card" onClick={() => toggleSetting('autosave')}>
                <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--sk-ink)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <PiggyBank size={16} style={{ color: 'var(--sk-acc)' }} /> Otomatis Masukkan Sisa Limit ke Tabungan
                  </div>
                  {expandedSettings['autosave'] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
                {expandedSettings['autosave'] && (
                  <div style={{ marginTop: 12, cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
                    <div className="sk-helper" style={{ fontSize: 12.5, marginBottom: 10 }}>
                      Pilih apakah uang sisa dari limit harian kemarin otomatis memotong saldo utama &amp; dimasukkan ke target tabungan.
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: budgetSetup.autoSaveRemainingLimit ? '#059669' : '#db2777' }}>
                        Status: {budgetSetup.autoSaveRemainingLimit ? 'Nyala (Potong Saldo)' : 'Mati'}
                      </span>
                      <SakugaToggle
                        checked={Boolean(budgetSetup.autoSaveRemainingLimit)}
                        label="Auto Pindah Sisa Limit"
                        onChange={() => {
                          handleToggleAutoSave();
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* NOTIFIKASI APLIKASI CARD */}
              <div className="sk-setting-card" onClick={() => toggleSetting('notif')}>
                <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--sk-ink)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BellRing size={16} style={{ color: 'var(--sk-pri)' }} /> Notifikasi Aplikasi System
                  </div>
                  {expandedSettings['notif'] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
                {expandedSettings['notif'] && (
                  <div style={{ marginTop: 12, cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
                    <div className="sk-helper" style={{ fontSize: 12.5, marginBottom: 10 }}>
                      Kirim notifikasi ke perangkat/browser saat limit terlampaui (100%) dan darurat pengeluaran (90%).
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: notificationPermission === 'granted' ? '#059669' : '#db2777' }}>
                        Status: {notificationPermission === 'granted' ? 'Diizinkan / Aktif' : 'Belum Diizinkan'}
                      </span>
                      <button className="btn-back-styled sk-btn-pri" onClick={handleRequestNotifPermission}>
                        {notificationPermission === 'granted' ? 'Uji Notifikasi' : 'Aktifkan Notifikasi'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* PATCH NOTES & UPDATE CARD */}
              <div className="sk-setting-card" onClick={() => toggleSetting('patch')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--sk-ink)' }}>
                    <Megaphone size={16} style={{ color: 'var(--sk-pri)' }} /> Catatan Pembaruan
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className="sk-tag">{APP_VERSION}</span>
                    {expandedSettings['patch'] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>
                {expandedSettings['patch'] && (
                  <div style={{ marginTop: 12, cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
                    <div className="sk-helper" style={{ fontSize: 12.5, marginBottom: 10 }}>
                      Lihat migrasi arsitektur ke Node.js + ExpressJS + MongoDB, perbaikan OCR Scan Struk, Gemini AI Advisor, dan tampilan Sakuga Gallery.
                    </div>
                    <button
                      className="btn-back-styled"
                      style={{ width: '100%' }}
                      onClick={() => setShowPatchNotesModal(true)}
                    >
                      Lihat Patch Notes {APP_VERSION}
                    </button>
                  </div>
                )}
              </div>

              {/* RESET BUDGET */}
              <div className="sk-setting-card" onClick={() => toggleSetting('reset')}>
                <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--sk-ink)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <RefreshCw size={16} style={{ color: 'var(--sk-mute)' }} /> Reset Pengaturan Budget
                  </div>
                  {expandedSettings['reset'] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
                {expandedSettings['reset'] && (
                  <div style={{ marginTop: 12, cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
                    <div className="sk-helper" style={{ fontSize: 12.5, marginBottom: 10 }}>
                      Reset mode limit anggaran harian/mingguan/bulanan di MongoDB.
                    </div>
                    <button className="btn-back-styled" style={{ width: '100%' }} onClick={handleResetBudget}>
                      Reset Budget &amp; Limit
                    </button>
                  </div>
                )}
              </div>

              {/* EKSPOR DATA */}
              <div className="sk-setting-card" onClick={() => toggleSetting('export')}>
                <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--sk-ink)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Download size={16} style={{ color: '#059669' }} /> Ekspor Data
                  </div>
                  {expandedSettings['export'] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
                {expandedSettings['export'] && (
                  <div style={{ marginTop: 12, cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
                    <div className="sk-helper" style={{ fontSize: 12.5, marginBottom: 10 }}>
                      Download cadangan data transaksi &amp; budget dari MongoDB dalam format JSON.
                    </div>
                    <button className="btn-back-styled sk-btn-pri" style={{ width: '100%' }} onClick={handleExportData}>
                      Download Backup JSON
                    </button>
                  </div>
                )}
              </div>

              {/* IMPORT DATA */}
              <div className="sk-setting-card" onClick={() => toggleSetting('import')}>
                <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--sk-ink)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Upload size={16} style={{ color: 'var(--sk-pri)' }} /> Import Data
                  </div>
                  {expandedSettings['import'] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
                {expandedSettings['import'] && (
                  <div style={{ marginTop: 12, cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
                    <div className="sk-helper" style={{ fontSize: 12.5, marginBottom: 10 }}>
                      Pulihkan data dari file backup JSON Hematin v1 atau v2 langsung ke MongoDB.
                    </div>
                    <input
                      type="file"
                      ref={importFileInputRef}
                      accept=".json"
                      style={{ display: 'none' }}
                      onChange={handleImportData}
                    />
                    <button
                      className="btn-back-styled"
                      style={{ width: '100%' }}
                      onClick={() => importFileInputRef.current?.click()}
                    >
                      Pilih File JSON
                    </button>
                  </div>
                )}
              </div>

              {/* PWA TUTORIAL */}
              <div className="sk-setting-card" onClick={() => toggleSetting('pwa')}>
                <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--sk-ink)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Smartphone size={16} style={{ color: '#059669' }} /> Panduan Install Web App &amp; Info Database
                  </div>
                  {expandedSettings['pwa'] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
                {expandedSettings['pwa'] && (
                  <div style={{ marginTop: 12, cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
                    <div className="sk-helper" style={{ fontSize: 12.5, marginBottom: 10 }}>
                      Lihat arsitektur penyimpanan MongoDB &amp; cara install Hematin sebagai Web App.
                    </div>
                    <button
                      className="btn-back-styled"
                      style={{ width: '100%' }}
                      onClick={() => setShowPwaModal(true)}
                    >
                      Buka Panduan Install &amp; Info Database
                    </button>
                  </div>
                )}
              </div>

              {/* CLEAR ALL DATA */}
              <div className="sk-setting-card danger" onClick={() => toggleSetting('clear')}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#be185d', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Trash2 size={16} /> Hapus Semua Data
                  </div>
                  {expandedSettings['clear'] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
                {expandedSettings['clear'] && (
                  <div style={{ marginTop: 12, cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
                    <div className="sk-helper" style={{ fontSize: 12.5, marginBottom: 10 }}>
                      Menghapus seluruh catatan transaksi, target, hutang, dan pengaturan di MongoDB secara permanen.
                    </div>
                    <button className="btn-back-styled sk-btn-acc" style={{ width: '100%' }} onClick={handleClearAllData}>
                      Hapus Semua Data
                    </button>
                  </div>
                )}
              </div>

              {/* COPYRIGHT & CREDITS */}
              <div
                className="desktop-span-full"
                style={{ background: 'var(--sk-chip)', border: '1.5px solid var(--sk-line)', borderRadius: 14, padding: 14, textAlign: 'center' }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--sk-ink)', marginBottom: 2 }}>
                  © 2026 Hematin — Node.js + ExpressJS + MongoDB Edition
                </div>
                <div className="sk-helper" style={{ fontSize: 12 }}>
                  Study Club Backend Basic — KSM Veterantech UPNVJ 2026 |{' '}
                  <a href="https://instagram.com/dhgfr_" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--sk-ink)', textDecoration: 'underline', fontWeight: 700 }}>
                    @dhgfr_
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ----------------- MOBILE BOTTOM NAVIGATION BAR (< 1024px) ----------------- */}
      <div className="bottom-nav">
        <button className={`nav-item ${activeTab === 'home' ? 'active' : ''}`} onClick={() => setActiveTab('home')}>
          <HomeIcon size={22} />
          <span>Home</span>
        </button>

        <button
          ref={targetRiwayatRef}
          className={`nav-item ${activeTab === 'riwayat' ? 'active' : ''}`}
          onClick={() => setActiveTab('riwayat')}
        >
          <History size={22} />
          <span>Riwayat</span>
        </button>

        <div className="nav-fab-wrap">
          <button ref={targetFabRef} className="nav-fab-btn" onClick={openCreateTxModal}>
            <Plus size={26} />
          </button>
        </div>

        <button
          ref={targetFiturRef}
          className={`nav-item ${activeTab === 'fitur' ? 'active' : ''}`}
          onClick={() => setActiveTab('fitur')}
        >
          <LayoutGrid size={22} />
          <span>Fitur</span>
        </button>

        <button
          ref={targetSettingRef}
          className={`nav-item ${activeTab === 'setting' ? 'active' : ''}`}
          onClick={() => setActiveTab('setting')}
        >
          <Settings size={22} />
          <span>Setting</span>
        </button>
      </div>

      {/* ----------------- INPUT / EDIT TRANSACTION MODAL ----------------- */}
      {showTxModal && (
        <div
          className="tx-modal-overlay active"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowTxModal(false);
          }}
        >
          <div className="tx-modal-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span className="box-title-text" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                {editingTxId ? (
                  <>
                    <Pencil size={15} /> Edit Transaksi
                  </>
                ) : (
                  <>
                    <Plus size={16} /> Catat Transaksi
                  </>
                )}
              </span>
              <button onClick={() => setShowTxModal(false)} className="sk-icon-btn" aria-label="Tutup">
                <X size={15} />
              </button>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
              <SakugaTabs
                label="Tipe Transaksi"
                value={txModalTab}
                options={
                  editingTxId
                    ? [
                        { value: 'pengeluaran', label: 'Pengeluaran' },
                        { value: 'pemasukan', label: 'Pemasukan' },
                      ]
                    : [
                        { value: 'pengeluaran', label: 'Pengeluaran' },
                        { value: 'pemasukan', label: 'Pemasukan' },
                        { value: 'struk', label: 'Foto Struk' },
                      ]
                }
                onChange={(val) => {
                  const next = val as 'pengeluaran' | 'pemasukan' | 'struk';
                  setTxModalTab(next);
                  if (next === 'pengeluaran' && !editingTxId && txCategory === 'Gaji') setTxCategory('Makanan');
                  if (next === 'pemasukan' && !editingTxId && txCategory === 'Makanan') setTxCategory('Gaji');
                }}
              />
            </div>

            {txModalTab === 'struk' ? (
              <div style={{ textAlign: 'center', padding: '14px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
                  <Camera size={42} style={{ color: 'var(--sk-pri)' }} />
                </div>
                <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6, color: 'var(--sk-ink)' }}>Upload Struk Belanja</div>
                <div className="sk-helper" style={{ fontSize: 12.5, marginBottom: 18 }}>
                  Foto struk diproses dengan Tesseract OCR + Parser Backend agar otomatis membaca toko, item, &amp; total belanja.
                </div>

                {isOcrLoading && (
                  <div className="sk-loading-stage">
                    <span className="sk-loading-label">{ocrProgress || 'Memproses OCR Struk...'}</span>
                    <SakugaProgress value={0.18} loading={true} label="Memproses OCR Struk" width="100%" />
                  </div>
                )}

                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleOcrFileUpload}
                />
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <SakugaButton
                    disabled={isOcrLoading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {isOcrLoading ? 'Memproses...' : 'Pilih Foto / Struk'}
                  </SakugaButton>
                </div>
              </div>
            ) : (
              <div>
                <label className="input-label-styled">Nominal (Rp)</label>
                <div className="nominal-input-box">
                  <span className="nominal-prefix">Rp</span>
                  <input
                    type="text"
                    className="nominal-field"
                    placeholder="0"
                    value={txAmount}
                    onChange={(e) => handleCurrencyInput(e.target.value, setTxAmount)}
                  />
                </div>

                <div className="grid-2col" style={{ marginBottom: 14 }}>
                  <div>
                    <label className="input-label-styled">Tanggal</label>
                    <input type="date" value={txDate} onChange={(e) => setTxDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="input-label-styled">Kategori</label>
                    <select value={txCategory} onChange={(e) => setTxCategory(e.target.value)}>
                      <option value="Makanan">Makanan &amp; Minuman</option>
                      <option value="Transport">Transportasi &amp; Bensin</option>
                      <option value="Tagihan">Tagihan &amp; Kos/WiFi</option>
                      <option value="Hiburan">Hiburan &amp; Jajan</option>
                      <option value="Kebutuhan">Kebutuhan Rumah</option>
                      <option value="Gaji">Gaji / Income</option>
                      <option value="Tabungan">Tabungan</option>
                      <option value="Lainnya">Lain-lain</option>
                    </select>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label className="input-label-styled">Keterangan</label>
                  <input
                    type="text"
                    placeholder="Contoh: Beli Nasi Goreng"
                    value={txNote}
                    onChange={(e) => setTxNote(e.target.value)}
                  />
                </div>

                {ocrDetectedDate && txDate !== ocrDetectedDate && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, padding: '8px 12px', background: 'var(--sk-chip)', border: '1.5px solid var(--sk-line)', borderRadius: 11, fontSize: 11.5 }}>
                    <span style={{ color: 'var(--sk-mute)' }}>
                      Tanggal di struk <strong>{formatDisplayDate(ocrDetectedDate)}</strong> (diset ke hari ini agar masuk limit aktif)
                    </span>
                    <button
                      type="button"
                      className="sk-pill"
                      style={{ height: 26, fontSize: 11, padding: '0 10px' }}
                      onClick={() => setTxDate(ocrDetectedDate)}
                    >
                      Pakai tgl struk
                    </button>
                  </div>
                )}

                {ocrRawPreview && (
                  <details style={{ marginBottom: 14, background: 'var(--sk-chip)', border: '1.5px solid var(--sk-line)', borderRadius: 11, padding: '8px 12px', fontSize: 11.5 }}>
                    <summary style={{ fontWeight: 700, cursor: 'pointer', color: 'var(--sk-ink)' }}>Lihat Teks Mentah Hasil Scan OCR</summary>
                    <pre style={{ whiteSpace: 'pre-wrap', marginTop: 6, fontSize: 10.5, color: 'var(--sk-mute)', maxHeight: 100, overflowY: 'auto' }}>
                      {ocrRawPreview}
                    </pre>
                  </details>
                )}

                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
                  <SakugaButton
                    doneOnClick
                    disabled={isSyncing}
                    onClick={handleSaveTransaction}
                  >
                    {isSyncing ? 'Menyimpan...' : editingTxId ? 'Perbarui Transaksi' : 'Simpan Transaksi'}
                  </SakugaButton>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ----------------- TARGET SAVING MODAL ----------------- */}
      {showGoalModal && (
        <div className="tx-modal-overlay active">
          <div className="tx-modal-box">
            <div className="box-title" style={{ marginBottom: 16 }}>
              <div className="box-title-icon mint">
                <Target size={17} />
              </div>
              <div className="box-title-text">Tambah Target Tabungan</div>
            </div>
            <div className="form-group">
              <label>Judul Target</label>
              <input
                type="text"
                placeholder="Contoh: Beli Sepatu Baru"
                value={goalTitle}
                onChange={(e) => setGoalTitle(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Target Nominal (Rp)</label>
              <input
                type="text"
                placeholder="Contoh: 1.500.000"
                value={goalTarget}
                onChange={(e) => handleCurrencyInput(e.target.value, setGoalTarget)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label>Ikon Tabungan</label>
              <select value={goalIcon} onChange={(e) => setGoalIcon(e.target.value)}>
                <option value="target">Target Umum</option>
                <option value="phone">Gadget / HP</option>
                <option value="shield">Dana Darurat</option>
                <option value="pig">Celengan / Tabungan</option>
              </select>
            </div>
            <div className="modal-btn-row">
              <SakugaButton full size="sm" variant="secondary" onClick={() => setShowGoalModal(false)}>
                Batal
              </SakugaButton>
              <SakugaButton full size="sm" doneOnClick disabled={isSyncing} onClick={handleAddGoal}>
                Simpan
              </SakugaButton>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- DEPOSIT GOAL MODAL ----------------- */}
      {depositGoalTarget && (
        <div className="tx-modal-overlay active">
          <div className="tx-modal-box">
            <div className="box-title" style={{ marginBottom: 14 }}>
              <div className="box-title-icon mint">
                <PiggyBank size={17} />
              </div>
              <div className="box-title-text">Setor ke Tabungan</div>
            </div>
            <p className="sk-helper" style={{ fontSize: 13, marginBottom: 12 }}>
              Target: <strong style={{ color: 'var(--sk-ink)' }}>{depositGoalTarget.title}</strong>
            </p>
            <div className="form-group" style={{ marginBottom: 18 }}>
              <label>Nominal Setoran (Rp)</label>
              <input
                type="text"
                placeholder="Contoh: 100.000"
                value={depositAmountInput}
                onChange={(e) => handleCurrencyInput(e.target.value, setDepositAmountInput)}
                autoFocus
              />
            </div>
            <div className="modal-btn-row">
              <SakugaButton full size="sm" variant="secondary" onClick={() => setDepositGoalTarget(null)}>
                Batal
              </SakugaButton>
              <SakugaButton full size="sm" doneOnClick disabled={isSyncing} onClick={handleConfirmDepositGoal}>
                Setor Sekarang
              </SakugaButton>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- DEBT MODAL ----------------- */}
      {showDebtModal && (
        <div className="tx-modal-overlay active">
          <div className="tx-modal-box">
            <div className="box-title" style={{ marginBottom: 16 }}>
              <div className="box-title-icon acc">
                <CreditCard size={17} />
              </div>
              <div className="box-title-text">Catatan Hutang / Piutang</div>
            </div>
            <div className="form-group">
              <label>Jenis</label>
              <select value={debtType} onChange={(e) => setDebtType(e.target.value as 'hutang' | 'piutang')}>
                <option value="hutang">Saya Berhutang ke Orang Lain</option>
                <option value="piutang">Orang Lain Berhutang ke Saya</option>
              </select>
            </div>
            <div className="form-group">
              <label>Nama Orang</label>
              <input
                type="text"
                placeholder="Contoh: Andi"
                value={debtPerson}
                onChange={(e) => setDebtPerson(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Nominal (Rp)</label>
              <input
                type="text"
                placeholder="Contoh: 100.000"
                value={debtAmount}
                onChange={(e) => handleCurrencyInput(e.target.value, setDebtAmount)}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label>Catatan / Keterangan</label>
              <input
                type="text"
                placeholder="Contoh: Pinjam uang makan"
                value={debtNote}
                onChange={(e) => setDebtNote(e.target.value)}
              />
            </div>
            <div className="modal-btn-row">
              <SakugaButton full size="sm" variant="secondary" onClick={() => setShowDebtModal(false)}>
                Batal
              </SakugaButton>
              <SakugaButton full size="sm" doneOnClick disabled={isSyncing} onClick={handleAddDebt}>
                Simpan
              </SakugaButton>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- MODAL AI ADVISOR (HANYA GEMINI AI) ----------------- */}
      {showAIModal && (
        <div className="tx-modal-overlay active">
          <div className="tx-modal-box modal-wide">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="box-title">
                <div className="box-title-icon pri">
                  <Bot size={18} />
                </div>
                <div>
                  <div className="box-title-text">AI Financial Advisor</div>
                  <div className="sk-helper" style={{ fontSize: 11.5 }}>
                    Powered by Google Gemini ({aiModelUsed})
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
                  setShowAIModal(false);
                }}
                className="sk-icon-btn"
              >
                <X size={15} />
              </button>
            </div>

            {isAiLoading && (
              <div className="sk-loading-stage">
                <span className="sk-loading-label">Gemini AI sedang menganalisis data MongoDB...</span>
                <SakugaProgress value={0.18} loading={true} label="Loading AI Advisor" width="100%" />
              </div>
            )}

            <div className="ai-chat-box" dangerouslySetInnerHTML={{ __html: aiResponseHTML }} />

            <div className="form-group">
              <input
                type="text"
                placeholder="Tanya Gemini AI: 'Bagaimana cara hemat pengeluaran bulan ini?'"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isAiLoading) {
                    e.preventDefault();
                    handleAskAI();
                  }
                }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <SakugaButton doneOnClick disabled={isAiLoading} onClick={handleAskAI}>
                {isAiLoading ? 'Memproses Gemini...' : 'Kirim ke AI Advisor'}
              </SakugaButton>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- MODAL PATCH NOTES (v2.0 UPDATE) ----------------- */}
      {showPatchNotesModal && (
        <div className="tx-modal-overlay active">
          <div className="tx-modal-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div className="box-title">
                <div className="box-title-icon pri">
                  <Megaphone size={17} />
                </div>
                <div className="box-title-text">Pembaruan Hematin {APP_VERSION}</div>
              </div>
              <button onClick={handleAcceptPatchNotes} className="sk-icon-btn">
                <X size={15} />
              </button>
            </div>

            <div className="sk-stage-box" style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--sk-ink)', marginBottom: 4 }}>
                Selamat Datang di Hematin {APP_VERSION}!
              </div>
              <div className="sk-helper" style={{ fontSize: 12.5 }}>
                Hematin kini hadir dengan konsep desain <strong style={{ color: 'var(--sk-ink)' }}>Sakuga VFX Gallery</strong> yang bersih dan interaktif, didukung arsitektur <strong style={{ color: 'var(--sk-ink)' }}>Node.js + ExpressJS + MongoDB</strong>.
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16, fontSize: 12.5, maxHeight: '50vh', overflowY: 'auto' }}>
              <div style={{ background: 'var(--sk-card)', border: '1.5px solid var(--sk-line)', borderRadius: 12, padding: 11, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div className="box-title-icon mint" style={{ width: 30, height: 30, minWidth: 30 }}>
                  <Database size={14} />
                </div>
                <div>
                  <strong>Migrasi Database ke MongoDB</strong>
                  <div className="sk-helper" style={{ fontSize: 11.5 }}>
                    Seluruh transaksi, budget limit, target tabungan, dan hutang-piutang tersimpan persisten di MongoDB melalui ExpressJS REST API.
                  </div>
                </div>
              </div>

              <div style={{ background: 'var(--sk-card)', border: '1.5px solid var(--sk-line)', borderRadius: 12, padding: 11, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div className="box-title-icon pri" style={{ width: 30, height: 30, minWidth: 30 }}>
                  <Receipt size={14} />
                </div>
                <div>
                  <strong>Scan Struk OCR &amp; Gemini AI Advisor</strong>
                  <div className="sk-helper" style={{ fontSize: 11.5 }}>
                    Scan struk dilengkapi image preprocessing + Parser Struk Indonesia, serta AI Financial Advisor terhubung ke Google Gemini API.
                  </div>
                </div>
              </div>

              <div style={{ background: 'var(--sk-card)', border: '1.5px solid var(--sk-line)', borderRadius: 12, padding: 11, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div className="box-title-icon acc" style={{ width: 30, height: 30, minWidth: 30 }}>
                  <LayoutGrid size={14} />
                </div>
                <div>
                  <strong>UI Sakuga VFX &amp; Riwayat Per Hari</strong>
                  <div className="sk-helper" style={{ fontSize: 11.5 }}>
                    Tampilan bersih putih-indigo dengan komponen asli Sakuga VFX, animasi spring, loading bar anime, dan efek partikel manga.
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <SakugaButton doneOnClick onClick={handleAcceptPatchNotes}>
                Terima Patch {APP_VERSION}
              </SakugaButton>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- MODAL PERMINTAAN IZIN NOTIFIKASI ----------------- */}
      {showNotifPermModal && (
        <div className="tx-modal-overlay active">
          <div className="tx-modal-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="box-title">
                <div className="box-title-icon pri">
                  <BellRing size={17} />
                </div>
                <div className="box-title-text">Aktifkan Notifikasi Aplikasi</div>
              </div>
              <button onClick={handleDismissNotifPermModal} className="sk-icon-btn">
                <X size={15} />
              </button>
            </div>

            <div className="sk-stage-box" style={{ marginBottom: 16, fontSize: 12.5, color: 'var(--sk-ink)' }}>
              Dapatkan peringatan langsung di layar Browser kamu ketika:
              <ul style={{ paddingLeft: 18, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--sk-mute)' }}>
                <li>Limit pengeluaran mencapai 100%.</li>
                <li>Pengeluaran menyentuh 90% dari pemasukan.</li>
                <li>Ada pembaruan fitur terbaru pada aplikasi Hematin.</li>
              </ul>
            </div>

            <div className="modal-btn-row">
              <SakugaButton full size="sm" variant="secondary" onClick={handleDismissNotifPermModal}>
                Nanti Saja
              </SakugaButton>
              <SakugaButton full size="sm" doneOnClick onClick={handleRequestNotifPermission}>
                Aktifkan
              </SakugaButton>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- MODAL PWA & INFO DATABASE ----------------- */}
      {showPwaModal && (
        <div
          className="tx-modal-overlay active"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClosePwaModal();
          }}
        >
          <div className="tx-modal-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="box-title">
                <div className="box-title-icon mint">
                  <Smartphone size={17} />
                </div>
                <div className="box-title-text">Info Database &amp; Install App</div>
              </div>
              <button onClick={handleClosePwaModal} className="sk-icon-btn">
                <X size={15} />
              </button>
            </div>

            <div style={{ background: 'var(--sk-mint-soft)', border: '1.5px solid #a7f3d0', borderRadius: 12, padding: 12, marginBottom: 14, fontSize: 12.5 }}>
              <div style={{ fontWeight: 700, marginBottom: 4, color: '#047857', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Info size={15} /> Penyimpanan MongoDB Lokal Aktif
              </div>
              <div style={{ color: '#065f46', lineHeight: 1.45 }}>
                <strong>Hematin {APP_VERSION}</strong> menyimpan semua catatan keuangan kamu ke database <strong>MongoDB</strong> melalui REST API <strong>ExpressJS</strong>. Data tetap aman meskipun cache browser dibersihkan.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
              <SakugaTabs
                label="Sistem Operasi"
                value={pwaOsTab}
                options={[
                  { value: 'android', label: 'Android (Chrome)' },
                  { value: 'ios', label: 'iOS (Safari)' },
                ]}
                onChange={(val) => setPwaOsTab(val as 'android' | 'ios')}
              />
            </div>

            {pwaOsTab === 'android' ? (
              <div className="sk-stage-box" style={{ marginBottom: 16, fontSize: 12.5 }}>
                <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--sk-ink)' }}>Cara Install di Android:</div>
                <ol style={{ paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--sk-mute)' }}>
                  <li>Buka web ini di browser <strong>Google Chrome</strong> atau <strong>Brave</strong>.</li>
                  <li>
                    Tekan tombol menu{' '}
                    <MoreVertical size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /> di pojok kanan atas browser.
                  </li>
                  <li>Pilih menu <strong>&quot;Install application&quot;</strong> atau <strong>&quot;Tambahkan ke Layar Utama&quot;</strong>.</li>
                  <li>Klik <strong>Install</strong>. Ikon Hematin akan muncul di menu HP kamu.</li>
                </ol>
              </div>
            ) : (
              <div className="sk-stage-box" style={{ marginBottom: 16, fontSize: 12.5 }}>
                <div style={{ fontWeight: 700, marginBottom: 8, color: 'var(--sk-ink)' }}>Cara Install di iPhone / iPad:</div>
                <ol style={{ paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--sk-mute)' }}>
                  <li>Buka web ini di browser <strong>Safari</strong>.</li>
                  <li>
                    Tekan ikon <strong>Share / Bagikan</strong>{' '}
                    <Share size={13} style={{ display: 'inline', verticalAlign: 'middle' }} /> di bilah bawah Safari.
                  </li>
                  <li>Gulir ke bawah dan pilih <strong>&quot;Add to Home Screen&quot;</strong>.</li>
                  <li>Tekan <strong>Add / Tambah</strong> di pojok kanan atas.</li>
                </ol>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <SakugaButton doneOnClick onClick={handleClosePwaModal}>
                Saya Paham
              </SakugaButton>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- CUSTOM SAKUGA CONFIRM POPUP ----------------- */}
      {confirmDialog && (
        <div
          className="tx-modal-overlay active"
          style={{ zIndex: 30000 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) resolveConfirm(false);
          }}
        >
          <div className="tx-modal-box" style={{ maxWidth: 400 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div className="box-title">
                <div className={`box-title-icon ${confirmDialog.tone === 'warn' ? 'pri' : 'acc'}`}>
                  {confirmDialog.tone === 'warn' ? <AlertTriangle size={17} /> : <Trash2 size={17} />}
                </div>
                <div className="box-title-text">{confirmDialog.title}</div>
              </div>
              <button onClick={() => resolveConfirm(false)} className="sk-icon-btn" aria-label="Tutup">
                <X size={15} />
              </button>
            </div>

            <div className="sk-stage-box" style={{ marginBottom: 18 }}>
              <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--sk-ink)', lineHeight: 1.5, margin: 0 }}>
                {confirmDialog.message}
              </p>
            </div>

            <div className="modal-btn-row">
              <SakugaButton full size="sm" variant="secondary" onClick={() => resolveConfirm(false)}>
                Batal
              </SakugaButton>
              <SakugaButton full size="sm" doneOnClick onClick={() => resolveConfirm(true)}>
                {confirmDialog.confirmLabel || 'Konfirmasi'}
              </SakugaButton>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- INTERACTIVE GUIDED TOUR ----------------- */}
      {showTutorialModal && (
        <>
          <div onClick={handleFinishTutorial} style={{ position: 'fixed', inset: 0, zIndex: 99997, cursor: 'default' }} />
          {(() => {
            const isCircle = spotlightPos.isCircle;
            const isBottomTarget = spotlightPos.y > spotlightPos.windowHeight * 0.55;
            const winWidth = spotlightPos.windowWidth || 400;
            const targetCenterX = spotlightPos.x ? spotlightPos.x + spotlightPos.w / 2 : winWidth / 2;
            const targetCenterY = spotlightPos.y ? spotlightPos.y + spotlightPos.h / 2 : spotlightPos.windowHeight / 2;

            const circleDiameter = isCircle ? Math.max(spotlightPos.w, spotlightPos.h) + 18 : 0;
            const maskW = isCircle ? circleDiameter : spotlightPos.w ? spotlightPos.w + 12 : 0;
            const maskH = isCircle ? circleDiameter : spotlightPos.h ? spotlightPos.h + 12 : 0;
            const maskTop = isCircle ? targetCenterY - circleDiameter / 2 : spotlightPos.y ? spotlightPos.y - 6 : 0;
            const maskLeft = isCircle ? targetCenterX - circleDiameter / 2 : spotlightPos.x ? spotlightPos.x - 6 : 0;

            const ringW = isCircle ? circleDiameter + 6 : spotlightPos.w ? spotlightPos.w + 16 : 0;
            const ringH = isCircle ? circleDiameter + 6 : spotlightPos.h ? spotlightPos.h + 16 : 0;
            const ringTop = isCircle ? targetCenterY - (circleDiameter + 6) / 2 : spotlightPos.y ? spotlightPos.y - 8 : 0;
            const ringLeft = isCircle ? targetCenterX - (circleDiameter + 6) / 2 : spotlightPos.x ? spotlightPos.x - 8 : 0;

            const cardWidth = Math.min(winWidth - 32, 400);
            const cardCenterX =
              winWidth >= 1024
                ? Math.max(cardWidth / 2 + 24, Math.min(targetCenterX, winWidth - cardWidth / 2 - 24))
                : winWidth / 2;
            const cardLeft = cardCenterX - cardWidth / 2;
            const arrowRelX = targetCenterX - cardLeft;
            const arrowLeftPos = Math.max(28, Math.min(arrowRelX, cardWidth - 28));

            return (
              <>
                <div
                  style={{
                    position: 'fixed',
                    top: maskTop,
                    left: maskLeft,
                    width: maskW,
                    height: maskH,
                    borderRadius: isCircle ? '50%' : 16,
                    boxShadow: '0 0 0 9999px rgba(29, 26, 74, 0.72)',
                    zIndex: 99998,
                    pointerEvents: 'none',
                    transition: 'all 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
                    opacity: spotlightPos.w ? 1 : 0,
                  }}
                />
                <div
                  className="tutorial-glow-ring"
                  style={{
                    position: 'fixed',
                    top: ringTop,
                    left: ringLeft,
                    width: ringW,
                    height: ringH,
                    borderRadius: isCircle ? '50%' : 18,
                    border: '3px solid var(--sk-acc)',
                    zIndex: 99999,
                    pointerEvents: 'none',
                    transition: 'all 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
                    opacity: spotlightPos.w ? 1 : 0,
                  }}
                />
                <div
                  key={tutorialStep}
                  className="tutorial-coach-card"
                  style={{
                    position: 'fixed',
                    ...(isBottomTarget ? { top: 85 } : { bottom: 90 }),
                    left: cardCenterX,
                    transform: 'translateX(-50%)',
                    width: 'calc(100% - 32px)',
                    maxWidth: 400,
                    background: 'var(--sk-card)',
                    border: '3px solid var(--sk-ink)',
                    borderRadius: 18,
                    padding: '16px 18px',
                    boxShadow: '6px 7px 0 var(--sk-soft)',
                    zIndex: 100000,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      ...(isBottomTarget ? { top: -14 } : { bottom: -14 }),
                      left: arrowLeftPos,
                      transform: 'translateX(-50%)',
                      width: 0,
                      height: 0,
                      borderLeft: '12px solid transparent',
                      borderRight: '12px solid transparent',
                      ...(isBottomTarget ? { borderBottom: '14px solid #1d1a4a' } : { borderTop: '14px solid #1d1a4a' }),
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      ...(isBottomTarget ? { top: -9 } : { bottom: -9 }),
                      left: arrowLeftPos,
                      transform: 'translateX(-50%)',
                      width: 0,
                      height: 0,
                      borderLeft: '9px solid transparent',
                      borderRight: '9px solid transparent',
                      ...(isBottomTarget ? { borderBottom: '11px solid #ffffff' } : { borderTop: '11px solid #ffffff' }),
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span className="sk-tag" style={{ color: 'var(--sk-ink)', fontWeight: 700 }}>
                      Langkah {tutorialStep + 1} / {tutorialSteps.length}
                    </span>
                    <button onClick={handleFinishTutorial} className="sk-pill sk-pill-danger" style={{ height: 24, fontSize: 10.5, padding: '0 9px' }}>
                      <span>Lewati</span>
                      <X size={11} />
                    </button>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6, color: 'var(--sk-ink)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="box-title-icon" style={{ width: 28, height: 28, minWidth: 28, background: tutorialSteps[tutorialStep].color }}>
                      {tutorialSteps[tutorialStep].icon}
                    </span>
                    {tutorialSteps[tutorialStep].title}
                  </div>
                  <div style={{ marginBottom: 14 }}>{tutorialSteps[tutorialStep].content}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {tutorialStep > 0 ? (
                      <button className="sk-pill" onClick={handlePrevTutorialStep}>
                        <ChevronLeft size={13} /> Prev
                      </button>
                    ) : (
                      <div />
                    )}
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 5 }}>
                      {tutorialSteps.map((_, idx) => (
                        <div
                          key={idx}
                          onClick={() => setTutorialStep(idx)}
                          style={{
                            width: idx === tutorialStep ? 20 : 7,
                            height: 7,
                            borderRadius: 10,
                            border: '1.5px solid var(--sk-ink)',
                            background: idx === tutorialStep ? 'var(--sk-pri)' : 'var(--sk-chip)',
                            cursor: 'pointer',
                            transition: 'width 0.2s ease',
                          }}
                        />
                      ))}
                    </div>
                    <button
                      className={`btn-back-styled ${tutorialStep === tutorialSteps.length - 1 ? 'sk-btn-acc' : 'sk-btn-pri'}`}
                      style={{ padding: '7px 14px', fontSize: 12 }}
                      onClick={handleNextTutorialStep}
                    >
                      {tutorialStep === tutorialSteps.length - 1 ? (
                        <>
                          <span>Selesai</span>
                          <Check size={14} />
                        </>
                      ) : (
                        <>
                          <span>Lanjut</span>
                          <ChevronRight size={14} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </>
            );
          })()}
        </>
      )}
    </div>
    </>
  );
}
