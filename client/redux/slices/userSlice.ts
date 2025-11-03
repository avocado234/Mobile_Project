import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

import { auth, db } from '@/lib/firebase';

type UserProfile = {
  name: string;
  email: string;
  phoneNumber: string;
  birthDate: string;
  gender: string;
};

type UserState = {
  profile: UserProfile | null;
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error?: string;
};

const initialState: UserState = {
  profile: null,
  status: 'idle',
};

export const fetchUserProfile = createAsyncThunk<
  UserProfile,
  void,
  { rejectValue: string }
>(
  'user/fetchProfile',
  async (_, { rejectWithValue }) => {
    const user = auth.currentUser;
    if (!user) {
      return rejectWithValue('User is not authenticated.');
    }

    const docRef = doc(db, 'users', user.uid);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) {
      const profile: UserProfile = {
        name: user.displayName ?? '',
        email: user.email ?? '',
        phoneNumber: '',
        birthDate: '',
        gender: '',
      };
      return profile;
    }

    const data = snapshot.data() as Partial<UserProfile>;

    return {
      name: data.name ?? '',
      email: data.email ?? user.email ?? '',
      phoneNumber: data.phoneNumber ?? '',
      birthDate: data.birthDate ?? '',
      gender: data.gender ?? '',
    };
  }
);

export type SaveUserProfilePayload = {
  name: string;
  email: string;
  phoneNumber: string;
  birthDate: string;
  gender: string;
};

export const saveUserProfile = createAsyncThunk<
  UserProfile,
  SaveUserProfilePayload,
  { rejectValue: string }
>('user/saveProfile', async (profile, { rejectWithValue }) => {
  const user = auth.currentUser;
  if (!user) {
    return rejectWithValue('User is not authenticated.');
  }

  const docRef = doc(db, 'users', user.uid);

  await setDoc(
    docRef,
    {
      ...profile,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return {
    name: profile.name,
    email: profile.email,
    phoneNumber: profile.phoneNumber,
    birthDate: profile.birthDate,
    gender: profile.gender,
  };
});

const userSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    clearUserState: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUserProfile.pending, (state) => {
        state.status = 'loading';
        state.error = undefined;
      })
      .addCase(fetchUserProfile.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.profile = action.payload;
      })
      .addCase(fetchUserProfile.rejected, (state, action) => {
        state.status = 'failed';
        state.error =
          typeof action.payload === 'string'
            ? action.payload
            : action.error.message ?? 'Failed to load profile.';
      })
      .addCase(saveUserProfile.pending, (state) => {
        state.status = 'loading';
        state.error = undefined;
      })
      .addCase(saveUserProfile.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.profile = action.payload;
      })
      .addCase(saveUserProfile.rejected, (state, action) => {
        state.status = 'failed';
        state.error =
          typeof action.payload === 'string'
            ? action.payload
            : action.error.message ?? 'Failed to save profile.';
      });
  },
});

export const { clearUserState } = userSlice.actions;

export default userSlice.reducer;
