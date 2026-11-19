import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Crown, Flame, ShieldCheck, Swords, Trophy, Zap } from 'lucide-react';
import kingsReloadLogo from '../assets/images/kr_emblem_pro_1795007184047.jpg';

interface SplashEntryProps {
  authReady: boolean;
  onComplete: () => void;
}

const BURST_PARTICLES = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2;
  const distance = 115 + (i % 3) * 45;
  return {
    id: i,
    tx: Math.cos(angle) * distance,
    ty: Math.sin(angle) * distance,
    size: i % 2 === 0 ? 7 : 5,
    color:
      i % 3 === 0
        ? 'bg-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.95)]'
        : i % 3 === 1
          ? 'bg-purple-400 shadow-[0_0_14px_rgba(192,132,252,0.95)]'
          : 'bg-cyan-400 shadow-[0_0_14px_rgba(34,211,238,0.95)]',
    delay: 0.16 + (i % 4) * 0.03,
  };
});

const POPUP_BADGES = [
  {
    id: 'cash',
    icon: Trophy,
    title: 'WIN REAL CASH',
    sub: 'Instant UPI Payouts',
    tilt: '-rotate-2',
    border: 'border-amber-400/60',
    glow: 'shadow-[0_10px_28px_rgba(245,158,11,0.32)]',
    accent: 'from-amber-500/25 to-orange-500/15',
    iconColor: 'text-amber-300',
    delay: 0.62,
  },
  {
    id: 'rooms',
    icon: Swords,
    title: 'BOOYAH ROOMS',
    sub: 'BR · CS · 1v1 Live',
    tilt: 'rotate-2',
    border: 'border-purple-400/60',
    glow: 'shadow-[0_10px_28px_rgba(168,85,247,0.35)]',
    accent: 'from-purple-500/25 to-fuchsia-500/15',
    iconColor: 'text-purple-300',
    delay: 0.88,
  },
  {
    id: 'fair',
    icon: ShieldCheck,
    title: '100% FAIR PLAY',
    sub: 'Anti-Cheat Guarded',
    tilt: '-rotate-1',
    border: 'border-emerald-400/60',
    glow: 'shadow-[0_10px_28px_rgba(16,185,129,0.3)]',
    accent: 'from-emerald-500/25 to-teal-500/15',
    iconColor: 'text-emerald-300',
    delay: 1.14,
  },
];

export default function SplashEntry({ authReady, onComplete }: SplashEntryProps) {
  const [progress, setProgress] = useState(0);
  const [minDurationDone, setMinDurationDone] = useState(false);

  useEffect(() => {
    const start = performance.now();
    const totalMs = 2450;
    let rafId = 0;

    const tick = (now: number) => {
      const elapsed = now - start;
      const ratio = Math.min(1, elapsed / totalMs);
      const eased = 1 - Math.pow(1 - ratio, 2.6);
      setProgress(Math.round(eased * 100));

      if (ratio < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        setMinDurationDone(true);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    if (minDurationDone && authReady) {
      const timer = window.setTimeout(onComplete, 220);
      return () => window.clearTimeout(timer);
    }
  }, [minDurationDone, authReady, onComplete]);

  const statusText =
    progress < 32
      ? 'IGNITING ARENA...'
      : progress < 68
        ? 'DROPPING INTO LOBBY...'
        : progress < 98
          ? 'LOCKING PRIZE POOLS...'
          : authReady
            ? 'ARENA UNLOCKED!'
            : 'VERIFYING PLAYER...';

  return (
    <motion.div
      key="kings-reload-crazy-splash"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.16, filter: 'blur(6px)' }}
      transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-[100] overflow-hidden bg-[#030712] text-white select-none"
    >
      {/* Camera-Shake Impact Container */}
      <motion.div
        animate={{
          x: [0, -7, 7, -5, 4, -2, 0],
          y: [0, 5, -5, 3, -3, 1, 0],
        }}
        transition={{ type: 'tween', delay: 0.17, duration: 0.36, ease: 'easeOut' }}
        className="relative flex h-full w-full flex-col items-center justify-between px-5 py-7"
      >
        {/* Dynamic Cyber Neon Backdrop */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(245,158,11,0.22),rgba(124,58,237,0.16)_38%,rgba(3,7,18,0.98)_76%)]"
        />

        {/* Perspective Neon Floor Grid */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(251, 191, 36, 0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(168, 85, 247, 0.14) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        {/* Rotating Laser Rays */}
        <motion.div
          aria-hidden="true"
          animate={{ rotate: 360 }}
          transition={{ type: 'tween', duration: 18, repeat: Infinity, ease: 'linear' }}
          className="pointer-events-none absolute top-[40%] left-1/2 h-[640px] w-[640px] -translate-x-1/2 -translate-y-1/2 opacity-20"
          style={{
            background:
              'conic-gradient(from 0deg, transparent 0deg 25deg, rgba(251,191,36,0.45) 30deg 38deg, transparent 42deg 115deg, rgba(168,85,247,0.45) 120deg 128deg, transparent 132deg 205deg, rgba(34,211,238,0.4) 210deg 218deg, transparent 222deg 295deg, rgba(251,191,36,0.4) 300deg 308deg, transparent 312deg 360deg)',
          }}
        />

        {/* Impact Flash Pulse */}
        <motion.div
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.45, 0] }}
          transition={{ type: 'tween', delay: 0.16, duration: 0.32, ease: 'easeOut' }}
          className="pointer-events-none absolute inset-0 bg-amber-300/20"
        />

        {/* Top Bar */}
        <div className="relative z-20 flex w-full max-w-md items-center justify-between">
          <motion.div
            initial={{ scale: 0, x: -20 }}
            animate={{ scale: 1, x: 0 }}
            transition={{ delay: 0.25, type: 'spring', stiffness: 360, damping: 14 }}
            className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-300 shadow-[0_0_18px_rgba(245,158,11,0.3)]"
          >
            <Flame className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
            <span>Esports Arena</span>
          </motion.div>

          {authReady && (
            <motion.button
              type="button"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              whileTap={{ scale: 0.9 }}
              onClick={onComplete}
              className="rounded-full border border-white/20 bg-white/10 px-3.5 py-1 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur-md transition-colors hover:border-amber-400 hover:bg-amber-500 hover:text-black"
            >
              Skip &gt;&gt;
            </motion.button>
          )}
        </div>

        {/* Main Explosive Center Stage */}
        <div className="relative z-20 flex w-full max-w-md flex-col items-center">
          {/* Emblem + Shockwaves + 360 Sparks */}
          <div className="relative flex h-44 w-44 items-center justify-center sm:h-48 sm:w-48">
            {/* 360-Degree Impact Particle Burst */}
            {BURST_PARTICLES.map((p) => (
              <motion.span
                key={p.id}
                aria-hidden="true"
                initial={{ x: 0, y: 0, scale: 0, opacity: 0 }}
                animate={{
                  x: [0, p.tx * 0.7, p.tx],
                  y: [0, p.ty * 0.7, p.ty],
                  scale: [0, 1.4, 0],
                  opacity: [0, 1, 0],
                }}
                transition={{ type: 'tween', delay: p.delay, duration: 0.85, ease: 'easeOut' }}
                style={{ width: p.size, height: p.size }}
                className={`pointer-events-none absolute rounded-full ${p.color}`}
              />
            ))}

            {/* Triple Expanding Shockwave Rings */}
            <motion.div
              aria-hidden="true"
              initial={{ scale: 0.3, opacity: 0.95 }}
              animate={{ scale: 2.1, opacity: 0 }}
              transition={{ type: 'tween', delay: 0.17, duration: 0.7, ease: 'easeOut' }}
              className="pointer-events-none absolute inset-4 rounded-full border-4 border-amber-400"
            />
            <motion.div
              aria-hidden="true"
              initial={{ scale: 0.3, opacity: 0.85 }}
              animate={{ scale: 1.85, opacity: 0 }}
              transition={{ type: 'tween', delay: 0.24, duration: 0.75, ease: 'easeOut' }}
              className="pointer-events-none absolute inset-4 rounded-full border-2 border-purple-400"
            />
            <motion.div
              aria-hidden="true"
              initial={{ scale: 0.3, opacity: 0.75 }}
              animate={{ scale: 1.6, opacity: 0 }}
              transition={{ type: 'tween', delay: 0.31, duration: 0.75, ease: 'easeOut' }}
              className="pointer-events-none absolute inset-4 rounded-full border-2 border-cyan-300"
            />

            {/* Turbo Counter-Rotating Orbital Rings */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ type: 'tween', duration: 4.5, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 rounded-full border-2 border-dashed border-amber-400/70"
            />
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ type: 'tween', duration: 3, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-3 rounded-full border-[3px] border-transparent border-t-amber-300 border-r-purple-500 border-b-cyan-400"
            />

            {/* Bouncing Crown Pop-Up On Top of Logo */}
            <motion.div
              initial={{ scale: 0, y: 24, rotate: -25 }}
              animate={{ scale: 1, y: 0, rotate: 0 }}
              transition={{ delay: 0.36, type: 'spring', stiffness: 420, damping: 12 }}
              className="absolute -top-2 z-30 flex h-10 w-10 items-center justify-center rounded-2xl border-2 border-amber-200 bg-gradient-to-tr from-amber-500 to-yellow-300 text-black shadow-[0_0_24px_rgba(251,191,36,0.9)]"
            >
              <Crown className="h-5 w-5 fill-black" />
            </motion.div>

            {/* Central Emblem Slam + Overshoot Pop */}
            <motion.div
              initial={{ scale: 0, rotate: -22, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ delay: 0.06, type: 'spring', stiffness: 320, damping: 13 }}
              className="relative z-20 h-28 w-28 overflow-hidden rounded-[1.85rem] border-[3px] border-amber-300 bg-[#070b14] shadow-[0_0_55px_rgba(245,158,11,0.55)] sm:h-32 sm:w-32"
            >
              <img
                src={kingsReloadLogo}
                alt="KINGS RELOAD"
                className="h-full w-full object-cover scale-110"
              />
              {/* Repeating Neon Shine Sweep */}
              <motion.div
                aria-hidden="true"
                initial={{ x: '-160%' }}
                animate={{ x: '200%' }}
                transition={{ type: 'tween', delay: 0.42, duration: 0.65, ease: 'easeInOut' }}
                className="pointer-events-none absolute inset-y-0 w-14 -skew-x-25 bg-gradient-to-r from-transparent via-white/65 to-transparent"
              />
            </motion.div>
          </div>

          {/* Crazy Wordmark Clash + Electric Bolt */}
          <div className="mt-4 flex items-center justify-center gap-2">
            <motion.span
              initial={{ x: -120, scale: 1.35, opacity: 0 }}
              animate={{ x: 0, scale: 1, opacity: 1 }}
              transition={{ delay: 0.22, type: 'spring', stiffness: 300, damping: 15 }}
              className="text-3xl font-black italic tracking-tight text-white uppercase drop-shadow-[0_0_20px_rgba(255,255,255,0.45)] sm:text-4xl"
            >
              KINGS
            </motion.span>

            <motion.div
              initial={{ scale: 0, rotate: -45 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.34, type: 'spring', stiffness: 420, damping: 12 }}
              className="text-amber-300 drop-shadow-[0_0_14px_rgba(251,191,36,0.95)]"
            >
              <Zap className="h-6 w-6 fill-amber-400" />
            </motion.div>

            <motion.span
              initial={{ x: 120, scale: 1.35, opacity: 0 }}
              animate={{ x: 0, scale: 1, opacity: 1 }}
              transition={{ delay: 0.25, type: 'spring', stiffness: 300, damping: 15 }}
              className="bg-gradient-to-r from-amber-300 via-yellow-400 to-orange-500 bg-clip-text text-3xl font-black italic tracking-tight text-transparent uppercase drop-shadow-[0_0_22px_rgba(245,158,11,0.55)] sm:text-4xl"
            >
              RELOAD
            </motion.span>
          </div>

          {/* Pop-Up Arcade Feature Cards */}
          <div className="mt-6 grid w-full grid-cols-3 gap-2.5 sm:gap-3">
            {POPUP_BADGES.map((badge) => {
              const Icon = badge.icon;
              return (
                <motion.div
                  key={badge.id}
                  initial={{ scale: 0, y: 36, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  transition={{
                    delay: badge.delay,
                    type: 'spring',
                    stiffness: 380,
                    damping: 14,
                  }}
                  className={`relative overflow-hidden rounded-2xl border ${badge.border} bg-gradient-to-br ${badge.accent} bg-[#091225]/95 p-2.5 text-center backdrop-blur-md ${badge.tilt} ${badge.glow}`}
                >
                  <div className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-xl bg-black/40 border border-white/10">
                    <Icon className={`h-4 w-4 ${badge.iconColor}`} />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-tight text-white leading-tight">
                    {badge.title}
                  </p>
                  <p className="mt-0.5 text-[9px] font-bold text-slate-300 leading-tight">
                    {badge.sub}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Bottom Turbo Arena Loader */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.35 }}
          className="relative z-20 flex w-full max-w-xs flex-col items-center gap-2.5 pb-1"
        >
          <div className="flex w-full items-center justify-between text-[11px] font-black uppercase tracking-wider">
            <span className="text-amber-300">{statusText}</span>
            <span className="font-mono text-white tabular-nums">{progress}%</span>
          </div>

          <div className="h-3 w-full overflow-hidden rounded-full border border-amber-400/35 bg-[#0a1326] p-0.5 shadow-[0_0_20px_rgba(245,158,11,0.2)]">
            <div
              style={{ width: `${progress}%` }}
              className="relative h-full rounded-full bg-gradient-to-r from-purple-500 via-amber-400 to-orange-500 transition-[width] duration-75 ease-out shadow-[0_0_16px_rgba(251,191,36,0.85)]"
            >
              <motion.div
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-y-0 w-10 bg-gradient-to-r from-transparent via-white/55 to-transparent"
              />
            </div>
          </div>

          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-slate-400">
            Free Fire Custom Rooms · Daily Cash
          </p>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
