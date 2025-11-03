import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    ImageBackground,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { useAppDispatch } from '@/redux/hooks';
import { fetchUserProfile } from '@/redux/slices/userSlice';
import { signInWithEmail } from '@/services/auth';

export default function SignInScreen() {
    const router = useRouter();
    const dispatch = useAppDispatch();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleSignIn = async () => {
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedPassword = password.trim();

        if (!normalizedEmail || !normalizedPassword) {
            setErrorMessage(' Pleass enter email and password');
            return;
        }

        try {
            setIsLoading(true);
            setErrorMessage(null);
            const result = await signInWithEmail(normalizedEmail, normalizedPassword);
            if (!result.ok) {
                setErrorMessage(result.message);
                return;
            }
            try {
                await dispatch(fetchUserProfile()).unwrap();
            } catch (fetchError) {
                console.warn('Unable to refresh profile after sign in:', fetchError);
            }
            router.replace('/(tabs)/Scanscreen');
        } catch (error) {
            setErrorMessage(
                error instanceof Error ? error.message : ' An unexpected error occurred. Please try again.'
            );
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <LinearGradient
            colors={['#1a0b2e', '#2d1b4e', '#1a0b2e']}
            style={styles.gradient}
        >
            <SafeAreaView style={styles.safeArea}>
                <KeyboardAvoidingView
                    style={styles.container}

                >
                    {/* Decorative Stars */}
                    <View style={styles.starsContainer}>
                        <Ionicons name="star" size={16} color="#B794F6" style={[styles.star, styles.star1]} />
                        <Ionicons name="star" size={12} color="#E9D5FF" style={[styles.star, styles.star2]} />
                        <Ionicons name="star" size={14} color="#C4B5FD" style={[styles.star, styles.star3]} />
                        <Ionicons name="star" size={10} color="#DDD6FE" style={[styles.star, styles.star4]} />
                        <Ionicons name="star" size={18} color="#A78BFA" style={[styles.star, styles.star5]} />
                    </View>

                    {/* Header with Moon Icon */}
                    <View style={styles.header}>
                        <View style={styles.moonContainer}>
                            <Ionicons name="moon" size={48} color="#E9D5FF" />
                            <View style={styles.moonGlow} />
                        </View>
                        <Text style={styles.title}>Mee Duang</Text>
                        <Text style={styles.subtitle}>Reveal your destiny through your palmistry.</Text>
                    </View>

                    {/* Form Card */}
                    <View style={styles.formCard}>
                        <LinearGradient
                            colors={['rgba(167, 139, 250, 0.1)', 'rgba(196, 181, 253, 0.05)']}
                            style={styles.cardGradient}
                        >
                            <View style={styles.form}>
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

                                {/* Password Field */}
                                <View style={styles.field}>
                                    <Text style={styles.label}>
                                        Password
                                    </Text>
                                    <View style={styles.inputContainer}>

                                        <TextInput

                                            placeholder=" your password"
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

                                {/* Sign In Button */}
                                <TouchableOpacity
                                    onPress= {handleSignIn}
                                    disabled={isLoading}
                                    activeOpacity={0.8}
                                >
                                    <LinearGradient
                                        colors={isLoading ? ['#6B7280', '#4B5563'] : ['#8B5CF6', '#7C3AED']}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={[styles.primaryButton, isLoading && styles.primaryButtonDisabled]}
                                    >
                                        {isLoading ? (
                                            <View style={styles.loadingContainer}>
                                                <ActivityIndicator color="#fff" />
                                                <Text style={styles.primaryButtonText}> loading... </Text>
                                            </View>
                                        ) : (
                                            <View style={styles.buttonContent}>
                                                <Text style={styles.primaryButtonText}> Sign In</Text>
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
                            </View>
                        </LinearGradient>
                    </View>

                    {/* Footer */}
                    <View style={styles.footer}>
                        <Text style={styles.footerText}> Don't have an account? </Text>

                        <TouchableOpacity onPress={() => router.push('./signupscreen')}>

                            <Text style={styles.link}> sign up </Text>

                        </TouchableOpacity>
                    </View>

                    {/* Constellation Lines Decoration */}
                    <View style={styles.constellation}>
                        <View style={styles.constellationLine1} />
                        <View style={styles.constellationLine2} />
                    </View>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </LinearGradient>
    );
}

const styles = StyleSheet.create({
    gradient: {
        flex: 1,
    },
    safeArea: {
        flex: 1,
    },
    container: {
        flex: 1,
        padding: 24,
        justifyContent: 'center',
    },
    starsContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    star: {
        position: 'absolute',
    },
    star1: { top: '10%', left: '15%', opacity: 0.8 },
    star2: { top: '25%', right: '15%', opacity: 0.6 },
    star3: { top: '45%', left: '1%', opacity: 0.7 },
    star4: { bottom: '30%', right: '1%', opacity: 0.5 },
    star5: { bottom: '10%', left: '15%', opacity: 0.8 },
    header: {
        alignItems: 'center',
        marginBottom: 32,
    },
    moonContainer: {
        position: 'relative',
        marginBottom: 16,
    },
    moonGlow: {
        position: 'absolute',
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#E9D5FF',
        opacity: 0.2,
        top: -16,
        left: -16,
    },
    title: {
        fontSize: 40,
        fontWeight: '800',
        color: '#E9D5FF',
        marginBottom: 8,
        textShadowColor: 'rgba(167, 139, 250, 0.5)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 20,
        letterSpacing: 2,
    },
    subtitle: {
        fontSize: 14,
        color: '#C4B5FD',
        textAlign: 'center',
        fontWeight: '500',
    },
    formCard: {
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: 2,
        borderColor: 'rgba(167, 139, 250, 0)',
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 5,
    },
    cardGradient: {
        padding: 24,
        backgroundColor: 'rgba(26, 11, 46, 1)',

    },
    form: {
        gap: 20,
    },
    field: {
        gap: 8,
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        color: '#E9D5FF',
        marginLeft: 4,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1.5,
        borderColor: 'rgba(167, 139, 250, 0.3)',
        borderRadius: 16,
        backgroundColor: 'rgba(26, 11, 46, 0.4)',
        paddingHorizontal: 16,
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
    },
    inputIcon: {
        marginRight: 12,
    },
    input: {
        flex: 1,
        paddingVertical: 16,
        fontSize: 16,
        color: '#E9D5FF',
    },
    eyeIcon: {
        padding: 8,
    },
    primaryButton: {
        paddingVertical: 18,
        borderRadius: 16,
        alignItems: 'center',
        marginTop: 8,
        shadowColor: '#8B5CF6',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 6,
    },
    primaryButtonDisabled: {
        opacity: 0.6,
    },
    buttonContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    primaryButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
    loadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
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
        fontSize: 14,
        fontWeight: '500',
        flex: 1,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        marginTop: 24,
    },
    footerText: {
        color: '#C4B5FD',
        fontSize: 15,
    },
    linkGradient: {
        paddingHorizontal: 2,
        paddingBottom: 2,
        borderRadius: 4,
    },
    link: {
        color: '#E9D5FF',
        fontWeight: '900',
        fontSize: 15,

    },
    constellation: {
        position: 'absolute',
        top: '20%',
        right: '10%',
        opacity: 0.3,
    },
    constellationLine1: {
        width: 60,
        height: 1,
        backgroundColor: '#A78BFA',
        transform: [{ rotate: '45deg' }],
    },
    constellationLine2: {
        width: 40,
        height: 1,
        backgroundColor: '#C4B5FD',
        transform: [{ rotate: '-30deg' }],
        marginTop: 20,
        marginLeft: 10,
    },
});
