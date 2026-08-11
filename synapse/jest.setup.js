/**
 * Native modules the zustand stores persist through. Tests that touch a store
 * (or anything importing one) need these standing in; without them the import
 * itself throws before a single assertion runs.
 */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-secure-store', () => {
  const vault = new Map();
  return {
    getItemAsync: async (k) => (vault.has(k) ? vault.get(k) : null),
    setItemAsync: async (k, v) => void vault.set(k, v),
    deleteItemAsync: async (k) => void vault.delete(k),
    isAvailableAsync: async () => true,
  };
});
