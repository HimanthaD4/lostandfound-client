import React, { useState, useEffect } from 'react';
import { apiRequest } from './App';

const DeviceSetupModal = ({ deviceInfo, onConfirm, onSkip, userEmail }) => {
  const [deviceName, setDeviceName] = useState('');
  const [deviceType, setDeviceType] = useState(deviceInfo.device_type || 'mobile');
  const [exactLocation, setExactLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [locationStatus, setLocationStatus] = useState('idle');
  const [heading, setHeading] = useState(null);
  const [permissionGuide, setPermissionGuide] = useState('');
  const [setupError, setSetupError] = useState('');
  const [deviceOwnershipStatus, setDeviceOwnershipStatus] = useState('checking');
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [locationAttempts, setLocationAttempts] = useState(0);

  useEffect(() => {
    if (deviceInfo.is_mobile) {
      setDeviceName('My Mobile Phone');
    } else {
      setDeviceName('My Computer');
    }
  }, [deviceInfo.is_mobile]);

  useEffect(() => {
    checkDeviceOwnership();
  }, [deviceInfo.device_id]);

  useEffect(() => {
    if (deviceInfo.is_mobile && window.DeviceOrientationEvent) {
      const handleOrientation = (event) => {
        if (event.alpha !== null) {
          setHeading(event.alpha);
        }
      };

      window.addEventListener('deviceorientation', handleOrientation);
      
      return () => {
        window.removeEventListener('deviceorientation', handleOrientation);
      };
    }
  }, [deviceInfo.is_mobile]);

  const checkDeviceOwnership = async () => {
    try {
      const response = await apiRequest(`/check_device_global/${deviceInfo.device_id}`);
      const data = await response.json();
      
      if (data.exists) {
        if (data.owner_email === userEmail) {
          setDeviceOwnershipStatus('owned_by_current_user');
        } else {
          setDeviceOwnershipStatus('owned_by_other_user');
          setSetupError(`This device is already registered to ${data.owner_email}. Each device can only be registered to one account.`);
        }
      } else {
        setDeviceOwnershipStatus('available');
      }
    } catch (err) {
      console.error('Failed to check device ownership:', err);
      setDeviceOwnershipStatus('available');
    }
  };

  const showPermissionGuide = (browser) => {
    const guides = {
      chrome: `
Chrome Mobile Location Access Guide:
1. Tap the lock icon 🔒 in address bar
2. Select "Site settings"
3. Tap "Location"
4. Change to "Allow"
5. Reload the page and try again

For Android:
• Go to Settings > Location > Enable
• Make sure "Google Location Accuracy" is ON
• Open Chrome > Site Settings > Location > Allow
      `,
      firefox: `
Firefox Mobile Location Access:
1. Tap the lock icon in address bar
2. Select "Permissions"
3. Find "Access your location"
4. Change to "Allow"
5. Reload page

Additional Tips:
• Ensure GPS is enabled in device settings
• Try outdoors for better GPS signal
      `,
      safari: `
Safari iOS Location Access:
1. Go to iPhone Settings > Privacy & Security
2. Tap "Location Services"
3. Ensure Location Services is ON
4. Find Safari Websites and select "While Using the App"
5. Return to Safari and reload

For iOS 14+:
• Also check Settings > Safari > Location
      `,
      general: `
General Mobile Location Fix:
1. Clear browser cache and data
2. Restart your browser completely
3. Ensure you're using HTTPS
4. Try different browser (Chrome/Firefox)
5. Check device location settings
6. Move to open area for better GPS
      `
    };
    setPermissionGuide(guides[browser] || guides.general);
  };

  const detectBrowser = () => {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('chrome')) return 'chrome';
    if (userAgent.includes('firefox')) return 'firefox';
    if (userAgent.includes('safari')) return 'safari';
    return 'general';
  };

  const getHighAccuracyLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser.');
      setLocationStatus('error');
      showPermissionGuide(detectBrowser());
      return;
    }

    // Check permissions first
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        if (result.state === 'denied') {
          setLocationError('Location permission is permanently denied. Please enable it in browser settings.');
          setLocationStatus('error');
          showPermissionGuide(detectBrowser());
          return;
        } else if (result.state === 'prompt') {
          console.log('Location permission will be requested...');
        }
      });
    }

    setLocationLoading(true);
    setLocationError('');
    setLocationStatus('loading');
    setExactLocation(null);
    setPermissionGuide('');
    setLocationAttempts(prev => prev + 1);

    const locationOptions = {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 0
    };

    console.log('Requesting high accuracy location...');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('High accuracy location obtained:', position);
        
        const exactLoc = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          altitudeAccuracy: position.coords.altitudeAccuracy,
          heading: position.coords.heading || heading,
          speed: position.coords.speed,
          city: 'High Accuracy GPS',
          country: 'Precise Location',
          timestamp: new Date().toISOString(),
          location_type: 'gps_high_accuracy',
          source: 'browser_geolocation_high_accuracy',
          is_mobile: deviceInfo.is_mobile,
          gps_quality: getGPSQuality(position.coords.accuracy)
        };
        
        setExactLocation(exactLoc);
        setGpsAccuracy(position.coords.accuracy);
        setLocationLoading(false);
        setLocationStatus('success');
      },
      (error) => {
        console.error('High accuracy location error:', error);
        let errorMessage = '';
        let showGuide = true;
        
        switch(error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location access was denied. Please allow location access in your browser settings to continue.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information is unavailable. Check your device location services are enabled and try again.';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out. This might be due to poor GPS signal. Try moving to an open area.';
            showGuide = false;
            break;
          default:
            errorMessage = `Unable to get location: ${error.message}. Please try again.`;
            break;
        }
        
        setLocationError(errorMessage);
        setLocationLoading(false);
        setLocationStatus('error');
        
        if (showGuide && locationAttempts >= 2) {
          showPermissionGuide(detectBrowser());
        }
      },
      locationOptions
    );
  };

  const getGPSQuality = (accuracy) => {
    if (accuracy < 10) return 'excellent';
    if (accuracy < 25) return 'good';
    if (accuracy < 50) return 'moderate';
    return 'poor';
  };

  const handleConfirm = async () => {
    if (!exactLocation) {
      alert('Please get your high accuracy location first to register this device properly.');
      return;
    }

    const deviceData = {
      device_id: deviceInfo.device_id,
      device_type: deviceType,
      device_name: deviceName,
      ip_address: deviceInfo.ip_address,
      user_agent: deviceInfo.user_agent,
      is_mobile: deviceInfo.is_mobile,
      location: exactLocation
    };

    onConfirm(deviceData);
  };

  const getLocationText = () => {
    switch(locationStatus) {
      case 'loading':
        return 'Acquiring high accuracy GPS location...';
      case 'success':
        return `High Accuracy Location Found! (Accuracy: ±${Math.round(gpsAccuracy)}m)`;
      case 'error':
        return 'Unable to get precise location';
      default:
        return 'Click below to get high accuracy GPS location for precise tracking';
    }
  };

  const openAppSettings = () => {
    if (deviceInfo.is_mobile) {
      alert('Please go to: Settings > Location > Enable Location Services and ensure GPS is enabled.');
    } else {
      alert('Please check your browser location settings and ensure location access is allowed for this site.');
    }
  };

  const renderOwnershipStatus = () => {
    switch(deviceOwnershipStatus) {
      case 'checking':
        return <div className="ownership-status checking">Checking device registration status...</div>;
      case 'owned_by_current_user':
        return <div className="ownership-status owned">✅ This device is already registered to your account</div>;
      case 'owned_by_other_user':
        return (
          <div className="ownership-status owned-by-other">
            ❌ This device is already registered to another account
            {deviceInfo.current_owner && (
              <div className="owner-info">
                Current owner: <strong>{deviceInfo.current_owner}</strong>
              </div>
            )}
          </div>
        );
      case 'available':
        return <div className="ownership-status available">✅ This device is available for registration</div>;
      default:
        return null;
    }
  };

  const isSetupAllowed = () => {
    return deviceOwnershipStatus === 'available' || deviceOwnershipStatus === 'owned_by_current_user';
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Add New Device</h2>
          <p>We need your precise GPS location for accurate real-time tracking.</p>
          <p className="device-uniqueness-note">
            <strong>Note:</strong> Each device can only be registered to one account for security.
          </p>
        </div>
        
        <div className="device-ownership-section">
          <h4>Device Registration Status:</h4>
          {renderOwnershipStatus()}
        </div>

        {setupError && (
          <div className="location-error">
            <div className="error-message">
              {setupError}
            </div>
          </div>
        )}
        
        <div className="device-details">
          <div className="device-info-card">
            <h4>Device Information:</h4>
            <div className="info-grid">
              <div className="info-item">
                <strong>Device Type:</strong> 
                <span className="device-badge">
                  {deviceInfo.is_mobile ? '📱 Mobile' : '💻 Computer'}
                </span>
              </div>
              <div className="info-item">
                <strong>IP Address:</strong> {deviceInfo.ip_address}
              </div>
              <div className="info-item">
                <strong>Device ID:</strong> 
                <span style={{fontSize: '12px', color: '#666'}}>{deviceInfo.device_id}</span>
              </div>
            </div>
          </div>

          {isSetupAllowed() && (
            <div className="exact-location-section">
              <h4>High Accuracy GPS Location:</h4>
              <div className={`location-status location-status-${locationStatus}`}>
                {getLocationText()}
              </div>

              {locationStatus === 'loading' && (
                <div className="location-loading">
                  <div className="spinner"></div>
                  <div>
                    <strong>Acquiring precise GPS coordinates...</strong>
                    <p>This may take 10-30 seconds for best accuracy</p>
                    <p>Ensure you're in an open area for better GPS signal</p>
                  </div>
                </div>
              )}

              {locationStatus === 'success' && exactLocation && (
                <div className="location-success-details">
                  <div className="success-header">
                    <strong>🎯 High Accuracy GPS Location Found!</strong>
                  </div>
                  <div className="location-coordinates">
                    <div className="coordinate-item">
                      <strong>Latitude:</strong> {exactLocation.latitude.toFixed(6)}
                    </div>
                    <div className="coordinate-item">
                      <strong>Longitude:</strong> {exactLocation.longitude.toFixed(6)}
                    </div>
                    <div className="coordinate-item">
                      <strong>Accuracy:</strong> ±{exactLocation.accuracy.toFixed(1)} meters
                    </div>
                    <div className="coordinate-item">
                      <strong>GPS Quality:</strong> 
                      <span className={`gps-quality ${exactLocation.gps_quality}`}>
                        {exactLocation.gps_quality.toUpperCase()}
                      </span>
                    </div>
                    {exactLocation.heading && (
                      <div className="coordinate-item">
                        <strong>Heading:</strong> {exactLocation.heading.toFixed(1)}°
                      </div>
                    )}
                    {exactLocation.speed > 0 && (
                      <div className="coordinate-item">
                        <strong>Speed:</strong> {(exactLocation.speed * 3.6).toFixed(1)} km/h
                      </div>
                    )}
                  </div>
                  <div className="location-tip">
                    <small>✅ This high accuracy location will enable precise real-time tracking</small>
                  </div>
                </div>
              )}

              {locationStatus === 'error' && (
                <div className="location-error">
                  <div className="error-message">
                    {locationError}
                  </div>
                  {permissionGuide && (
                    <div className="permission-guide">
                      <h5>📋 Setup Instructions:</h5>
                      <pre>{permissionGuide}</pre>
                    </div>
                  )}
                  <div className="location-fallback-options">
                    <h5>Quick Solutions:</h5>
                    <div className="solution-buttons">
                      <button 
                        className="btn btn-small btn-retry"
                        onClick={getHighAccuracyLocation}
                        disabled={locationLoading}
                      >
                        🔄 Retry Location
                      </button>
                      <button 
                        className="btn btn-small"
                        onClick={() => window.location.reload()}
                      >
                        🔃 Reload Page
                      </button>
                      <button 
                        className="btn btn-small"
                        onClick={openAppSettings}
                      >
                        ⚙️ Location Settings
                      </button>
                    </div>
                    <p className="browser-suggestion">
                      <strong>Recommended:</strong> Try using <strong>Chrome Mobile</strong> or <strong>Firefox Mobile</strong> for best results
                    </p>
                  </div>
                </div>
              )}

              {(locationStatus === 'idle' || locationStatus === 'error') && (
                <div className="location-action">
                  <button 
                    className="btn btn-primary get-location-btn"
                    onClick={getHighAccuracyLocation}
                    disabled={locationLoading}
                  >
                    {locationLoading ? '🛰️ Getting Location...' : '🎯 Get High Accuracy GPS Location'}
                  </button>
                  {deviceInfo.is_mobile && (
                    <div className="mobile-tips">
                      <p><strong>Mobile Tips:</strong></p>
                      <ul>
                        <li>Enable Location/GPS in device settings</li>
                        <li>Allow location permission when prompted</li>
                        <li>Move to an open area for better GPS signal</li>
                        <li>Ensure mobile data or WiFi is connected</li>
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {isSetupAllowed() && (
          <>
            <div className="form-group">
              <label>Device Name:</label>
              <input
                type="text"
                className="form-input"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Enter a name for this device"
              />
            </div>

            <div className="form-group">
              <label>Device Type:</label>
              <select 
                className="form-input"
                value={deviceType}
                onChange={(e) => setDeviceType(e.target.value)}
              >
                <option value="mobile">Mobile Phone</option>
                <option value="laptop">Laptop</option>
                <option value="desktop">Desktop</option>
                <option value="tablet">Tablet</option>
                <option value="other">Other</option>
              </select>
            </div>
          </>
        )}

        <div className="modal-actions">
          {isSetupAllowed() ? (
            <>
              <button 
                className="btn btn-primary confirm-btn" 
                onClick={handleConfirm}
                disabled={locationStatus !== 'success' || deviceOwnershipStatus === 'owned_by_other_user'}
              >
                {deviceOwnershipStatus === 'owned_by_current_user' ? 'Update Device Location' : 'Add Device with Precise Location'}
              </button>
              <button className="btn btn-secondary" onClick={onSkip}>
                Skip for Now
              </button>
            </>
          ) : (
            <button className="btn btn-secondary" onClick={onSkip}>
              Continue to Dashboard
            </button>
          )}
        </div>

        <div className="privacy-note">
          <small>
            🔒 Your location data is encrypted and only used for device tracking. 
            You can update or remove device locations at any time.
            <br />
            <strong>Each device can only be registered to one account for security reasons.</strong>
          </small>
        </div>
      </div>
    </div>
  );
};

export default DeviceSetupModal;