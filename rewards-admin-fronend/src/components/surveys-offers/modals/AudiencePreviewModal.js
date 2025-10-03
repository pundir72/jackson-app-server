'use client';

export default function AudiencePreviewModal({ isOpen, onClose, sdk }) {
  if (!isOpen || !sdk) return null;

  const audienceBreakdown = {
    totalUsers: sdk.previewAudienceCount,
    byAge: [
      { range: '18-24', count: Math.floor(sdk.previewAudienceCount * 0.25), percentage: '25%' },
      { range: '25-34', count: Math.floor(sdk.previewAudienceCount * 0.35), percentage: '35%' },
      { range: '35-44', count: Math.floor(sdk.previewAudienceCount * 0.22), percentage: '22%' },
      { range: '45-54', count: Math.floor(sdk.previewAudienceCount * 0.12), percentage: '12%' },
      { range: '55-65', count: Math.floor(sdk.previewAudienceCount * 0.06), percentage: '6%' }
    ],
    byCountry: sdk.segmentRules.countries.map((country, index) => {
      const countryNames = {
        'US': 'United States',
        'UK': 'United Kingdom', 
        'CA': 'Canada',
        'AU': 'Australia',
        'DE': 'Germany',
        'FR': 'France',
        'JP': 'Japan'
      };
      const percentages = [0.45, 0.25, 0.15, 0.10, 0.05];
      const percentage = percentages[index] || 0.05;
      return {
        code: country,
        name: countryNames[country] || country,
        count: Math.floor(sdk.previewAudienceCount * percentage),
        percentage: `${Math.round(percentage * 100)}%`
      };
    }),
    byGender: [
      { type: 'Female', count: Math.floor(sdk.previewAudienceCount * 0.52), percentage: '52%' },
      { type: 'Male', count: Math.floor(sdk.previewAudienceCount * 0.46), percentage: '46%' },
      { type: 'Non-binary', count: Math.floor(sdk.previewAudienceCount * 0.02), percentage: '2%' }
    ]
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Audience Preview</h2>
            <p className="text-sm text-gray-600 mt-1">
              Estimated matching users for {sdk.name} SDK rules
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Current Rules */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h3 className="font-medium text-gray-900 mb-3">Current Targeting Rules</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <span className="text-sm font-medium text-gray-700">Age Range:</span>
              <p className="text-sm text-gray-900">{sdk.segmentRules.ageRange.min}-{sdk.segmentRules.ageRange.max} years</p>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-700">Countries:</span>
              <p className="text-sm text-gray-900">{sdk.segmentRules.countries.join(', ')}</p>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-700">Gender:</span>
              <p className="text-sm text-gray-900 capitalize">{sdk.segmentRules.gender}</p>
            </div>
          </div>
        </div>

        {/* Total Count */}
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 mb-6">
          <div className="flex items-center">
            <svg className="w-8 h-8 text-emerald-600 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <div>
              <h3 className="text-lg font-semibold text-emerald-900">
                {audienceBreakdown.totalUsers.toLocaleString()} Matching Users
              </h3>
              <p className="text-sm text-emerald-700">
                Estimated audience size based on current rules
              </p>
            </div>
          </div>
        </div>

        {/* Breakdown Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Age Breakdown */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-4">Age Distribution</h4>
            <div className="space-y-3">
              {audienceBreakdown.byAge.map((age) => (
                <div key={age.range} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{age.range}</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ width: age.percentage }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-500 w-8">{age.percentage}</span>
                    <span className="text-sm font-medium text-gray-900 w-16 text-right">
                      {age.count.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Country Breakdown */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-4">Country Distribution</h4>
            <div className="space-y-3">
              {audienceBreakdown.byCountry.map((country) => (
                <div key={country.code} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{country.name}</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-600 h-2 rounded-full" 
                        style={{ width: country.percentage }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-500 w-8">{country.percentage}</span>
                    <span className="text-sm font-medium text-gray-900 w-16 text-right">
                      {country.count.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Gender Breakdown */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-4">Gender Distribution</h4>
            <div className="space-y-3">
              {audienceBreakdown.byGender.map((gender) => (
                <div key={gender.type} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">{gender.type}</span>
                  <div className="flex items-center space-x-2">
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-purple-600 h-2 rounded-full" 
                        style={{ width: gender.percentage }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-500 w-8">{gender.percentage}</span>
                    <span className="text-sm font-medium text-gray-900 w-16 text-right">
                      {gender.count.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h4 className="font-medium text-blue-900">Audience Insights</h4>
              <p className="text-sm text-blue-800 mt-1">
                Your current targeting rules will reach approximately {audienceBreakdown.totalUsers.toLocaleString()} users. 
                This represents a good balance of reach and targeting specificity for survey campaigns.
              </p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}