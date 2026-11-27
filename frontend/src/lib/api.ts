export type Transaction = {
  id: string;
  _id?: string;
  type: 'pemasukan' | 'pengeluaran';
  category: string;
  amount: number;
  note: string;
  date: string; // YYYY-MM-DD
};

export type BudgetSetup = {
  mode: 'harian' | 'mingguan' | 'bulanan' | null;
  limitValue: number;
  dateLimits: Record<string, number>;
  tabunganBalance: number;
  autoSaveRemainingLimit: boolean;
  lastAutoSaveDate?: string | null;
  setupAt?: string | null;
};

export type SavingGoal = {
  id: string;
  _id?: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  icon: string;
};

export type DebtItem = {
  id: string;
  _id?: string;
  person: string;
  amount: number;
  type: 'hutang' | 'piutang';
  note: string;
  dueDate: string; // YYYY-MM-DD
  isPaid: boolean;
};

export type ParsedOcrResult = {
  toko: string;
  total: number;
  items: string;
  itemsList: string[];
  date: string | null;
  category: string;
  totalMethod?: string;
  parserSource: string;
};

export type HealthStatus = {
  status: string;
  database: string;
  timestamp: string;
};

type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  data: T;
};

function getApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) {
    if (typeof window !== 'undefined' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(configured)) {
      const host = window.location.hostname;
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        return configured.replace(/localhost|127\.0\.0\.1/i, host).replace(/\/+$/, '');
      }
    }
    return configured.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:5000/api`;
  }
  return 'http://localhost:5000/api';
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getApiBase()}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });
  } catch {
    throw new Error('Tidak dapat terhubung ke server backend (pastikan Express berjalan di port 5000).');
  }

  let json: ApiEnvelope<T> | null = null;
  try {
    json = await response.json();
  } catch {
    throw new Error(`Respon server tidak valid (HTTP ${response.status}).`);
  }

  if (!response.ok || !json || !json.success) {
    throw new Error(json?.message || `Permintaan gagal (HTTP ${response.status})`);
  }

  return json.data;
}

export const api = {
  healthCheck: () => apiRequest<HealthStatus>('/health'),

  // Transactions CRUD
  getTransactions: (params?: {
    type?: string;
    category?: string;
    search?: string;
    date?: string;
    sortBy?: string;
    order?: string;
  }) => {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== '') query.set(k, v);
      });
    }
    const qs = query.toString();
    return apiRequest<Transaction[]>(`/transactions${qs ? `?${qs}` : ''}`);
  },

  createTransaction: (payload: Omit<Transaction, 'id' | '_id'>) =>
    apiRequest<Transaction>('/transactions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateTransaction: (id: string, payload: Partial<Omit<Transaction, 'id' | '_id'>>) =>
    apiRequest<Transaction>(`/transactions/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteTransaction: (id: string) =>
    apiRequest<Transaction>(`/transactions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  bulkDeleteTransactions: (params: {
    type?: string;
    category?: string;
    search?: string;
    date?: string;
    all?: boolean;
  }) => {
    const query = new URLSearchParams();
    if (params.type) query.set('type', params.type);
    if (params.category) query.set('category', params.category);
    if (params.search) query.set('search', params.search);
    if (params.date) query.set('date', params.date);
    if (params.all) query.set('all', 'true');
    return apiRequest<{ deletedCount: number }>(`/transactions?${query.toString()}`, {
      method: 'DELETE',
    });
  },

  // Budget
  getBudget: () => apiRequest<BudgetSetup>('/budget'),

  updateBudget: (payload: Partial<BudgetSetup>) =>
    apiRequest<BudgetSetup>('/budget', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  setDailyLimit: (isoDate: string, limitValue: number) =>
    apiRequest<BudgetSetup>(`/budget/daily-limit/${encodeURIComponent(isoDate)}`, {
      method: 'PATCH',
      body: JSON.stringify({ limitValue }),
    }),

  deleteDailyLimit: (isoDate: string) =>
    apiRequest<BudgetSetup>(`/budget/daily-limit/${encodeURIComponent(isoDate)}`, {
      method: 'DELETE',
    }),

  resetBudget: () =>
    apiRequest<BudgetSetup>('/budget/reset', {
      method: 'DELETE',
    }),

  runAutoSave: (todayIso?: string, yesterdayIso?: string) =>
    apiRequest<{ executed: boolean; amount?: number; transaction?: Transaction; goal?: SavingGoal }>(
      '/budget/auto-save',
      {
        method: 'POST',
        body: JSON.stringify({ todayIso, yesterdayIso }),
      }
    ),

  // Saving Goals
  getGoals: () => apiRequest<SavingGoal[]>('/goals'),

  createGoal: (payload: { title: string; targetAmount: number; icon: string }) =>
    apiRequest<SavingGoal>('/goals', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  depositGoal: (id: string, amount: number) =>
    apiRequest<SavingGoal>(`/goals/${encodeURIComponent(id)}/deposit`, {
      method: 'PATCH',
      body: JSON.stringify({ amount }),
    }),

  deleteGoal: (id: string) =>
    apiRequest<SavingGoal>(`/goals/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  // Debts
  getDebts: () => apiRequest<DebtItem[]>('/debts'),

  createDebt: (payload: {
    person: string;
    amount: number;
    type: 'hutang' | 'piutang';
    note: string;
    dueDate?: string;
  }) =>
    apiRequest<DebtItem>('/debts', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  toggleDebtPaid: (id: string) =>
    apiRequest<DebtItem>(`/debts/${encodeURIComponent(id)}/toggle-paid`, {
      method: 'PATCH',
    }),

  deleteDebt: (id: string) =>
    apiRequest<DebtItem>(`/debts/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  // OCR & AI Advisor
  parseReceiptOcr: (rawText: string) =>
    apiRequest<ParsedOcrResult>('/ocr/parse', {
      method: 'POST',
      body: JSON.stringify({ rawText }),
    }),

  askAiAdvisor: (prompt: string) =>
    apiRequest<{ reply: string; source: string; model?: string }>('/ai/advisor', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),

  // Data Export / Import / Clear
  exportData: () =>
    apiRequest<{
      transactions: Transaction[];
      budgetSetup: BudgetSetup;
      savingGoals: SavingGoal[];
      debts: DebtItem[];
      exportDate: string;
    }>('/data/export'),

  importData: (payload: unknown) =>
    apiRequest<{ transactions: number; savingGoals: number; debts: number }>('/data/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  clearAllData: () =>
    apiRequest<null>('/data/clear', {
      method: 'DELETE',
    }),
};

