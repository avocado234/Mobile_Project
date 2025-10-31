import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';

import { auth } from '@/lib/firebase';
import { signOut as signOutFromFirebase } from '@/services/auth';
import { useAppDispatch } from '@/redux/hooks';
import { clearUserState, fetchUserProfile } from '@/redux/slices/userSlice';

type AuthContextValue = {
  user: User | null;
  initializing: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const dispatch = useAppDispatch();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setInitializing(false);

      if (firebaseUser) {
        dispatch(fetchUserProfile());
      } else {
        dispatch(clearUserState());
      }
    });

    return unsubscribe;
  }, [dispatch]);

  const handleSignOut = useCallback(async () => {
    await signOutFromFirebase();
    dispatch(clearUserState());
  }, [dispatch]);

  const value = useMemo(
    () => ({
      user,
      initializing,
      signOut: handleSignOut,
    }),
    [handleSignOut, initializing, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
}
