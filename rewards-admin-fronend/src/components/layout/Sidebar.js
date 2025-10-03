import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: '/dashboard.png', href: '/' },
  { id: 'users', label: 'Users', icon: '/Users (2).png', href: '/users' },
  {
    id: 'offers',
    label: 'Game & Offer Management',
    icon: '/Offers.png',
    href: '/offers',
    subItems: [
      { id: 'offers-listing', label: 'Offers Listing', href: '/offers' },
      { id: 'games-listing', label: 'Games Listing', href: '/offers/games' },
      { id: 'view-tasks', label: 'View Tasks', href: '/offers/tasks' },
      { id: 'display-rules', label: 'Game Display Rules', href: '/offers/display-rules' },
      { id: 'progression-rules', label: 'Task Progression Rules', href: '/offers/progression-rules' },
      { id: 'gameplay-settings', label: 'Welcome Bonus Timer Rules', href: '/offers/gameplay-settings' }
    ]
  },
  { id: 'surveys-offers', label: 'Surveys & Non-Gaming Offers', icon: '/Offers.png', href: '/surveys-offers' },
  { id: 'challenges-bonuses', label: 'Daily Challenges & Bonuses', icon: '/Rewards.png', href: '/challenges-bonuses' },
  { id: 'analytics', label: 'Marketing Attribution and Analytics', icon: '/Analytics and Reports.png', href: '/analytics' },
  { id: 'creative-management', label: 'Creative Management', icon: '/Fraud Monitoring.png', href: '/creative-management' },
  { id: 'transaction-wallet', label: 'Transaction & Wallet Manager', icon: '/Transactions.png', href: '/transaction-wallet' },
  { id: 'rewards', label: 'Rewards', icon: '/Rewards.png', href: '/rewards' },
  { id: 'spin-wheel', label: 'Spin Wheel Manager', icon: '/Rewards.png', href: '/spin-wheel' },
  { id: 'payments', label: 'Payments', icon: '/Payments.png', href: '/payments' },
  // EXCLUDED: Fraud monitoring functionality not supported per requirements
  // { id: 'fraud', label: 'Fraud Monitoring', icon: '/Fraud Monitoring.png', href: '/fraud' },
  // { id: 'remote-config', label: 'Remote Config', icon: '/Settings.png', href: '/remote-config' },
  //  { id: 'push-notifications', label: 'Push Notification Center', icon: '/Settings.png', href: '/push-notifications' },
  { id: 'security-compliance', label: 'Security & Compliance', icon: '/Settings.png', href: '/security-compliance' },
  { id: 'settings-integrations', label: 'Settings & Integrations', icon: '/Integrations.png', href: '/settings-integrations' },
];

export default function Sidebar({ isOpen, onClose }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Helper function to check if a sub-item should be active
  const isSubItemActive = (subItem) => {
    // Special case for View Tasks: only highlight when viewing global tasks (no game filter)
    if (subItem.href === '/offers/tasks') {
      return pathname === '/offers/tasks' && !searchParams.get('game');
    }
    // Default: exact pathname match
    return pathname === subItem.href;
  };

  const [activeItem, setActiveItem] = useState(() => {
    // Check for main items and sub-items
    for (const item of menuItems) {
      if (item.href === pathname) {
        return item.id;
      }
      if (item.subItems) {
        const subItem = item.subItems.find(sub => isSubItemActive(sub));
        if (subItem) {
          return item.id;
        }
      }
    }
    return 'dashboard';
  });

  const [expandedItems, setExpandedItems] = useState(() => {
    // Auto-expand parent if current path matches a sub-item
    const expandedSet = new Set();
    for (const item of menuItems) {
      if (item.subItems) {
        const hasActiveSubItem = item.subItems.some(sub => isSubItemActive(sub));
        if (hasActiveSubItem) {
          expandedSet.add(item.id);
        }
      }
    }
    return expandedSet;
  });

  const toggleExpanded = (itemId) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <div className={`
        w-64 h-screen bg-white border-r border-gray-100 flex flex-col fixed left-0 top-0 z-50 
        transition-transform duration-300 ease-in-out shadow-lg lg:shadow-none
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
      {/* Logo */}
      <div className="p-6 pb-6">
        <h1 className="text-4xl  font-extrabold text-gray-800">
          Jackson<span className="text-emerald-500">.</span>
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 overflow-y-auto" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <style jsx>{`
          nav::-webkit-scrollbar {
            display: none;
          }
        `}</style>
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const isMainActive = pathname === item.href;
            const hasActiveSubItem = item.subItems?.some(sub => isSubItemActive(sub));
            const isParentActive = isMainActive || hasActiveSubItem;
            const isExpanded = expandedItems.has(item.id);

            return (
              <li key={item.id}>
                {/* Main Item */}
                <div className="flex items-center">
                  <Link
                    href={item.href}
                    onClick={() => {
                      setActiveItem(item.id);
                      if (!item.subItems) {
                        onClose?.();
                      }
                    }}
                    className={`flex-1 flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all duration-200 ${
                      isMainActive
                        ? 'bg-emerald-50 text-emerald-600 border-l-4 border-emerald-500'
                        : isParentActive
                        ? 'bg-emerald-25 text-emerald-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                    }`}
                  >
                    <Image
                      src={item.icon}
                      alt={`${item.label} icon`}
                      width={20}
                      height={20}
                      className="flex-shrink-0"
                    />
                    <span className="font-medium">{item.label}</span>
                  </Link>

                  {/* Expand/Collapse Button */}
                  {item.subItems && (
                    <button
                      onClick={() => toggleExpanded(item.id)}
                      className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {isExpanded ? (
                        <ChevronDownIcon className="h-4 w-4" />
                      ) : (
                        <ChevronRightIcon className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>

                {/* Sub Items */}
                {item.subItems && isExpanded && (
                  <ul className="mt-1 ml-6 space-y-1">
                    {item.subItems.map((subItem) => {
                      const isSubActive = isSubItemActive(subItem);

                      return (
                        <li key={subItem.id}>
                          <Link
                            href={subItem.href}
                            onClick={() => {
                              setActiveItem(item.id);
                              onClose?.();
                            }}
                            className={`block px-4 py-2 rounded-md text-sm transition-all duration-200 ${
                              isSubActive
                                ? 'bg-emerald-100 text-emerald-700 font-medium'
                                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
                            }`}
                          >
                            {subItem.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      </div>
    </>
  );
}