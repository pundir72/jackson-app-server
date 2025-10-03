export default function FilterDropdown({
  filterId,
  label,
  options,
  value,
  onChange,
  className = ""
}) {
  return (
    <div className={`relative min-w-[130px] flex-shrink-0 ${className}`}>
      <div className="relative h-[42px] bg-white rounded-[9.6px] shadow-[0px_3.2px_3.2px_#0000000a] border border-gray-200">
        <select
          id={`filter-${filterId}`}
          value={value}
          onChange={(e) => onChange(filterId, e.target.value)}
          className="w-full h-full px-3 pr-8 bg-transparent border-none rounded-[9.6px] cursor-pointer [font-family:'DM_Sans-Medium',Helvetica] font-medium text-[#3e4954] text-[13.5px] tracking-[0] leading-[normal] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none"
          aria-label={`Filter by ${label}`}
        >
          <option value="">{label}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
          <svg className="w-3 h-2 text-[#3e4954]" fill="currentColor" viewBox="0 0 12 7">
            <path d="M1 1L6 6L11 1" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>
    </div>
  );
}