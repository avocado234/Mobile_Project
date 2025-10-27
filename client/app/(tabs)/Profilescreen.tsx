import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useAuth } from '@/contexts/AuthContext';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { fetchUserProfile, saveUserProfile } from '@/redux/slices/userSlice';
import { useRouter } from 'expo-router';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const dispatch = useAppDispatch();
  const { profile, status, error } = useAppSelector((state) => state.user);
  const navigator = useRouter();

  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [email, setEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const isLoading = useMemo(() => status === 'loading', [status]);

  useEffect(() => {
    if (user && status === 'idle') {
      dispatch(fetchUserProfile());
    }
  }, [dispatch, status, user]);

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setPhoneNumber(profile.phoneNumber);
      setBirthDate(profile.birthDate);
      setEmail(profile.email);
    } else if (user) {
      setName(user.displayName ?? '');
      setEmail(user.email ?? '');
    }
  }, [profile, user]);

  const handleSaveProfile = async () => {
    const normalizedEmail = (email || user?.email || '').trim();

    if (!normalizedEmail) {
      Alert.alert('Missing email', 'An email address is required.');
      return;
    }

    try {
      setIsSaving(true);
      await dispatch(
        saveUserProfile({
          name: name.trim(),
          email: normalizedEmail,
          phoneNumber: phoneNumber.trim(),
          birthDate: birthDate.trim(),
        })
      ).unwrap();

      Alert.alert('Profile updated', 'Your information has been saved.');
    } catch (err) {
      Alert.alert(
        'Save failed',
        err instanceof Error ? err.message : 'Please try again in a moment.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await signOut();
      navigator.replace('/signinscreen');
    } catch (err) {
      Alert.alert(
        'Sign out failed',
        err instanceof Error ? err.message : 'Please try again in a moment.'
      );
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Profile details</Text>
        <Text style={styles.subtitle}>Update your contact information below.</Text>

        <View style={styles.form}>
          <View style={styles.field}>
            <Text style={styles.label}>Full name</Text>
            <TextInput
              accessibilityLabel="Full name input"
              placeholder="Jane Doe"
              value={name}
              onChangeText={setName}
              style={styles.input}
              editable={!isLoading && !isSaving}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              accessibilityLabel="Email address"
              placeholder="example@email.com"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!isLoading && !isSaving}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Phone number</Text>
            <TextInput
              accessibilityLabel="Phone number input"
              placeholder="+66 800 000 000"
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              style={styles.input}
              keyboardType="phone-pad"
              editable={!isLoading && !isSaving}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Birth date</Text>
            <TextInput
              accessibilityLabel="Birth date input"
              placeholder="YYYY-MM-DD"
              value={birthDate}
              onChangeText={setBirthDate}
              style={styles.input}
              editable={!isLoading && !isSaving}
            />
          </View>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.primaryButton, (isSaving || isLoading) && styles.buttonDisabled]}
          onPress={handleSaveProfile}
          disabled={isSaving || isLoading}
        >
          <Text style={styles.primaryButtonText}>
            {isSaving ? 'Saving...' : 'Save profile'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryButton, isSigningOut && styles.buttonDisabled]}
          onPress={handleSignOut}
          disabled={isSigningOut}
        >
          <Text style={styles.secondaryButtonText}>
            {isSigningOut ? 'Signing out...' : 'Sign out'}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f5f5f5',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#101828',
  },
  subtitle: {
    fontSize: 14,
    color: '#475467',
    marginTop: 4,
    marginBottom: 24,
  },
  form: {
    gap: 16,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#344054',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    fontSize: 16,
    color: '#101828',
  },
  errorText: {
    color: '#B91C1C',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
    fontWeight: '500',
  },
  primaryButton: {
    backgroundColor: '#1D4ED8',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  secondaryButton: {
    borderColor: '#1D4ED8',
    borderWidth: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: '#1D4ED8',
    fontSize: 16,
    fontWeight: '600',
  },
});
