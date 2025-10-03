'use client';

const XPTierBadge = ({ xpTier, className = '' }) => {
  if (!xpTier) return null;

  const getXPTierStyle = (tier) => {
    switch (tier) {
      case 'Junior': return 'bg-green-100 text-green-800';
      case 'Middle Level': return 'bg-blue-100 text-blue-800';
      case 'Senior': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getXPTierIcon = (tier) => {
    switch (tier) {
      case 'Junior': return '🌱';
      case 'Middle Level': return '⚡';
      case 'Senior': return '🏆';
      default: return '📊';
    }
  };

  const baseClasses = `inline-flex items-center justify-center w-[80px] px-3 py-1 rounded-full text-xs font-medium`;
  const tierStyle = getXPTierStyle(xpTier);
  const icon = getXPTierIcon(xpTier);

  return (
    <span className={`${baseClasses} ${tierStyle} ${className}`}>
      <span className="mr-1">{icon}</span>
      {xpTier}
    </span>
  );
};

export default XPTierBadge;