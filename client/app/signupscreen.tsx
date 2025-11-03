import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,

  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import DropDownPicker from 'react-native-dropdown-picker';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppDispatch } from '@/redux/hooks';
import { fetchUserProfile } from '@/redux/slices/userSlice';
import { signUpWithEmail } from '@/services/auth';

export default function SignUpScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [genderOpen, setGenderOpen] = useState(false);
  const [gender, setGender] = useState<string | null>(null);
  const [genderItems, setGenderItems] = useState([
    { label: 'male', value: 'male' },
    { label: 'female', value: 'female' },

  ]);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onChangeBirthDate = (_: DateTimePickerEvent, selected?: Date) => {
    setShowDatePicker(false);
    if (selected) setBirthDate(selected);
  };

  const isValidPhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    return digits.length >= 9 && digits.length <= 15;
  };

  const handleSignUp = async () => {
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();
    const normalizedConfirmPassword = confirmPassword.trim();
    const normalizedPhone = phone.trim();

    if (
      !normalizedName ||
      !normalizedEmail ||
      !normalizedPassword ||
      !normalizedConfirmPassword ||
      !normalizedPhone ||
      !birthDate ||
      !gender
    ) {
      setErrorMessage('please fill in all fields');
      return;
    }

    if (!isValidPhone(normalizedPhone)) {
      setErrorMessage(' invalid phone number ');
      return;
    }

    if (normalizedPassword !== normalizedConfirmPassword) {
      setErrorMessage('passwords do not match');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      const result = await signUpWithEmail(
        normalizedName,
        normalizedEmail,
        normalizedPassword,
        normalizedPhone,
        `${birthDate.getDate().toString().padStart(2, '0')}-${(birthDate.getMonth() + 1).toString().padStart(2, '0')}-${birthDate.getFullYear()}`,
        gender,
      );

      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }

      try {
        await dispatch(fetchUserProfile()).unwrap();
      } catch (fetchError) {
        console.warn('Unable to refresh profile after sign up:', fetchError);
      }

      router.replace('/(tabs)/Scanscreen');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message :  'Please try again in a moment.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <LinearGradient colors={['#1a0b2e', '#2d1b4e', '#1a0b2e']} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.container} >
            {/* Decorative Stars */}
            <View style={styles.starsContainer}>
              <Ionicons name="star" size={14} color="#B794F6" style={[styles.star, styles.star1]} />
              <Ionicons name="star" size={14} color="#E9D5FF" style={[styles.star, styles.star2]} />
              
            </View>

            {/* Header */}
            <View style={styles.header}>

              <Text style={styles.title}> Register </Text>

            </View >

            {/* Form Card */}
            <View style={styles.formCard}>
              <LinearGradient
                colors={['rgba(167, 139, 250, 0.1)', 'rgba(196, 181, 253, 0.05)']}
                style={styles.cardGradient}
              >
                <View style={styles.form}>
                  {/* Name Field */}
                  <View style={styles.field}>
                    <Text style={styles.label}>
                      User
                    </Text>
                    <View style={styles.inputContainer}>

                      <TextInput
                        placeholder="user name"
                        placeholderTextColor="#9CA3AF"
                        value={name}
                        onChangeText={setName}
                        style={styles.input}
                      />
                    </View>
                  </View>

                  {/* Email Field */}
                  <View style={styles.field}>
                    <Text style={styles.label}>
                      Email
                    </Text>
                    <View style={styles.inputContainer}>

                      <TextInput
                        autoCapitalize="none"
                        autoComplete="email"
                        keyboardType="email-address"
                        placeholder="example@email.com"
                        placeholderTextColor="#9CA3AF"
                        value={email}
                        onChangeText={setEmail}
                        style={styles.input}
                      />
                    </View>
                  </View>

                  {/* Phone Field */}
                  <View style={styles.field}>
                    <Text style={styles.label}>
                      Phone
                    </Text>
                    <View style={styles.inputContainer}>

                      <TextInput
                        placeholder="08xxxxxxxx"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="phone-pad"
                        value={phone}
                        onChangeText={setPhone}
                        style={styles.input}
                      />
                    </View>
                  </View>

                  {/* Birth Date + Gender Row */}
                  <View style={styles.row}>
                    {/* Birth Date */}
                    <View style={[styles.field, styles.rowItem]}>
                      <Text style={styles.label}>
                        Birthday
                      </Text>
                      <TouchableOpacity
                        onPress={() => setShowDatePicker(true)}
                        activeOpacity={0.8}
                        style={styles.inputButton}
                      >
                        <Ionicons name="calendar" size={16} color="#A78BFA" />
                        <Text style={birthDate ? styles.inputText : styles.placeholder}>
                          {birthDate
                            ? `${birthDate.getDate().toString().padStart(2, '0')}-${(birthDate.getMonth() + 1).toString().padStart(2, '0')}-${birthDate.getFullYear()}`
                            : 'date'}
                        </Text>
                      </TouchableOpacity>

                      {showDatePicker && (
                        <DateTimePicker
                          value={birthDate ?? new Date(2000, 0, 1)}
                          mode="date"
                          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                          onChange={onChangeBirthDate}
                          maximumDate={new Date()}
                        />
                      )}
                    </View>

                    {/* Gender */}
                    <View style={[styles.field, styles.rowItem, { zIndex: 10 }]}>
                      <Text style={styles.label}>
                        Gender
                      </Text>
                      <DropDownPicker
                        open={genderOpen}
                        value={gender}
                        items={genderItems}
                        setOpen={setGenderOpen}
                        setValue={setGender}
                        setItems={setGenderItems}
                        placeholder=" gender "
                        style={styles.dropdown}
                        dropDownContainerStyle={styles.dropdownContainer}
                        textStyle={styles.dropdownText}
                        placeholderStyle={styles.dropdownPlaceholder}
                        listMode="SCROLLVIEW"
                        ArrowDownIconComponent={() => (
                          <Ionicons name="chevron-down" size={20} color="#A78BFA" />
                        )}
                        ArrowUpIconComponent={() => (
                          <Ionicons name="chevron-up" size={20} color="#A78BFA" />
                        )}
                      />
                    </View>
                  </View>

                  {/* Password Field */}
                  <View style={styles.field}>
                    <Text style={styles.label}>
                       Password
                    </Text>
                    <View style={styles.inputContainer}>
                     
                      <TextInput
                        placeholder= " password"
                        placeholderTextColor="#9CA3AF"
                        secureTextEntry={!showPassword}
                        value={password}
                        onChangeText={setPassword}
                        style={styles.input}
                      />
                      <TouchableOpacity
                        onPress={() => setShowPassword(!showPassword)}
                        style={styles.eyeIcon}
                      >
                        <Ionicons
                          name={showPassword ? "eye-outline" : "eye-off-outline"}
                          size={20}
                          color="#A78BFA"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Confirm Password Field */}
                  <View style={styles.field}>
                    <Text style={styles.label}>
                       Confirm Password
                    </Text>
                    <View style={styles.inputContainer}>
                     
                      <TextInput
                        placeholder="Confirm Password"
                        placeholderTextColor="#9CA3AF"
                        secureTextEntry={!showConfirmPassword}
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        style={styles.input}
                      />
                      <TouchableOpacity
                        onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                        style={styles.eyeIcon}
                      >
                        <Ionicons
                          name={showConfirmPassword ? "eye-outline" : "eye-off-outline"}
                          size={20}
                          color="#A78BFA"
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Sign Up Button */}
                  <TouchableOpacity
                    onPress={handleSignUp}
                    disabled={isSubmitting}
                    activeOpacity={0.8}
                  >
                    <LinearGradient
                      colors={isSubmitting ? ['#6B7280', '#4B5563'] : ['#8B5CF6', '#7C3AED']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.primaryButton, isSubmitting && styles.primaryButtonDisabled]}
                    >
                      {isSubmitting ? (
                        <View style={styles.loadingContainer}>
                          <ActivityIndicator color="#fff" />
                          <Text style={styles.primaryButtonText}>  </Text>
                        </View>
                      ) : (
                        <View style={styles.buttonContent}>
                          
                          <Text style={styles.primaryButtonText}> create account </Text>
                         
                        </View>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>

                  {/* Error Message */}
                  {errorMessage && (
                    <View style={styles.errorContainer}>
                      <Ionicons name="alert-circle" size={16} color="#F87171" />
                      <Text style={styles.errorText}>{errorMessage}</Text>
                    </View>
                  )}

                  {/* Back to Sign In */}
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => router.replace('/signinscreen')}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="arrow-back" size={18} color="#C4B5FD" />
                    <Text style={styles.secondaryButtonText}> back to sign in</Text>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  container: { flexGrow: 1, padding: 24, paddingTop: 10, paddingBottom: 10, justifyContent: 'center' },
  starsContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  star: { position: 'absolute' },
  star1: { top: '8%', left: '10%', opacity: 0.8 },
  star2: { top: '5%', right: '15%', opacity: 0.6 },
  
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  sparkleContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  sparkleGlow: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#E9D5FF',
    opacity: 0.2,
    top: -15,
    left: -15,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#E9D5FF',
    marginBottom: 8,
    textShadowColor: 'rgba(167, 139, 250, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
    letterSpacing: 1.5,
  },
  subtitle: {
    fontSize: 13,
    color: '#C4B5FD',
    textAlign: 'center',
    fontWeight: '500',
  },
  formCard: {
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
    padding: 20,
    backgroundColor: 'rgba(26, 11, 46, 1)',
  },
  form: { gap: 16 },
  field: { gap: 6 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#E9D5FF',
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(167, 139, 250, 0.3)',
    borderRadius: 14,
    backgroundColor: 'rgba(26, 11, 46, 0.5)',
    paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: '#E9D5FF',
  },
  eyeIcon: { padding: 8 },
  row: { flexDirection: 'row', gap: 10 },
  rowItem: { flex: 1 },
  inputButton: {
    borderWidth: 1.5,
    borderColor: 'rgba(167, 139, 250, 0.3)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(26, 11, 46, 0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
  },
  inputText: { fontSize: 15, color: '#E9D5FF', marginLeft: 10 },
  placeholder: { fontSize: 15, color: '#9CA3AF', marginLeft: 10 },
  dropdown: {
    borderWidth: 1.5,
    borderColor: 'rgba(167, 139, 250, 0.3)',
    borderRadius: 14,
    backgroundColor: 'rgba(26, 11, 46, 0.5)',
    minHeight: 48,
  },
  dropdownContainer: {
    borderWidth: 1.5,
    borderColor: 'rgba(167, 139, 250, 0.3)',
    borderRadius: 14,
    backgroundColor: '#2d1b4e',
  },
  dropdownText: { fontSize: 15, color: '#E9D5FF' },
  dropdownPlaceholder: { fontSize: 15, color: '#9CA3AF' },
  primaryButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  primaryButtonDisabled: { opacity: 0.6 },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  },
  errorText: {
    color: '#FCA5A5',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  secondaryButton: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(167, 139, 250, 0.3)',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(167, 139, 250, 0.05)',
  },
  secondaryButtonText: {
    color: '#C4B5FD',
    fontSize: 15,
    fontWeight: '600',
  },
});
