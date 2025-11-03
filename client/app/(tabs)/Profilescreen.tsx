import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { useAuth } from '@/contexts/AuthContext';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import { fetchUserProfile, saveUserProfile } from '@/redux/slices/userSlice';

export default function ProfileScreen() {
  const { user, signOut } = useAuth();
  const dispatch = useAppDispatch();
  const { profile, status, error } = useAppSelector((state) => state.user);
  const navigator = useRouter();

  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState('');

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // เก็บค่าเดิมไว้สำหรับกดยกเลิก
  const [originalData, setOriginalData] = useState({
    name: '',
    phoneNumber: '',
    birthDate: '',
    email: '',
    gender: '',
  });

  const isLoading = useMemo(() => status === 'loading', [status]);

  useEffect(() => {
    if (user && status === 'idle') {
      dispatch(fetchUserProfile());
    }
  }, [dispatch, status, user]);

  useEffect(() => {
    if (profile) {
      const data = {
        name: profile.name || '',
        phoneNumber: profile.phoneNumber || '',
        birthDate: profile.birthDate || '',
        email: profile.email || '',
        gender: profile.gender || '',
      };

      setName(data.name);
      setPhoneNumber(data.phoneNumber);
      setBirthDate(data.birthDate);
      setEmail(data.email);
      setGender(data.gender);
      setOriginalData(data);
    } else if (user) {
      setName(user.displayName ?? '');
      setEmail(user.email ?? '');
    }
  }, [profile, user]);

  const handleEditProfile = () => {
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    // คืนค่ากลับเป็นค่าเดิม
    setName(originalData.name);
    setPhoneNumber(originalData.phoneNumber);
    setBirthDate(originalData.birthDate);
    setEmail(originalData.email);
    setGender(originalData.gender);
    setIsEditing(false);
  };

  const handleSaveProfile = async () => {
    const normalizedEmail = (email || user?.email || '').trim();

    if (!normalizedEmail) {
      Alert.alert('Missing Information', 'Please enter your email');
      return;
    }

    if (!name.trim()) {
      Alert.alert('Missing Information', 'Please enter your name');
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
          gender: gender,
        })
      ).unwrap();

      // อัพเดทค่าเดิม
      const newData = {
        name: name.trim(),
        email: normalizedEmail,
        phoneNumber: phoneNumber.trim(),
        birthDate: birthDate.trim(),
        gender: gender,
      };
      setOriginalData(newData);
      setIsEditing(false);

      Alert.alert('Success', 'Your profile has been updated');
    } catch (err) {
      Alert.alert(
        'Save Failed',
        err instanceof Error ? err.message : 'Please try again'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsSigningOut(true);
              await signOut();
              navigator.replace('/signinscreen');
            } catch (err) {
              Alert.alert(
                'Error',
                err instanceof Error ? err.message : 'Please try again'
              );
            } finally {
              setIsSigningOut(false);
            }
          },
        },
      ]
    );
  };

  const getGenderDisplay = (genderValue: string) => {
    const genderMap: { [key: string]: string } = {
      male: 'Male',
      female: 'Female',
      other: 'Other',
    };
    return genderMap[genderValue] || genderValue;
  };

  return (
    <LinearGradient colors={['#1a0b2e', '#2d1b4e', '#1a0b2e']} style={styles.gradient}>
      {/* Decorative Stars - ย้ายออกมาข้างนอก ScrollView */}
      <View style={styles.starsContainer} pointerEvents="none">
        <Ionicons name="star" size={16} color="#B794F6" style={[styles.star, styles.star1]} />
        <Ionicons name="star" size={12} color="#E9D5FF" style={[styles.star, styles.star2]} />
        <Ionicons name="star" size={14} color="#C4B5FD" style={[styles.star, styles.star3]} />
        <Ionicons name="star" size={10} color="#DDD6FE" style={[styles.star, styles.star4]} />
      </View>

      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          
          <Text style={styles.welcomeText}>Profile</Text>
        </View>

        {/* Profile Card */}
        <View style={styles.card}>
          <LinearGradient
            colors={['rgba(167, 139, 250, 0.1)', 'rgba(196, 181, 253, 0.05)']}
            style={styles.cardGradient}
          >
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#A78BFA" />
                <Text style={styles.loadingText}>Loading...</Text>
              </View>
            ) : (
              <>
                <View style={styles.form}>
                  {/* Name Field */}
                  <View style={styles.field}>
                    <Text style={styles.label}>Full Name</Text>
                    <View style={[styles.inputContainer, !isEditing && styles.inputDisabled]}>
                      <TextInput
                        placeholder="Enter your name"
                        placeholderTextColor="#9CA3AF"
                        value={name}
                        onChangeText={setName}
                        style={styles.input}
                        editable={isEditing}
                      />
                    </View>
                  </View>

                  {/* Email Field */}
                  <View style={styles.field}>
                    <Text style={styles.label}>Email</Text>
                    <View style={[styles.inputContainer, styles.inputDisabled]}>
                      <TextInput
                        placeholder="example@email.com"
                        placeholderTextColor="#9CA3AF"
                        value={email}
                        style={styles.input}
                        editable={false}
                      />
                    
                    </View>
                    <Text style={styles.helperText}>Email cannot be changed</Text>
                  </View>

                  {/* Phone Field */}
                  <View style={styles.field}>
                    <Text style={styles.label}>Phone Number</Text>
                    <View style={[styles.inputContainer, !isEditing && styles.inputDisabled]}>
                      <TextInput
                        placeholder="08xxxxxxxx"
                        placeholderTextColor="#9CA3AF"
                        value={phoneNumber}
                        onChangeText={setPhoneNumber}
                        style={styles.input}
                        keyboardType="phone-pad"
                        editable={isEditing}
                      />
                    </View>
                  </View>

                  {/* Birth Date Field */}
                  <View style={styles.field}>
                    <Text style={styles.label}>Birth Date</Text>
                    <View style={[styles.inputContainer, !isEditing && styles.inputDisabled]}>
                      <TextInput
                        placeholder="DD-MM-YYYY"
                        placeholderTextColor="#9CA3AF"
                        value={birthDate}
                        onChangeText={setBirthDate}
                        style={styles.input}
                        editable={isEditing}
                      />
                    </View>
                  </View>

                  {/* Gender Field */}
                  <View style={styles.field}>
                    <Text style={styles.label}>Gender</Text>
                    <View style={[styles.inputContainer, !isEditing && styles.inputDisabled]}>
                      <TextInput
                        placeholder="Male / Female / Other"
                        placeholderTextColor="#9CA3AF"
                        value={isEditing ? gender : getGenderDisplay(gender)}
                        onChangeText={setGender}
                        style={styles.input}
                        editable={isEditing}
                      />
                    </View>
                  </View>
                </View>

                {error ? (
                  <View style={styles.errorContainer}>
                    <Ionicons name="alert-circle" size={16} color="#F87171" />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                {/* Action Buttons */}
                {!isEditing ? (
                  <>
                    {/* Edit Profile Button */}
                    <TouchableOpacity
                      onPress={handleEditProfile}
                      activeOpacity={0.8}
                    >
                      <LinearGradient
                        colors={['#8B5CF6', '#7C3AED']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.primaryButton}
                      >
                        <Ionicons name="create-outline" size={20} color="#fff" />
                        <Text style={styles.primaryButtonText}>Edit Profile</Text>
                      </LinearGradient>
                    </TouchableOpacity>

                    {/* Sign Out Button */}
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={handleSignOut}
                      disabled={isSigningOut}
                      activeOpacity={0.8}
                    >
                      {isSigningOut ? (
                        <ActivityIndicator color="#F87171" size="small" />
                      ) : (
                        <>
                          <Ionicons name="log-out-outline" size={20} color="#F87171" />
                          <Text style={styles.signOutButtonText}>Sign Out</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  <View style={styles.editButtonsContainer}>
                    {/* Save Button */}
                    <TouchableOpacity
                      onPress={handleSaveProfile}
                      disabled={isSaving}
                      activeOpacity={0.8}
                      style={styles.editButton}
                    >
                      <LinearGradient
                        colors={isSaving ? ['#6B7280', '#4B5563'] : ['#10B981', '#059669']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.editButtonGradient}
                      >
                        {isSaving ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <>
                            <Ionicons name="checkmark-circle" size={20} color="#fff" />
                            <Text style={styles.editButtonText}>Save</Text>
                          </>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>

                    {/* Cancel Button */}
                    <TouchableOpacity
                      onPress={handleCancelEdit}
                      disabled={isSaving}
                      activeOpacity={0.8}
                      style={styles.editButton}
                    >
                      <View style={styles.cancelButton}>
                        <Ionicons name="close-circle" size={20} color="#F87171" />
                        <Text style={styles.cancelButtonText}>Cancel</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                )}
              </>
            )}
          </LinearGradient>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  starsContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  star: { position: 'absolute' },
  star1: { top: '5%', left: '15%', opacity: 0.8 },
  star2: { top: '10%', right: '15%', opacity: 0.6 },
  star3: { bottom: '25%', left: '20%', opacity: 0.7 },
  star4: { bottom: '15%', right: '10%', opacity: 0.5 },
  container: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  
  welcomeText: {
    fontSize: 32,
    fontWeight: '800',
    color: '#E9D5FF',
    textShadowColor: 'rgba(167, 139, 250, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 15,
    letterSpacing: 1.5,
  },
  card: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.3)',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  cardGradient: {
    padding: 24,
    backgroundColor: 'rgba(26, 11, 46, 1)',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 16,
  },
  loadingText: {
    color: '#C4B5FD',
    fontSize: 16,
    fontWeight: '500',
  },
  form: { gap: 18 },
  field: { gap: 8 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E9D5FF',
    marginLeft: 4,
  },
  inputContainer: {
    borderWidth: 1.5,
    borderColor: 'rgba(167, 139, 250, 0.3)',
    borderRadius: 14,
    backgroundColor: 'rgba(26, 11, 46, 0.5)',
    paddingHorizontal: 14,
  },
  inputDisabled: {
    backgroundColor: 'rgba(26, 11, 46, 0.3)',
    borderColor: 'rgba(167, 139, 250, 0.15)',
  },
  input: {
    paddingVertical: 12,
    fontSize: 15,
    color: '#E9D5FF',
  },
  lockIcon: {
    marginLeft: 1,
  },
  helperText: {
    fontSize: 11,
    color: '#9CA3AF',
    marginLeft: 8,
    marginTop: 2,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(248, 113, 113, 0.1)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.3)',
    marginTop: 4,
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  primaryButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  secondaryButton: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(248, 113, 113, 0.3)',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(248, 113, 113, 0.05)',
    marginTop: 12,
  },
  signOutButtonText: {
    color: '#F87171',
    fontSize: 16,
    fontWeight: '600',
  },
  editButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  editButton: {
    flex: 1,
  },
  editButtonGradient: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  editButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(248, 113, 113, 0.3)',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(248, 113, 113, 0.05)',
  },
  cancelButtonText: {
    color: '#F87171',
    fontSize: 16,
    fontWeight: '600',
  },
}); 