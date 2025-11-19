import React, { useState, useEffect, useRef } from 'react';
import MapView from './MapView';
import { apiRequest } from './App';
import config from './config';
import io from 'socket.io-client';

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
  const [socket, setSocket] = useState(null);
  const [realTimeUpdates, setRealTimeUpdates] = useState(0);

  useEffect(() => {
    // Initialize WebSocket connection
    const newSocket = io(config.API_BASE_URL.replace('/api', ''), {
      transports: ['websocket', 'polling']
    });
    
    newSocket.on('connect', () => {
      console.log('✅ Connected to real-time server');
      newSocket.emit('join_user_room', { email: user.email });
    });
    
    newSocket.on('device_location_update', (data) => {
      console.log('🔄 Real-time device update received:', data.device_id);
      setRealTimeUpdates(prev => prev + 1);
      
      setDevices(prevDevices => {
        const updatedDevices = prevDevices.map(device => 
          device.device_id === data.device_id 
            ? { ...device, ...data.device_data }
            : device
        );
        
        const deviceExists = updatedDevices.some(device => device.device_id === data.device_id);
        if (!deviceExists) {
          return [...updatedDevices, data.device_data];
        }
        
        return updatedDevices;
      });
    });
    
    newSocket.on('new_device_added', (data) => {
      console.log('🆕 Real-time new device added:', data.device_data.device_id);
      setDevices(prevDevices => [...prevDevices, data.device_data]);
    });
    
    newSocket.on('new_alert', (data) => {
      console.log('🚨 Real-time alert received');
      setAlerts(prevAlerts => [data.alert_data, ...prevAlerts]);
    });
    
    newSocket.on('disconnect', () => {
      console.log('❌ Disconnected from real-time server');
    });
    
    setSocket(newSocket);

    initializeDeviceTracking();
    fetchDevices();
    fetchAlerts();
    startBehaviorMonitoring();

    const interval = setInterval(() => {
      fetchDevices();
      fetchAlerts();
      fetchBehaviorProgress();
    }, 5000); // Reduced from 30s to 5s for better real-time sync

    return () => {
      stopAutomaticLocationUpdates();
      clearInterval(interval);
      if (newSocket) {
        newSocket.disconnect();
      }
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
      console.log('Device exists, starting real-time location tracking...');
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
    console.log('🚀 Starting real-time location tracking for device:', deviceId);
    
    if (isMobileDevice()) {
      startMobileRealTimeGPSTracking(deviceId);
    } else {
      startDesktopRealTimeLocationTracking(deviceId);
    }
  };

  const startMobileRealTimeGPSTracking = (deviceId) => {
    if (!navigator.geolocation) {
      console.warn('Geolocation not supported, falling back to desktop mode');
      startDesktopRealTimeLocationTracking(deviceId);
      return;
    }

    console.log('🛰️ Starting real-time mobile GPS tracking (1-second updates)');
    setLocationStatus('tracking_mobile_gps_realtime');

    // First get immediate location
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await processRealTimeGPSLocation(deviceId, position, 'initial_fix');
      },
      (error) => {
        console.error('Initial GPS fix failed:', error);
        startDesktopRealTimeLocationTracking(deviceId);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

    // Real-time continuous updates every 1 second
    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        await processRealTimeGPSLocation(deviceId, position, 'continuous_realtime_gps');
      },
      (error) => {
        console.error('Real-time GPS watch error:', error);
        setTimeout(() => {
          if (locationStatus.includes('realtime')) {
            startDesktopRealTimeLocationTracking(deviceId);
          }
        }, 10000);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000, // Reduced timeout for faster updates
        maximumAge: 0, // No caching, always fresh
        distanceFilter: 0.1 // Update every 0.1 meter movement (almost continuous)
      }
    );

    locationWatcherRef.current = watchId;
  };

  const processRealTimeGPSLocation = async (deviceId, position, source) => {
    const location = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      altitude: position.coords.altitude,
      altitudeAccuracy: position.coords.altitudeAccuracy,
      heading: position.coords.heading,
      speed: position.coords.speed,
      city: 'Live Real-time GPS',
      country: 'Real-time Location',
      location_type: 'gps_realtime_mobile',
      timestamp: new Date().toISOString(),
      source: source,
      is_mobile: true,
      gps_quality: getGPSQuality(position.coords.accuracy),
      real_time: true
    };

    setGpsAccuracy(position.coords.accuracy);
    setLocationUpdates(prev => prev + 1);
    
    // Update user location for map in real-time
    setUserLocation({
      latitude: location.latitude,
      longitude: location.longitude
    });

    await updateDeviceLocationRealTime(deviceId, location);
  };

  const getGPSQuality = (accuracy) => {
    if (accuracy < 10) return 'excellent';
    if (accuracy < 25) return 'good';
    if (accuracy < 50) return 'moderate';
    return 'poor';
  };

  const startDesktopRealTimeLocationTracking = async (deviceId) => {
    console.log('Starting real-time desktop location tracking');
    setLocationStatus('tracking_desktop_realtime');

    // Try to get browser geolocation first with faster updates
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            heading: position.coords.heading || 0,
            speed: position.coords.speed || 0,
            city: 'Browser Geolocation',
            country: 'GPS from Browser',
            location_type: 'browser_geolocation_realtime',
            timestamp: new Date().toISOString(),
            source: 'browser_geolocation_realtime',
            is_mobile: false,
            real_time: true
          };
          await updateDeviceLocationRealTime(deviceId, location);
        },
        async (error) => {
          console.log('Browser geolocation failed, using network-based tracking');
          await updateNetworkLocationRealTime(deviceId);
        },
        {
          enableHighAccuracy: true, // Try high accuracy for desktop too
          timeout: 5000,
          maximumAge: 0
        }
      );
    } else {
      await updateNetworkLocationRealTime(deviceId);
    }

    // Set up faster periodic updates (every 3 seconds)
    locationIntervalRef.current = setInterval(async () => {
      await updateNetworkLocationRealTime(deviceId);
    }, 3000);
  };

  const updateNetworkLocationRealTime = async (deviceId) => {
    try {
      const networkLocation = await getNetworkBasedLocation();
      networkLocation.real_time = true;
      await updateDeviceLocationRealTime(deviceId, networkLocation);
    } catch (error) {
      console.error('Network location update failed:', error);
    }
  };

  const getNetworkBasedLocation = async () => {
    try {
      const services = [
        'https://ipapi.co/json/',
        'https://api.ipgeolocation.io/ipgeo?apiKey=demo',
        'https://extreme-ip-lookup.com/json/'
      ];

      for (const service of services) {
        try {
          const response = await fetch(service, { timeout: 3000 }); // Reduced timeout
          if (response.ok) {
            const data = await response.json();
            
            if (data.latitude && data.longitude) {
              return {
                latitude: data.latitude,
                longitude: data.longitude,
                accuracy: 1000,
                city: data.city || 'Unknown',
                country: data.country_name || data.country || 'Unknown',
                location_type: 'network_ip_realtime',
                timestamp: new Date().toISOString(),
                source: 'network_geolocation_realtime',
                is_mobile: false
              };
            }
          }
        } catch (error) {
          continue;
        }
      }

      // Fallback with slight variation for testing
      return {
        latitude: 6.9271 + (Math.random() - 0.5) * 0.0001, // Small variation
        longitude: 79.8612 + (Math.random() - 0.5) * 0.0001,
        accuracy: 5000,
        city: 'Colombo',
        country: 'Sri Lanka',
        location_type: 'network_fallback_realtime',
        timestamp: new Date().toISOString(),
        source: 'fallback_realtime',
        is_mobile: false
      };
    } catch (error) {
      console.error('All network location services failed:', error);
      return {
        latitude: 6.9271,
        longitude: 79.8612,
        accuracy: 10000,
        city: 'Colombo',
        country: 'Sri Lanka',
        location_type: 'default_realtime',
        timestamp: new Date().toISOString(),
        source: 'default_fallback_realtime',
        is_mobile: false
      };
    }
  };

  const updateDeviceLocationRealTime = async (deviceId, location) => {
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
                  real_time: true
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
              real_time: true
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
      setDevices(data);
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
    
    if (diffSeconds > 10) return 'offline'; // Reduced from 30s to 10s for real-time
    if (diffSeconds > 5) return 'warning'; // Reduced from 15s to 5s
    return 'safe';
  };

  const forceHighAccuracyUpdate = async () => {
    if (!currentDeviceId) return;

    setLocationStatus('manual_high_accuracy_realtime');
    
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
            country: 'GPS',
            location_type: 'gps_manual_high_accuracy_realtime',
            timestamp: new Date().toISOString(),
            source: 'manual_gps_high_accuracy_realtime',
            is_mobile: isMobileDevice(),
            gps_quality: getGPSQuality(position.coords.accuracy),
            real_time: true
          };
          await updateDeviceLocationRealTime(currentDeviceId, location);
          setLocationStatus(isMobileDevice() ? 'tracking_mobile_gps_realtime' : 'tracking_desktop_realtime');
        },
        async (error) => {
          console.error('Manual high accuracy location failed:', error);
          await updateNetworkLocationRealTime(currentDeviceId);
          setLocationStatus('tracking_desktop_realtime');
        },
        { 
          enableHighAccuracy: true, 
          timeout: 10000,
          maximumAge: 0 
        }
      );
    } else {
      await updateNetworkLocationRealTime(currentDeviceId);
      setLocationStatus('tracking_desktop_realtime');
    }
  };

  const getLocationStatusText = () => {
    const baseText = locationStatus.includes('realtime') ? '🔄 REAL-TIME ' : '📍 ';
    
    switch(locationStatus) {
      case 'tracking_mobile_gps_realtime': 
        return `${baseText}Live GPS (Accuracy: ±${gpsAccuracy ? Math.round(gpsAccuracy) : '?'}m)`;
      case 'tracking_desktop_realtime': 
        return `${baseText}Enhanced Location Tracking`;
      case 'waiting_for_setup': 
        return '⏳ Waiting for Device Setup...';
      case 'manual_high_accuracy_realtime': 
        return '🎯 Getting High Accuracy Location...';
      case 'initializing': 
        return '⚙️ Initializing Location...';
      default: 
        return `${baseText}Location Tracking`;
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
          📍 Smart Device Tracker - AI Behavior Learning
          <span className="live-indicator">LIVE</span>
          <span className="location-status-badge">{getLocationStatusText()}</span>
          {locationUpdates > 0 && (
            <span className="update-counter">Updates: {locationUpdates}</span>
          )}
          {realTimeUpdates > 0 && (
            <span className="realtime-counter" style={{marginLeft: '10px', background: '#10B981', color: 'white', padding: '2px 8px', borderRadius: '10px', fontSize: '12px'}}>
              Real-time: {realTimeUpdates}
            </span>
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
                🎯 High Accuracy Update
              </button>
            </div>
          </div>
          {devices.map((device, index) => (
            <div key={device.device_id} className="device-card">
              <div className="device-header">
                <h4>{device.device_name || `Device ${index + 1}`}</h4>
                <span className={`device-status status-${getStatus(device)}`}>
                  {getStatus(device).toUpperCase()}
                  {device.real_time && ' 🔄'}
                  {getStatus(device) === 'safe' ? ' 🟢' : 
                   getStatus(device) === 'warning' ? ' 🟡' : ' 🔴'}
                </span>
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
                <p><strong>Area:</strong> {device.last_location?.city || 'Unknown'}</p>
                <p><strong>Coordinates:</strong> 
                  {device.last_location ? 
                    `${device.last_location.latitude?.toFixed(6)}, ${device.last_location.longitude?.toFixed(6)}` : 
                    'No location data'
                  }
                </p>
                <p><strong>Accuracy:</strong> {device.last_location?.accuracy ? `±${Math.round(device.last_location.accuracy)}m` : 'Unknown'}</p>
                <p><strong>Last Update:</strong> {device.last_updated ? 
                  new Date(device.last_updated).toLocaleTimeString('en-US', { timeZone: 'Asia/Colombo' }) : 'Never'}</p>
                
                {device.last_location?.heading && (
                  <p><strong>Heading:</strong> {device.last_location.heading.toFixed(1)}°</p>
                )}
                {device.last_location?.speed > 0 && (
                  <p><strong>Speed:</strong> {(device.last_location.speed * 3.6).toFixed(1)} km/h</p>
                )}
                {device.real_time && (
                  <p><strong>🔄 Real-time Tracking Active</strong></p>
                )}
              </div>
              
              {device.device_id === currentDeviceId && (
                <div className="current-device-badge">
                  ✅ Current Device - {isMobileDevice() ? 'Mobile GPS' : 'Enhanced'} Real-time Tracking Active
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
          <h3>Live Real-time Device Locations</h3>
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
              <span className="realtime-indicator">🔄</span>
              <span>Real-time tracking active</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;