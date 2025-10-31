import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
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
import { signUpWithEmail } from '@/services/auth';

export default function SignUpScreen() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // ✅ Gender dropdown state
  const [genderOpen, setGenderOpen] = useState(false);
  const [gender, setGender] = useState<string | null>(null);
  const [genderItems, setGenderItems] = useState([
    { label: 'Male', value: 'male' },
    { label: 'Female', value: 'female' },
    { label: 'Other', value: 'other' },
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
      setErrorMessage('Please fill in all fields to continue.');
      return;
    }

    if (!isValidPhone(normalizedPhone)) {
      setErrorMessage('Please enter a valid phone number.');
      return;
    }

    if (normalizedPassword !== normalizedConfirmPassword) {
      setErrorMessage('Passwords do not match. Please try again.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);

      // ✅ คุณสามารถแก้ service ให้เก็บ gender/birthDate/phone เพิ่มเติมได้
      const result = await signUpWithEmail(
        normalizedName,
        normalizedEmail,
        normalizedPassword,
        normalizedPhone,
        birthDate.toISOString().split('T')[0],
        gender,
        // Format as YYYY-MM-DD
      );

      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }

      router.replace('/(tabs)/Scanscreen');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Something went wrong. Please try again.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>Create a new account</Text>
            <Text style={styles.subtitle}>Register to get started with the app.</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Full name</Text>
              <TextInput
                placeholder="Your name"
                value={name}
                onChangeText={setName}
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="example@email.com"
                value={email}
                onChangeText={setEmail}
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Phone number</Text>
              <TextInput
                placeholder="08xxxxxxxx"
                keyboardType="phone-pad"
                value={phone}
                onChangeText={setPhone}
                style={styles.input}
              />
            </View>

            {/* ✅ Birth Date + Gender */}
            <View style={styles.row}>
              <View style={[styles.field, styles.rowItem]}>
                <Text style={styles.label}>Birth Date</Text>
                <TouchableOpacity
                  onPress={() => setShowDatePicker(true)}
                  activeOpacity={0.8}
                  style={styles.inputButton}
                >
                  <Ionicons name="calendar-outline" size={20} color="#475467" />
                  <Text style={birthDate ? styles.inputText : styles.placeholder}>
                    {birthDate
                      ? `${birthDate.getDate().toString().padStart(2, '0')}-${(birthDate.getMonth() + 1).toString().padStart(2, '0')}-${birthDate.getFullYear()}`
                      : 'Select birth date'}
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

              <View style={[styles.field, styles.rowItem, { zIndex: 10 }]}>
                <Text style={styles.label}>Gender</Text>
                <DropDownPicker
                  open={genderOpen}
                  value={gender}
                  items={genderItems}
                  setOpen={setGenderOpen}
                  setValue={setGender}
                  setItems={setGenderItems}
                  placeholder="Select gender"
                  style={styles.dropdown}
                  dropDownContainerStyle={styles.dropdownContainer}
                  textStyle={styles.inputText}
                  placeholderStyle={styles.placeholder}
                  listMode="SCROLLVIEW"
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                placeholder="At least 6 characters"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
                style={styles.input}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Confirm password</Text>
              <TextInput
                placeholder="Re-enter your password"
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                style={styles.input}
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, isSubmitting && styles.primaryButtonDisabled]}
              onPress={handleSignUp}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.primaryButtonText}>Creating account...</Text>
                </View>
              ) : (
                <Text style={styles.primaryButtonText}>Sign Up</Text>
              )}
            </TouchableOpacity>

            {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.replace('/signinscreen')}
            >
              <Text style={styles.secondaryButtonText}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f5f5f5' },
  flex: { flex: 1 },
  container: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  header: { marginBottom: 32 },
  title: { fontSize: 32, fontWeight: '700', color: '#101828', marginBottom: 8 },
  subtitle: { fontSize: 16, color: '#475467' },
  form: { gap: 16 },
  field: { gap: 8 },
  label: { fontSize: 14, fontWeight: '500', color: '#344054' },

  input: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    fontSize: 16,
    color: '#101828',
  },

  row: { flexDirection: 'row', gap: 12 },
  rowItem: { flex: 1 },

  inputButton: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
  },
  inputText: { fontSize: 16, color: '#101828', marginLeft: 8 },
  placeholder: { fontSize: 16, color: '#98A2B3', marginLeft: 8 },

  dropdown: {
    borderColor: '#D0D5DD',
    borderRadius: 12,
    backgroundColor: '#fff',
    minHeight: 48,
  },
  dropdownContainer: {
    borderColor: '#D0D5DD',
    borderRadius: 12,
  },

  primaryButton: {
    backgroundColor: '#1D4ED8',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonDisabled: { opacity: 0.75 },
  primaryButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  loadingContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  secondaryButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#98A2B3',
  },
  secondaryButtonText: { color: '#344054', fontSize: 16, fontWeight: '600' },
  errorText: { color: '#B91C1C', textAlign: 'center', marginTop: 8, fontWeight: '500' },
});
