'use client';

import { useEffect, useState } from 'react';

function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      setShowBanner(true);
      setTimeout(() => setShowBanner(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowBanner(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!showBanner) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0,
      zIndex: 50, padding: '10px 16px', textAlign: 'center',
      fontFamily: 'var(--font-mono), monospace', fontSize: 12.5, fontWeight: 600, color: 'var(--paper-raised)',
      background: isOnline ? 'var(--accent)' : 'var(--ochre-deep)',
      transition: 'background 0.3s ease-out',
    }}>
      {isOnline ? 'Connection restored' : 'You are offline - some features may not work'}
    </div>
  );
}

export default NetworkStatus;
