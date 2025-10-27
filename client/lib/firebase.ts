import AsyncStorage from '@react-native-async-storage/async-storage';
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, Persistence, getAuth, initializeAuth } from 'firebase/auth';
import { Firestore, getFirestore, initializeFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';

const requiredEnv = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
] as const;

type FirebaseConfigKeys = (typeof requiredEnv)[number];

const getEnv = (key: FirebaseConfigKeys) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${key}. ` +
        'Create a .env file based on .env.example and restart the dev server.'
    );
  }
  return value;
};

const firebaseConfig = {
  apiKey: getEnv('EXPO_PUBLIC_FIREBASE_API_KEY'),
  authDomain: getEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
  storageBucket: getEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnv('EXPO_PUBLIC_FIREBASE_APP_ID'),
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const alreadyInitialized = getApps().length > 0;

export const firebaseApp: FirebaseApp = alreadyInitialized
  ? getApp()
  : initializeApp(firebaseConfig);

const persistence =
  Platform.OS === 'web' ? undefined : createReactNativePersistence(AsyncStorage);

export const auth: Auth = alreadyInitialized
  ? getAuth(firebaseApp)
  : initializeAuth(firebaseApp, persistence ? { persistence } : undefined);

export const db: Firestore = alreadyInitialized
  ? getFirestore(firebaseApp)
  : initializeFirestore(firebaseApp, {
      experimentalForceLongPolling: true,
    });

function createReactNativePersistence(storage: typeof AsyncStorage): Persistence {
  const STORAGE_AVAILABLE_KEY = '__firebase_storage_available__';

  class ReactNativePersistenceImpl {
    readonly type = 'LOCAL' as const;

    async _isAvailable() {
      try {
        if (!storage) {
          return false;
        }
        await storage.setItem(STORAGE_AVAILABLE_KEY, '1');
        await storage.removeItem(STORAGE_AVAILABLE_KEY);
        return true;
      } catch {
        return false;
      }
    }

    _set(key: string, value: unknown) {
      return storage.setItem(key, JSON.stringify(value));
    }

    async _get<T>(key: string): Promise<T | null> {
      const json = await storage.getItem(key);
      return json ? (JSON.parse(json) as T) : null;
    }

    _remove(key: string) {
      return storage.removeItem(key);
    }

    // Listeners are not supported with AsyncStorage, so these are no-ops.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _addListener(_key: string, _listener: () => void) {}
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _removeListener(_key: string, _listener: () => void) {}
  }

  return ReactNativePersistenceImpl as unknown as Persistence;
}
