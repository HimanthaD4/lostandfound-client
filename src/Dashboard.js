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

  useEffect(() => {
    initializeDeviceTracking();
    fetchDevices();
    fetchAlerts();
    startBehaviorMonitoring();

    const interval = setInterval(() => {
      fetchDevices();
      fetchAlerts();
      fetchBehaviorProgress();
    }, 3000);

    return () => {
      clearInterval(interval);
      stopAutomaticLocationUpdates();
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
      
      // If learning is complete, show celebration
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
    
    // Check if device already exists before starting tracking
    const deviceExists = await checkDeviceExists(deviceId);
    setDeviceCheckComplete(true);
    
    if (!deviceExists) {
      console.log('Device does not exist, waiting for setup...');
      setLocationStatus('waiting_for_setup');
    } else {
      console.log('Device exists, starting location tracking...');
      startLocationUpdatesOnly(deviceId);
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

  const getIPLocation = async () => {
    try {
      const services = [
        'https://api.ipify.org?format=json',
        'https://ipapi.co/json/',
        'https://api.my-ip.io/ip.json'
      ];

      let locationData = null;
      
      for (const service of services) {
        try {
          const response = await fetch(service, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            timeout: 5000
          });
          
          if (response.ok) {
            const data = await response.json();
            
            if (service.includes('ipify')) {
              const ip = data.ip;
              const locationResponse = await fetch(`http://ip-api.com/json/${ip}`);
              if (locationResponse.ok) {
                const location = await locationResponse.json();
                locationData = {
                  latitude: location.lat || 6.9271,
                  longitude: location.lon || 79.8612,
                  city: location.city || 'Unknown',
                  country: location.country || 'Sri Lanka',
                  accuracy: 10000,
                  source: 'ip_geolocation_fallback'
                };
                break;
              }
            } else if (data.latitude && data.longitude) {
              locationData = {
                latitude: data.latitude,
                longitude: data.longitude,
                city: data.city || 'Unknown',
                country: data.country_name || data.country || 'Sri Lanka',
                accuracy: data.accuracy || 5000,
                source: 'ip_geolocation'
              };
              break;
            }
          }
        } catch (error) {
          console.log(`Service ${service} failed:`, error.message);
          continue;
        }
      }

      if (!locationData) {
        locationData = {
          latitude: 6.9271,
          longitude: 79.8612,
          city: 'Colombo',
          country: 'Sri Lanka',
          accuracy: 10000,
          source: 'default'
        };
      }

      return locationData;
    } catch (error) {
      console.error('All IP location services failed:', error);
      return {
        latitude: 6.9271,
        longitude: 79.8612,
        city: 'Colombo',
        country: 'Sri Lanka',
        accuracy: 10000,
        source: 'default_fallback'
      };
    }
  };

  const startHighAccuracyLocationTracking = (deviceId) => {
    if (!navigator.geolocation) {
      console.warn('Geolocation not supported');
      startLaptopLocationTracking(deviceId);
      return;
    }

    console.log('Starting high accuracy mobile location tracking');
    setLocationStatus('tracking_mobile');

    const watchId = navigator.geolocation.watchPosition(
      async (position) => {
        await updateDeviceLocation(deviceId, {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          altitudeAccuracy: position.coords.altitudeAccuracy,
          heading: position.coords.heading,
          speed: position.coords.speed,
          city: 'Live GPS Tracking',
          country: 'Real-time Location',
          location_type: 'gps_live_mobile',
          timestamp: new Date().toISOString(),
          source: 'gps_high_accuracy',
          is_mobile: true
        });
      },
      (error) => {
        console.error('Mobile location error:', error);
        startLaptopLocationTracking(deviceId);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000,
        distanceFilter: 1
      }
    );

    locationWatcherRef.current = watchId;
  };

  const startLaptopLocationTracking = async (deviceId) => {
    console.log('Starting laptop location tracking');
    setLocationStatus('tracking_laptop');

    await updateLaptopLocation(deviceId);

    locationIntervalRef.current = setInterval(async () => {
      await updateLaptopLocation(deviceId);
    }, 10000);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          await updateDeviceLocation(deviceId, {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            heading: position.coords.heading || 0,
            speed: position.coords.speed || 0,
            city: 'Browser Location',
            country: 'GPS from Browser',
            location_type: 'gps_browser',
            timestamp: new Date().toISOString(),
            source: 'browser_geolocation',
            is_mobile: false
          });
        },
        (error) => {
          console.log('Browser geolocation not available, using IP-based tracking');
        },
        {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 300000
        }
      );
    }
  };

  const startLocationUpdatesOnly = async (deviceId) => {
    console.log('Starting location updates for existing device');
    setLocationStatus('tracking_existing');

    if (isMobileDevice()) {
      startHighAccuracyLocationTracking(deviceId);
    } else {
      startLaptopLocationTracking(deviceId);
    }
  };

  const updateLaptopLocation = async (deviceId) => {
    try {
      const ipLocation = await getIPLocation();
      
      const variation = {
        latitude: (Math.random() - 0.5) * 0.001,
        longitude: (Math.random() - 0.5) * 0.001
      };

      await updateDeviceLocation(deviceId, {
        latitude: ipLocation.latitude + variation.latitude,
        longitude: ipLocation.longitude + variation.longitude,
        accuracy: ipLocation.accuracy,
        heading: Math.random() * 360,
        speed: Math.random() * 5,
        city: ipLocation.city,
        country: ipLocation.country,
        location_type: 'ip_geolocation',
        timestamp: new Date().toISOString(),
        source: ipLocation.source,
        is_mobile: false
      });
    } catch (error) {
      console.error('Laptop location update failed:', error);
    }
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
        
        // Always update userLocation when we get new location data
        setUserLocation({
          latitude: location.latitude,
          longitude: location.longitude
        });
        
        console.log('User location set to:', location.latitude, location.longitude);
        
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
              device_name: isMobileDevice() ? 'My Mobile Phone' : 'My Laptop',
              device_type: isMobileDevice() ? 'mobile' : 'laptop',
              last_location: location,
              last_updated: new Date().toISOString(),
              is_mobile: location.is_mobile || false
            };
            return [...updatedDevices, newDevice];
          }
          
          return updatedDevices;
        });

        // Show behavior analysis result
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
    
    if (diffSeconds > 30) return 'offline';
    if (diffSeconds > 15) return 'warning';
    return 'safe';
  };

  const forceLocationUpdate = async () => {
    if (!currentDeviceId) return;

    setLocationStatus('manual_update');
    
    if (isMobileDevice()) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            heading: position.coords.heading || 0,
            speed: position.coords.speed || 0,
            city: 'Manual Update',
            country: 'GPS',
            location_type: 'gps_manual',
            timestamp: new Date().toISOString(),
            source: 'manual_gps',
            is_mobile: true
          };
          await updateDeviceLocation(currentDeviceId, location);
          setLocationStatus('tracking_mobile');
        },
        async (error) => {
          console.error('Manual location failed:', error);
          await updateLaptopLocation(currentDeviceId);
          setLocationStatus('tracking_laptop');
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    } else {
      await updateLaptopLocation(currentDeviceId);
      setLocationStatus('tracking_laptop');
    }
  };

  const getLocationStatusText = () => {
    switch(locationStatus) {
      case 'tracking_mobile': return '🛰️ Live GPS Tracking Active';
      case 'tracking_laptop': return '💻 IP Location Tracking Active';
      case 'tracking_existing': return '📍 Updating Existing Device';
      case 'waiting_for_setup': return '⏳ Waiting for Device Setup...';
      case 'manual_update': return '⏳ Updating Location...';
      case 'initializing': return '⚙️ Initializing Location...';
      default: return '📍 Location Tracking';
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
              <button className="btn btn-small" onClick={forceLocationUpdate}>
                🔄 Update Now
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
                <p><strong>Location Source:</strong> {device.last_location?.source || 'Unknown'}</p>
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
              </div>
              
              {device.device_id === currentDeviceId && (
                <div className="current-device-badge">
                  ✅ Current Device - {isMobileDevice() ? 'Mobile GPS' : 'Laptop'} Tracking Active
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
          <h3>Live Device Locations</h3>
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
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;