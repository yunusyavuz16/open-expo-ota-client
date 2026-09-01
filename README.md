# OpenExpoOTA Client

React Native client library for OpenExpoOTA - A self-hosted OTA update system for Expo apps.

## Project components

Part of [OpenExpoOTA](https://github.com/yunusyavuz16/open-expo-ota-backend), a self-hosted alternative to EAS Update:

- **[open-expo-ota-backend](https://github.com/yunusyavuz16/open-expo-ota-backend)** — the update server: manifests, storage, auth
- **[open-expo-ota-cli](https://github.com/yunusyavuz16/open-expo-ota-cli)** — publish updates from your machine or CI
- **[open-expo-ota-client](https://github.com/yunusyavuz16/open-expo-ota-client)** — the Expo library your app installs to fetch updates *(this repo)*

## How It Works

The OpenExpoOTA client works as a layer on top of Expo's built-in `expo-updates` package. Here's the flow:

1. **Check for Updates**: Your app queries your OpenExpoOTA backend server to see if a new update is available
2. **Download Update**: If an update is found, the client uses `expo-updates.fetchUpdateAsync()` to download the new bundle
3. **Apply Update**: The client uses `expo-updates.reloadAsync()` to restart the app with the new update

The key advantage is that you control the server, the update distribution, and can customize the entire update experience.

## Installation

```bash
npm install open-expo-ota expo-updates
```

The npm package is named `open-expo-ota` while this repository is named
`open-expo-ota-client`. Install and import the package name, not the repository name.

### Upgrading to 0.1.21

0.1.21 pulls in `expo-application`, a native module, to read the installed
binary's version. `expo-constants` deprecated `nativeAppVersion` in favour of it,
and the value it replaces — `Constants.expoConfig.version` — is rewritten by
whichever OTA manifest is running, which made `--target-version` ranges compare
against the update rather than the binary.

Because a native module is involved, **rebuild the app after upgrading**; an
over-the-air update cannot deliver this change. `applyUpdate()` also became
`async` in this release, so `await` it if you need its failures.

## Quick Setup

### 1. Initialize Your App with the CLI

First, set up your app in the OpenExpoOTA backend:

```bash
# In your Expo project directory
npx openexpoota-cli login
npx openexpoota-cli init
```

This will create an `ota.config.json` file with your app configuration.

### 2. Configure app.json

Update your `app.json` to work with OpenExpoOTA:

```json
{
  "expo": {
    "name": "your-app",
    "slug": "your-app-slug-from-ota-config",
    "version": "1.0.0",
    "runtimeVersion": "1.0.0",
    "updates": {
      "url": "http://your-backend-url.com/api/manifest/your-app-slug-from-ota-config?channel=production&runtimeVersion=1.0.0",
      "enabled": false,
      "checkAutomatically": "NEVER",
      "fallbackToCacheTimeout": 0,
      "disableAntiBrickingMeasures": true
    },
    "ios": {
      "runtimeVersion": "1.0.0"
    },
    "android": {
      "runtimeVersion": "1.0.0"
    }
  }
}
```

**Important Notes:**
- The `slug` must match the slug from your `ota.config.json`
- Set `updates.enabled: false` to disable Expo's automatic checking
- Set `checkAutomatically: "NEVER"` to prevent conflicts
- Add `disableAntiBrickingMeasures: true` for development
- Use the same `runtimeVersion` across all platforms

### 3. Add the Provider to Your App

```jsx
import React from 'react';
import { UpdatesProvider } from 'open-expo-ota';
import { ReleaseChannel } from 'open-expo-ota';

export default function App() {
  return (
    <UpdatesProvider
      config={{
        backendUrl: 'http://your-backend-url.com/api',
        appSlug: 'your-app-slug-from-ota-config',
        channel: ReleaseChannel.PRODUCTION,
        runtimeVersion: '1.0.0',
        checkOnLaunch: true,
        autoInstall: false, // Set to true for automatic updates
        debug: true // Enable for development
      }}
    >
      <YourMainApp />
    </UpdatesProvider>
  );
}
```

### 4. Use Updates in Components

```jsx
import React from 'react';
import { View, Text, Button } from 'react-native';
import { useSelfHostedUpdates } from 'open-expo-ota';

function UpdateScreen() {
  const {
    isChecking,
    isUpdateAvailable,
    updateInfo,
    checkForUpdates,
    downloadUpdate,
    applyUpdate,
    error,
    progress
  } = useSelfHostedUpdates();

  if (error) {
    return <Text>Error: {error.message}</Text>;
  }

  if (isChecking) {
    return <Text>Checking for updates...</Text>;
  }

  if (isUpdateAvailable) {
    return (
      <View>
        <Text>Update Available: {updateInfo?.version}</Text>
        {progress ? (
          <Text>Downloading: {Math.round(progress * 100)}%</Text>
        ) : (
          <Button
            title="Download & Install"
            onPress={async () => {
              await downloadUpdate();
              applyUpdate();
            }}
          />
        )}
      </View>
    );
  }

  return (
    <View>
      <Text>Your app is up to date!</Text>
      <Button title="Check for Updates" onPress={checkForUpdates} />
    </View>
  );
}
```

## Configuration Options

### UpdatesProvider Config

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `backendUrl` | string | Yes | - | URL of your OpenExpoOTA backend API |
| `appSlug` | string | Yes | - | App identifier (from `ota.config.json`) |
| `channel` | ReleaseChannel | No | PRODUCTION | Release channel to use |
| `runtimeVersion` | string | No | From Constants | Runtime version for compatibility |
| `checkOnLaunch` | boolean | No | true | Check for updates when app starts |
| `autoInstall` | boolean | No | false | Automatically download and install updates |
| `debug` | boolean | No | false | Enable debug logging |

### Release Channels

```typescript
enum ReleaseChannel {
  PRODUCTION = 'production',
  STAGING = 'staging',
  DEVELOPMENT = 'development'
}
```

## Advanced Features

### Custom Update Flow

```jsx
function AdvancedUpdateFlow() {
  const updates = useSelfHostedUpdates();
  const [updateState, setUpdateState] = useState('idle');

  const handleUpdate = async () => {
    try {
      setUpdateState('checking');
      await updates.checkForUpdates();

      if (updates.isUpdateAvailable) {
        setUpdateState('downloading');
        await updates.downloadUpdate();

        setUpdateState('installing');
        updates.applyUpdate(); // This restarts the app
      }
    } catch (error) {
      setUpdateState('error');
      console.error('Update failed:', error);
    }
  };

  return (
    <View>
      <Text>Update State: {updateState}</Text>
      <Button title="Check & Update" onPress={handleUpdate} />
    </View>
  );
}
```

### Progress Tracking

```jsx
function UpdateWithProgress() {
  const { progress, downloadUpdate, isUpdateAvailable } = useSelfHostedUpdates();

  return (
    <View>
      {isUpdateAvailable && (
        <View>
          <Button title="Download Update" onPress={downloadUpdate} />
          {progress && (
            <View style={{ marginTop: 10 }}>
              <Text>Progress: {Math.round(progress * 100)}%</Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${progress * 100}%` }
                  ]}
                />
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
```

### Event Listening

```jsx
import SelfHostedUpdates from 'open-expo-ota';

// Direct usage of the updates class
const updates = new SelfHostedUpdates({
  backendUrl: 'http://your-backend.com/api',
  appSlug: 'your-app-slug',
  channel: ReleaseChannel.PRODUCTION,
  debug: true
});

// Listen to all update events
updates.addEventListener((event) => {
  switch (event.type) {
    case 'checking':
      console.log('Checking for updates...');
      break;
    case 'updateAvailable':
      console.log('Update available:', event.manifest);
      break;
    case 'updateNotAvailable':
      console.log('No update available');
      break;
    case 'downloadStarted':
      console.log('Download started');
      break;
    case 'downloadFinished':
      console.log('Download finished');
      break;
    case 'installed':
      console.log('Update installed');
      break;
    case 'error':
      console.error('Update error:', event.error);
      break;
  }
});
```

## Publishing Updates

Use the OpenExpoOTA CLI to publish updates:

```bash
# Publish to development channel
ota publish --channel development

# Publish to production with specific version
ota publish --channel production --version 1.2.0

# Publish with runtime version compatibility
ota publish --channel production --target-version-range ">=1.0.0 <2.0.0"
```

## Runtime Version Compatibility

The client automatically handles runtime version compatibility:

- **Exact Match**: Update with `runtimeVersion: "1.0.0"` only applies to apps with runtime version `1.0.0`
- **Range Match**: Update with `targetVersionRange: ">=1.0.0 <2.0.0"` applies to compatible app versions
- **Platform Specific**: Updates can target specific platforms (iOS, Android)

## App Configuration Requirements

### Required app.json Settings

```json
{
  "expo": {
    "slug": "must-match-ota-config-slug",
    "runtimeVersion": "1.0.0",
    "updates": {
      "url": "http://backend.com/api/manifest/your-slug?channel=production&runtimeVersion=1.0.0",
      "enabled": false,
      "checkAutomatically": "NEVER",
      "disableAntiBrickingMeasures": true
    },
    "ios": {
      "runtimeVersion": "1.0.0"
    },
    "android": {
      "runtimeVersion": "1.0.0"
    }
  }
}
```

### Required ota.config.json

This file is created by `ota init`:

```json
{
  "appId": 123,
  "slug": "your-app-slug",
  "backendUrl": "http://your-backend.com/api"
}
```

## Building for Production

### Development Builds

For development and testing:

```bash
npx expo run:ios --configuration Release
npx expo run:android --configuration Release
```

### Production Builds

For production releases:

```bash
# Build for app stores
eas build --platform all --profile production

# Or local builds
npx expo run:ios --configuration Release
npx expo run:android --configuration Release
```

## Troubleshooting

### Common Issues

#### 1. "Cannot find module 'expo-updates'"

**Solution**: Install expo-updates
```bash
npm install expo-updates
```

#### 2. Updates not working in development

**Problem**: Expo Go doesn't support custom updates
**Solution**: Use development builds (`expo run:ios` / `expo run:android`)

#### 3. Runtime version mismatch

**Problem**: App and update have incompatible runtime versions
**Solution**: Ensure consistent runtime versions in:
- `app.json` → `runtimeVersion`
- `app.json` → `ios.runtimeVersion`
- `app.json` → `android.runtimeVersion`
- Client config → `runtimeVersion`

#### 4. 400 errors when checking for updates

**Problem**: Usually missing or incorrect query parameters
**Solution**: Check that app.json `updates.url` includes correct parameters:
```
http://backend.com/api/manifest/your-slug?channel=production&runtimeVersion=1.0.0
```

#### 5. Download fails with fetch errors

**Problem**: expo-updates using wrong configuration
**Solution**: Ensure:
- `updates.enabled: false` in app.json
- `checkAutomatically: "NEVER"` in app.json
- Correct slug in app.json matches ota.config.json

### Debug Mode

Enable debug logging to troubleshoot:

```jsx
<UpdatesProvider
  config={{
    // ... other config
    debug: true
  }}
>
```

This will log detailed information about:
- API requests and responses
- Runtime version comparisons
- Update availability decisions
- Download progress
- Error details

### Network Requirements

- Your backend API must be accessible from the device
- For iOS simulator/Android emulator: use `http://localhost:3000`
- For physical devices: use your computer's IP address `http://192.168.1.100:3000`
- For production: use HTTPS `https://your-domain.com`

## Security Considerations

- The system uses app-level authentication (no user credentials on device)
- App slugs and channels provide access control
- Use HTTPS in production
- Runtime version compatibility prevents incompatible updates
- Updates are cryptographically verified by expo-updates

## Compatibility

- **Expo SDK**: 49+ (with expo-updates)
- **React Native**: 0.72+
- **Platforms**: iOS, Android
- **Build Types**: Development builds, Production builds (not Expo Go)

## License

MIT

## Important Notes

⚠️ **App Restart Required**: When the OpenExpoOTA client configures `expo-updates` at startup with custom URLs, the configuration only takes effect on the **next app launch**. If you change your configuration (like app slug, channel, or backend URL), users will need to completely close and reopen the app.

⚠️ **Release Builds Only**: Most update functionality only works in release builds. Development builds using Expo Go will not fully support OTA updates.

⚠️ **Network Requirements**: Update checking and downloading requires an active internet connection.
