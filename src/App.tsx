import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { isAdminIdentity, hasPanelAccess } from './constants';
import { Page, User, UserRole } from './types';

import BottomNav from './components/BottomNav';
import GlobalNotificationListener from './components/GlobalNotificationListener';
import SplashEntry from './components/SplashEntry';

import Auth from './pages/Auth';
import Home from './pages/Home';
import Tournaments from './pages/Tournaments';
import JoinMatch from './pages/JoinMatch';
import WalletPage from './pages/Wallet';
import AddMoney from './pages/AddMoney';
import Withdraw from './pages/Withdraw';
import ProfilePage from './pages/Profile';
import AdminPage from './pages/Admin';
import AdminUserDetail from './pages/AdminUserDetail';
import AdminEditMatch from './pages/AdminEditMatch';
import AdminCreateMatch from './pages/AdminCreateMatch';
import ReferralPage from './pages/Referral';
import ProfileDetails from './pages/ProfileDetails';
import GameStats from './pages/GameStats';
import GameModes from './pages/GameModes';
import AdminModes from './pages/AdminModes';
import Leaderboard from './pages/Leaderboard';
import MatchDetails from './pages/MatchDetails';
import ChatPage from './pages/Chat';

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [joinedMatchIds, setJoinedMatchIds] = useState<string[]>([]);

  useEffect(() => {
    let unsubUserDoc: (() => void) | null = null;
    let unsubJoined: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubUserDoc) {
        unsubUserDoc();
        unsubUserDoc = null;
      }
      if (unsubJoined) {
        unsubJoined();
        unsubJoined = null;
      }

      if (!firebaseUser) {
        setUser(null);
        setJoinedMatchIds([]);
        setAuthReady(true);
        return;
      }

      const userRef = doc(db, 'users', firebaseUser.uid);

      try {
        const snap = await getDoc(userRef);
        const normalizedEmail = (firebaseUser.email || '').trim().toLowerCase();
        let assignedRole: UserRole | undefined;

        if (normalizedEmail) {
          try {
            const roleSnap = await getDoc(doc(db, 'roleAssignments', normalizedEmail));
            if (roleSnap.exists()) {
              assignedRole = roleSnap.data()?.role as UserRole;
            }
          } catch {
            // Role assignment lookup may not exist or be readable for standard users
          }
        }

        const adminByIdentity = isAdminIdentity(firebaseUser.email, firebaseUser.uid);

        if (!snap.exists()) {
          const initialRole: UserRole = adminByIdentity ? 'admin' : assignedRole || 'user';
          await setDoc(userRef, {
            username:
              firebaseUser.displayName ||
              firebaseUser.email?.split('@')[0] ||
              'Player',
            email: firebaseUser.email || '',
            phone: firebaseUser.phoneNumber || '',
            wallet: { deposit: 0, winnings: 0, bonus: 0 },
            isKycVerified: false,
            isAdmin: initialRole === 'admin',
            role: initialRole,
            stats: {
              matchesPlayed: 0,
              totalWins: 0,
              totalKills: 0,
              totalWinnings: 0,
            },
            createdAt: serverTimestamp(),
          });
        } else if (adminByIdentity || (assignedRole && snap.data()?.role !== assignedRole)) {
          const nextRole: UserRole = adminByIdentity ? 'admin' : assignedRole || 'user';
          await setDoc(
            userRef,
            {
              role: nextRole,
              isAdmin: nextRole === 'admin',
            },
            { merge: true }
          ).catch(() => {});
        }
      } catch (err) {
        console.error('Error initializing user profile:', err);
      }

      unsubUserDoc = onSnapshot(
        userRef,
        (docSnap) => {
          if (docSnap.exists()) {
            setUser({ id: docSnap.id, ...docSnap.data() } as User);
          } else {
            setUser({
              id: firebaseUser.uid,
              username: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Player',
              email: firebaseUser.email || '',
              phone: firebaseUser.phoneNumber || '',
              wallet: { deposit: 0, winnings: 0, bonus: 0 },
              isKycVerified: false,
              isAdmin: isAdminIdentity(firebaseUser.email, firebaseUser.uid),
              role: isAdminIdentity(firebaseUser.email, firebaseUser.uid) ? 'admin' : 'user',
              stats: {
                matchesPlayed: 0,
                totalWins: 0,
                totalKills: 0,
                totalWinnings: 0,
              },
            });
          }
          setAuthReady(true);
        },
        (err) => {
          handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`);
          setAuthReady(true);
        }
      );

      const joinedQuery = query(
        collection(db, 'registrations'),
        where('userId', '==', firebaseUser.uid)
      );
      unsubJoined = onSnapshot(
        joinedQuery,
        (snapshot) => {
          const ids = Array.from(
            new Set(
              snapshot.docs
                .map((d) => d.data()?.matchId as string | undefined)
                .filter((id): id is string => Boolean(id))
            )
          );
          setJoinedMatchIds(ids);
        },
        () => {}
      );
    });

    return () => {
      unsubAuth();
      if (unsubUserDoc) unsubUserDoc();
      if (unsubJoined) unsubJoined();
    };
  }, []);

  const handlePageChange = useCallback(
    (page: Page, param?: string) => {
      switch (page) {
        case Page.LOGIN:
        case Page.SIGNUP:
          navigate('/login');
          break;
        case Page.HOME:
          navigate('/home');
          break;
        case Page.TOURNAMENTS:
          navigate(param ? `/tournaments/${param}` : '/tournaments');
          break;
        case Page.GAME_MODES:
          navigate(param ? `/game-modes/${param}` : '/game-modes/freefire');
          break;
        case Page.MATCH_DETAILS:
          navigate(param ? `/match-details/${param}` : '/tournaments');
          break;
        case Page.JOIN_MATCH:
          navigate(param ? `/join/${param}` : '/tournaments');
          break;
        case Page.WALLET:
          navigate('/wallet');
          break;
        case Page.ADD_MONEY:
          navigate('/add-money');
          break;
        case Page.WITHDRAW:
          navigate('/withdraw');
          break;
        case Page.PROFILE:
          navigate('/profile');
          break;
        case Page.PROFILE_DETAILS:
          navigate('/profile-details');
          break;
        case Page.GAME_STATS:
          navigate('/game-stats');
          break;
        case Page.REFERRAL:
          navigate('/referral');
          break;
        case Page.LEADERBOARD:
          navigate('/leaderboard');
          break;
        case Page.CHAT:
          navigate('/chat');
          break;
        case Page.ADMIN:
          navigate('/admin');
          break;
        case Page.ADMIN_USER_PROFILE:
          navigate(param ? `/admin/user/${param}` : '/admin');
          break;
        case Page.ADMIN_EDIT_MATCH:
          navigate(param ? `/admin/edit-match/${param}` : '/admin');
          break;
        case Page.ADMIN_CREATE_MATCH:
          navigate(param ? `/admin/create-match/${param}` : '/admin/create-match');
          break;
        case Page.ADMIN_MODES:
          navigate('/admin/modes');
          break;
        default:
          navigate('/home');
      }
    },
    [navigate]
  );

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
      setUser(null);
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  }, [navigate]);

  const handleJoinSuccess = useCallback((matchId: string) => {
    setJoinedMatchIds((prev) => (prev.includes(matchId) ? prev : [...prev, matchId]));
  }, []);

  const showBottomNav =
    Boolean(user && !user.isBanned) &&
    (location.pathname === '/' ||
      location.pathname === '/home' ||
      location.pathname.startsWith('/tournaments') ||
      location.pathname.startsWith('/game-modes') ||
      location.pathname === '/referral' ||
      location.pathname === '/chat' ||
      location.pathname === '/profile' ||
      location.pathname === '/leaderboard');

  return (
    <>
      <AnimatePresence>
        {(showSplash || !authReady) && (
          <SplashEntry
            authReady={authReady}
            onComplete={() => setShowSplash(false)}
          />
        )}
      </AnimatePresence>

      {!authReady ? null : !user ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        >
          <Routes>
            <Route path="/login" element={<Auth onLogin={() => navigate('/home')} />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </motion.div>
      ) : user.isBanned ? (
        <div className="min-h-screen bg-[#071328] flex flex-col items-center justify-center p-6 text-center text-white">
          <div className="max-w-sm w-full bg-slate-900 border border-rose-500/40 rounded-2xl p-6 shadow-2xl">
            <h1 className="text-xl font-black text-rose-400 uppercase">Account Suspended</h1>
            <p className="text-sm text-slate-300 mt-2">
              Your account has been suspended for violating fair-play guidelines. Contact support if
              you believe this is an error.
            </p>
            <button
              onClick={handleLogout}
              className="mt-5 w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 font-bold text-sm text-white transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      ) : (
        <div className="min-h-screen bg-[#071328] text-white">
      <GlobalNotificationListener
        user={user}
        joinedMatchIds={joinedMatchIds}
        onPageChange={handlePageChange}
      />

      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="/login" element={<Navigate to="/home" replace />} />
        <Route
          path="/home"
          element={
            <Home user={user} onPageChange={handlePageChange} joinedMatchIds={joinedMatchIds} />
          }
        />
        <Route
          path="/game-modes/:gameId"
          element={<GameModes onPageChange={handlePageChange} />}
        />
        <Route
          path="/tournaments"
          element={
            <Tournaments onPageChange={handlePageChange} joinedMatchIds={joinedMatchIds} />
          }
        />
        <Route
          path="/tournaments/:gameId"
          element={
            <Tournaments onPageChange={handlePageChange} joinedMatchIds={joinedMatchIds} />
          }
        />
        <Route
          path="/match-details/:id"
          element={
            <MatchDetails
              user={user}
              onPageChange={handlePageChange}
              joinedMatchIds={joinedMatchIds}
            />
          }
        />
        <Route
          path="/join/:id"
          element={
            <JoinMatch
              user={user}
              onPageChange={handlePageChange}
              joinedMatchIds={joinedMatchIds}
              onJoinSuccess={handleJoinSuccess}
            />
          }
        />
        <Route
          path="/wallet"
          element={<WalletPage user={user} onPageChange={handlePageChange} />}
        />
        <Route
          path="/add-money"
          element={<AddMoney onPageChange={handlePageChange} />}
        />
        <Route
          path="/withdraw"
          element={<Withdraw user={user} onPageChange={handlePageChange} />}
        />
        <Route
          path="/profile"
          element={
            <ProfilePage user={user} onPageChange={handlePageChange} onLogout={handleLogout} />
          }
        />
        <Route
          path="/profile-details"
          element={<ProfileDetails user={user} onPageChange={handlePageChange} />}
        />
        <Route
          path="/game-stats"
          element={<GameStats user={user} onPageChange={handlePageChange} />}
        />
        <Route
          path="/referral"
          element={<ReferralPage user={user} onPageChange={handlePageChange} />}
        />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route
          path="/chat"
          element={<ChatPage user={user} onPageChange={handlePageChange} />}
        />
        <Route
          path="/admin"
          element={
            hasPanelAccess(user) ? (
              <AdminPage user={user} onPageChange={handlePageChange} />
            ) : (
              <Navigate to="/home" replace />
            )
          }
        />
        <Route
          path="/admin/user/:id"
          element={
            hasPanelAccess(user) ? (
              <AdminUserDetail currentUser={user} onPageChange={handlePageChange} />
            ) : (
              <Navigate to="/home" replace />
            )
          }
        />
        <Route
          path="/admin/edit-match/:id"
          element={
            hasPanelAccess(user) ? (
              <AdminEditMatch onPageChange={handlePageChange} />
            ) : (
              <Navigate to="/home" replace />
            )
          }
        />
        <Route
          path="/admin/create-match"
          element={
            hasPanelAccess(user) ? (
              <AdminCreateMatch onPageChange={handlePageChange} />
            ) : (
              <Navigate to="/home" replace />
            )
          }
        />
        <Route
          path="/admin/create-match/:duplicateId"
          element={
            hasPanelAccess(user) ? (
              <AdminCreateMatch onPageChange={handlePageChange} />
            ) : (
              <Navigate to="/home" replace />
            )
          }
        />
        <Route
          path="/admin/modes"
          element={
            hasPanelAccess(user) ? (
              <AdminModes onPageChange={handlePageChange} />
            ) : (
              <Navigate to="/home" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>

          {showBottomNav && <BottomNav onPageChange={handlePageChange} user={user} />}
        </div>
      )}
    </>
  );
}
