'use client';

import { useState, useEffect } from 'react';
import SettingsIntegrationsModule from '../../components/settings-integrations/SettingsIntegrationsModule';

export default function SettingsIntegrationsPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return <SettingsIntegrationsModule />;
}