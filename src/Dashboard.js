import React, { useState, useEffect, useRef } from 'react';
import MapView from './MapView.js';
import { apiRequest } from './App';
import config from './config';

// Shared device status manager (simulates a global state)
const deviceStatusManager = {
  status: {},
  listeners: new Set(),
  
  updateStatus(deviceId, status) {
    this.status[deviceId] = {
      ...status,
      timestamp: Date.now(),
      updatedFrom: navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop'
    };
    this.notifyListeners();
  },
  
  getStatus(deviceId) {
    return this.status[deviceId] || { isActive: false, lastUpdated: 0 };
  },
  
  getAllStatus() {
    return this.status;
  },
  
  addListener(listener) {
    this.listeners.add(listener);
  },
  
  removeListener(listener) {
    this.listeners.delete(listener);
  },
  
  notifyListeners() {
    this.listeners.forEach(listener => listener(this.status));
  }
};

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
  const [realTimeDevices, setRealTimeDevices] = useState({});
  const deviceUpdateTimeoutRef = useRef(null);
  const [deviceStatus, setDeviceStatus] = useState({});
  const [isCurrentDeviceMobile, setIsCurrentDeviceMobile] = useState(false);
  const lastLocationUpdateRef = useRef({});

  useEffect(() => {
    initializeDeviceTracking();
    fetchDevices();
    fetchAlerts();
    startBehaviorMonitoring();
    
    // Subscribe to global device status updates
    deviceStatusManager.addListener(handleDeviceStatusUpdate);

    const interval = setInterval(() => {
      fetchDevices();
      fetchAlerts();
      fetchBehaviorProgress();
      checkDevicePresence();
    }, 3000);

    return () => {
      stopAutomaticLocationUpdates();
      clearInterval(interval);
      if (deviceUpdateTimeoutRef.current) {
        clearTimeout(deviceUpdateTimeoutRef.current);
      }
      deviceStatusManager.removeListener(handleDeviceStatusUpdate);
    };
  }, [user]);

  const handleDeviceStatusUpdate = (status) => {
    setDeviceStatus(status);
  };

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
    
    // Check if current device is mobile
    const isMobile = isMobileDevice();
    setIsCurrentDeviceMobile(isMobile);
    
    // Mark current device as active immediately
    deviceStatusManager.updateStatus(deviceId, {
      isActive: true,
      deviceType: isMobile ? 'mobile' : 'laptop',
      locationSource: isMobile ? 'gps' : 'network'
    });
    
    const deviceExists = await checkDeviceExists(deviceId);
    setDeviceCheckComplete(true);
    
    if (!deviceExists) {
      console.log('Device does not exist, waiting for setup...');
      setLocationStatus('waiting_for_setup');
    } else {
      console.log('Device exists, starting location tracking...');
      startDeviceSpecificLocationTracking(deviceId, isMobile);
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

  const startDeviceSpecificLocationTracking = (deviceId, isMobile) => {
    console.log(`Starting ${isMobile ? 'mobile GPS' : 'desktop network'} tracking for:`, deviceId);
    
    if (isMobile) {
      startMobileLocationTracking(deviceId);
    } else {
      startDesktopLocationTracking(deviceId);
    }
  };

  const startMobileLocationTracking = (deviceId) => {
    if (!navigator.geolocation) {
      console.warn('Geolocation not supported, falling back to network mode');
      startDesktopLocationTracking(deviceId);
      return;
    }

    console.log('📱 Starting mobile GPS tracking');
    setLocationStatus('tracking_mobile_gps');

    // Get initial location
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await processMobileLocation(deviceId, position, 'initial');
      },
      (error) => {
        console.error('Initial GPS failed:', error);
        startDesktopLocationTracking(deviceId);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

    // Continuous updates
    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        await processMobileLocation(deviceId, position, 'continuous');
      },
      (error) => {
        console.error('GPS watch error:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
        distanceFilter: 5 // Update every 5 meters movement
      }
    );

    locationWatcherRef.current = watchId;
  };

  const processMobileLocation = async (deviceId, position, source) => {
    const location = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude,
      altitudeAccuracy: position.coords.altitudeAccuracy,
      heading: position.coords.heading,
      speed: position.coords.speed,
      city: 'Live GPS',
      country: 'GPS Location',
      location_type: 'gps_mobile',
      timestamp: new Date().toISOString(),
      source: `mobile_${source}`,
      is_mobile: true,
      gps_quality: getGPSQuality(position.coords.accuracy),
      is_active: true
    };

    setGpsAccuracy(position.coords.accuracy);
    setLocationUpdates(prev => prev + 1);
    
    // Update device status globally
    deviceStatusManager.updateStatus(deviceId, {
      isActive: true,
      deviceType: 'mobile',
      locationSource: 'gps',
      lastLocation: location,
      lastUpdate: Date.now()
    });

    // Update local state
    updateRealTimeDevice(deviceId, location);
    
    // Send to backend
    await updateDeviceLocation(deviceId, location);
    
    // Update user location for map
    setUserLocation({
      latitude: location.latitude,
      longitude: location.longitude
    });
  };

  const startDesktopLocationTracking = (deviceId) => {
    console.log('💻 Starting desktop network tracking');
    setLocationStatus('tracking_desktop_network');

    // Initial location
    getDesktopLocation(deviceId, 'initial');

    // Periodic updates every 5 seconds
    locationIntervalRef.current = setInterval(() => {
      getDesktopLocation(deviceId, 'periodic');
    }, 5000);
  };

  const getDesktopLocation = async (deviceId, source) => {
    try {
      const location = await getNetworkLocation();
      location.is_active = true;
      location.is_mobile = false;
      location.source = `desktop_${source}`;
      location.location_type = 'network';
      location.timestamp = new Date().toISOString();
      
      // Update device status globally
      deviceStatusManager.updateStatus(deviceId, {
        isActive: true,
        deviceType: 'laptop',
        locationSource: 'network',
        lastLocation: location,
        lastUpdate: Date.now()
      });

      // Update local state
      updateRealTimeDevice(deviceId, location);
      
      // Send to backend
      await updateDeviceLocation(deviceId, location);
      
      // Update user location for map
      setUserLocation({
        latitude: location.latitude,
        longitude: location.longitude
      });
      
    } catch (error) {
      console.error('Desktop location failed:', error);
      // Mark as active but with old location
      const lastStatus = deviceStatusManager.getStatus(deviceId);
      if (lastStatus.isActive) {
        deviceStatusManager.updateStatus(deviceId, {
          ...lastStatus,
          lastUpdate: Date.now()
        });
      }
    }
  };

  const getNetworkLocation = async () => {
    try {
      // Try multiple services
      const services = [
        'https://ipapi.co/json/',
        'https://api.ipgeolocation.io/ipgeo?apiKey=demo',
        'https://ipinfo.io/json?token=demo'
      ];

      for (const url of services) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2000);
          
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const data = await response.json();
            
            if (data.latitude && data.longitude) {
              return {
                latitude: parseFloat(data.latitude),
                longitude: parseFloat(data.longitude),
                accuracy: data.accuracy || 100,
                city: data.city || data.region || 'Unknown',
                country: data.country_name || data.country || 'Unknown',
                location_type: 'network_ip',
                gps_quality: 'moderate',
                is_active: true
              };
            }
          }
        } catch (err) {
          continue; // Try next service
        }
      }

      // Fallback: Use last known location with slight variation
      const lastLocation = realTimeDevices[currentDeviceId]?.last_location;
      if (lastLocation) {
        return {
          ...lastLocation,
          latitude: lastLocation.latitude + (Math.random() - 0.5) * 0.00005,
          longitude: lastLocation.longitude + (Math.random() - 0.5) * 0.00005,
          accuracy: lastLocation.accuracy || 100,
          timestamp: new Date().toISOString()
        };
      }

      // Default location
      return {
        latitude: 6.9271,
        longitude: 79.8612,
        accuracy: 200,
        city: 'Colombo',
        country: 'Sri Lanka',
        location_type: 'network_default',
        gps_quality: 'moderate',
        is_active: true
      };
    } catch (error) {
      console.error('All network services failed:', error);
      throw error;
    }
  };

  const updateRealTimeDevice = (deviceId, location) => {
    setRealTimeDevices(prev => ({
      ...prev,
      [deviceId]: {
        device_id: deviceId,
        device_name: isCurrentDeviceMobile ? 'My Mobile Phone' : 'My Computer',
        device_type: isCurrentDeviceMobile ? 'mobile' : 'laptop',
        last_location: location,
        last_updated: new Date().toISOString(),
        is_mobile: location.is_mobile || false,
        is_active: true
      }
    }));
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
        console.log(`Location updated for ${deviceId}:`, result.message);
      } else {
        const errorData = await response.json();
        if (errorData.code === 'DEVICE_NOT_FOUND') {
          console.log('Device not found in backend');
        }
      }
    } catch (err) {
      console.error('Failed to update device location:', err);
    }
  };

  const stopAutomaticLocationUpdates = () => {
    if (locationWatcherRef.current) {
      navigator.geolocation.clearWatch(locationWatcherRef.current);
    }
    if (locationIntervalRef.current) {
      clearInterval(locationIntervalRef.current);
    }
    console.log('Stopped location tracking');
  };

  const checkDevicePresence = () => {
    // Check if devices are still active based on global status
    const allStatus = deviceStatusManager.getAllStatus();
    const now = Date.now();
    
    Object.entries(allStatus).forEach(([deviceId, status]) => {
      if (status.isActive && (now - status.lastUpdate) > 60000) {
        // Mark as inactive if no update for 60 seconds
        deviceStatusManager.updateStatus(deviceId, {
          ...status,
          isActive: false
        });
      }
    });
  };

  const fetchDevices = async () => {
    try {
      const response = await apiRequest(`/devices/${user.email}`);
      const backendDevices = await response.json();
      
      // Merge backend data with real-time status
      const mergedDevices = backendDevices.map(backendDevice => {
        const realTimeDevice = realTimeDevices[backendDevice.device_id];
        const globalStatus = deviceStatusManager.getStatus(backendDevice.device_id);
        
        let finalDevice = { ...backendDevice };
        
        // Use real-time data if available
        if (realTimeDevice && realTimeDevice.last_location) {
          finalDevice = {
            ...finalDevice,
            last_location: realTimeDevice.last_location,
            last_updated: realTimeDevice.last_updated,
            is_mobile: realTimeDevice.is_mobile || backendDevice.is_mobile
          };
        }
        
        // Apply global status
        finalDevice.is_active = globalStatus.isActive || false;
        finalDevice.status_source = globalStatus.locationSource || 'unknown';
        finalDevice.last_status_update = globalStatus.lastUpdate || 0;
        
        return finalDevice;
      });
      
      // Add real-time devices not in backend
      Object.values(realTimeDevices).forEach(realTimeDevice => {
        const exists = mergedDevices.some(d => d.device_id === realTimeDevice.device_id);
        if (!exists) {
          const globalStatus = deviceStatusManager.getStatus(realTimeDevice.device_id);
          mergedDevices.push({
            ...realTimeDevice,
            is_active: globalStatus.isActive || true,
            status_source: globalStatus.locationSource || 'realtime'
          });
        }
      });
      
      setDevices(mergedDevices);
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

  const getDeviceStatus = (device) => {
    // Primary: Use global status manager
    const globalStatus = deviceStatusManager.getStatus(device.device_id);
    
    if (globalStatus.isActive) {
      return 'safe';
    }
    
    // Fallback: Check last update time
    if (!device.last_updated) return 'offline';
    
    const lastUpdate = new Date(device.last_updated);
    const now = new Date();
    const diffSeconds = (now - lastUpdate) / 1000;
    
    if (device.is_mobile) {
      if (diffSeconds > 60) return 'offline';
      if (diffSeconds > 30) return 'warning';
    } else {
      // Desktop devices have more lenient thresholds
      if (diffSeconds > 120) return 'offline';
      if (diffSeconds > 60) return 'warning';
    }
    
    return 'safe';
  };

  const getGPSQuality = (accuracy) => {
    if (!accuracy) return 'unknown';
    if (accuracy < 5) return 'excellent';
    if (accuracy < 15) return 'good';
    if (accuracy < 30) return 'moderate';
    return 'poor';
  };

  const forceLocationUpdate = async () => {
    if (!currentDeviceId) return;

    setLocationStatus('manual_update');
    
    if (isCurrentDeviceMobile && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          await processMobileLocation(currentDeviceId, position, 'manual');
          setLocationStatus('tracking_mobile_gps');
        },
        async (error) => {
          console.error('Manual update failed:', error);
          await getDesktopLocation(currentDeviceId, 'manual');
          setLocationStatus('tracking_desktop_network');
        },
        { 
          enableHighAccuracy: true, 
          timeout: 10000,
          maximumAge: 0 
        }
      );
    } else {
      await getDesktopLocation(currentDeviceId, 'manual');
      setLocationStatus('tracking_desktop_network');
    }
  };

  const getLocationStatusText = () => {
    switch(locationStatus) {
      case 'tracking_mobile_gps': 
        return `📱 Mobile GPS (Accuracy: ±${gpsAccuracy ? Math.round(gpsAccuracy) : '?'}m)`;
      case 'tracking_desktop_network': 
        return '💻 Network Location';
      case 'waiting_for_setup': 
        return '⏳ Waiting for Device Setup...';
      case 'manual_update': 
        return '🎯 Manual Update...';
      case 'initializing': 
        return '⚙️ Initializing...';
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

  const getDisplayDevices = () => {
    return devices.map(device => {
      const status = getDeviceStatus(device);
      return {
        ...device,
        display_status: status,
        is_current_device: device.device_id === currentDeviceId
      };
    });
  };

  return (
    <div className="dashboard">
      <nav className="navbar">
        <div className="nav-title">
          📍 Smart Device Tracker
          <span className="live-indicator">LIVE</span>
          <span className="location-status-badge">{getLocationStatusText()}</span>
          {locationUpdates > 0 && (
            <span className="update-counter">Updates: {locationUpdates}</span>
          )}
        </div>
        <div className="nav-user">
          Welcome, {user.email}
          <button className="logout-btn" onClick={onLogout}>Logout</button>
        </div>
      </nav>

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
                💡 <strong>Demo Tip:</strong> Move between campus sections to help the system learn your patterns.
                <button 
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
            <h3>My Devices ({getDisplayDevices().length})</h3>
            <div className="location-controls">
              <button className="btn btn-small btn-high-accuracy" onClick={forceLocationUpdate}>
                🔄 Update Location
              </button>
            </div>
          </div>
          {getDisplayDevices().map((device, index) => (
            <div key={device.device_id} className="device-card">
              <div className="device-header">
                <h4>{device.device_name || `Device ${index + 1}`}</h4>
                <span className={`device-status status-${device.display_status}`}>
                  {device.display_status.toUpperCase()}
                  {device.display_status === 'safe' ? ' 🟢' : 
                   device.display_status === 'warning' ? ' 🟡' : ' 🔴'}
                </span>
              </div>
              
              <div className="device-info">
                <p><strong>Type:</strong> {device.device_type} {device.is_mobile ? '📱 Mobile' : '💻 Computer'}</p>
                <p><strong>Status Source:</strong> {device.status_source || 'Unknown'}</p>
                <p><strong>Connection:</strong> {device.is_active ? 'Active' : 'Inactive'}</p>
                {device.last_location?.gps_quality && (
                  <p><strong>GPS Quality:</strong> 
                    <span className={`gps-quality ${device.last_location.gps_quality}`}>
                      {device.last_location.gps_quality.toUpperCase()}
                    </span>
                  </p>
                )}
                <p><strong>Area:</strong> {device.last_location?.city || 'Unknown'}</p>
                <p><strong>Coordinates:</strong> 
                  {device.last_location ? 
                    `${device.last_location.latitude?.toFixed(6)}, ${device.last_location.longitude?.toFixed(6)}` : 
                    'No location'
                  }
                </p>
                <p><strong>Accuracy:</strong> {device.last_location?.accuracy ? `±${Math.round(device.last_location.accuracy)}m` : 'Unknown'}</p>
                <p><strong>Last Update:</strong> {device.last_updated ? 
                  new Date(device.last_updated).toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: '2-digit'
                  }) : 'Never'}
                </p>
              </div>
              
              {device.is_current_device && (
                <div className="current-device-badge">
                  ✅ Current Device - {isCurrentDeviceMobile ? 'Mobile' : 'Desktop'} Tracking
                </div>
              )}
            </div>
          ))}
          {getDisplayDevices().length === 0 && (
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
                    {new Date(alert.created_at).toLocaleTimeString('en-US')}
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
          <h3>Live Device Locations</h3>
          <div className="map-container">
            <MapView devices={getDisplayDevices()} userLocation={userLocation} />
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
              <span>Live (Active tracking)</span>
            </div>
            <div className="legend-item">
              <span className="legend-color orange"></span>
              <span>Warning (Slow updates)</span>
            </div>
            <div className="legend-item">
              <span className="legend-color red"></span>
              <span>Offline (No recent updates)</span>
            </div>
            <div className="legend-item">
              <span className="legend-direction">➤</span>
              <span>Mobile direction</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;