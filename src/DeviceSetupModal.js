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
        1. Tap the lock icon in address bar
        2. Select "Site settings"
        3. Tap "Location"
        4. Change to "Allow"
        5. Reload the page and try again
      `,
      firefox: `
        Firefox Mobile Location Access:
        1. Tap the lock icon in address bar
        2. Select "Permissions"
        3. Find "Access your location"
        4. Change to "Allow"
        5. Reload page
      `,
      safari: `
        Safari iOS Location Access:
        1. Go to iPhone Settings
        2. Scroll down to Safari
        3. Tap "Location"
        4. Select "Allow"
        5. Return and reload
      `,
      general: `
        General Mobile Location Fix:
        1. Clear browser cache
        2. Restart browser
        3. Use HTTPS if possible
        4. Try different browser
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

  const getExactLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser.');
      setLocationStatus('error');
      showPermissionGuide(detectBrowser());
      return;
    }

    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        if (result.state === 'denied') {
          setLocationError('Location permission is blocked. Please enable it in browser settings.');
          setLocationStatus('error');
          showPermissionGuide(detectBrowser());
          return;
        }
      });
    }

    setLocationLoading(true);
    setLocationError('');
    setLocationStatus('loading');
    setExactLocation(null);
    setPermissionGuide('');

    const locationOptions = {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 0
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const exactLoc = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          altitudeAccuracy: position.coords.altitudeAccuracy,
          heading: position.coords.heading || heading,
          speed: position.coords.speed,
          city: 'Exact GPS Location',
          country: 'GPS Coordinates',
          timestamp: new Date().toISOString(),
          location_type: 'gps_exact',
          source: 'browser_geolocation',
          is_mobile: deviceInfo.is_mobile
        };
        setExactLocation(exactLoc);
        setLocationLoading(false);
        setLocationStatus('success');
      },
      (error) => {
        let errorMessage = '';
        let showGuide = true;
        
        switch(error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Location access was denied. Please allow location access in your browser settings.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information is unavailable. Check your device location services are enabled.';
            break;
          case error.TIMEOUT:
            errorMessage = 'Location request timed out. Please try again.';
            showGuide = false;
            break;
          default:
            errorMessage = `Unable to get location: ${error.message}`;
            break;
        }
        setLocationError(errorMessage);
        setLocationLoading(false);
        setLocationStatus('error');
        
        if (showGuide) {
          showPermissionGuide(detectBrowser());
        }
      },
      locationOptions
    );
  };

  const handleConfirm = async () => {
    if (!exactLocation) {
      alert('Please get your exact location first to register this device.');
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
        return 'Detecting your exact location...';
      case 'success':
        return `Exact Location Found: ${exactLocation.latitude.toFixed(6)}, ${exactLocation.longitude.toFixed(6)}`;
      case 'error':
        return 'Unable to get exact location';
      default:
        return 'Click below to get your exact GPS location for accurate tracking';
    }
  };

  const openAppSettings = () => {
    if (deviceInfo.is_mobile) {
      alert('Please go to: Settings > Location > Enable Location Services');
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
          <p>We need your current location to track this device accurately.</p>
          <p className="device-uniqueness-note">
            <strong>Note:</strong> Each device can only be registered to one account.
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
                  {deviceInfo.is_mobile ? 'Mobile' : 'Computer'}
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
              <h4>Exact GPS Location:</h4>
              <div className={`location-status location-status-${locationStatus}`}>
                {getLocationText()}
              </div>

              {locationStatus === 'loading' && (
                <div className="location-loading">
                  <div className="spinner"></div>
                  <div>
                    <strong>Getting precise GPS location...</strong>
                    <p>Please ensure location services are enabled</p>
                  </div>
                </div>
              )}

              {locationStatus === 'success' && exactLocation && (
                <div className="location-success-details">
                  <div className="success-header">
                    <strong>Exact GPS location found!</strong>
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
                    {exactLocation.heading && (
                      <div className="coordinate-item">
                        <strong>Heading:</strong> {exactLocation.heading.toFixed(1)} degrees
                      </div>
                    )}
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
                      <pre>{permissionGuide}</pre>
                    </div>
                  )}
                  <div className="location-fallback-options">
                    <h5>Quick Solutions:</h5>
                    <button 
                      className="btn btn-small"
                      onClick={() => window.location.reload()}
                    >
                      Reload Page
                    </button>
                    <button 
                      className="btn btn-small"
                      onClick={openAppSettings}
                    >
                      Open Location Settings
                    </button>
                    <p className="browser-suggestion">
                      Try using: <strong>Firefox Mobile</strong> or <strong>Chrome Canary</strong>
                    </p>
                  </div>
                </div>
              )}

              {(locationStatus === 'idle' || locationStatus === 'error') && (
                <div className="location-action">
                  <button 
                    className="btn btn-primary get-location-btn"
                    onClick={getExactLocation}
                    disabled={locationLoading}
                  >
                    Get Exact GPS Location
                  </button>
                  {deviceInfo.is_mobile && (
                    <p className="mobile-note">
                      On mobile: Make sure location services are enabled and try again
                    </p>
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
                {deviceOwnershipStatus === 'owned_by_current_user' ? 'Update Device Location' : 'Add Device with Location'}
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
            Your location data is only used for device tracking and is stored securely. 
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