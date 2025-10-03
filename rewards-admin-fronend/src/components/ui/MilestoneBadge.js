'use client';

const MilestoneBadge = ({ milestone, className = '' }) => {
  if (!milestone) return null;

  const getMilestoneStyle = (milestone) => {
    switch (milestone) {
      case 'First Game': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'After 1 Game': return 'bg-green-100 text-green-800 border-green-200';
      case 'Bronze Tier': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'Platinum Tier': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'Gold Tier': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Weekend Special': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Custom Milestone': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getMilestoneIcon = (milestone) => {
    switch (milestone) {
      case 'First Game': return '🎮';
      case 'After 1 Game': return '✅';
      case 'Bronze Tier': return '🥉';
      case 'Platinum Tier': return '🥈';
      case 'Gold Tier': return '🥇';
      case 'Weekend Special': return '🎉';
      case 'Custom Milestone': return '⭐';
      default: return '📍';
    }
  };

  // Standardized design tokens
  const baseClasses = `
    inline-flex
    items-center
    justify-center
    min-w-[100px]
    px-3
    py-1.5
    rounded-full
    text-xs
    font-medium
    border
    transition-all
    duration-200
  `.replace(/\s+/g, ' ').trim();

  const milestoneStyle = getMilestoneStyle(milestone);
  const icon = getMilestoneIcon(milestone);

  return (
    <span className={`${baseClasses} ${milestoneStyle} ${className}`}>
      <span className="mr-1.5" aria-hidden="true">{icon}</span>
      <span className="truncate">{milestone}</span>
    </span>
  );
};

export default MilestoneBadge;