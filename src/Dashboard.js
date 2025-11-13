import React, { useState, useEffect, useRef } from 'react';
import MapView from './MapView';
import { apiRequest } from './App';
import config from './config';

const Dashboard = ({ user, onLogout }) => {
  const [devices, setDevices] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [currentDeviceId, setCurrentDeviceId] = useState(null);
  const [locationStatus, setLocationStatus] = useState('initializing');
  const [userLocation, setUserLocation] = useState(null);
  const [campusCenter, setCampusCenter] = useState(null);
  const locationWatcherRef = useRef(null);
  const locationIntervalRef = useRef(null);
  const [deviceCheckComplete, setDeviceCheckComplete] = useState(false);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [behaviorProgress, setBehaviorProgress] = useState(0);
  const [behaviorSummary, setBehaviorSummary] = useState(null);
  const [learningActive, setLearningActive] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [locationUpdates, setLocationUpdates] = useState(0);
  const [deviceConnectivity, setDeviceConnectivity] = useState({});
  const [highAccuracyMode, setHighAccuracyMode] = useState(false);

  useEffect(() => {
    initializeDeviceTracking();
    fetchDevices();
    fetchAlerts();
    startBehaviorMonitoring();

    const interval = setInterval(() => {
      fetchDevices();
      fetchAlerts();
      fetchBehaviorProgress();
      checkDeviceConnectivity();
    }, 5000);

    return () => {
      stopAutomaticLocationUpdates();
      clearInterval(interval);
    };
  }, [user]);

  const startBehaviorMonitoring = () => {
    setLearningActive(true);
    console.log('🎯 Behavior learning monitoring started');
  };

  const fetchBehaviorProgress = async () => {
    try {
      const response = await apiRequest(`/behavior/progress/${user.email}`);
      const data = await response.json();
      
      setBehaviorProgress(data.learning_progress);
      setBehaviorSummary(data.behavior_summary);
      
      if (data.learning_progress >= 100 && learningActive) {
        setLearningActive(false);
        console.log('✅ Behavior learning complete!');
      }
    } catch (err) {
      console.error('Failed to fetch behavior progress:', err);
    }
  };

  const checkDeviceConnectivity = () => {
    const connectivity = {};
    devices.forEach(device => {
      if (device.last_updated) {
        const lastUpdate = new Date(device.last_updated);
        const now = new Date();
        const diffSeconds = (now - lastUpdate) / 1000;
        connectivity[device.device_id] = diffSeconds < 60;
      } else {
        connectivity[device.device_id] = false;
      }
    });
    setDeviceConnectivity(connectivity);
  };

  const simulateLearningComplete = async () => {
    try {
      const response = await apiRequest(`/behavior/simulate_complete/${user.email}`, {
        method: 'POST'
      });
      
      if (response.ok) {
        setBehaviorProgress(100);
        setLearningActive(false);
        alert('🎉 Behavior learning simulated as complete for demo!');
      }
    } catch (err) {
      console.error('Failed to simulate learning complete:', err);
    }
  };

  const initializeDeviceTracking = async () => {
    const deviceId = await getCurrentDeviceId();
    setCurrentDeviceId(deviceId);
    
    const deviceExists = await checkDeviceExists(deviceId);
    setDeviceCheckComplete(true);
    
    if (!deviceExists) {
      console.log('Device does not exist, waiting for setup...');
      setLocationStatus('waiting_for_setup');
    } else {
      console.log('Device exists, starting high-precision location tracking...');
      startHighPrecisionLocationTracking(deviceId);
    }
  };

  const getCurrentDeviceId = async () => {
    if (user.device_info?.device_id) {
      return user.device_info.device_id;
    }
    
    const userAgent = navigator.userAgent;
    const isMobile = isMobileDevice();
    const deviceId = `device_${user.email}_${isMobile ? 'mobile' : 'laptop'}_${btoa(userAgent).slice(0, 10)}`;
    
    return deviceId;
  };

  const checkDeviceExists = async (deviceId) => {
    try {
      const response = await apiRequest(`/devices/${user.email}`);
      const userDevices = await response.json();
      const exists = userDevices.some(device => device.device_id === deviceId);
      console.log(`Device ${deviceId} exists: ${exists}`);
      return exists;
    } catch (err) {
      console.error('Failed to check device existence:', err);
      return false;
    }
  };

  const isMobileDevice = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  };

  const startHighPrecisionLocationTracking = (deviceId) => {
    console.log('🚀 Starting high-precision location tracking for device:', deviceId);
    
    if (isMobileDevice() && navigator.geolocation) {
      startMobileHighAccuracyGPS(deviceId);
    } else {
      startDesktopPrecisionTracking(deviceId);
    }
  };

  const startMobileHighAccuracyGPS = (deviceId) => {
    console.log('📱 Starting mobile high-accuracy GPS tracking');
    setLocationStatus('acquiring_gps_signal');
    setHighAccuracyMode(true);

    // First try to get the most accurate location quickly
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        console.log('🎯 High accuracy GPS acquired:', position);
        await processHighAccuracyLocation(deviceId, position, 'gps_high_accuracy');
        setLocationStatus('tracking_live_gps');
        
        // Start continuous tracking
        startContinuousGPSTracking(deviceId);
      },
      async (error) => {
        console.warn('High accuracy GPS failed, trying standard accuracy:', error);
        await fallbackToStandardAccuracy(deviceId);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  const startContinuousGPSTracking = (deviceId) => {
    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        await processHighAccuracyLocation(deviceId, position, 'gps_continuous');
      },
      (error) => {
        console.error('Continuous GPS tracking error:', error);
        handleGPSError(deviceId, error);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 1000,
        distanceFilter: 0 // Update on every movement
      }
    );

    locationWatcherRef.current = watchId;
  };

  const processHighAccuracyLocation = async (deviceId, position, source) => {
    const location = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude,
      altitudeAccuracy: position.coords.altitudeAccuracy,
      heading: position.coords.heading,
      speed: position.coords.speed,
      city: 'Live High-Accuracy GPS',
      country: 'Precise Location',
      location_type: 'gps_high_accuracy',
      timestamp: new Date().toISOString(),
      source: source,
      is_mobile: true,
      gps_quality: getGPSQuality(position.coords.accuracy),
      connectivity: 'online'
    };

    console.log(`📍 GPS Update: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)} ±${Math.round(location.accuracy)}m`);

    setGpsAccuracy(position.coords.accuracy);
    setLocationUpdates(prev => prev + 1);
    
    // Update user location for map
    setUserLocation({
      latitude: location.latitude,
      longitude: location.longitude
    });

    // Set campus center based on first high-accuracy location
    if (!campusCenter) {
      setCampusCenter({
        latitude: location.latitude,
        longitude: location.longitude
      });
      console.log('🎓 Campus center set based on high-accuracy GPS');
    }

    await updateDeviceLocation(deviceId, location);
  };

  const fallbackToStandardAccuracy = async (deviceId) => {
    console.log('🔄 Falling back to standard accuracy GPS');
    setLocationStatus('tracking_standard_gps');
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await processHighAccuracyLocation(deviceId, position, 'gps_standard');
        startContinuousStandardTracking(deviceId);
      },
      async (error) => {
        console.error('Standard GPS also failed:', error);
        await startDesktopPrecisionTracking(deviceId);
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 30000
      }
    );
  };

  const startContinuousStandardTracking = (deviceId) => {
    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        await processHighAccuracyLocation(deviceId, position, 'gps_standard_continuous');
      },
      (error) => {
        console.error('Standard GPS tracking error:', error);
        startDesktopPrecisionTracking(deviceId);
      },
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 5000,
        distanceFilter: 5 // Update every 5 meters
      }
    );

    locationWatcherRef.current = watchId;
  };

  const handleGPSError = (deviceId, error) => {
    let errorMessage = 'GPS Error: ';
    switch(error.code) {
      case error.PERMISSION_DENIED:
        errorMessage += 'Location permission denied';
        break;
      case error.POSITION_UNAVAILABLE:
        errorMessage += 'Location unavailable';
        break;
      case error.TIMEOUT:
        errorMessage += 'Location request timeout';
        break;
      default:
        errorMessage += error.message;
    }
    
    console.error(errorMessage);
    startDesktopPrecisionTracking(deviceId);
  };

  const startDesktopPrecisionTracking = async (deviceId) => {
    console.log('💻 Starting desktop precision tracking');
    setLocationStatus('tracking_desktop_precision');
    setHighAccuracyMode(false);

    // Try multiple methods for best accuracy
    await tryAllLocationMethods(deviceId);

    // Set up periodic updates with different methods
    locationIntervalRef.current = setInterval(async () => {
      await tryAllLocationMethods(deviceId);
    }, 10000);
  };

  const tryAllLocationMethods = async (deviceId) => {
    console.log('🔄 Trying all location methods...');
    
    // Method 1: Browser Geolocation (most accurate for desktop)
    if (navigator.geolocation) {
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 8000,
            maximumAge: 30000
          });
        });
        
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          heading: position.coords.heading || 0,
          speed: position.coords.speed || 0,
          city: 'Browser Geolocation',
          country: 'GPS/WiFi Location',
          location_type: 'browser_geolocation',
          timestamp: new Date().toISOString(),
          source: 'browser_geolocation',
          is_mobile: false,
          gps_quality: getGPSQuality(position.coords.accuracy),
          connectivity: navigator.onLine ? 'online' : 'offline'
        };
        
        if (!campusCenter) {
          setCampusCenter({
            latitude: location.latitude,
            longitude: location.longitude
          });
        }
        
        await updateDeviceLocation(deviceId, location);
        return; // Success with browser geolocation
      } catch (error) {
        console.log('Browser geolocation failed, trying IP-based methods...');
      }
    }

    // Method 2: IP-based location with multiple services
    await tryIPBasedLocation(deviceId);
  };

  const tryIPBasedLocation = async (deviceId) => {
    const services = [
      {
        url: 'https://ipapi.co/json/',
        parser: (data) => ({
          latitude: data.latitude,
          longitude: data.longitude,
          city: data.city,
          country: data.country_name
        })
      },
      {
        url: 'https://api.ipgeolocation.io/ipgeo?apiKey=demo',
        parser: (data) => ({
          latitude: data.latitude,
          longitude: data.longitude,
          city: data.city,
          country: data.country_name
        })
      },
      {
        url: 'https://json.geoiplookup.io/',
        parser: (data) => ({
          latitude: data.latitude,
          longitude: data.longitude,
          city: data.city,
          country: data.country_name
        })
      }
    ];

    for (const service of services) {
      try {
        console.log(`Trying location service: ${service.url}`);
        const response = await fetch(service.url, { 
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(5000)
        });
        
        if (response.ok) {
          const data = await response.json();
          const locationData = service.parser(data);
          
          if (locationData.latitude && locationData.longitude) {
            const location = {
              latitude: locationData.latitude,
              longitude: locationData.longitude,
              accuracy: 1000,
              city: locationData.city || 'Unknown',
              country: locationData.country || 'Unknown',
              location_type: 'ip_geolocation',
              timestamp: new Date().toISOString(),
              source: 'ip_geolocation',
              is_mobile: false,
              gps_quality: 'moderate',
              connectivity: navigator.onLine ? 'online' : 'offline'
            };
            
            await updateDeviceLocation(deviceId, location);
            console.log(`✅ IP location found: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`);
            return true;
          }
        }
      } catch (error) {
        console.log(`Service ${service.url} failed:`, error.message);
        continue;
      }
    }

    // Fallback: Use previous location with small variation or default
    await useFallbackLocation(deviceId);
    return false;
  };

  const useFallbackLocation = async (deviceId) => {
    const existingDevice = devices.find(d => d.device_id === deviceId);
    let baseLat, baseLng;

    if (existingDevice && existingDevice.last_location) {
      // Use previous location with small random variation
      baseLat = existingDevice.last_location.latitude;
      baseLng = existingDevice.last_location.longitude;
    } else if (campusCenter) {
      // Use campus center
      baseLat = campusCenter.latitude;
      baseLng = campusCenter.longitude;
    } else {
      // Use default coordinates
      baseLat = 6.9271;
      baseLng = 79.8612;
    }

    const location = {
      latitude: baseLat + (Math.random() - 0.5) * 0.0001,
      longitude: baseLng + (Math.random() - 0.5) * 0.0001,
      accuracy: 5000,
      city: 'Estimated Location',
      country: 'Network Based',
      location_type: 'network_estimated',
      timestamp: new Date().toISOString(),
      source: 'fallback_estimation',
      is_mobile: false,
      gps_quality: 'poor',
      connectivity: navigator.onLine ? 'online' : 'offline'
    };

    await updateDeviceLocation(deviceId, location);
    console.log('🔄 Using fallback location');
  };

  const getGPSQuality = (accuracy) => {
    if (accuracy < 10) return 'excellent';
    if (accuracy < 25) return 'good';
    if (accuracy < 50) return 'moderate';
    if (accuracy < 100) return 'fair';
    return 'poor';
  };

  const updateDeviceLocation = async (deviceId, location) => {
    try {
      const response = await apiRequest('/update_device_location', {
        method: 'POST',
        body: JSON.stringify({
          email: user.email,
          device_id: deviceId,
          location: location
        }),
      });

      if (response.ok) {
        const result = await response.json();
        
        setDevices(prevDevices => {
          const updatedDevices = prevDevices.map(device => 
            device.device_id === deviceId 
              ? { 
                  ...device, 
                  last_location: location,
                  last_updated: new Date().toISOString(),
                  is_mobile: location.is_mobile || false,
                  connectivity: location.connectivity || 'online'
                }
              : device
          );
          
          const deviceExists = updatedDevices.some(device => device.device_id === deviceId);
          if (!deviceExists) {
            const newDevice = {
              device_id: deviceId,
              device_name: isMobileDevice() ? 'My Mobile Phone' : 'My Computer',
              device_type: isMobileDevice() ? 'mobile' : 'laptop',
              last_location: location,
              last_updated: new Date().toISOString(),
              is_mobile: location.is_mobile || false,
              connectivity: location.connectivity || 'online'
            };
            return [...updatedDevices, newDevice];
          }
          
          return updatedDevices;
        });

        setDeviceConnectivity(prev => ({
          ...prev,
          [deviceId]: location.connectivity !== 'offline'
        }));

        if (result.anomalies_detected > 0) {
          console.log(`🚨 ${result.anomalies_detected} behavior anomalies detected`);
        }
      } else {
        const errorData = await response.json();
        if (errorData.code === 'DEVICE_NOT_FOUND') {
          console.log('Device not found, waiting for setup...');
          setLocationStatus('waiting_for_setup');
        } else {
          console.error('Failed to update device location:', errorData);
        }
      }
    } catch (err) {
      console.error('Failed to update device location:', err);
      setDeviceConnectivity(prev => ({
        ...prev,
        [deviceId]: false
      }));
    }
  };

  const stopAutomaticLocationUpdates = () => {
    if (locationWatcherRef.current) {
      navigator.geolocation.clearWatch(locationWatcherRef.current);
    }
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
    }
    console.log('Stopped all location tracking');
  };

  const fetchDevices = async () => {
    try {
      const response = await apiRequest(`/devices/${user.email}`);
      const data = await response.json();
      
      const updatedDevices = data.map(device => {
        const lastUpdate = device.last_updated ? new Date(device.last_updated) : null;
        const now = new Date();
        const isOnline = lastUpdate ? (now - lastUpdate) / 1000 < 60 : false;
        
        return {
          ...device,
          connectivity: isOnline ? 'online' : 'offline'
        };
      });
      
      setDevices(updatedDevices);
    } catch (err) {
      console.error('Failed to fetch devices:', err);
    }
  };

  const fetchAlerts = async () => {
    try {
      const response = await apiRequest(`/alerts/${user.email}`);
      const data = await response.json();
      setAlerts(data);
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    }
  };

  const getStatus = (device) => {
    if (device.connectivity === 'offline') return 'offline';
    if (!device.last_updated) return 'offline';
    
    const lastUpdate = new Date(device.last_updated);
    const now = new Date();
    const diffSeconds = (now - lastUpdate) / 1000;
    
    if (diffSeconds > 30) return 'offline';
    if (diffSeconds > 15) return 'warning';
    return 'safe';
  };

  const forceHighAccuracyUpdate = async () => {
    if (!currentDeviceId) return;

    console.log('🎯 Forcing high accuracy location update...');
    setLocationStatus('acquiring_high_accuracy');
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            heading: position.coords.heading || 0,
            speed: position.coords.speed || 0,
            city: 'Manual High Accuracy',
            country: 'Precise GPS',
            location_type: 'gps_manual_high_accuracy',
            timestamp: new Date().toISOString(),
            source: 'manual_gps_high_accuracy',
            is_mobile: isMobileDevice(),
            gps_quality: getGPSQuality(position.coords.accuracy),
            connectivity: 'online'
          };
          await updateDeviceLocation(currentDeviceId, location);
          setLocationStatus(isMobileDevice() ? 'tracking_live_gps' : 'tracking_desktop_precision');
          console.log('✅ High accuracy location acquired manually');
        },
        async (error) => {
          console.error('Manual high accuracy location failed:', error);
          await tryAllLocationMethods(currentDeviceId);
          setLocationStatus('tracking_desktop_precision');
        },
        { 
          enableHighAccuracy: true, 
          timeout: 15000,
          maximumAge: 0 
        }
      );
    } else {
      await tryAllLocationMethods(currentDeviceId);
      setLocationStatus('tracking_desktop_precision');
    }
  };

  const getLocationStatusText = () => {
    switch(locationStatus) {
      case 'tracking_live_gps': 
        return `🛰️ Live High-Accuracy GPS (±${gpsAccuracy ? Math.round(gpsAccuracy) : '?'}m)`;
      case 'tracking_standard_gps': 
        return `📡 Standard GPS Tracking (±${gpsAccuracy ? Math.round(gpsAccuracy) : '?'}m)`;
      case 'tracking_desktop_precision': 
        return '💻 Precision Location Tracking';
      case 'acquiring_gps_signal': 
        return '🔄 Acquiring GPS Signal...';
      case 'acquiring_high_accuracy': 
        return '🎯 Getting High Accuracy...';
      case 'waiting_for_setup': 
        return '⏳ Waiting for Device Setup...';
      case 'initializing': 
        return '⚙️ Initializing Location...';
      default: 
        return '📍 Location Tracking';
    }
  };

  const getConnectivityStatus = (device) => {
    return device.connectivity === 'online' ? '🟢 Online' : '🔴 Offline';
  };

  const getDisplayAlerts = () => {
    if (showAllAlerts) {
      return alerts;
    }
    return alerts.slice(-3);
  };

  const toggleShowAllAlerts = () => {
    setShowAllAlerts(!showAllAlerts);
  };

  const getLearningStatusText = () => {
    if (behaviorProgress >= 100) {
      return '✅ Behavior Learning Complete';
    } else if (behaviorProgress > 0) {
      return `🎯 Learning Behavior... ${Math.round(behaviorProgress)}%`;
    } else {
      return '⏳ Waiting to learn behavior patterns';
    }
  };

  const getSimulatedDays = () => {
    return Math.min(7, Math.floor(behaviorProgress / 100 * 7));
  };

  return (
    <div className="dashboard">
      <nav className="navbar">
        <div className="nav-title">
          📍 Smart Device Tracker - High Precision GPS
          <span className="live-indicator">LIVE</span>
          <span className="location-status-badge">{getLocationStatusText()}</span>
          {locationUpdates > 0 && (
            <span className="update-counter">Updates: {locationUpdates}</span>
          )}
          {highAccuracyMode && (
            <span className="high-accuracy-badge">HIGH ACCURACY</span>
          )}
        </div>
        <div className="nav-user">
          Welcome, {user.email}
          <button className="logout-btn" onClick={onLogout}>Logout</button>
        </div>
      </nav>

      {/* Behavior Learning Progress Bar */}
      {learningActive && (
        <div className="behavior-learning-section">
          <div className="learning-header">
            <h3>🎯 AI Behavior Learning</h3>
            <span className="learning-status">{getLearningStatusText()}</span>
          </div>
          
          <div className="progress-container">
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ width: `${behaviorProgress}%` }}
              ></div>
            </div>
            <div className="progress-info">
              <span>Simulated Days: {getSimulatedDays()}/7</span>
              <span>{Math.round(behaviorProgress)}% Complete</span>
            </div>
          </div>

          {behaviorSummary && behaviorProgress > 0 && (
            <div className="learning-stats">
              <div className="stat-item">
                <strong>Schedule Consistency:</strong> 
                <span>{(behaviorSummary.schedule_consistency * 100).toFixed(0)}%</span>
              </div>
              <div className="stat-item">
                <strong>Patterns Learned:</strong> 
                <span>{behaviorSummary.learned_patterns}</span>
              </div>
              <div className="stat-item">
                <strong>Devices Analyzed:</strong> 
                <span>{behaviorSummary.devices_analyzed}</span>
              </div>
            </div>
          )}

          {behaviorProgress < 100 && (
            <div className="learning-tip">
              <small>
                💡 <strong>Demo Tip:</strong> The system is learning your behavior patterns. 
                Move between campus sections to help it learn. 
                Or <button 
                  className="simulate-btn" 
                  onClick={simulateLearningComplete}
                >
                  Simulate Complete Learning
                </button>
              </small>
            </div>
          )}

          {behaviorProgress >= 100 && (
            <div className="learning-complete">
              <div className="celebration">🎉</div>
              <p><strong>Behavior Learning Complete!</strong> The system will now detect suspicious activities.</p>
            </div>
          )}
        </div>
      )}

      <div className="dashboard-content">
        <div className="devices-section">
          <div className="section-header">
            <h3>My Devices ({devices.length})</h3>
            <div className="location-controls">
              <button className="btn btn-small btn-high-accuracy" onClick={forceHighAccuracyUpdate}>
                🎯 Force High Accuracy
              </button>
            </div>
          </div>
          {devices.map((device, index) => (
            <div key={device.device_id} className="device-card">
              <div className="device-header">
                <h4>{device.device_name || `Device ${index + 1}`}</h4>
                <div className="device-status-group">
                  <span className={`device-status status-${getStatus(device)}`}>
                    {getStatus(device).toUpperCase()}
                    {getStatus(device) === 'safe' ? ' 🟢' : 
                     getStatus(device) === 'warning' ? ' 🟡' : ' 🔴'}
                  </span>
                  <span className={`connectivity-status ${device.connectivity}`}>
                    {getConnectivityStatus(device)}
                  </span>
                </div>
              </div>
              
              <div className="device-info">
                <p><strong>Type:</strong> {device.device_type} {device.is_mobile ? '📱' : '💻'}</p>
                <p><strong>Location Source:</strong> {device.last_location?.source || 'Unknown'}</p>
                <p><strong>GPS Quality:</strong> 
                  {device.last_location?.gps_quality ? 
                    <span className={`gps-quality ${device.last_location.gps_quality}`}>
                      {device.last_location.gps_quality.toUpperCase()}
                    </span> : 
                    'N/A'
                  }
                </p>
                <p><strong>Accuracy:</strong> {device.last_location?.accuracy ? `±${Math.round(device.last_location.accuracy)}m` : 'Unknown'}</p>
                <p><strong>Area:</strong> {device.last_location?.city || 'Unknown'}</p>
                <p><strong>Coordinates:</strong> 
                  {device.last_location ? 
                    `${device.last_location.latitude.toFixed(6)}, ${device.last_location.longitude.toFixed(6)}` : 
                    'No location data'
                  }
                </p>
                <p><strong>Last Update:</strong> {device.last_updated ? 
                  new Date(device.last_updated).toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo' }) : 'Never'}</p>
                
                {device.last_location?.heading && (
                  <p><strong>Heading:</strong> {device.last_location.heading.toFixed(1)}°</p>
                )}
                {device.last_location?.speed > 0 && (
                  <p><strong>Speed:</strong> {(device.last_location.speed * 3.6).toFixed(1)} km/h</p>
                )}
              </div>
              
              {device.device_id === currentDeviceId && (
                <div className="current-device-badge">
                  ✅ Current Device - {highAccuracyMode ? 'High Accuracy GPS' : 'Precision'} Tracking Active
                </div>
              )}
            </div>
          ))}
          {devices.length === 0 && (
            <div className="no-devices">
              <p>No devices found. Complete device setup to start tracking.</p>
            </div>
          )}
        </div>

        <div className="alerts-section">
          <div className="section-header">
            <h3>Alerts ({alerts.length})</h3>
            {alerts.length > 3 && (
              <button 
                className="btn btn-small" 
                onClick={toggleShowAllAlerts}
                style={{ 
                  background: 'transparent', 
                  border: '1px solid #667eea',
                  color: '#667eea'
                }}
              >
                {showAllAlerts ? '▲ Show Less' : '▼ Show All'}
              </button>
            )}
          </div>
          
          <div className={`alerts-container ${showAllAlerts ? 'show-all' : 'show-limited'}`}>
            {getDisplayAlerts().map((alert, index) => (
              <div key={index} className={`alert-card ${alert.type === 'suspicious_behavior' ? 'behavior-alert' : ''}`}>
                <div className="alert-header">
                  <strong>{alert.type.replace('_', ' ').toUpperCase()}</strong>
                  <span className="alert-time">
                    {new Date(alert.created_at).toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo' })}
                  </span>
                </div>
                <p>{alert.message}</p>
                {alert.severity === 'high' && (
                  <div className="alert-severity high">🚨 HIGH SEVERITY</div>
                )}
              </div>
            ))}
          </div>
          
          {alerts.length === 0 && (
            <div className="no-alerts">
              <p>No alerts - Everything looks good! ✅</p>
            </div>
          )}
          
          {!showAllAlerts && alerts.length > 3 && (
            <div className="alerts-footer">
              <p className="alerts-more-indicator">
                ... and {alerts.length - 3} more alerts. 
                <span 
                  className="view-all-link" 
                  onClick={toggleShowAllAlerts}
                  style={{ cursor: 'pointer', color: '#667eea', marginLeft: '5px' }}
                >
                  View all
                </span>
              </p>
            </div>
          )}
        </div>

        <div className="map-section">
          <h3>Live High-Precision Device Locations</h3>
          <div className="map-container">
            <MapView 
              devices={devices} 
              userLocation={userLocation}
              campusCenter={campusCenter}
            />
          </div>
          
          <div className="map-legend">
            <div className="legend-item">
              <span className="legend-color green"></span>
              <span>Live (Updated &lt; 15 sec ago)</span>
            </div>
            <div className="legend-item">
              <span className="legend-color orange"></span>
              <span>Warning (Updated 15-30 sec ago)</span>
            </div>
            <div className="legend-item">
              <span className="legend-color red"></span>
              <span>Offline (Updated &gt; 30 sec ago)</span>
            </div>
            <div className="legend-item">
              <span className="legend-direction">➤</span>
              <span>Direction indicator (mobile devices)</span>
            </div>
            <div className="legend-item">
              <span className="gps-quality excellent"></span>
              <span>Excellent GPS (&lt;10m accuracy)</span>
            </div>
            <div className="legend-item">
              <span className="gps-quality good"></span>
              <span>Good GPS (10-25m accuracy)</span>
            </div>
            <div className="legend-item">
              <span className="gps-quality moderate"></span>
              <span>Moderate GPS (25-50m accuracy)</span>
            </div>
            <div className="legend-item">
              <span className="connectivity-dot online"></span>
              <span>Online (Connected to internet)</span>
            </div>
            <div className="legend-item">
              <span className="connectivity-dot offline"></span>
              <span>Offline (No internet connection)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;