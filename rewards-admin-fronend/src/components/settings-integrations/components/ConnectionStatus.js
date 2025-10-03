'use client';

export default function ConnectionStatus({ status, error, size = 'sm' }) {
  const getStatusConfig = () => {
    switch (status) {
      case 'Connected':
        return {
          color: 'bg-green-100 text-green-800 border-green-200',
          icon: (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
          label: 'Connected'
        };
      case 'Failed':
        return {
          color: 'bg-red-100 text-red-800 border-red-200',
          icon: (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ),
          label: 'Failed'
        };
      case 'Untested':
        return {
          color: 'bg-gray-100 text-gray-800 border-gray-200',
          icon: (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
          label: 'Untested'
        };
      default:
        return {
          color: 'bg-gray-100 text-gray-800 border-gray-200',
          icon: (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
          label: status || 'Unknown'
        };
    }
  };

  const config = getStatusConfig();
  const sizeClass = size === 'lg' ? 'px-4 py-1.5 text-sm w-24' : 'px-3 py-1 text-xs w-20';

  return (
    <div className="group relative">
      <span 
        className={`inline-flex items-center justify-center space-x-1 rounded-full border font-medium ${config.color} ${sizeClass}`}
      >
        {config.icon}
        <span>{config.label}</span>
      </span>

      {/* Tooltip for error details */}
      {status === 'Failed' && error && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10 w-64">
          <div className="font-medium mb-1">Connection Error:</div>
          <div>{error}</div>
          {/* Arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
        </div>
      )}
    </div>
  );
}