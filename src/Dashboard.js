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
  const locationWatcherRef = useRef(null);
  const locationIntervalRef = useRef(null);
  const [deviceCheckComplete, setDeviceCheckComplete] = useState(false);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [behaviorProgress, setBehaviorProgress] = useState(0);
  const [behaviorSummary, setBehaviorSummary] = useState(null);
  const [learningActive, setLearningActive] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [locationUpdates, setLocationUpdates] = useState(0);
  const [lastPosition, setLastPosition] = useState(null);
  const [movementData, setMovementData] = useState({ speed: 0, heading: 0 });

  useEffect(() => {
    initializeDeviceTracking();
    fetchDevices();
    fetchAlerts();
    startBehaviorMonitoring();

    const interval = setInterval(() => {
      fetchDevices();
      fetchAlerts();
      fetchBehaviorProgress();
    }, 2000); // Increased frequency

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
      console.log('Device exists, starting REAL-TIME location tracking...');
      startRealTimeLocationTracking(deviceId);
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

  const startRealTimeLocationTracking = (deviceId) => {
    console.log('🚀 Starting REAL-TIME location tracking for device:', deviceId);
    
    if (isMobileDevice()) {
      startContinuousMobileTracking(deviceId);
    } else {
      startEnhancedDesktopTracking(deviceId);
    }
  };

  const startContinuousMobileTracking = (deviceId) => {
    if (!navigator.geolocation) {
      console.warn('Geolocation not supported, falling back to desktop mode');
      startEnhancedDesktopTracking(deviceId);
      return;
    }

    console.log('📡 Starting CONTINUOUS mobile GPS tracking with high frequency');
    setLocationStatus('tracking_live_mobile');

    // Clear any existing watchers
    if (locationWatcherRef.current) {
      navigator.geolocation.clearWatch(locationWatcherRef.current);
    }

    // Watch position with highest frequency and accuracy
    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        await processRealTimeLocation(deviceId, position, 'continuous_gps');
      },
      (error) => {
        console.error('Continuous GPS tracking error:', error);
        // Fallback to less frequent updates but don't stop completely
        setTimeout(() => {
          if (locationStatus.includes('tracking')) {
            startEnhancedDesktopTracking(deviceId);
          }
        }, 5000);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
        distanceFilter: 0.1 // Update every 0.1 meters (10cm) - MAXIMUM SENSITIVITY
      }
    );

    locationWatcherRef.current = watchId;

    // Additional frequent updates as backup
    locationIntervalRef.current = setInterval(async () => {
      try {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            await processRealTimeLocation(deviceId, position, 'backup_gps');
          },
          (error) => console.warn('Backup GPS update failed:', error),
          {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
          }
        );
      } catch (err) {
        console.warn('Backup location update error:', err);
      }
    }, 1000); // Backup update every second
  };

  const calculateMovement = (currentPosition, lastPosition) => {
    if (!lastPosition) return { speed: 0, heading: 0 };
    
    const timeDiff = (currentPosition.timestamp - lastPosition.timestamp) / 1000; // seconds
    if (timeDiff === 0) return { speed: 0, heading: 0 };

    // Calculate distance using Haversine formula
    const R = 6371000; // Earth's radius in meters
    const dLat = (currentPosition.coords.latitude - lastPosition.coords.latitude) * Math.PI / 180;
    const dLon = (currentPosition.coords.longitude - lastPosition.coords.longitude) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lastPosition.coords.latitude * Math.PI / 180) * 
      Math.cos(currentPosition.coords.latitude * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // Distance in meters
    
    const speed = distance / timeDiff; // meters per second
    
    // Calculate heading (bearing)
    const y = Math.sin(dLon) * Math.cos(currentPosition.coords.latitude * Math.PI / 180);
    const x = Math.cos(lastPosition.coords.latitude * Math.PI / 180) * 
              Math.sin(currentPosition.coords.latitude * Math.PI / 180) -
              Math.sin(lastPosition.coords.latitude * Math.PI / 180) * 
              Math.cos(currentPosition.coords.latitude * Math.PI / 180) * 
              Math.cos(dLon);
    let heading = Math.atan2(y, x) * 180 / Math.PI;
    heading = (heading + 360) % 360; // Normalize to 0-360
    
    return { speed, heading };
  };

  const processRealTimeLocation = async (deviceId, position, source) => {
    const movement = lastPosition ? calculateMovement(position, lastPosition) : { speed: 0, heading: 0 };
    
    const location = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude,
      altitudeAccuracy: position.coords.altitudeAccuracy,
      heading: position.coords.heading || movement.heading,
      speed: position.coords.speed || movement.speed,
      city: 'Live Real-time GPS',
      country: 'Continuous Tracking',
      location_type: 'gps_realtime_continuous',
      timestamp: new Date().toISOString(),
      source: source,
      is_mobile: true,
      gps_quality: getGPSQuality(position.coords.accuracy),
      movement_detected: movement.speed > 0.1
    };

    setMovementData({ speed: movement.speed, heading: movement.heading });
    setGpsAccuracy(position.coords.accuracy);
    setLocationUpdates(prev => prev + 1);
    setLastPosition(position);
    
    // Update user location for map in REAL-TIME
    setUserLocation({
      latitude: location.latitude,
      longitude: location.longitude,
      heading: location.heading,
      speed: location.speed
    });

    await updateDeviceLocation(deviceId, location);
  };

  const startEnhancedDesktopTracking = async (deviceId) => {
    console.log('Starting enhanced desktop location tracking with frequent updates');
    setLocationStatus('tracking_desktop_realtime');

    // Clear any existing intervals
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
    }

    // Initial location
    await updateNetworkLocation(deviceId);

    // Set up VERY frequent updates for desktop
    locationIntervalRef.current = setInterval(async () => {
      await updateNetworkLocation(deviceId);
    }, 2000); // Update every 2 seconds for desktop
  };

  const updateNetworkLocation = async (deviceId) => {
    try {
      const networkLocation = await getNetworkBasedLocation();
      await updateDeviceLocation(deviceId, networkLocation);
    } catch (error) {
      console.error('Network location update failed:', error);
    }
  };

  const getNetworkBasedLocation = async () => {
    try {
      // Try browser geolocation first with high frequency
      if (navigator.geolocation) {
        return new Promise((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy,
                heading: position.coords.heading || 0,
                speed: position.coords.speed || 0,
                city: 'Browser Geolocation',
                country: 'GPS',
                location_type: 'browser_geolocation_realtime',
                timestamp: new Date().toISOString(),
                source: 'browser_geolocation_frequent',
                is_mobile: false,
                gps_quality: getGPSQuality(position.coords.accuracy),
                movement_detected: false
              });
            },
            () => {
              // Fallback to IP-based location
              resolve(getIPBasedLocation());
            },
            {
              enableHighAccuracy: true,
              timeout: 3000,
              maximumAge: 0
            }
          );
        });
      } else {
        return getIPBasedLocation();
      }
    } catch (error) {
      console.error('All location services failed:', error);
      return getIPBasedLocation();
    }
  };

  const getIPBasedLocation = () => {
    return {
      latitude: 6.9271 + (Math.random() - 0.5) * 0.0001,
      longitude: 79.8612 + (Math.random() - 0.5) * 0.0001,
      accuracy: 100,
      city: 'Colombo',
      country: 'Sri Lanka',
      location_type: 'network_ip_frequent',
      timestamp: new Date().toISOString(),
      source: 'network_frequent',
      is_mobile: false,
      gps_quality: 'moderate',
      movement_detected: false
    };
  };

  const getGPSQuality = (accuracy) => {
    if (accuracy < 5) return 'excellent';
    if (accuracy < 15) return 'good';
    if (accuracy < 30) return 'moderate';
    return 'poor';
  };

  const updateDeviceLocation = async (deviceId, location) => {
    try {
      console.log(`📍 REAL-TIME Updating device ${deviceId} location:`, {
        coords: `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`,
        speed: location.speed ? `${(location.speed * 3.6).toFixed(1)} km/h` : '0 km/h',
        heading: location.heading ? `${location.heading.toFixed(1)}°` : '0°',
        accuracy: `±${Math.round(location.accuracy)}m`
      });
      
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
        
        // Update local state immediately for real-time map updates
        setDevices(prevDevices => {
          const updatedDevices = prevDevices.map(device => 
            device.device_id === deviceId 
              ? { 
                  ...device, 
                  last_location: location,
                  last_updated: new Date().toISOString(),
                  is_mobile: location.is_mobile || false
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
              is_mobile: location.is_mobile || false
            };
            return [...updatedDevices, newDevice];
          }
          
          return updatedDevices;
        });

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
    }
  };

  const stopAutomaticLocationUpdates = () => {
    if (locationWatcherRef.current) {
      navigator.geolocation.clearWatch(locationWatcherRef.current);
      locationWatcherRef.current = null;
    }
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
      locationIntervalRef.current = null;
    }
    console.log('Stopped all location tracking');
  };

  const fetchDevices = async () => {
    try {
      const response = await apiRequest(`/devices/${user.email}`);
      const data = await response.json();
      const validDevices = data.filter(device => 
        device.last_location && 
        typeof device.last_location.latitude === 'number' && 
        typeof device.last_location.longitude === 'number' &&
        !isNaN(device.last_location.latitude) && 
        !isNaN(device.last_location.longitude) &&
        device.last_location.latitude !== 0 && 
        device.last_location.longitude !== 0
      );
      console.log(`📱 Fetched ${validDevices.length} valid devices`);
      setDevices(validDevices);
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
    if (!device.last_updated) return 'offline';
    
    const lastUpdate = new Date(device.last_updated);
    const now = new Date();
    const diffSeconds = (now - lastUpdate) / 1000;
    
    if (diffSeconds > 10) return 'offline';
    if (diffSeconds > 5) return 'warning';
    return 'safe';
  };

  const forceHighAccuracyUpdate = async () => {
    if (!currentDeviceId) return;

    setLocationStatus('manual_high_accuracy');
    
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            heading: position.coords.heading || movementData.heading,
            speed: position.coords.speed || movementData.speed,
            city: 'Manual High Accuracy',
            country: 'GPS',
            location_type: 'gps_manual_high_accuracy',
            timestamp: new Date().toISOString(),
            source: 'manual_gps_high_accuracy',
            is_mobile: isMobileDevice(),
            gps_quality: getGPSQuality(position.coords.accuracy),
            movement_detected: movementData.speed > 0.1
          };
          
          setUserLocation({
            latitude: location.latitude,
            longitude: location.longitude,
            heading: location.heading,
            speed: location.speed
          });
          
          await updateDeviceLocation(currentDeviceId, location);
          setLocationStatus(isMobileDevice() ? 'tracking_live_mobile' : 'tracking_desktop_realtime');
        },
        async (error) => {
          console.error('Manual high accuracy location failed:', error);
          await updateNetworkLocation(currentDeviceId);
          setLocationStatus('tracking_desktop_realtime');
        },
        { 
          enableHighAccuracy: true, 
          timeout: 10000,
          maximumAge: 0 
        }
      );
    } else {
      await updateNetworkLocation(currentDeviceId);
      setLocationStatus('tracking_desktop_realtime');
    }
  };

  const getLocationStatusText = () => {
    switch(locationStatus) {
      case 'tracking_live_mobile': 
        return `📡 LIVE Mobile GPS (${movementData.speed > 0.1 ? 'MOVING' : 'STATIONARY'}) ±${gpsAccuracy ? Math.round(gpsAccuracy) : '?'}m`;
      case 'tracking_desktop_realtime': 
        return '💻 Real-time Desktop Tracking';
      case 'waiting_for_setup': 
        return '⏳ Waiting for Device Setup...';
      case 'manual_high_accuracy': 
        return '🎯 Getting High Accuracy Location...';
      case 'initializing': 
        return '⚙️ Initializing Real-time Tracking...';
      default: 
        return '📍 Location Tracking';
    }
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

  const campusSections = [
    { name: "Library Section", type: "library", color: "#3B82F6" },
    { name: "Laboratory Section", type: "lab", color: "#10B981" },
    { name: "Classroom Section", type: "classroom", color: "#F59E0B" },
    { name: "Administration Section", type: "admin", color: "#EF4444" }
  ];

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
          📍 Smart Device Tracker - REAL-TIME AI Tracking
          <span className="live-indicator">LIVE</span>
          <span className="location-status-badge">{getLocationStatusText()}</span>
          {locationUpdates > 0 && (
            <span className="update-counter">Updates: {locationUpdates}</span>
          )}
          {movementData.speed > 0.1 && (
            <span className="movement-indicator">🚶 MOVING: {(movementData.speed * 3.6).toFixed(1)} km/h</span>
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
                💡 <strong>Real-time Tracking Active:</strong> The system is learning your behavior patterns in real-time. 
                Move around to see live tracking updates.
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
              <p><strong>Behavior Learning Complete!</strong> Real-time anomaly detection active.</p>
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
                🎯 Force GPS Update
              </button>
            </div>
          </div>
          {devices.map((device, index) => (
            <div key={device.device_id} className="device-card">
              <div className="device-header">
                <h4>{device.device_name || `Device ${index + 1}`}</h4>
                <span className={`device-status status-${getStatus(device)}`}>
                  {getStatus(device).toUpperCase()}
                  {getStatus(device) === 'safe' ? ' 🟢' : 
                   getStatus(device) === 'warning' ? ' 🟡' : ' 🔴'}
                </span>
              </div>
              
              <div className="device-info">
                <p><strong>Type:</strong> {device.device_type} {device.is_mobile ? '📱' : '💻'}</p>
                <p><strong>Tracking:</strong> {device.last_location?.movement_detected ? 'MOVING 🚶' : 'STATIONARY'}</p>
                <p><strong>Location Source:</strong> {device.last_location?.source || 'Unknown'}</p>
                <p><strong>GPS Quality:</strong> 
                  {device.last_location?.gps_quality ? 
                    <span className={`gps-quality ${device.last_location.gps_quality}`}>
                      {device.last_location.gps_quality.toUpperCase()}
                    </span> : 
                    'N/A'
                  }
                </p>
                <p><strong>Speed:</strong> {device.last_location?.speed ? `${(device.last_location.speed * 3.6).toFixed(1)} km/h` : '0 km/h'}</p>
                <p><strong>Heading:</strong> {device.last_location?.heading ? `${device.last_location.heading.toFixed(1)}°` : '0°'}</p>
                <p><strong>Coordinates:</strong> 
                  {device.last_location ? 
                    `${device.last_location.latitude?.toFixed(6)}, ${device.last_location.longitude?.toFixed(6)}` : 
                    'No location data'
                  }
                </p>
                <p><strong>Accuracy:</strong> {device.last_location?.accuracy ? `±${Math.round(device.last_location.accuracy)}m` : 'Unknown'}</p>
                <p><strong>Last Update:</strong> {device.last_updated ? 
                  new Date(device.last_updated).toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo' }) : 'Never'}</p>
              </div>
              
              {device.device_id === currentDeviceId && (
                <div className="current-device-badge">
                  ✅ Current Device - REAL-TIME {isMobileDevice() ? 'Mobile GPS' : 'Enhanced'} Tracking Active
                </div>
              )}
            </div>
          ))}
          {devices.length === 0 && (
            <div className="no-devices">
              <p>No devices found. Complete device setup to start real-time tracking.</p>
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
          <h3>LIVE Real-time Device Locations</h3>
          <div className="map-container">
            <MapView devices={devices} userLocation={userLocation} />
          </div>
          
          <div className="campus-legend">
            <h4>Campus Sections</h4>
            {campusSections.map((section, index) => (
              <div key={index} className="legend-zone-item">
                <span 
                  className="legend-zone-color" 
                  style={{backgroundColor: section.color}}
                ></span>
                <span>{section.name} ({section.type})</span>
              </div>
            ))}
          </div>
          
          <div className="map-legend">
            <div className="legend-item">
              <span className="legend-color green"></span>
              <span>Live (Updated &lt; 5 sec ago)</span>
            </div>
            <div className="legend-item">
              <span className="legend-color orange"></span>
              <span>Warning (Updated 5-10 sec ago)</span>
            </div>
            <div className="legend-item">
              <span className="legend-color red"></span>
              <span>Offline (Updated &gt; 10 sec ago)</span>
            </div>
            <div className="legend-item">
              <span className="legend-direction">➤</span>
              <span>Direction indicator (real-time movement)</span>
            </div>
            <div className="legend-item">
              <span className="gps-quality excellent"></span>
              <span>Excellent GPS (&lt;5m accuracy)</span>
            </div>
            <div className="legend-item">
              <span className="gps-quality good"></span>
              <span>Good GPS (5-15m accuracy)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;