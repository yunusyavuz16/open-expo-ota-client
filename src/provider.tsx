import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import SelfHostedUpdates from './updates';
import { ReleaseChannel, SelfHostedUpdateConfig, UpdateEvent } from './types';

// Context value type
export interface UpdatesContextValue {
  isChecking: boolean;
  isUpdateAvailable: boolean;
  updateInfo: any | null;
  error: Error | null;
  progress: number | undefined;
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  applyUpdate: () => void;
  checkOnResume: boolean;
  setCheckOnResume: (check: boolean) => void;
  lastUpdateCheck: Date | null;
}

// Create context with default values
const UpdatesContext = createContext<UpdatesContextValue | undefined>(undefined);

// Provider props
interface UpdatesProviderProps {
  children: ReactNode;
  config: {
    backendUrl: string;
    appSlug: string;
    appKey: string;
    channel?: ReleaseChannel;
    checkInterval?: number;
    updateMode?: 'auto' | 'manual';
  };
}

// Convert provider config to SelfHostedUpdateConfig
const convertConfig = (config: UpdatesProviderProps['config']): SelfHostedUpdateConfig => {
  return {
    backendUrl: config.backendUrl,
    appSlug: config.appSlug,
    appKey: config.appKey,
    channel: config.channel,
    autoInstall: config.updateMode === 'auto',
    checkOnLaunch: true,
  };
};

// Provider component
export const UpdatesProvider: React.FC<UpdatesProviderProps> = ({ children, config }) => {
  const [isChecking, setIsChecking] = useState(false);
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [checkOnResume, setCheckOnResume] = useState(true);
  const [lastUpdateCheck, setLastUpdateCheck] = useState<Date | null>(null);
  const [updates] = useState(() => new SelfHostedUpdates(convertConfig(config)));

  // Set up event listener
  useEffect(() => {
    const removeListener = updates.addEventListener((event: UpdateEvent) => {
      switch (event.type) {
        case 'checking':
          setIsChecking(true);
          setError(null);
          break;

        case 'updateAvailable':
          setIsChecking(false);
          setIsUpdateAvailable(true);
          setUpdateInfo(event.manifest);
          setLastUpdateCheck(new Date());
          break;

        case 'updateNotAvailable':
          setIsChecking(false);
          setIsUpdateAvailable(false);
          setLastUpdateCheck(new Date());
          break;

        case 'error':
          setIsChecking(false);
          setError(event.error);
          break;

        case 'downloadStarted':
          setProgress(0);
          break;

        case 'downloadProgress':
          if (event.progress !== undefined) {
            setProgress(event.progress);
          }
          break;

        case 'downloadFinished':
          setProgress(1);
          break;

        case 'installed':
          setIsUpdateAvailable(false);
          setUpdateInfo(null);
          break;
      }
    });

    // Check for updates at the specified interval
    let intervalId: ReturnType<typeof setInterval> | undefined;

    if (config.checkInterval) {
      intervalId = setInterval(() => {
        checkForUpdates();
      }, config.checkInterval);
    }

    return () => {
      removeListener();
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [config.checkInterval]);

  // Check for updates
  const checkForUpdates = async (): Promise<void> => {
    await updates.checkForUpdates();
  };

  // Download the available update
  const downloadUpdate = async (): Promise<void> => {
    await updates.downloadUpdate();
  };

  // Apply the downloaded update
  const applyUpdate = (): void => {
    updates.applyUpdate();
  };

  // Context value
  const value: UpdatesContextValue = {
    isChecking,
    isUpdateAvailable,
    updateInfo,
    error,
    progress,
    checkForUpdates,
    downloadUpdate,
    applyUpdate,
    checkOnResume,
    setCheckOnResume,
    lastUpdateCheck,
  };

  return (
    <UpdatesContext.Provider value={value}>
      {children}
    </UpdatesContext.Provider>
  );
};

// Custom hook to use updates context
export const useSelfHostedUpdates = (): UpdatesContextValue => {
  const context = useContext(UpdatesContext);
  if (context === undefined) {
    throw new Error('useSelfHostedUpdates must be used within an UpdatesProvider');
  }
  return context;
};