'use client';

import { useState } from 'react';

export default function Header() {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <header className="  px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Search Bar */}
        <div className="flex-1 max-w-lg">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search for games or users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full pl-10 pr-3 py-2  rounded-lg leading-5 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>
        </div>

        {/* Right side - Notifications and User */}
        <div className="flex items-center space-x-4">
          {/* Notification Bell */}
          <div className="relative">
            <button className="p-1 rounded-full text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500">
              <span className="sr-only">View notifications</span>
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-3-3 3-3h-5m-10 0h5l3 3-3 3H5m5-6a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <div className="absolute -top-1 -right-1 h-4 w-4 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="text-xs text-white font-medium">3</span>
            </div>
          </div>

          {/* User Profile */}
          <div className="flex items-center space-x-3">
            <span className="text-sm text-gray-700">Hello, Sam!</span>
            <div className="h-8 w-8 rounded-full bg-gray-300 flex items-center justify-center">
              <img
                className="h-8 w-8 rounded-full"
                src="/api/placeholder/32/32"
                alt="User avatar"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'block';
                }}
              />
              <span className="hidden text-sm text-gray-600 font-medium">S</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}