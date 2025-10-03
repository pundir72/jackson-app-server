'use client';

import ConnectionStatus from './ConnectionStatus';

export default function IntegrationTable({
  integrations,
  onEdit,
  onTest,
  onDelete,
  onToggleStatus
}) {
  const maskApiKey = (apiKey) => {
    if (!apiKey) return '';
    if (apiKey.length <= 8) return '*'.repeat(apiKey.length);
    return apiKey.substring(0, 4) + '*'.repeat(apiKey.length - 8) + apiKey.substring(apiKey.length - 4);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Integration Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              API Key
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Endpoint URL
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Connection Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {integrations.map((integration) => (
            <tr key={integration.id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm font-medium text-gray-900">
                  {integration.name}
                </div>
                <div className="text-sm text-gray-500">
                  {integration.category}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <code className="text-sm bg-gray-100 px-2 py-1 rounded font-mono">
                  {maskApiKey(integration.apiKey)}
                </code>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="text-sm text-gray-900 max-w-xs truncate">
                  {integration.endpointUrl}
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <ConnectionStatus 
                  status={integration.status} 
                  error={integration.error} 
                />
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                <button
                  onClick={() => onTest(integration)}
                  className="text-emerald-600 hover:text-emerald-900"
                >
                  Test
                </button>
                <button
                  onClick={() => onEdit(integration)}
                  className="text-blue-600 hover:text-blue-900"
                >
                  Edit
                </button>
                <button
                  onClick={() => onToggleStatus(integration)}
                  className={`${
                    integration.isActive 
                      ? 'text-orange-600 hover:text-orange-900' 
                      : 'text-green-600 hover:text-green-900'
                  }`}
                >
                  {integration.isActive ? 'Disable' : 'Enable'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}