'use client';

const TierBadge = ({ tier, showIcon = true, className = '' }) => {
  if (!tier) return null;

  const getTierData = (tier) => {
    switch (tier) {
      case 'Bronze':
        return {
          bgColor: '#ffefda',
          borderColor: '#c77023',
          tierColor: '#f68d2b',
          iconSrc: 'https://c.animaapp.com/mf180vyvQGfAhJ/img/---icon--star--9@2x.png'
        };
      case 'Gold':
        return {
          bgColor: '#fffddf',
          borderColor: '#f0c92e',
          tierColor: '#c7a20f',
          iconSrc: 'https://c.animaapp.com/mf180vyvQGfAhJ/img/---icon--star--5@2x.png'
        };
      case 'Platinum':
        return {
          bgColor: '#f4f4f4',
          borderColor: '#9aa7b8',
          tierColor: '#6f85a4',
          iconSrc: 'https://c.animaapp.com/mf180vyvQGfAhJ/img/---icon--star--1@2x.png'
        };
      case 'All Tiers':
      case 'All':
        return {
          bgColor: '#e0f2fe',
          borderColor: '#0277bd',
          tierColor: '#01579b',
          iconSrc: 'https://c.animaapp.com/mf180vyvQGfAhJ/img/---icon--star--5@2x.png'
        };
      default:
        return {
          bgColor: '#f4f4f4',
          borderColor: '#9aa7b8',
          tierColor: '#6f85a4',
          iconSrc: 'https://c.animaapp.com/mf180vyvQGfAhJ/img/---icon--star--1@2x.png'
        };
    }
  };

  const tierData = getTierData(tier);

  return (
    <div
      className={`inline-flex justify-center gap-1 px-2 py-1.5 rounded-full border border-solid items-center w-[90px] ${className}`}
      style={{
        backgroundColor: tierData.bgColor,
        borderColor: tierData.borderColor,
      }}
    >
      {showIcon && (
        <img
          className="w-3 h-3 flex-shrink-0"
          alt="tier icon"
          src={tierData.iconSrc}
        />
      )}
      <div
        className="font-semibold text-xs text-center tracking-[0.10px] leading-4 whitespace-nowrap"
        style={{ color: tierData.tierColor }}
      >
        {tier}
      </div>
    </div>
  );
};

export default TierBadge;