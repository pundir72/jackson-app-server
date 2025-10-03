'use client';

import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { usePathname } from 'next/navigation';

const SearchContext = createContext();

export const useSearch = () => {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return context;
};

export const SearchProvider = ({ children }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [onSearch, setOnSearch] = useState(() => () => {});
  const pathname = usePathname();

  const searchConfig = useMemo(() => {
    switch (pathname) {
      case '/users':
        return {
          placeholder: 'Search by name, email, user ID, phone, or location...',
          ariaLabel: 'Search users',
          description: 'Enter keywords to search for users'
        };
      case '/payments':
        return {
          placeholder: 'Search by Redemption ID or User ID...',
          ariaLabel: 'Search payments',
          description: 'Enter keywords to search for payment transactions'
        };
      case '/offers':
        return {
          placeholder: 'Search offers by title, ID, type, or segment...',
          ariaLabel: 'Search offers',
          description: 'Enter keywords to search for offers and campaigns'
        };
      case '/offers/games':
        return {
          placeholder: 'Search games by title, ID, or category...',
          ariaLabel: 'Search games',
          description: 'Enter keywords to search for games'
        };
      case '/offers/tasks':
        return {
          placeholder: 'Search tasks by title, game, or rule type...',
          ariaLabel: 'Search tasks',
          description: 'Enter keywords to search for tasks and rules'
        };
      case '/analytics':
        return {
          placeholder: 'Search by game title, acquisition source, or advertiser...',
          ariaLabel: 'Search analytics data',
          description: 'Enter keywords to search marketing attribution data'
        };
      case '/remote-config':
        return {
          placeholder: 'Search by config title, key name, or segment...',
          ariaLabel: 'Search remote configs',
          description: 'Enter keywords to search for remote configurations'
        };
      default:
        return {
          placeholder: 'Search for games or users....',
          ariaLabel: 'Search',
          description: 'Enter keywords to search for games or users'
        };
    }
  }, [pathname]);

  const registerSearchHandler = useCallback((handler) => {
    setOnSearch(() => handler);
  }, []);

  const handleSearch = useCallback((query) => {
    setSearchTerm(query);
    onSearch(query);
  }, [onSearch]);

  const clearSearch = useCallback(() => {
    setSearchTerm('');
    onSearch('');
  }, [onSearch]);

  const value = useMemo(() => ({
    searchTerm,
    setSearchTerm,
    handleSearch,
    clearSearch,
    registerSearchHandler,
    searchConfig,
  }), [searchTerm, handleSearch, clearSearch, registerSearchHandler, searchConfig]);

  return (
    <SearchContext.Provider value={value}>
      {children}
    </SearchContext.Provider>
  );
};