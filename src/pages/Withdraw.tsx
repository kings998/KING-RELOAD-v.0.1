import { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Landmark,
  Banknote,
  ShieldAlert,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Smartphone,
  Clock,
  XCircle,
  Copy,
  Check,
  AlertCircle,
} from 'lucide-react';
import { Page, User, PaymentGateway, WithdrawalMethod, WithdrawalRequest } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  doc,
  increment,
  runTransaction,
  collection,
  serverTimestamp,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { paymentService } from '../services/paymentService';

interface WithdrawProps {
  user: User;
  onPageChange: (page: Page) => void;
}

export default function Withdraw({ user, onPageChange }: WithdrawProps) {
  const [amount, setAmount] = useState('100');
  const [method, setMethod] = useState<WithdrawalMethod>('upi');
  const [upiId, setUpiId] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeGateway, setActiveGateway] = useState<PaymentGateway | null>(null);
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  const winningsBalance = Number(user.wallet?.winnings || 0);

  useEffect(() => {
    paymentService.getActiveGatewayAsync().then(setActiveGateway).catch(() => {});
  }, []);

  useEffect(() => {
    if (!auth.currentUser) {
      setRequestsLoading(false);
      return;
    }

    const q = query(
      collection(db, 'withdrawalRequests'),
      where('userId', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as WithdrawalRequest[];

        list.sort((a, b) => {
          const msA = a.createdAt?.toMillis?.() || (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
          const msB = b.createdAt?.toMillis?.() || (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
          return msB - msA;
        });

        setRequests(list);
        setRequestsLoading(false);

        if (!prefilled && list.length > 0) {
          const last = list[0];
          setMethod(last.method || 'upi');
          if (last.upiId) setUpiId(last.upiId);
          if (last.accountHolderName) setAccountHolderName(last.accountHolderName);
          if (last.bankName) setBankName(last.bankName);
          if (last.accountNumber) setAccountNumber(last.accountNumber);
          if (last.ifscCode) setIfscCode(last.ifscCode);
          setPrefilled(true);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'withdrawalRequests');
        setRequestsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [prefilled]);

  const validatePayoutFields = (): string | null => {
    const value = Number(amount);
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
      return 'Please enter a valid whole rupee amount.';
    }
    if (value < 100) {
      return 'Minimum withdrawal amount is ₹100.';
    }
    if (value > 50000) {
      return 'Maximum withdrawal amount per request is ₹50,000.';
    }
    if (value > winningsBalance) {
      return 'Insufficient winnings balance.';
    }

    if (method === 'upi') {
      const cleanUpi = upiId.trim();
      if (!cleanUpi || !/^[a-zA-Z0-9._\-]{2,}@[a-zA-Z0-9]{2,}$/.test(cleanUpi)) {
        return 'Enter a valid UPI ID (e.g. name@okaxis or 9876543210@ybl).';
      }
    } else {
      if (accountHolderName.trim().length < 2) {
        return 'Enter account holder name.';
      }
      if (bankName.trim().length < 2) {
        return 'Enter bank name.';
      }
      const cleanAcc = accountNumber.replace(/\s+/g, '');
      if (cleanAcc.length < 6 || cleanAcc.length > 34 || !/^[a-zA-Z0-9]+$/.test(cleanAcc)) {
        return 'Enter a valid bank account number (6–34 characters).';
      }
      const cleanIfsc = ifscCode.trim().toUpperCase();
      if (cleanIfsc.length < 4 || cleanIfsc.length > 20 || !/^[A-Z0-9]+$/.test(cleanIfsc)) {
        return 'Enter a valid IFSC code (e.g. HDFC0001234).';
      }
    }

    return null;
  };

  const handleWithdraw = async () => {
    if (!auth.currentUser) return;
    setFeedback(null);

    const validationError = validatePayoutFields();
    if (validationError) {
      setFeedback({ type: 'error', message: validationError });
      return;
    }

    const value = parseInt(amount, 10);
    const cleanUpi = upiId.trim();
    const cleanHolder = accountHolderName.trim();
    const cleanBank = bankName.trim();
    const cleanAcc = accountNumber.replace(/\s+/g, '');
    const cleanIfsc = ifscCode.trim().toUpperCase();

    setLoading(true);
    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      const transRef = doc(collection(db, 'transactions'));
      const reqRef = doc(collection(db, 'withdrawalRequests'));

      await runTransaction(db, async (transaction) => {
        const uSnap = await transaction.get(userRef);
        if (!uSnap.exists()) throw new Error('User profile not found.');

        const userData = uSnap.data() as User;
        const currentWinnings = Number(userData.wallet?.winnings || 0);
        if (currentWinnings < value) {
          throw new Error('Insufficient winnings balance.');
        }

        transaction.update(userRef, {
          'wallet.winnings': increment(-value),
        });

        transaction.set(transRef, {
          userId: auth.currentUser!.uid,
          type: 'withdraw',
          amount: value,
          status: 'pending',
          title:
            method === 'upi'
              ? `Withdrawal (UPI: ${cleanUpi})`
              : `Withdrawal (${cleanBank} ••••${cleanAcc.slice(-4)})`,
          createdAt: serverTimestamp(),
        });

        const requestPayload: Record<string, any> = {
          userId: auth.currentUser!.uid,
          username: (userData.username || user.username || 'Player').slice(0, 100),
          userEmail: (userData.email || user.email || auth.currentUser?.email || '').slice(0, 200),
          userPhone: (userData.phone || user.phone || '').slice(0, 30),
          amount: value,
          method,
          status: 'pending',
          transactionId: transRef.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        if (method === 'upi') {
          requestPayload.upiId = cleanUpi;
        } else {
          requestPayload.accountHolderName = cleanHolder;
          requestPayload.bankName = cleanBank;
          requestPayload.accountNumber = cleanAcc;
          requestPayload.ifscCode = cleanIfsc;
        }

        transaction.set(reqRef, requestPayload);
      });

      setFeedback({
        type: 'success',
        message: `Withdrawal request of ₹${value.toLocaleString()} submitted! Admin / Co-Owner will process it shortly.`,
      });
    } catch (error: any) {
      setFeedback({ type: 'error', message: error?.message || 'Withdrawal request failed.' });
      handleFirestoreError(error, OperationType.UPDATE, `users/${auth.currentUser.uid}`);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (ts: any) => {
    if (!ts) return 'Just now';
    try {
      const d = typeof ts?.toDate === 'function' ? ts.toDate() : ts?.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
      if (isNaN(d.getTime())) return 'Recent';
      return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Recent';
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const numericAmount = parseInt(amount || '0', 10);
  const canSubmit = !loading && numericAmount >= 100 && numericAmount <= 50000 && numericAmount <= winningsBalance;

  return (
    <div className="pb-24 max-w-lg mx-auto bg-background min-h-screen">
      <div className="px-5 py-8">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => onPageChange(Page.WALLET)}
            className="p-2.5 bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-500 hover:text-white transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex flex-col">
            <h2 className="text-xl font-bold tracking-tighter uppercase italic text-white">
              Secure <span className="text-purple-500">Withdrawal</span>
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <ShieldCheck size={10} className="text-emerald-500" />
              <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500/80">
                {activeGateway ? `Verified Payouts • ${activeGateway.name}` : 'Verified UPI & Bank Payouts'}
              </span>
            </div>
          </div>
        </div>

        {feedback && (
          <div
            className={`mb-6 p-4 rounded-2xl border flex items-start gap-3 text-xs font-bold ${
              feedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 size={18} className="shrink-0 text-emerald-400 mt-0.5" />
            ) : (
              <AlertCircle size={18} className="shrink-0 text-red-400 mt-0.5" />
            )}
            <p className="leading-relaxed">{feedback.message}</p>
          </div>
        )}

        {/* Withdrawal Amount Card */}
        <section className="bg-neutral-900 border border-neutral-800 rounded-[2.5rem] p-7 mb-6 flex flex-col items-center shadow-2xl relative overflow-hidden">
          <div className="w-14 h-14 bg-purple-500/10 rounded-2xl flex items-center justify-center text-purple-500 mb-4 shadow-xl shadow-purple-500/5 border border-purple-500/10">
            <Banknote size={28} />
          </div>

          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500 mb-1">
            Available Winnings Balance
          </p>
          <h3 className="text-4xl font-black tracking-tighter mb-6 italic text-white">
            ₹{winningsBalance.toLocaleString()}
          </h3>

          <div className="w-full space-y-2 text-left">
            <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 pl-1">
              Amount to Withdraw
            </label>
            <div className="relative">
              <span className="absolute left-5 top-1/2 -translate-y-1/2 text-xl font-black text-neutral-600 italic">
                ₹
              </span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min={100}
                max={50000}
                className="w-full bg-black border border-neutral-800 rounded-2xl py-4 pl-10 pr-5 text-xl font-black tracking-tight outline-hidden focus:border-purple-500/40 text-white italic"
                placeholder="100"
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {[100, 250, 500, 1000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(String(preset))}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                    amount === String(preset)
                      ? 'bg-purple-600 border-purple-500 text-white'
                      : 'bg-black/60 border-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  ₹{preset}
                </button>
              ))}
              {winningsBalance >= 100 && (
                <button
                  type="button"
                  onClick={() => setAmount(String(Math.min(50000, Math.floor(winningsBalance))))}
                  className="px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
                >
                  Max
                </button>
              )}
            </div>

            <div className="flex justify-between px-1 pt-1">
              <p className="text-[8px] font-black text-neutral-600 uppercase tracking-[0.2em]">Min: ₹100</p>
              <p className="text-[8px] font-black text-neutral-600 uppercase tracking-[0.2em]">Max: ₹50,000</p>
            </div>
          </div>
        </section>

        {/* Payout Method Selector */}
        <h4 className="text-[9px] font-black uppercase tracking-[0.3em] text-neutral-500 mb-3 pl-1">
          Payout Destination
        </h4>
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <button
            type="button"
            onClick={() => setMethod('upi')}
            className={`p-3.5 rounded-2xl border flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider transition-all ${
              method === 'upi'
                ? 'bg-purple-600/20 border-purple-500 text-white shadow-lg shadow-purple-500/10'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            <Smartphone size={16} />
            UPI Transfer
          </button>
          <button
            type="button"
            onClick={() => setMethod('bank')}
            className={`p-3.5 rounded-2xl border flex items-center justify-center gap-2 text-xs font-black uppercase tracking-wider transition-all ${
              method === 'bank'
                ? 'bg-purple-600/20 border-purple-500 text-white shadow-lg shadow-purple-500/10'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
            }`}
          >
            <Landmark size={16} />
            Bank Account
          </button>
        </div>

        {/* Payout Details Form */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 mb-6 space-y-3.5">
          {method === 'upi' ? (
            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 pl-1">
                UPI ID (GPay / PhonePe / Paytm)
              </label>
              <input
                type="text"
                value={upiId}
                onChange={(e) => setUpiId(e.target.value)}
                placeholder="e.g. username@okaxis or 9876543210@ybl"
                className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-white outline-hidden focus:border-purple-500/50"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 pl-1">
                  Account Holder Name
                </label>
                <input
                  type="text"
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                  placeholder="Full name as per bank passbook"
                  className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-white outline-hidden focus:border-purple-500/50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 pl-1">
                  Bank Name
                </label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g. State Bank of India, HDFC Bank"
                  className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-white outline-hidden focus:border-purple-500/50"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 pl-1">
                    Account Number
                  </label>
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="Account number"
                    className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-white outline-hidden focus:border-purple-500/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-500 pl-1">
                    IFSC Code
                  </label>
                  <input
                    type="text"
                    value={ifscCode}
                    onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                    placeholder="e.g. SBIN0001234"
                    className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-white uppercase outline-hidden focus:border-purple-500/50"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Advisory */}
        <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-5 mb-6 flex gap-3.5">
          <ShieldAlert className="text-neutral-600 shrink-0 mt-0.5" size={18} />
          <div className="space-y-1">
            <h5 className="text-[10px] font-black uppercase tracking-widest leading-none text-neutral-400">
              Admin & Co-Owner Verification
            </h5>
            <p className="text-[10px] text-neutral-500 font-medium leading-relaxed">
              Requests are reviewed by our Admin / Co-Owner team. If a request is rejected, 100% of the amount is automatically refunded to your winnings wallet.
            </p>
          </div>
        </div>

        <button
          onClick={handleWithdraw}
          disabled={!canSubmit}
          className={`w-full h-14 rounded-2xl font-black text-xs uppercase tracking-[0.25em] shadow-2xl flex items-center justify-center gap-3 transition-all ${
            !canSubmit
              ? 'bg-neutral-900 text-neutral-700 cursor-not-allowed border border-neutral-800'
              : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-600/40 active:scale-95'
          }`}
        >
          {loading ? <Loader2 className="animate-spin" size={18} /> : 'Submit Withdrawal Request'}
        </button>

        {/* Live User Withdrawal History */}
        <section className="mt-10">
          <div className="flex items-center justify-between mb-4 px-1">
            <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-neutral-400">
              Your Withdrawal Requests
            </h4>
            <span className="text-[10px] font-bold text-neutral-600">
              {requests.length} total
            </span>
          </div>

          {requestsLoading ? (
            <div className="p-8 bg-neutral-900/60 border border-neutral-800 rounded-2xl flex justify-center">
              <Loader2 className="animate-spin text-purple-500" size={22} />
            </div>
          ) : requests.length === 0 ? (
            <div className="p-6 bg-neutral-900/40 border border-neutral-800 rounded-2xl text-center">
              <p className="text-xs font-bold text-neutral-500">No withdrawal requests submitted yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => {
                const isPending = req.status === 'pending';
                const isApproved = req.status === 'approved';
                return (
                  <div
                    key={req.id}
                    className="p-4 bg-neutral-900 border border-neutral-800 rounded-2xl space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                            isApproved
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                              : isPending
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                              : 'bg-red-500/10 border-red-500/30 text-red-400'
                          }`}
                        >
                          {isApproved ? (
                            <CheckCircle2 size={17} />
                          ) : isPending ? (
                            <Clock size={17} />
                          ) : (
                            <XCircle size={17} />
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-black italic text-white">
                            ₹{Number(req.amount).toLocaleString()}
                          </p>
                          <p className="text-[10px] font-bold text-neutral-500">
                            {req.method === 'upi'
                              ? `UPI: ${req.upiId}`
                              : `${req.bankName} ••••${(req.accountNumber || '').slice(-4)}`}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                            isApproved
                              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                              : isPending
                              ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                              : 'bg-red-500/15 border-red-500/30 text-red-400'
                          }`}
                        >
                          {req.status === 'approved'
                            ? 'Paid'
                            : req.status === 'rejected'
                            ? 'Rejected & Refunded'
                            : 'Pending'}
                        </span>
                        <p className="text-[9px] text-neutral-600 mt-1">{formatDate(req.createdAt)}</p>
                      </div>
                    </div>

                    {req.utrNumber && (
                      <div className="flex items-center justify-between px-3 py-2 bg-black/50 border border-emerald-500/20 rounded-xl text-[10px]">
                        <span className="text-neutral-400 font-bold">
                          UTR / Ref: <span className="text-emerald-300 font-black">{req.utrNumber}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(`utr-${req.id}`, req.utrNumber!)}
                          className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-black"
                        >
                          {copiedId === `utr-${req.id}` ? <Check size={12} /> : <Copy size={12} />}
                          {copiedId === `utr-${req.id}` ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                    )}

                    {req.adminNote && (
                      <p className="text-[10px] text-neutral-400 bg-black/40 border border-white/5 rounded-xl px-3 py-2">
                        <span className="font-black uppercase text-neutral-500 mr-1.5">Note:</span>
                        {req.adminNote}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
