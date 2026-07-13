module.exports = {
  preset: 'jest-expo',
  // low-RAM machines SIGTERM parallel workers mid-suite; two is plenty
  maxWorkers: 2,
  testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/src/**/*.test.tsx'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)/|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@shopify/react-native-skia|react-native-.*|zustand)',
  ],
};
