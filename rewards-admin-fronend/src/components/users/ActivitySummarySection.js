import React from "react";

export const ActivitySummarySection = ({ user }) => {
  const activityData = [
    {
      label: "Last Login Timestamp",
      value: user?.lastLogin || "May 28, 2025 – 11:42 AM",
      isTimestamp: true
    },
    {
      label: "Total Logins Since Registration",
      value: user?.totalLogins || "58 logins since Mar 2025",
      isCount: true
    },
    {
      label: "Last Task Completed",
      value: user?.lastTaskCompleted || "BitLabs Survey #432 – May 27",
    },
    {
      label: "Offers Redeemed + Last Offer Claimed",
      value: user?.offersRedeemed || "12 offers redeemed",
      additionalInfo: user?.lastOfferClaimed || "Lucky Spin – 200 coins – May 26"
    },
    {
      label: "Total Coins Earned",
      value: user?.totalCoinsEarned || "47,250 coins earned",
      isHighlighted: true
    },
    {
      label: "Total XP Earned",
      value: user?.totalXPEarned || "2,850 XP earned",
      isHighlighted: true
    },
    {
      label: "Redemptions Made (Summary View)",
      value: user?.redemptionsMade || "3 redemptions",
      additionalInfo: "2 via PayPal ($15), 1 Gift Card ($10)"
    },
    {
      label: "Challenge Progress",
      value: user?.challengeProgress || "Day 6 of 7-Day Login Challenge",
      isProgress: true
    },
    {
      label: "Spin Usage History",
      value: user?.spinUsage || "8 spins used this month",
      additionalInfo: "Last spin: May 24 (won 150 coins)"
    },
  ];

  return (
    <div className="w-full space-y-6">
      {/* Header with Export Button */}
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-semibold text-gray-800">Activity Summary</h3>
        <button
          onClick={() => {
            const csvContent = [
              ['Activity Type', 'Details', 'Additional Info'],
              ...activityData.map(item => [
                item.label, 
                item.value, 
                item.additionalInfo || ''
              ])
            ].map(row => row.join(',')).join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `user_activity_${user?.userId || 'unknown'}_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          title="Export activity data"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
          </svg>
          Export
        </button>
      </div>
      {/* Activity Data - First Column */}
      <div className="space-y-[30px]">
        {activityData.slice(0, 5).map((item, index) => (
          <div key={index} className="flex items-start gap-8">
            <dt className="w-[280px] flex-shrink-0 [font-family:'DM_Sans-Medium',Helvetica] font-medium text-gray-600 text-sm tracking-[0] leading-[normal]">
              {item.label}
            </dt>
            <dd className="flex-1 [font-family:'DM_Sans-Medium',Helvetica] font-medium text-black text-sm tracking-[0] leading-[normal]">
              {item.isTimestamp ? (
                <div className="flex items-center gap-2">
                  <span className="text-green-600">🟢</span>
                  <span>{item.value}</span>
                </div>
              ) : item.isCount ? (
                <div className="flex items-center gap-2">
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-semibold">
                    {item.value.split(' ')[0]}
                  </span>
                  <span className="text-gray-600 text-xs">{item.value.split(' ').slice(1).join(' ')}</span>
                </div>
              ) : item.isHighlighted ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded px-2 py-1 inline-block">
                  <span className="font-semibold text-yellow-800">{item.value}</span>
                </div>
              ) : item.isProgress ? (
                <div className="space-y-1">
                  <span>{item.value}</span>
                  <div className="w-32 bg-gray-200 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: '85.7%' }}></div>
                  </div>
                  <span className="text-xs text-gray-500">85.7% complete</span>
                </div>
              ) : (
                <div>
                  <div>{item.value}</div>
                  {item.additionalInfo && (
                    <div className="text-xs text-gray-500 mt-1">{item.additionalInfo}</div>
                  )}
                </div>
              )}
            </dd>
          </div>
        ))}
      </div>

      {/* Activity Data - Second Column */}
      <div className="space-y-[30px]">
        {activityData.slice(5).map((item, index) => (
          <div key={index + 5} className="flex items-start gap-8">
            <dt className="w-[280px] flex-shrink-0 [font-family:'DM_Sans-Medium',Helvetica] font-medium text-gray-600 text-sm tracking-[0] leading-[normal]">
              {item.label}
            </dt>
            <dd className="flex-1 [font-family:'DM_Sans-Medium',Helvetica] font-medium text-black text-sm tracking-[0] leading-[normal]">
              {item.isTimestamp ? (
                <div className="flex items-center gap-2">
                  <span className="text-green-600">🟢</span>
                  <span>{item.value}</span>
                </div>
              ) : item.isCount ? (
                <div className="flex items-center gap-2">
                  <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-semibold">
                    {item.value.split(' ')[0]}
                  </span>
                  <span className="text-gray-600 text-xs">{item.value.split(' ').slice(1).join(' ')}</span>
                </div>
              ) : item.isHighlighted ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded px-2 py-1 inline-block">
                  <span className="font-semibold text-yellow-800">{item.value}</span>
                </div>
              ) : item.isProgress ? (
                <div className="space-y-1">
                  <span>{item.value}</span>
                  <div className="w-32 bg-gray-200 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: '85.7%' }}></div>
                  </div>
                  <span className="text-xs text-gray-500">85.7% complete</span>
                </div>
              ) : (
                <div>
                  <div>{item.value}</div>
                  {item.additionalInfo && (
                    <div className="text-xs text-gray-500 mt-1">{item.additionalInfo}</div>
                  )}
                </div>
              )}
            </dd>
          </div>
        ))}
      </div>
    </div>
  );
};