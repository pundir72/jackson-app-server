'use client';

import { useState, useMemo, useCallback } from 'react';

export const usePagination = (items, initialItemsPerPage = 10) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(initialItemsPerPage);

  const paginationData = useMemo(() => {
    const totalPages = Math.ceil(items.length / itemsPerPage);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedItems = items.slice(startIndex, startIndex + itemsPerPage);

    return {
      items: paginatedItems,
      totalPages,
      currentPage,
      itemsPerPage,
      startIndex,
      totalItems: items.length,
    };
  }, [items, currentPage, itemsPerPage]);

  const handlePageChange = (page) => {
    if (page >= 1 && page <= paginationData.totalPages) {
      setCurrentPage(page);
    }
  };

  const handleItemsPerPageChange = (newItemsPerPage) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  const resetPagination = useCallback(() => {
    setCurrentPage(1);
  }, []);

  return {
    ...paginationData,
    handlePageChange,
    handleItemsPerPageChange,
    resetPagination,
  };
};