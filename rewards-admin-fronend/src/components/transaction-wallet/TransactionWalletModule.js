'use client';

import { useState } from 'react';
import TransactionLog from './screens/TransactionLog';
import RedemptionQueue from './screens/RedemptionQueue';
import WalletAdjustments from './screens/WalletAdjustments';
import ConversionSettings from './screens/ConversionSettings';
import AuditTrails from './screens/AuditTrails';
import SneakPeekModal from './modals/SneakPeekModal';

const TABS = [
  { id: 'transactions', label: 'Transaction Log', component: TransactionLog },
  { id: 'redemptions', label: 'Redemption Queue', component: RedemptionQueue },
  { id: 'adjustments', label: 'Wallet Adjustments', component: WalletAdjustments },
  { id: 'conversions', label: 'Conversion Settings', component: ConversionSettings },
  { id: 'audit', label: 'Audit Trails', component: AuditTrails }
];

export default function TransactionWalletModule() {
  const [activeTab, setActiveTab] = useState('transactions');
  const [sneakPeekData, setSneakPeekData] = useState(null);

  const handleSneakPeek = (userData) => {
    setSneakPeekData(userData);
  };

  const closeSneakPeek = () => {
    setSneakPeekData(null);
  };

  const ActiveComponent = TABS.find(tab => tab.id === activeTab)?.component;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Transaction & Wallet Manager
          </h1>
          <p className="text-gray-600">
            Manage user transactions, redemptions, wallet adjustments, and audit trails
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8 px-6">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'border-emerald-500 text-emerald-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {ActiveComponent && (
              <ActiveComponent onSneakPeek={handleSneakPeek} />
            )}
          </div>
        </div>
      </div>

      {/* Sneak Peek Modal */}
      {sneakPeekData && (
        <SneakPeekModal
          userData={sneakPeekData}
          isOpen={!!sneakPeekData}
          onClose={closeSneakPeek}
        />
      )}
    </div>
  );
}