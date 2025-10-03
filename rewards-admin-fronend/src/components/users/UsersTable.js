import { useRouter } from 'next/navigation';

export default function UsersTable({
  users,
  selectedUsers,
  onSelectUser,
  onSelectAll,
  onEditUser,
  onSuspendUser,
  className = ""
}) {
  const router = useRouter();

  return (
    <div className={`bg-white rounded-[10px] border border-gray-200 w-full ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-full lg:min-w-[1000px]">
          <thead>
            <tr className="bg-[#ecf8f1]">
              {/* Select All checkbox hidden */}
              {/* <th className="text-center py-4 px-3 font-semibold text-[#333333] text-sm tracking-[0.1px] w-12">
                <input
                  type="checkbox"
                  checked={selectedUsers.length === users.length && users.length > 0}
                  onChange={onSelectAll}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                />
              </th> */}
              <th className="text-left py-4 px-3 font-semibold text-[#333333] text-sm tracking-[0.1px] min-w-[140px]">
                Name
              </th>
              <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm tracking-[0.1px] hidden xl:table-cell min-w-[80px]">
                User ID
              </th>
              <th className="text-left py-4 px-2 font-semibold text-[#333333] text-sm tracking-[0.1px] min-w-[160px]">
                Email ID
              </th>
              <th className="text-left py-4 px-2 font-semibold text-[#333333] text-sm tracking-[0.1px] hidden lg:table-cell min-w-[110px]">
                Phone
              </th>
              <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm tracking-[0.1px] hidden xl:table-cell min-w-[60px]">
                Gender
              </th>
              <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm tracking-[0.1px] hidden xl:table-cell min-w-[60px]">
                Age
              </th>
              <th className="text-left py-4 px-2 font-semibold text-[#333333] text-sm tracking-[0.1px] hidden md:table-cell min-w-[120px]">
                Location
              </th>
              <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm tracking-[0.1px] min-w-[80px]">
                Tier
              </th>
              <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm tracking-[0.1px] min-w-[80px]">
                Status
              </th>
              <th className="text-center py-4 px-2 font-semibold text-[#333333] text-sm tracking-[0.1px] min-w-[120px]">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((row, index) => (
              <tr
                key={row.id}
                className={`border-b border-[#d0d6e7] hover:bg-gray-50 transition-colors ${index === users.length - 1 ? "border-b-0" : ""} ${selectedUsers.includes(row.id) ? "bg-blue-50" : ""}`}
              >
                {/* Select Column - hidden */}
                {/* <td className="py-4 px-3 text-center">
                  <input
                    type="checkbox"
                    checked={selectedUsers.includes(row.id)}
                    onChange={() => onSelectUser(row.id)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                  />
                </td> */}

                {/* Name Column */}
                <td className="py-4 px-3">
                  <div className="flex items-center gap-2">
                    <img
                      className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover flex-shrink-0"
                      src={row.avatar}
                      alt={`${row.name} avatar`}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                    <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-200 rounded-full items-center justify-center text-sm hidden flex-shrink-0">
                      👤
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-black text-sm tracking-[0.1px] leading-5 truncate">
                        {row.name}
                      </div>
                    </div>
                  </div>
                </td>

                {/* User ID Column */}
                <td className="py-4 px-2 text-center hidden xl:table-cell">
                  <div className="font-medium text-[#333333] text-sm tracking-[0.1px] leading-5 truncate">
                    {row.userId}
                  </div>
                </td>

                {/* Email Column */}
                <td className="py-4 px-2">
                  <div className="font-medium text-[#333333] text-sm tracking-[0.1px] leading-5 truncate" title={row.email}>
                    {row.email}
                  </div>
                </td>

                {/* Phone Column */}
                <td className="py-4 px-2 hidden lg:table-cell">
                  <div className="font-medium text-[#333333] text-sm tracking-[0.1px] leading-5 truncate" title={row.phone}>
                    {row.phone}
                  </div>
                </td>

                {/* Gender Column */}
                <td className="py-4 px-2 text-center hidden xl:table-cell">
                  <div className="font-medium text-[#333333] text-sm tracking-[0.1px] leading-5">
                    {row.gender}
                  </div>
                </td>

                {/* Age Column */}
                <td className="py-4 px-2 text-center hidden xl:table-cell">
                  <div className="font-medium text-[#333333] text-sm tracking-[0.1px] leading-5">
                    {row.age}
                  </div>
                </td>

                {/* Location Column */}
                <td className="py-4 px-2 hidden md:table-cell">
                  <div className="font-medium text-[#333333] text-sm tracking-[0.1px] leading-5 truncate" title={row.location}>
                    {row.location}
                  </div>
                </td>

                {/* Tier Column */}
                <td className="py-4 px-2 text-center">
                  <div
                    className="inline-flex justify-center gap-1 px-2 py-1.5 rounded-full border border-solid items-center w-[90px]"
                    style={{
                      backgroundColor: row.tierBg,
                      borderColor: row.tierBorder,
                    }}
                  >
                    <img
                      className="w-3 h-3 flex-shrink-0"
                      alt="Icon star"
                      src={row.tierIcon}
                    />
                    <div
                      className="font-semibold text-xs sm:text-sm text-center tracking-[0.10px] leading-4 whitespace-nowrap"
                      style={{ color: row.tierColor }}
                    >
                      {row.tier}
                    </div>
                  </div>
                </td>

                {/* Status Column */}
                <td className="py-4 px-2 text-center">
                  <div
                    className="inline-flex items-center justify-center px-2 py-1.5 rounded-full min-w-0"
                    style={{ backgroundColor: row.statusBg }}
                  >
                    <div
                      className="font-medium text-xs sm:text-sm tracking-[0.1px] leading-4 whitespace-nowrap"
                      style={{ color: row.statusColor }}
                    >
                      {row.status}
                    </div>
                  </div>
                </td>

                {/* Actions Column */}
                <td className="py-4 px-2">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => onEditUser(row)}
                      className="p-1.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors flex-shrink-0"
                      title="Edit user"
                    >
                      <img
                        className="w-3.5 h-3.5"
                        alt="Icon pencil"
                        src="https://c.animaapp.com/t66hdvJZ/img/---icon--pencil--10@2x.png"
                      />
                    </button>

                    <button 
                      onClick={() => router.push(`/users/${row.userId}`)}
                      className="inline-flex items-center justify-center gap-1 px-2 py-1.5 bg-[#00a389] rounded-full hover:bg-[#008a73] transition-colors cursor-pointer text-xs"
                    >
                      <div className="font-medium text-white text-xs tracking-[0] leading-4">
                        View
                      </div>
                    </button>

                    {row.status === "Active" && (
                      <button
                        onClick={() => onSuspendUser(row)}
                        className="items-center justify-center gap-1 px-2 py-1.5 bg-[#f40202] rounded-full hover:bg-[#d10000] transition-colors cursor-pointer text-xs hidden md:flex"
                      >
                        <div className="font-medium text-white text-xs tracking-[0] leading-4">
                          Suspend
                        </div>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}