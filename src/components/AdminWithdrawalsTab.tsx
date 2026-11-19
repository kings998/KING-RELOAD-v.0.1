import React, { useMemo, useState } from 'react';
import {
  Banknote,
  CheckCircle2,
  Clock,
  Copy,
  Check,
  Landmark,
  Loader2,
  Search,
  Smartphone,
  X,
  XCircle,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { Page, User, UserRole, WithdrawalRequest, WithdrawalStatus } from '../types';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  addDoc,
  collection,
  doc,
  increment,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';

interface AdminWithdrawalsTabProps {
  requests: WithdrawalRequest[];
  currentUser?: User | null;
  effectiveRole: UserRole;
  onInspectUser?: (userId: string) => void;
}

export default function AdminWithdrawalsTab({
  requests,
  currentUser,
  effectiveRole,
  onInspectUser,
}: AdminWithdrawalsTabProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | WithdrawalStatus>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<{
    mode: 'approve' | 'reject';
    request: WithdrawalRequest;
  } | null>(null);
  const [utrInput, setUtrInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const stats = useMemo(() => {
    let pendingCount = 0;
    let pendingAmount = 0;
    let approvedAmount = 0;
    let approvedCount = 0;
    let rejectedAmount = 0;
    let rejectedCount = 0;

    requests.forEach((r) => {
      const amt = Number(r.amount || 0);
      if (r.status === 'pending') {
        pendingCount++;
        pendingAmount += amt;
      } else if (r.status === 'approved') {
        approvedCount++;
        approvedAmount += amt;
      } else if (r.status === 'rejected') {
        rejectedCount++;
        rejectedAmount += amt;
      }
    });

    return {
      pendingCount,
      pendingAmount,
      approvedCount,
      approvedAmount,
      rejectedCount,
      rejectedAmount,
    };
  }, [requests]);

  const filteredRequests = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (r.username || '').toLowerCase().includes(q) ||
        (r.userEmail || '').toLowerCase().includes(q) ||
        (r.userPhone || '').toLowerCase().includes(q) ||
        (r.upiId || '').toLowerCase().includes(q) ||
        (r.accountNumber || '').toLowerCase().includes(q) ||
        (r.ifscCode || '').toLowerCase().includes(q) ||
        (r.utrNumber || '').toLowerCase().includes(q) ||
        String(r.amount).includes(q)
      );
    });
  }, [requests, statusFilter, searchTerm]);

  const copyValue = (key: string, value: string) => {
    navigator.clipboard?.writeText(value).catch(() => {});
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const openActionModal = (mode: 'approve' | 'reject', request: WithdrawalRequest) => {
    setFeedback(null);
    setUtrInput('');
    setNoteInput('');
    setActionModal({ mode, request });
  };

  const formatTimestamp = (ts: any) => {
    if (!ts) return 'Recent';
    try {
      const d =
        typeof ts?.toDate === 'function'
          ? ts.toDate()
          : ts?.seconds
          ? new Date(ts.seconds * 1000)
          : new Date(ts);
      if (isNaN(d.getTime())) return 'Recent';
      return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Recent';
    }
  };

  const handleConfirmAction = async () => {
    if (!actionModal || !actionModal.request.id) return;
    const { mode, request } = actionModal;
    const requestId = request.id as string;
    const processorRole: 'admin' | 'co_owner' = effectiveRole === 'co_owner' ? 'co_owner' : 'admin';
    const processorUid = currentUser?.id || auth.currentUser?.uid || 'system';
    const processorName =
      currentUser?.username || currentUser?.email || auth.currentUser?.email || processorRole.toUpperCase();

    if (mode === 'reject' && noteInput.trim().length < 3) {
      setFeedback({ type: 'error', message: 'Please enter a brief rejection reason for the player.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const reqRef = doc(db, 'withdrawalRequests', requestId);

      if (mode === 'approve') {
        const cleanUtr = utrInput.trim().slice(0, 100);
        const cleanNote = noteInput.trim().slice(0, 300);

        const updatePayload: Record<string, any> = {
          status: 'approved',
          processedBy: processorUid,
          processedByName: processorName.slice(0, 100),
          processedByRole: processorRole,
          processedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (cleanUtr) updatePayload.utrNumber = cleanUtr;
        if (cleanNote) updatePayload.adminNote = cleanNote;

        await updateDoc(reqRef, updatePayload);

        await addDoc(collection(db, 'notifications'), {
          title: `Withdrawal Approved: ₹${Number(request.amount).toLocaleString()}`,
          message: cleanUtr
            ? `Your withdrawal of ₹${request.amount} has been sent! UTR / Ref: ${cleanUtr}`
            : `Your withdrawal request of ₹${request.amount} has been approved and processed.`,
          type: 'wallet',
          audience: 'user',
          targetUserId: request.userId,
          targetUsername: request.username,
          actionPage: Page.WALLET,
          actionText: 'View Wallet',
          readBy: [],
          createdAt: serverTimestamp(),
          createdBy: processorUid,
        }).catch(() => {});

        setFeedback({
          type: 'success',
          message: `Approved ₹${Number(request.amount).toLocaleString()} withdrawal for ${request.username}.`,
        });
      } else {
        const reason = noteInput.trim().slice(0, 300);
        const userRef = doc(db, 'users', request.userId);
        const refundTxRef = doc(collection(db, 'transactions'));

        await runTransaction(db, async (tx) => {
          const freshSnap = await tx.get(reqRef);
          if (!freshSnap.exists()) throw new Error('Withdrawal request not found.');
          const freshData = freshSnap.data() as WithdrawalRequest;
          if (freshData.status !== 'pending') {
            throw new Error(`Request already processed (${freshData.status}).`);
          }

          tx.update(reqRef, {
            status: 'rejected',
            adminNote: reason,
            processedBy: processorUid,
            processedByName: processorName.slice(0, 100),
            processedByRole: processorRole,
            processedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          tx.update(userRef, {
            'wallet.winnings': increment(Number(freshData.amount)),
          });

          tx.set(refundTxRef, {
            userId: freshData.userId,
            type: 'refund',
            amount: Number(freshData.amount),
            status: 'completed',
            title: `Withdrawal Rejected Refund (${reason.slice(0, 60)})`,
            createdAt: serverTimestamp(),
          });
        });

        await addDoc(collection(db, 'notifications'), {
          title: `Withdrawal Rejected & Refunded: ₹${Number(request.amount).toLocaleString()}`,
          message: `Reason: ${reason}. ₹${request.amount} has been refunded to your winnings wallet.`,
          type: 'wallet',
          audience: 'user',
          targetUserId: request.userId,
          targetUsername: request.username,
          actionPage: Page.WITHDRAW,
          actionText: 'Check Withdrawals',
          readBy: [],
          createdAt: serverTimestamp(),
          createdBy: processorUid,
        }).catch(() => {});

        setFeedback({
          type: 'success',
          message: `Rejected request & refunded ₹${Number(request.amount).toLocaleString()} to ${request.username}'s winnings wallet.`,
        });
      }

      setActionModal(null);
    } catch (error: any) {
      setFeedback({ type: 'error', message: error?.message || 'Failed to update withdrawal request.' });
      handleFirestoreError(error, OperationType.UPDATE, `withdrawalRequests/${request.id}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Role Header Banner */}
      <div className="p-4 bg-gradient-to-r from-purple-950/60 via-neutral-900 to-cyan-950/40 border border-purple-500/25 rounded-3xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
            <Banknote size={20} />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase italic tracking-tight text-white flex items-center gap-2">
              Withdrawal Requests
              <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-[8px] font-black text-cyan-300 not-italic">
                {effectiveRole === 'co_owner' ? 'CO-OWNER ACCESS' : 'ADMIN ACCESS'}
              </span>
            </h3>
            <p className="text-[10px] text-neutral-400 font-medium mt-0.5">
              Approve payouts with UTR or reject to auto-refund player winnings.
            </p>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-2xl border flex items-center gap-2.5 text-xs font-bold ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 size={16} className="shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle size={16} className="shrink-0 text-red-400" />
          )}
          <span className="flex-1">{feedback.message}</span>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="p-3.5 bg-neutral-900 border border-amber-500/25 rounded-2xl">
          <p className="text-[8px] font-black uppercase tracking-widest text-amber-400">Pending</p>
          <p className="text-lg font-black italic text-white mt-0.5">₹{stats.pendingAmount.toLocaleString()}</p>
          <p className="text-[9px] font-bold text-neutral-500">{stats.pendingCount} requests</p>
        </div>
        <div className="p-3.5 bg-neutral-900 border border-emerald-500/25 rounded-2xl">
          <p className="text-[8px] font-black uppercase tracking-widest text-emerald-400">Paid Out</p>
          <p className="text-lg font-black italic text-emerald-400 mt-0.5">₹{stats.approvedAmount.toLocaleString()}</p>
          <p className="text-[9px] font-bold text-neutral-500">{stats.approvedCount} approved</p>
        </div>
        <div className="p-3.5 bg-neutral-900 border border-red-500/20 rounded-2xl">
          <p className="text-[8px] font-black uppercase tracking-widest text-red-400">Rejected</p>
          <p className="text-lg font-black italic text-red-400 mt-0.5">₹{stats.rejectedAmount.toLocaleString()}</p>
          <p className="text-[9px] font-bold text-neutral-500">{stats.rejectedCount} refunded</p>
        </div>
      </div>

      {/* Filter & Search */}
      <div className="space-y-3">
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {(
            [
              { id: 'pending', label: `Pending (${stats.pendingCount})` },
              { id: 'approved', label: `Paid (${stats.approvedCount})` },
              { id: 'rejected', label: `Rejected (${stats.rejectedCount})` },
              { id: 'all', label: `All (${requests.length})` },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`px-3.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider border whitespace-nowrap transition-all ${
                statusFilter === f.id
                  ? 'bg-purple-600 border-purple-500 text-white shadow-md shadow-purple-600/20'
                  : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-600" size={16} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search player, UPI ID, account number, UTR..."
            className="w-full bg-neutral-900 border border-neutral-800 rounded-2xl py-3 pl-10 pr-4 text-xs font-bold text-white outline-hidden focus:border-purple-500/40"
          />
        </div>
      </div>

      {/* Requests List */}
      {filteredRequests.length === 0 ? (
        <div className="p-10 bg-neutral-900/60 border border-neutral-800 rounded-3xl text-center space-y-2">
          <Clock size={26} className="mx-auto text-neutral-600" />
          <p className="text-xs font-black uppercase tracking-wider text-neutral-400">
            No {statusFilter === 'all' ? '' : statusFilter} withdrawal requests
          </p>
          <p className="text-[10px] text-neutral-600">
            Player withdrawal submissions will appear here in real time.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map((req) => {
            const isPending = req.status === 'pending';
            const isApproved = req.status === 'approved';
            const payoutText =
              req.method === 'upi'
                ? req.upiId || ''
                : `${req.accountNumber || ''} | ${req.ifscCode || ''}`;

            return (
              <div
                key={req.id}
                className="p-4 bg-neutral-900 border border-neutral-800 rounded-3xl space-y-3"
              >
                {/* Top Row: User + Amount */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => onInspectUser?.(req.userId)}
                        className="text-sm font-black text-white hover:text-purple-400 transition-colors truncate"
                      >
                        {req.username}
                      </button>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase border ${
                          req.method === 'upi'
                            ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                            : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-300'
                        }`}
                      >
                        {req.method === 'upi' ? 'UPI' : 'BANK'}
                      </span>
                    </div>
                    <p className="text-[10px] text-neutral-500 truncate mt-0.5">
                      {req.userEmail || req.userId}
                      {req.userPhone ? ` • ${req.userPhone}` : ''}
                    </p>
                    <p className="text-[9px] text-neutral-600 mt-0.5">{formatTimestamp(req.createdAt)}</p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-xl font-black italic text-white">
                      ₹{Number(req.amount).toLocaleString()}
                    </p>
                    <span
                      className={`inline-block mt-1 px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-wider border ${
                        isApproved
                          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                          : isPending
                          ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                          : 'bg-red-500/15 border-red-500/30 text-red-400'
                      }`}
                    >
                      {isApproved ? 'PAID' : isPending ? 'PENDING' : 'REJECTED'}
                    </span>
                  </div>
                </div>

                {/* Payout Destination Details */}
                <div className="p-3 bg-black/60 border border-white/5 rounded-2xl space-y-1.5">
                  {req.method === 'upi' ? (
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Smartphone size={14} className="text-purple-400 shrink-0" />
                        <span className="text-xs font-bold text-white truncate">{req.upiId}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyValue(`pay-${req.id}`, payoutText)}
                        className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-[9px] font-black uppercase text-purple-300 flex items-center gap-1 shrink-0"
                      >
                        {copiedKey === `pay-${req.id}` ? <Check size={11} /> : <Copy size={11} />}
                        {copiedKey === `pay-${req.id}` ? 'Copied' : 'Copy UPI'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1 text-[11px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 font-black text-white">
                          <Landmark size={13} className="text-cyan-400" />
                          {req.bankName}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyValue(`pay-${req.id}`, req.accountNumber || '')}
                          className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/10 text-[9px] font-black uppercase text-cyan-300 flex items-center gap-1"
                        >
                          {copiedKey === `pay-${req.id}` ? <Check size={11} /> : <Copy size={11} />}
                          {copiedKey === `pay-${req.id}` ? 'Copied' : 'Copy A/C'}
                        </button>
                      </div>
                      <p className="text-neutral-400">
                        Holder: <span className="text-white font-bold">{req.accountHolderName}</span>
                      </p>
                      <div className="flex items-center justify-between gap-2 text-neutral-400">
                        <span>
                          A/C: <span className="text-white font-bold">{req.accountNumber}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => copyValue(`ifsc-${req.id}`, req.ifscCode || '')}
                          className="text-neutral-300 hover:text-white font-bold flex items-center gap-1"
                        >
                          IFSC: <span className="text-amber-300">{req.ifscCode}</span>
                          {copiedKey === `ifsc-${req.id}` ? <Check size={10} /> : <Copy size={10} />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Audit / UTR / Rejection Note */}
                {(req.utrNumber || req.adminNote || req.processedByName) && (
                  <div className="px-3 py-2 bg-white/[0.03] border border-white/5 rounded-xl space-y-1 text-[10px]">
                    {req.utrNumber && (
                      <p className="text-emerald-300 font-bold">
                        UTR / Ref: <span className="font-black">{req.utrNumber}</span>
                      </p>
                    )}
                    {req.adminNote && (
                      <p className="text-neutral-300">
                        Note: <span className="text-neutral-400">{req.adminNote}</span>
                      </p>
                    )}
                    {req.processedByName && (
                      <p className="text-[9px] text-neutral-500 flex items-center gap-1">
                        <ShieldCheck size={11} className="text-cyan-400" />
                        Processed by <span className="text-neutral-300 font-bold">{req.processedByName}</span> (
                        {(req.processedByRole || 'admin').replace('_', '-').toUpperCase()})
                        {req.processedAt ? ` • ${formatTimestamp(req.processedAt)}` : ''}
                      </p>
                    )}
                  </div>
                )}

                {/* Pending Actions */}
                {isPending && (
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => openActionModal('approve', req)}
                      className="py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-600/20 active:scale-95 transition-all"
                    >
                      <CheckCircle2 size={14} />
                      Approve & Pay
                    </button>
                    <button
                      type="button"
                      onClick={() => openActionModal('reject', req)}
                      className="py-3 rounded-xl bg-red-600/15 hover:bg-red-600/25 border border-red-500/30 text-red-400 text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-95 transition-all"
                    >
                      <XCircle size={14} />
                      Reject & Refund
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Approve / Reject Confirmation Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full max-w-lg bg-neutral-900 border-t sm:border border-neutral-800 rounded-t-[2.2rem] sm:rounded-3xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-base font-black uppercase italic text-white">
                  {actionModal.mode === 'approve' ? 'Confirm Payout' : 'Reject & Refund'}
                </h4>
                <p className="text-[10px] text-neutral-400 font-bold mt-0.5">
                  {actionModal.request.username} • ₹{Number(actionModal.request.amount).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className="p-2 rounded-xl bg-white/5 text-neutral-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            {actionModal.mode === 'approve' ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-400">
                    UTR / Transaction Reference (Optional)
                  </label>
                  <input
                    type="text"
                    value={utrInput}
                    onChange={(e) => setUtrInput(e.target.value)}
                    placeholder="e.g. 432198765432"
                    className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-white outline-hidden focus:border-emerald-500/50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-400">
                    Admin / Co-Owner Note (Optional)
                  </label>
                  <input
                    type="text"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="e.g. Sent via UPI"
                    className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-white outline-hidden focus:border-emerald-500/50"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[11px] text-red-200 font-medium">
                  Rejecting will automatically refund{' '}
                  <span className="font-black">₹{Number(actionModal.request.amount).toLocaleString()}</span> back to{' '}
                  <span className="font-black">{actionModal.request.username}</span>&apos;s winnings wallet.
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-neutral-400">
                    Rejection Reason (Required)
                  </label>
                  <input
                    type="text"
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="e.g. Invalid UPI ID / Bank mismatch"
                    className="w-full bg-black border border-neutral-800 rounded-xl px-4 py-3 text-xs font-bold text-white outline-hidden focus:border-red-500/50"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setActionModal(null)}
                className="flex-1 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 text-xs font-black uppercase tracking-wider"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmAction}
                className={`flex-1 py-3.5 rounded-xl text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 ${
                  actionModal.mode === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : 'bg-red-600 hover:bg-red-500'
                }`}
              >
                {isSubmitting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : actionModal.mode === 'approve' ? (
                  'Confirm Paid'
                ) : (
                  'Reject & Refund'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
