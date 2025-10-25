import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
    Alert,
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';


export default function SignInScreen() {
    const router = useRouter();
    
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    
    const [isLoading, setIsLoading] = useState(false);

    const handleSignIn = async () => {
        if (!email.trim() || !password.trim()) {
            Alert.alert('Missing information', 'Please provide both email and password.');
            return;
        }

        try {
            
            Alert.alert('Signed in', 'Welcome back!');
            router.replace('/(tabs)/Scanscreen');
        } catch (error) {
            const message =
                typeof error === 'string'
                    ? error
                    : error instanceof Error
                    ? error.message
                    : 'Something went wrong. Please try again.';
            Alert.alert('Sign in failed', message);
        }
    };

    return (
        <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={styles.header}>
                    <Text style={styles.title}>Welcome back</Text>
                    <Text style={styles.subtitle}>Sign in to continue with your account.</Text>
                </View>

                <View style={styles.form}>
                    <View style={styles.field}>
                        <Text style={styles.label}>Email</Text>
                        <TextInput
                            accessibilityLabel="Email input"
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
                        <Text style={styles.label}>Password</Text>
                        <TextInput
                            accessibilityLabel="Password input"
                            placeholder="Enter your password"
                            secureTextEntry
                            value={password}
                            onChangeText={setPassword}
                            style={styles.input}
                        />
                    </View>

                    <TouchableOpacity
                        style={[styles.primaryButton, isLoading && styles.primaryButtonDisabled]}
                        onPress={handleSignIn}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator color="#fff" />
                                <Text style={styles.primaryButtonText}>Signing in...</Text>
                            </View>
                        ) : (
                            <Text style={styles.primaryButtonText}>Sign In</Text>
                        )}
                    </TouchableOpacity>
                    <View style={styles.footer}>
                        <Text style={styles.footerText}>Need an account?</Text>
                        <TouchableOpacity onPress={() => router.push('./signupscreen')}>
                            <Text style={styles.link}>Create one</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}    

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    container: {
        flex: 1,
        padding: 24,
        justifyContent: 'center',
    },
    header: {
        marginBottom: 32,
    },
    title: {
        fontSize: 32,
        fontWeight: '700',
        color: '#101828',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: '#475467',
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
        paddingVertical: 14,
        paddingHorizontal: 16,
        backgroundColor: '#fff',
        fontSize: 16,
        color: '#101828',
    },
    primaryButton: {
        backgroundColor: '#1D4ED8',
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 8,
    },
    primaryButtonDisabled: {
        opacity: 0.75,
    },
    primaryButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    loadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 4,
        marginTop: 12,
    },
    footerText: {
        color: '#475467',
    },
    link: {
        color: '#1D4ED8',
        fontWeight: '600',
    },
    errorText: {
        color: '#B91C1C',
        textAlign: 'center',
        marginTop: 8,
        fontWeight: '500',
    },
});
