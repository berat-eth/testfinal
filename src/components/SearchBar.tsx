import React from 'react';
import { 
  View, 
  TextInput, 
  StyleSheet, 
  TouchableOpacity, 
  Text,
  Image
} from 'react-native';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChangeText,
  placeholder = 'Ürün ara...',
  onSubmit,
}) => {
  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <Image 
          source={require('../../assets/search-interface-symbol.png')} 
          style={styles.searchIcon}
          resizeMode="contain"
        />
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#8A8A8A"
          onSubmitEditing={onSubmit}
          returnKeyType="search"
        />
        {value.length > 0 && (
          <TouchableOpacity onPress={() => onChangeText('')}>
            <Text style={styles.clearIcon}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 50,
    borderWidth: 1,
    borderColor: '#1A1A2E',
  },
  searchIcon: {
    width: 18,
    height: 18,
    marginRight: 12,
    tintColor: '#1A1A2E',
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1A1A2E',
    fontWeight: '500',
  },
  clearIcon: {
    fontSize: 18,
    color: '#666666',
    marginLeft: 8,
    fontWeight: '600',
  },
});