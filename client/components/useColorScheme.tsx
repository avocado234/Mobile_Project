import { useColorScheme as useNativeColorScheme } from 'react-native';

// The useColorScheme value is always either "light" or "dark", but the built-in
// type suggests that it can be null. This will not happen in practice, so this
// makes it safer to use.
export function useColorScheme(): 'light' | 'dark' {
    return useNativeColorScheme() as 'light' | 'dark';
}
