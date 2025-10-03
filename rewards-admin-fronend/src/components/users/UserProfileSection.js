import React from "react";

export const UserProfileSection = () => {
  return (
    <header
      className="flex items-end gap-6 self-stretch w-full relative flex-[0_0_auto] mb-6"
      role="banner"
    >
      <div className="relative">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">
          User Details
        </h1>
        <p className="text-gray-600 text-sm">
          Track all your users activity
        </p>
      </div>
    </header>
  );
};