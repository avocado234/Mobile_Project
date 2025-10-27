import { FirebaseError } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';

import { auth, db } from '@/lib/firebase';

export type AuthResult = { ok: true } | { ok: false; message: string };

const errorMessages: Record<string, string> = {
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/invalid-email': 'Please provide a valid email address.',
  'auth/invalid-credential': 'The email or password you entered is incorrect.',
  'auth/missing-password': 'Please enter your password.',
  'auth/weak-password': 'Passwords must be at least 6 characters long.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof FirebaseError) {
    return errorMessages[error.code] ?? 'Authentication failed. Please try again.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong. Please try again.';
};

export async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
  try {
    await signInWithEmailAndPassword(auth, email, password);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: getErrorMessage(error) };
  }
}

export async function signUpWithEmail(
  name: string,
  email: string,
  password: string,
  phoneNumber: string,
  birthDate: string,
  gender: string
): Promise<AuthResult> {
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);

    if (name.trim()) {
      await updateProfile(user, { displayName: name.trim() });
    }

    await setDoc(doc(db, 'users', user.uid), {
      name: name.trim(),
      email,
      phoneNumber: phoneNumber.trim(),
      birthDate,
      gender,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return { ok: true };
  } catch (error) {
    return { ok: false, message: getErrorMessage(error) };
  }
}
""


export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}
