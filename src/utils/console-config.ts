// Console warning'leri kapatmak için
import { LogBox } from 'react-native';

// Sadece belirli uyarıları kapat
LogBox.ignoreLogs([
  'source.uri should not be an empty string',
  'Warning: source.uri should not be an empty string',
  'SyntaxError: "undefined" is not valid JSON',
]);

// Metro bundler JSON hatalarını kapat
LogBox.ignoreLogs([
  'SyntaxError: "undefined" is not valid JSON',
  'at JSON.parse',
  'at Server._symbolicate',
  'at Server._processRequest',
]);

export {};
