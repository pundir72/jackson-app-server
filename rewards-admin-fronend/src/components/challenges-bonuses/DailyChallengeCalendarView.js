'use client';

import React, { useState, useMemo } from 'react';
import { 
  ChevronLeftIcon, 
  ChevronRightIcon, 
  PlusIcon,
  CalendarDaysIcon,
  EyeIcon,
  EyeSlashIcon
} from '@heroicons/react/24/outline';

const CHALLENGE_TYPES = ['Spin', 'Game', 'Survey', 'Referral', 'Watch Ad', 'SDK Game'];
const CLAIM_TYPES = ['Watch Ad', 'Auto'];

export default function DailyChallengeCalendarView({
  challenges = [],
  onAddChallenge,
  onUpdateChallenge,
  onDeleteChallenge,
  selectedDate,
  onDateSelect,
  loading = false
}) {
  const [currentDate, setCurrentDate] = useState(selectedDate || new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRangeFilter, setDateRangeFilter] = useState('all');
  const [viewMode, setViewMode] = useState('month'); // month, week, day
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [selectedDateChallenges, setSelectedDateChallenges] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  const today = new Date();
  
  // Get current month and year
  const currentMonth = currentDate.getMonth();
  const currentYear = currentDate.getFullYear();

  // Get first day of month and number of days
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();
  const startingDayOfWeek = firstDayOfMonth.getDay();

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(currentYear, currentMonth, day);
      const dateString = date.toISOString().split('T')[0];
      const dayChallenges = challenges.filter(challenge => 
        challenge.date === dateString
      );
      
      days.push({
        date,
        day,
        challenges: dayChallenges,
        isToday: date.toDateString() === today.toDateString(),
        isSelected: selectedDate && date.toDateString() === selectedDate.toDateString()
      });
    }
    
    return days;
  }, [currentYear, currentMonth, daysInMonth, startingDayOfWeek, challenges, selectedDate, today]);

  // Filter challenges for search
  const filteredCalendarDays = useMemo(() => {
    if (!searchTerm && typeFilter === 'all' && statusFilter === 'all' && dateRangeFilter === 'all') {
      return calendarDays;
    }

    return calendarDays.map(day => {
      if (!day) return day;
      
      // Apply date range filter to the day itself
      let dayMatchesRange = true;
      if (dateRangeFilter !== 'all') {
        const dayDate = day.date;
        const today = new Date();
        const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        
        switch (dateRangeFilter) {
          case 'this-week':
            dayMatchesRange = dayDate >= startOfWeek && dayDate <= endOfWeek;
            break;
          case 'this-month':
            dayMatchesRange = dayDate.getMonth() === new Date().getMonth() && 
                             dayDate.getFullYear() === new Date().getFullYear();
            break;
          case 'next-month':
            const nextMonth = new Date();
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            dayMatchesRange = dayDate.getMonth() === nextMonth.getMonth() && 
                             dayDate.getFullYear() === nextMonth.getFullYear();
            break;
          case 'past-week':
            const pastWeekStart = new Date(startOfWeek);
            pastWeekStart.setDate(pastWeekStart.getDate() - 7);
            const pastWeekEnd = new Date(pastWeekStart);
            pastWeekEnd.setDate(pastWeekStart.getDate() + 6);
            dayMatchesRange = dayDate >= pastWeekStart && dayDate <= pastWeekEnd;
            break;
          default:
            dayMatchesRange = true;
        }
      }
      
      if (!dayMatchesRange) {
        return {
          ...day,
          challenges: []
        };
      }
      
      const filteredChallenges = day.challenges.filter(challenge => {
        const matchesSearch = !searchTerm || 
          challenge.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          challenge.type.toLowerCase().includes(searchTerm.toLowerCase());
        
        const matchesType = typeFilter === 'all' || challenge.type === typeFilter;
        
        const matchesStatus = statusFilter === 'all' || challenge.status === statusFilter;
        
        return matchesSearch && matchesType && matchesStatus;
      });
      
      return {
        ...day,
        challenges: filteredChallenges
      };
    });
  }, [calendarDays, searchTerm, typeFilter, statusFilter, dateRangeFilter]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const handleDateClick = (dayData) => {
    if (!dayData) return;
    
    onDateSelect?.(dayData.date);
    setSelectedDateChallenges(dayData.challenges);
    
    // If there are no challenges for this date, open add modal
    if (dayData.challenges.length === 0) {
      onAddChallenge();
    }
  };

  const handleChallengeClick = (challenge, event) => {
    event.stopPropagation(); // Prevent day click event
    onUpdateChallenge(challenge);
  };

  // Generate week view days
  const getWeekDays = () => {
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
    
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      const dateString = date.toISOString().split('T')[0];
      const dayChallenges = challenges.filter(challenge => challenge.date === dateString);
      
      days.push({
        date,
        day: date.getDate(),
        challenges: dayChallenges,
        isToday: date.toDateString() === today.toDateString(),
        isSelected: selectedDate && date.toDateString() === selectedDate.toDateString()
      });
    }
    return days;
  };

  // Generate single day view
  const getDayView = () => {
    const dateString = currentDate.toISOString().split('T')[0];
    const dayChallenges = challenges.filter(challenge => challenge.date === dateString);
    
    return {
      date: currentDate,
      day: currentDate.getDate(),
      challenges: dayChallenges,
      isToday: currentDate.toDateString() === today.toDateString(),
      isSelected: selectedDate && currentDate.toDateString() === selectedDate.toDateString()
    };
  };

  const getStatusColor = (status, date) => {
    const challengeDate = new Date(date);
    const today = new Date();
    
    // Auto-update status based on date
    let actualStatus = status;
    if (challengeDate.toDateString() === today.toDateString()) {
      actualStatus = 'Live';
    } else if (challengeDate > today) {
      actualStatus = 'Scheduled';
    } else if (challengeDate < today) {
      actualStatus = 'Expired';
    }

    const statusColors = {
      'Scheduled': 'bg-blue-100 text-blue-800 border-blue-200',
      'Live': 'bg-green-100 text-green-800 border-green-200',
      'Pending': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'Expired': 'bg-gray-100 text-gray-800 border-gray-200'
    };
    
    return statusColors[actualStatus] || statusColors['Pending'];
  };

  // Render functions for different view modes
  const renderMonthView = () => (
    <>
      {/* Day Headers */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {dayNames.map(day => (
          <div key={day} className="p-2 text-center text-sm font-medium text-gray-500">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Days */}
      <div className="grid grid-cols-7 gap-1">
        {filteredCalendarDays.map((dayData, index) => (
          <div
            key={index}
            className={`min-h-[120px] border border-gray-200 rounded-lg p-2 cursor-pointer transition-all duration-200 ${
              !dayData 
                ? 'bg-gray-50 cursor-default' 
                : dayData.isToday 
                  ? 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100' 
                  : dayData.isSelected 
                    ? 'bg-blue-50 border-blue-200' 
                    : 'bg-white hover:bg-gray-50'
            }`}
            onClick={() => handleDateClick(dayData)}
          >
            {dayData && renderDayContent(dayData)}
          </div>
        ))}
      </div>
    </>
  );

  const renderWeekView = () => {
    const weekDays = getWeekDays();
    
    return (
      <>
        {/* Week Headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {dayNames.map(day => (
            <div key={day} className="p-2 text-center text-sm font-medium text-gray-500">
              {day}
            </div>
          ))}
        </div>

        {/* Week Days */}
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((dayData, index) => (
            <div
              key={index}
              className={`min-h-[200px] border border-gray-200 rounded-lg p-3 cursor-pointer transition-all duration-200 ${
                dayData.isToday 
                  ? 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100' 
                  : dayData.isSelected 
                    ? 'bg-blue-50 border-blue-200' 
                    : 'bg-white hover:bg-gray-50'
              }`}
              onClick={() => handleDateClick(dayData)}
            >
              {renderDayContent(dayData)}
            </div>
          ))}
        </div>
      </>
    );
  };

  const renderDayView = () => {
    const dayData = getDayView();
    
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-semibold text-gray-900">
                {dayData.date.toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </h3>
              {dayData.isToday && (
                <span className="text-sm text-emerald-600 font-medium">Today</span>
              )}
            </div>
            <div className="text-sm text-gray-500">
              {dayData.challenges.length} challenge{dayData.challenges.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Day Challenges */}
          <div className="space-y-3">
            {dayData.challenges.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <CalendarDaysIcon className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p>No challenges scheduled for this day</p>
                <button
                  onClick={() => onAddChallenge()}
                  className="mt-2 text-emerald-600 hover:text-emerald-700 text-sm font-medium"
                >
                  Add Challenge
                </button>
              </div>
            ) : (
              dayData.challenges.map((challenge, idx) => (
                <div
                  key={challenge.id}
                  className={`p-4 rounded-lg border-l-4 cursor-pointer hover:shadow-md transition-all duration-200 ${getStatusColor(challenge.status, challenge.date)}`}
                  onClick={() => handleChallengeClick(challenge, { stopPropagation: () => {} })}
                  title={`Click to edit ${challenge.title}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{challenge.title}</h4>
                      <p className="text-sm text-gray-600 mt-1">{challenge.type}</p>
                    </div>
                    <div className="flex items-center space-x-4 text-sm">
                      <div className="flex items-center">
                        <span className="mr-1">🪙</span>
                        <span>{challenge.coinReward}</span>
                      </div>
                      <div className="flex items-center">
                        <span className="mr-1">⭐</span>
                        <span>{challenge.xpReward}</span>
                      </div>
                      <span className="text-xs text-gray-500">{challenge.claimType}</span>
                      {!challenge.visibility && (
                        <EyeSlashIcon className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderDayContent = (dayData) => (
    <>
      {/* Day Number */}
      <div className={`text-sm font-medium mb-2 ${
        dayData.isToday 
          ? 'text-emerald-600' 
          : dayData.isSelected 
            ? 'text-blue-600' 
            : 'text-gray-900'
      }`}>
        {dayData.day}
        {dayData.isToday && (
          <span className="ml-1 text-xs text-emerald-600">(Today)</span>
        )}
      </div>

      {/* Challenge Cards */}
      <div className="space-y-1">
        {dayData.challenges.slice(0, 3).map((challenge, idx) => (
          <div
            key={challenge.id}
            className={`px-2 py-1 rounded text-xs border cursor-pointer hover:shadow-sm transition-all duration-200 ${getStatusColor(challenge.status, challenge.date)}`}
            title={`${challenge.title} - ${challenge.type} (${challenge.claimType}) - Click to edit`}
            onClick={(e) => handleChallengeClick(challenge, e)}
          >
            <div className="flex items-center justify-between">
              <div className="truncate flex-1">
                <span className="font-medium">{challenge.title}</span>
              </div>
              {!challenge.visibility && (
                <EyeSlashIcon className="h-3 w-3 text-gray-400 ml-1 flex-shrink-0" />
              )}
            </div>
            <div className="flex items-center space-x-2 mt-1">
              <span className="text-xs text-gray-600">{challenge.type}</span>
              <div className="flex items-center space-x-1">
                <span>🪙{challenge.coinReward}</span>
                <span>⭐{challenge.xpReward}</span>
              </div>
            </div>
          </div>
        ))}
        
        {/* Show more indicator */}
        {dayData.challenges.length > 3 && (
          <div className="px-2 py-1 text-xs text-gray-500 bg-gray-100 rounded text-center">
            +{dayData.challenges.length - 3} more
          </div>
        )}
        
        {/* Add challenge button for empty days */}
        {dayData.challenges.length === 0 && (
          <div className="flex items-center justify-center h-16 text-gray-400 hover:text-gray-600">
            <div className="text-center">
              <PlusIcon className="h-6 w-6 mx-auto mb-1" />
              <span className="text-xs">Add Challenge</span>
            </div>
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      {/* Header with Navigation */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Daily Challenge Calendar (Calendar View)</h2>
              <p className="mt-1 text-sm text-gray-600">
                Visual calendar view for managing daily challenges
              </p>
            </div>
            
            {/* Calendar Navigation */}
            <div className="flex items-center space-x-4">
              <button
                onClick={goToToday}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500"
              >
                Today
              </button>
              
              {/* View Mode Controls */}
              <div className="flex items-center space-x-1 bg-gray-100 p-1 rounded-lg">
                <button
                  onClick={() => setViewMode('day')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-all duration-200 ${
                    viewMode === 'day'
                      ? 'bg-white text-emerald-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Day
                </button>
                <button
                  onClick={() => setViewMode('week')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-all duration-200 ${
                    viewMode === 'week'
                      ? 'bg-white text-emerald-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Week
                </button>
                <button
                  onClick={() => setViewMode('month')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-all duration-200 ${
                    viewMode === 'month'
                      ? 'bg-white text-emerald-600 shadow-sm'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  Month
                </button>
              </div>
              
              <div className="flex items-center space-x-1">
                <button
                  onClick={goToPreviousMonth}
                  className="p-2 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded-md"
                >
                  <ChevronLeftIcon className="h-5 w-5" />
                </button>
                
                <h3 className="text-lg font-semibold text-gray-900 min-w-[200px] text-center">
                  {monthNames[currentMonth]} {currentYear}
                </h3>
                
                <button
                  onClick={goToNextMonth}
                  className="p-2 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded-md"
                >
                  <ChevronRightIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            {/* Search */}
            <div className="flex-1 max-w-lg">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search challenges..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500"
                />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center space-x-4">
              <select
                value={dateRangeFilter}
                onChange={(e) => setDateRangeFilter(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="all">All Dates</option>
                <option value="this-week">This Week</option>
                <option value="this-month">This Month</option>
                <option value="next-month">Next Month</option>
                <option value="past-week">Past Week</option>
                <option value="custom">Custom Range</option>
              </select>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="all">All Types</option>
                {CHALLENGE_TYPES.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="all">All Status</option>
                <option value="Scheduled">Scheduled</option>
                <option value="Live">Live</option>
                <option value="Pending">Pending</option>
                <option value="Expired">Expired</option>
              </select>
            </div>
          </div>
        </div>

        {/* Calendar Views */}
        <div className="p-6">
          {viewMode === 'month' && renderMonthView()}
          {viewMode === 'week' && renderWeekView()}
          {viewMode === 'day' && renderDayView()}
        </div>

        {/* Calendar Pagination */}
        {viewMode !== 'day' && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {viewMode === 'month' ? 
                  `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}` :
                  `Week of ${currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                }
              </div>
              
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    if (viewMode === 'month') {
                      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
                    } else {
                      const newDate = new Date(currentDate);
                      newDate.setDate(currentDate.getDate() - 7);
                      setCurrentDate(newDate);
                    }
                  }}
                  className="px-3 py-1 text-sm text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  Previous
                </button>
                
                <span className="px-3 py-1 text-sm text-gray-600 bg-white border border-gray-300 rounded">
                  Page {currentPage}
                </span>
                
                <button
                  onClick={() => {
                    if (viewMode === 'month') {
                      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
                    } else {
                      const newDate = new Date(currentDate);
                      newDate.setDate(currentDate.getDate() + 7);
                      setCurrentDate(newDate);
                    }
                    setCurrentPage(currentPage + 1);
                  }}
                  className="px-3 py-1 text-sm text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-6">
              <span className="text-gray-600">Status Legend:</span>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 bg-blue-100 border border-blue-200 rounded"></div>
                  <span className="text-gray-600">Scheduled</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 bg-green-100 border border-green-200 rounded"></div>
                  <span className="text-gray-600">Live</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 bg-yellow-100 border border-yellow-200 rounded"></div>
                  <span className="text-gray-600">Pending</span>
                </div>
                <div className="flex items-center space-x-1">
                  <div className="w-3 h-3 bg-gray-100 border border-gray-200 rounded"></div>
                  <span className="text-gray-600">Expired</span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2 text-gray-600">
              <EyeSlashIcon className="h-4 w-4" />
              <span>Hidden from users</span>
            </div>
          </div>
        </div>
      </div>

      {/* TODO: Add challenge modal for adding/editing challenges */}
    </div>
  );
}