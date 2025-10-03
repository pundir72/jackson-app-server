import React from "react";
import { UserActionsSection } from "./UserActionsSection";
import { UserDetailsSection } from "./UserDetailsSection";
import { UserProfileSection } from "./UserProfileSection";
import { Breadcrumb } from "./Breadcrumb";
import { NotificationSystem } from "./NotificationSystem";
import { useRouter } from "next/navigation";

export const UserDetailPage = ({ user }) => {
  const router = useRouter();

  const breadcrumbItems = [
    { 
      label: "Dashboard", 
      href: "/",
      icon: <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
    },
    { 
      label: "Users", 
      href: "/users",
      icon: <path d="M9 12a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H2z" />
    },
    { 
      label: user?.name || `User ${user?.userId}`,
      icon: <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    }
  ];

  return (
    <div className="space-y-6">
      {/* Navigation Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/users')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Users
          </button>
          <div className="text-sm text-gray-500">
            Last updated: {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
            user?.status === 'Active' 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }`}>
            {user?.status || 'Unknown'}
          </span>
          <span className="text-sm text-gray-500">ID: {user?.userId}</span>
        </div>
      </div>

      <Breadcrumb items={breadcrumbItems} />
      <UserProfileSection />
      
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="flex items-start gap-12">
          <UserActionsSection user={user} />
          <UserDetailsSection user={user} />
        </div>
      </div>

      {/* Notification System */}
      <NotificationSystem />
    </div>
  );
};