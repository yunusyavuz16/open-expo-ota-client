import * as ExpoUpdates from 'expo-updates';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  SelfHostedUpdateConfig,
  UpdateEvent,
  UpdateEventListener,
  ReleaseChannel
} from './types';

// Import semver for targetVersion checking
const semver = require('semver');

/**
 * Main class for handling OTA updates from the OpenExpoOTA server
 */
export default class SelfHostedUpdates {
  private config: Required<Omit<SelfHostedUpdateConfig, 'appKey'>> & { appKey?: string };
  private listeners: UpdateEventListener[] = [];
  private isChecking = false;
  private lastCheck: Date | null = null;

  constructor(config: SelfHostedUpdateConfig) {
    // Set defaults for optional config
    this.config = {
      backendUrl: config.backendUrl || 'http://localhost:3000/api',
      appSlug: config.appSlug,
      appKey: config.appKey, // Now optional
      channel: config.channel || ReleaseChannel.PRODUCTION,
      runtimeVersion: config.runtimeVersion || Constants.expoConfig?.version || '1.0.0',
      checkOnLaunch: config.checkOnLaunch !== false,
      autoInstall: config.autoInstall !== false,
      debug: config.debug || false
    };

    if (!this.config.appSlug) {
      throw new Error('appSlug is required for OpenExpoOTA client');
    }

    // Configure expo-updates with the correct URL and headers at startup
    this.configureExpoUpdates();

    // Check for updates on launch if enabled
    if (this.config.checkOnLaunch) {
      setTimeout(() => {
        this.checkForUpdates();
      }, 0);
    }

    this.log('OpenExpoOTA client initialized with app slug:', this.config.appSlug);
  }

  /**
   * Get the app binary version from Constants
   */
  private getAppBinaryVersion(): string {
    // Try to get the app version (binary version) from Constants
    return (
      Constants.expoConfig?.version ||
      // Legacy (SDK <= 48) manifest. Still read at runtime for older hosts; the current
      // expo-constants types model this as EmbeddedManifest, which has no `version`.
      (Constants.manifest as { version?: string } | null)?.version ||
      '1.0.0'
    );
  }

  /**
   * Check if the current app version is compatible with the update's targetVersion
   */
  private isTargetVersionCompatible(targetVersion: string): boolean {
    if (!targetVersion) {
      // If no targetVersion specified, update is compatible with all versions
      return true;
    }

    const currentAppVersion = this.getAppBinaryVersion();
    this.log(`Checking targetVersion compatibility: current app version ${currentAppVersion} vs targetVersion ${targetVersion}`);

    try {
      // Use semver to check if current version satisfies the target version range
      const isCompatible = semver.satisfies(currentAppVersion, targetVersion);
      this.log(`TargetVersion compatibility result: ${isCompatible}`);
      return isCompatible;
    } catch (error) {
      this.log('Error checking targetVersion compatibility:', error);
      // If semver parsing fails, assume incompatible for safety
      return false;
    }
  }

  /**
   * Configure expo-updates to use our custom URL and headers
   * This must be called at app startup for the configuration to take effect
   */
  private configureExpoUpdates(): void {
    try {
      // Get the device platform
      const platformStr = Platform.OS === 'ios' ? 'ios' : 'android';
      const appVersion = this.getAppBinaryVersion();

      // Build the correct manifest URL that expo-updates should use
      const manifestUrl = `${this.config.backendUrl}/manifest/${this.config.appSlug}?` +
        `channel=${this.config.channel}&` +
        `runtimeVersion=${encodeURIComponent(this.config.runtimeVersion)}&` +
        `appVersion=${encodeURIComponent(appVersion)}&` +
        `platform=${platformStr}`;

      this.log('Configuring expo-updates with URL:', manifestUrl);

      // Configure expo-updates to use our custom URL and headers
      if (ExpoUpdates && typeof (ExpoUpdates as any).setUpdateURLAndRequestHeadersOverride === 'function') {
        const requestHeaders: Record<string, string> = {};

        // Add app key if provided (backward compatibility)
        if (this.config.appKey) {
          requestHeaders['X-App-Key'] = this.config.appKey;
        }

        // Override the expo-updates configuration to use our backend
        (ExpoUpdates as any).setUpdateURLAndRequestHeadersOverride({
          updateUrl: manifestUrl,
          requestHeaders
        });

        this.log('expo-updates configured successfully with custom URL and headers');
      } else {
        this.log('Warning: setUpdateURLAndRequestHeadersOverride not available - updates may use default configuration');
      }
    } catch (error) {
      this.log('Error configuring expo-updates:', error);
    }
  }

  /**
   * Check for updates from the server
   */
  async checkForUpdates(): Promise<void> {
    if (this.isChecking) {
      this.log('Already checking for updates, skipping');
      return;
    }

    try {
      this.isChecking = true;
      this.emitEvent({ type: 'checking' });
      this.log('Checking for updates...');
      this.log('Current runtime version:', this.config.runtimeVersion);

      // Get the device platform and app version
      const platformStr = Platform.OS === 'ios' ? 'ios' : 'android';
      const appVersion = this.getAppBinaryVersion();

      this.log('Current app binary version:', appVersion);

      // Build the API URL with query parameters including appVersion for targetVersion checking
      const url = `${this.config.backendUrl}/manifest/${this.config.appSlug}?` +
        `channel=${this.config.channel}&` +
        `runtimeVersion=${encodeURIComponent(this.config.runtimeVersion)}&` +
        `appVersion=${encodeURIComponent(appVersion)}&` +
        `platform=${platformStr}`;

      this.log('Fetching from URL:', url);

      // Fetch from the API
      const headers: Record<string, string> = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      };

      // Add app key if provided (backward compatibility)
      if (this.config.appKey) {
        headers['X-App-Key'] = this.config.appKey;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        // Handle different error cases
        if (response.status === 404) {
          this.log('No updates found for this app and version');
          this.emitEvent({ type: 'updateNotAvailable' });
          return;
        }

        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const manifest = await response.json();
      this.lastCheck = new Date();

      if (manifest && manifest.version) {
        // Log more details about the manifest
        this.log('Update available:', manifest);
        this.log(`Found version ${manifest.version} - current runtime version is ${this.config.runtimeVersion}`);

        // Check targetVersion compatibility on client side as additional verification
        const targetVersion = manifest.targetVersion;
        if (targetVersion && !this.isTargetVersionCompatible(targetVersion)) {
          this.log(`Update rejected: targetVersion ${targetVersion} not compatible with current app version ${appVersion}`);
          this.emitEvent({ type: 'updateNotAvailable' });
          return;
        }

        // Quick version comparison for debugging
        const isNewer = this.compareVersions(manifest.version, this.config.runtimeVersion);
        this.log(`Is ${manifest.version} newer than ${this.config.runtimeVersion}? ${isNewer ? 'Yes' : 'No'}`);

        this.emitEvent({
          type: 'updateAvailable',
          manifest
        });

        if (this.config.autoInstall) {
          await this.downloadUpdate(manifest);
        }
      } else {
        this.log('No update available or invalid manifest');
        this.emitEvent({ type: 'updateNotAvailable' });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('Error checking for updates:', errorMessage);
      this.emitEvent({
        type: 'error',
        error: error instanceof Error ? error : new Error(String(error))
      });
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Compare two version strings, returning true if v1 is newer than v2
   */
  private compareVersions(v1: string, v2: string): boolean {
    const v1Parts = v1.split('.').map(Number);
    const v2Parts = v2.split('.').map(Number);

    this.log(`Comparing versions: ${v1} vs ${v2}`);

    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;

      if (v1Part > v2Part) return true;
      if (v1Part < v2Part) return false;
    }

    return false; // Versions are equal
  }

  /**
   * Download the latest update
   */
  async downloadUpdate(manifest?: any): Promise<void> {
    try {
      this.log('Downloading update...');
      this.emitEvent({ type: 'downloadStarted' });

      // Use expo-updates to fetch the update (configuration was set at startup)
      if (ExpoUpdates && typeof ExpoUpdates.fetchUpdateAsync === 'function') {
        this.log('Calling ExpoUpdates.fetchUpdateAsync()...');
        const result = await ExpoUpdates.fetchUpdateAsync();
        this.log('ExpoUpdates.fetchUpdateAsync() result:', result);

        this.log('Update downloaded successfully');
        this.emitEvent({ type: 'downloadFinished' });

        // If auto install is enabled, reload the app
        if (this.config.autoInstall) {
          this.applyUpdate();
        }
      } else {
        throw new Error('ExpoUpdates.fetchUpdateAsync not available');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('Error downloading update:', errorMessage);
      this.log('Full error object:', error);
      this.emitEvent({
        type: 'error',
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
  }

  /**
   * Apply a downloaded update
   */
  applyUpdate(): void {
    try {
      this.log('Applying update...');

      // Use expo-updates to reload the app if available
      if (ExpoUpdates && typeof ExpoUpdates.reloadAsync === 'function') {
        ExpoUpdates.reloadAsync();
        this.emitEvent({ type: 'installed' });
      } else {
        throw new Error('ExpoUpdates.reloadAsync not available');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('Error applying update:', errorMessage);
      this.emitEvent({
        type: 'error',
        error: error instanceof Error ? error : new Error(String(error))
      });
    }
  }

  /**
   * Add an event listener
   */
  addEventListener(listener: UpdateEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Emit an event to all listeners
   */
  private emitEvent(event: UpdateEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in update event listener:', error);
      }
    });
  }

  /**
   * Log debug information if debug is enabled
   */
  private log(...args: any[]): void {
    if (this.config.debug) {
      console.log('[OpenExpoOTA]', ...args);
    }
  }
}