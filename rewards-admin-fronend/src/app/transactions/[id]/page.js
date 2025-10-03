'use client';

import { use } from 'react';
import TransactionDetails from '@/components/transactions/TransactionDetails';

export default function TransactionPage({ params }) {
  const { id } = use(params);
  
  return <TransactionDetails transactionId={id} />;
}