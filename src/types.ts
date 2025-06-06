export enum ReleaseChannel {
  PRODUCTION = 'production',
  STAGING = 'staging',
  DEVELOPMENT = 'development'
}

export enum Platform {
  IOS = 'ios',
  ANDROID = 'android',
  WEB = 'web'
}

export interface SelfHostedUpdateConfig {
  /**
   * The base URL of the OpenExpoOTA server API
   * @default http://localhost:3000/api
   */
  backendUrl?: string;

  /**
   * The app slug that identifies your app on the server
   */
  appSlug: string;

  /**
   * The app authentication key for accessing updates
   * @deprecated Not required for public endpoints
   */
  appKey?: string;

  /**
   * The update release channel to use
   * @default ReleaseChannel.PRODUCTION
   */
  channel?: ReleaseChannel;

  /**
   * The runtime version to use for update compatibility
   * By default, uses the app's current version
   */
  runtimeVersion?: string;

  /**
   * Check for updates on app start
   * @default true
   */
  checkOnLaunch?: boolean;

  /**
   * Automatically download and install updates when available
   * @default true
   */
  autoInstall?: boolean;

  /**
   * Log debug information to the console
   * @default false
   */
  debug?: boolean;
}

export interface CheckingEvent {
  type: 'checking';
}

export interface UpdateAvailableEvent {
  type: 'updateAvailable';
  manifest: Record<string, any>;
}

export interface UpdateNotAvailableEvent {
  type: 'updateNotAvailable';
}

export interface UpdateErrorEvent {
  type: 'error';
  error: Error;
}

export interface UpdateDownloadEvent {
  type: 'downloadStarted' | 'downloadProgress' | 'downloadFinished';
  progress?: number;
}

export interface UpdateInstalledEvent {
  type: 'installed';
}

export interface UpdateReadyEvent {
  type: 'updateReady';
  manifest: Record<string, any>;
}

export type UpdateEvent =
  | CheckingEvent
  | UpdateAvailableEvent
  | UpdateNotAvailableEvent
  | UpdateErrorEvent
  | UpdateDownloadEvent
  | UpdateInstalledEvent
  | UpdateReadyEvent;

export type UpdateEventListener = (event: UpdateEvent) => void;